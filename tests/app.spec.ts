import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import AppShell from '@/app/AppShell.vue'
import { findForbiddenClaim } from '@/game/debrief'
import { SAVE_KEY, saveGame } from '@/game/storage'
import { choose, createInitialState } from '@/game/engine'
import type { GameState, OptionId } from '@/game/types'

/**
 * 集成测试：在 jsdom 中真实挂载整部手机并点击真实按钮。
 * 覆盖自由探索、资料、付款、结局、复盘与重开路径。
 */

const mounted: VueWrapper[] = []

/** 挂载一部新的手机；默认先清空存档（模拟全新开局）。 */
function mountApp(options: { keepSave?: boolean } = {}): VueWrapper {
  if (!options.keepSave) globalThis.localStorage.clear()
  const wrapper = mount(AppShell)
  mounted.push(wrapper)
  return wrapper
}

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

function play(optionIds: OptionId[], from: GameState = createInitialState()): GameState {
  let state = from
  for (const id of optionIds) {
    const result = choose(state, id)
    if (!result.ok) throw new Error(`选项 ${id} 在节点 ${state.node} 非法`)
    state = result.state
  }
  return state
}

/** 按可见文案或 aria-label 查找按钮。 */
function findButton(wrapper: VueWrapper, label: string) {
  return wrapper
    .findAll('button')
    .find((btn) => btn.text().includes(label) || (btn.attributes('aria-label') ?? '').includes(label))
}

/** 点击按钮；找不到时列出当前可用按钮，便于定位。 */
async function click(wrapper: VueWrapper, label: string): Promise<void> {
  const target = findButton(wrapper, label)
  if (!target) {
    const available = wrapper
      .findAll('button')
      .map((btn) => btn.text().trim() || btn.attributes('aria-label'))
      .join(' | ')
    throw new Error(`找不到「${label}」按钮。当前可用：${available}`)
  }
  await target.trigger('click')
}

/** 等待「提交后解锁」的微任务。 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5))
}

/**
 * 构造指针事件。
 * jsdom 的 `clientY` 是只读 getter，无法通过 test-utils 的 trigger 选项赋值，
 * 因此手动创建事件并用 defineProperty 注入坐标。
 */
function pointerEvent(type: string, clientY: number, pointerId = 1): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientY', { value: clientY })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  return event
}

/**
 * 锁屏上滑解锁（指针事件）。
 * 不依赖真实指针设备，直接在解锁面上派发 pointerdown / pointermove / pointerup。
 */
async function swipeUnlock(wrapper: VueWrapper): Promise<void> {
  const surface = wrapper.find('.lock__surface')
  expect(surface.exists(), '锁屏应有可上滑的解锁面').toBe(true)
  const el = surface.element
  el.dispatchEvent(pointerEvent('pointerdown', 600))
  el.dispatchEvent(pointerEvent('pointermove', 480))
  el.dispatchEvent(pointerEvent('pointerup', 480))
  await flush()
}

/** 锁屏等效解锁：点击解锁面（不滑动也能进）。 */
async function clickUnlock(wrapper: VueWrapper): Promise<void> {
  const surface = wrapper.find('.lock__surface')
  await surface.trigger('click')
  await flush()
}

/** 开场 → 桌面 → 点通知进入邀请会话。 */
async function startAndOpenInvite(wrapper: VueWrapper): Promise<void> {
  await swipeUnlock(wrapper)
  await click(wrapper, '一位学姐邀请你加入兼职群')
}

/** 开场 → 进群。 */
async function startAndEnterGroup(wrapper: VueWrapper): Promise<void> {
  await startAndOpenInvite(wrapper)
  await click(wrapper, '进群看看')
}

/** 开场 → 进群 → 接下任务（到达首次待付款页）。 */
async function startAndReachPayment(wrapper: VueWrapper): Promise<void> {
  await startAndEnterGroup(wrapper)
  await click(wrapper, '接下任务')
}

/** 点击桌面上的应用图标（避免与状态栏按钮的同名 aria-label 冲突）。 */
async function clickDesktopApp(wrapper: VueWrapper, label: string): Promise<void> {
  const icon = wrapper
    .findAll('.apps .app')
    .find((b) => (b.text() ?? '').includes(label))
  if (!icon) {
    const available = wrapper.findAll('.apps .app').map((b) => b.text().trim()).join(' | ')
    throw new Error(`桌面找不到「${label}」图标。当前可用：${available}`)
  }
  await icon.trigger('click')
}

/** 读取当前存档。 */
function readSave(): GameState | null {
  const text = globalThis.localStorage.getItem(SAVE_KEY)
  return text ? (JSON.parse(text) as GameState) : null
}

beforeEach(() => {
  globalThis.localStorage.clear()
})

describe('E. 整部手机的交互（B01–B14）', () => {
  it('B01/B08 锁屏上滑解锁 → 桌面：先看到独立桌面与邀请通知，不是答题页', async () => {
    const wrapper = mountApp()
    expect(wrapper.text()).toContain('反诈局中局：你的手机')
    expect(wrapper.text()).toContain('上滑解锁')

    await swipeUnlock(wrapper)
    expect(wrapper.text()).toContain('一位学姐邀请你加入兼职群')
    for (const label of ['青讯', '安心钱包', '识骗手册']) {
      expect(wrapper.text(), `桌面应有「${label}」入口`).toContain(label)
    }
    // 桌面就是整页手机，没有外层网页导航
    expect(wrapper.findAll('a')).toHaveLength(0)
  })

  it('J 解锁后顶部弹出反诈提醒，可关闭且进入通知中心', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    // 解锁后按当前节点弹出提醒
    expect(wrapper.text()).toContain('国家反诈中心提醒您')
    expect(wrapper.find('.banner').exists()).toBe(true)

    // 点击横幅进入通知中心，可看到同一条提醒
    await click(wrapper, '国家反诈中心提醒您')
    expect(wrapper.find('.center__list').exists()).toBe(true)
    expect(wrapper.text()).toContain('国家反诈中心提醒您')

    // 关闭按钮可收起横幅
    const fresh = mountApp()
    await swipeUnlock(fresh)
    const close = fresh.findAll('button').find((b) => b.attributes('aria-label') === '关闭提醒')
    expect(close, '横幅应有可键盘访问的关闭按钮').toBeTruthy()
    await close?.trigger('click')
    // 退场动画后移除
    await new Promise((r) => setTimeout(r, 320))
    expect(fresh.find('.banner').exists()).toBe(false)
  })

  it('G 解锁方式的等效性：轻微上滑不解锁，点击与键盘也能解锁', async () => {
    // 轻微上滑（未达阈值）应回弹，仍停在锁屏
    const shortSwipe = mountApp()
    const surface = shortSwipe.find('.lock__surface')
    const el = surface.element
    el.dispatchEvent(pointerEvent('pointerdown', 600))
    el.dispatchEvent(pointerEvent('pointermove', 590))
    el.dispatchEvent(pointerEvent('pointerup', 590))
    await flush()
    expect(shortSwipe.text()).toContain('上滑解锁')
    expect(shortSwipe.text()).not.toContain('青屏 OS')

    // 点击解锁面即可进入（不依赖滑动）
    const byClick = mountApp()
    await clickUnlock(byClick)
    expect(byClick.text()).toContain('一位学姐邀请你加入兼职群')

    // 键盘 Enter 同样可解锁
    const byKey = mountApp()
    await byKey.find('.lock__surface').trigger('keydown', { key: 'Enter' })
    await flush()
    expect(byKey.text()).toContain('一位学姐邀请你加入兼职群')
  })

  it('B01/B09 通知与消息图标是两条独立入口，都能到达邀请', async () => {
    const viaNotice = mountApp()
    await startAndOpenInvite(viaNotice)
    expect(viaNotice.text()).toContain('拒绝并举报')

    const viaIcon = mountApp()
    await swipeUnlock(viaIcon)
    await click(viaIcon, '青讯')
    expect(viaIcon.text()).toContain('拒绝并举报')
  })

  it('B11 邀请可忽略：先看钱包/手册再回来，邀请仍在且未扣款', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    await click(wrapper, '安心钱包')
    expect(wrapper.text()).toContain('没有待处理的钱')
    expect(wrapper.text()).toContain('800')

    await click(wrapper, '桌面')
    await click(wrapper, '识骗手册')
    expect(wrapper.text()).toContain('让你先垫钱的兼职')

    await click(wrapper, '桌面')
    expect(wrapper.text()).toContain('一位学姐邀请你加入兼职群')

    await click(wrapper, '继续当前事项')
    expect(wrapper.text()).toContain('拒绝并举报')
    expect(wrapper.text()).not.toContain('你已付款')
  })

  it('B03 资料可点击、可返回，且不改变余额', async () => {
    const wrapper = mountApp()
    await startAndEnterGroup(wrapper)

    await click(wrapper, '群主资料')
    expect(wrapper.text()).toContain('最近 7 天内')
    expect(wrapper.text()).toContain('用别的渠道')

    await click(wrapper, '返回群聊')
    expect(wrapper.text()).toContain('接下任务')

    // 反复查看资料不改变余额、不重复推进
    await click(wrapper, '再看群主资料')
    await click(wrapper, '返回群聊')
    await click(wrapper, '桌面')
    expect(wrapper.text()).toContain('800')
    expect(readSave()?.balance).toBe(800)
  })

  it('B12 群聊待付款：切走再回来，请求仍待确认、金额不变；确认后才扣款一次', async () => {
    const wrapper = mountApp()
    await startAndReachPayment(wrapper)
    expect(wrapper.text()).toContain('有一笔待确认')

    await click(wrapper, '桌面')
    expect(wrapper.text()).toContain('800')
    expect(wrapper.text()).toContain('还有一笔 100 元待确认')
    expect(readSave()?.balance).toBe(800)

    await click(wrapper, '识骗手册')
    await click(wrapper, '桌面')
    await click(wrapper, '继续当前事项')
    expect(wrapper.text()).toContain('确认垫付 100 元')

    await click(wrapper, '确认垫付 100 元')
    await flush()
    expect(readSave()?.balance).toBe(700)
    // 回到群聊看到平台展示数字，且明确取不出来
    expect(wrapper.text()).toContain('平台内显示')
    expect(wrapper.text()).toContain('130')
  })

  it('B10 离开待付款页 ≠ 取消：切走后仍可回来取消并进入止损结局', async () => {
    const wrapper = mountApp()
    await startAndReachPayment(wrapper)

    await click(wrapper, '桌面')
    await click(wrapper, '安心钱包')
    expect(wrapper.text()).toContain('确认垫付 100 元')

    await click(wrapper, '取消，不参与')
    await flush()
    expect(wrapper.text()).toContain('及时止损')
    expect(wrapper.text()).toContain('一分没花')
    expect(readSave()?.balance).toBe(800)
  })

  it('B12/B14 钱包平时不能绕过剧情付款', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await click(wrapper, '安心钱包')
    expect(wrapper.text()).toContain('没有待处理的钱')
    expect(findButton(wrapper, '确认垫付')).toBeUndefined()
  })

  it('A08 连点确认只扣一次款', async () => {
    const wrapper = mountApp()
    await startAndReachPayment(wrapper)

    const confirm = findButton(wrapper, '确认垫付 100 元')
    expect(confirm).toBeTruthy()
    await confirm?.trigger('click')
    await confirm?.trigger('click')
    await flush()

    const saved = readSave()
    expect(saved?.balance).toBe(700)
    expect(saved?.paidCount).toBe(1)
    expect(saved?.paidTotal).toBe(100)
  })

  it('B13 结局与复盘都可离开并从桌面/手册再次进入', async () => {
    const wrapper = mountApp()
    await startAndOpenInvite(wrapper)
    await click(wrapper, '拒绝并举报')
    await flush()
    expect(wrapper.text()).toContain('提前识破')

    await click(wrapper, '桌面')
    expect(wrapper.text()).toContain('看本局结果与复盘')

    await click(wrapper, '继续当前事项')
    expect(wrapper.text()).toContain('提前识破')

    await click(wrapper, '识骗手册')
    await click(wrapper, '看本局结果')
    expect(wrapper.text()).toContain('提前识破')

    await click(wrapper, '看复盘')
    await flush()
    expect(wrapper.text()).toContain('复盘')
    expect(wrapper.text()).toContain('你碰到的')

    // 复盘也可以离开再进入
    await click(wrapper, '桌面')
    await click(wrapper, '识骗手册')
    expect(wrapper.text()).toContain('你碰到的')
  })

  it('B13/A09 重开必须二次确认；取消则进度不变', async () => {
    const wrapper = mountApp()
    await startAndReachPayment(wrapper)
    await click(wrapper, '确认垫付 100 元')
    await flush()

    await click(wrapper, '桌面')
    await click(wrapper, '重新开始本局')
    expect(wrapper.text()).toContain('重来一次？')

    await click(wrapper, '算了，接着玩')
    expect(wrapper.text()).toContain('700')
    expect(readSave()).not.toBeNull()

    await click(wrapper, '重新开始本局')
    await click(wrapper, '清掉，重来')
    // 重开后回到锁屏
    expect(wrapper.text()).toContain('上滑解锁')
    expect(readSave()).toBeNull()
  })

  it('B04 复盘只引用亲历环节：早拒绝者不会看到解冻费与追加', async () => {
    const wrapper = mountApp()
    await startAndOpenInvite(wrapper)
    await click(wrapper, '拒绝并举报')
    await flush()
    await click(wrapper, '看复盘')
    await flush()

    const text = wrapper.text()
    expect(text).toContain('陌生人的兼职邀请')
    expect(text).not.toContain('解冻费')
    expect(text).not.toContain('追加 300')
    expect(text).not.toContain('你付了第一笔')
  })

  it('B04 追加后损失：复盘显示 400，且无「保证追回」表述', async () => {
    const wrapper = mountApp()
    await startAndReachPayment(wrapper)
    await click(wrapper, '确认垫付 100 元')
    await flush()
    await click(wrapper, '继续查看任务')
    await click(wrapper, '查看追加垫付')
    await click(wrapper, '确认垫付 300 元')
    await flush()

    expect(wrapper.text()).toContain('追加后损失')
    expect(readSave()?.balance).toBe(400)

    await click(wrapper, '看复盘')
    await flush()
    const text = wrapper.text()
    expect(text).toContain('400')
    expect(text).toContain('解冻费')
    // 只拦截肯定式误导表述；「不保证追回」是必须保留的正确表述。
    expect(findForbiddenClaim(text)).toBeNull()
    expect(text).toContain('不保证')
  })

  it('C04 损坏存档启动时安全回退到锁屏，页面仍可用', () => {
    globalThis.localStorage.setItem(SAVE_KEY, '{"version":1,"node":"group","balance":999999}')
    const wrapper = mountApp({ keepSave: true })
    expect(wrapper.text()).toContain('上滑解锁')
    expect(readSave()).toBeNull()
  })

  it('C04 有效存档恢复进度，且不能重复扣款', async () => {
    const paid = play(['start', 'enter-group', 'accept-task', 'confirm-100', 'continue-task'])
    saveGame(paid)
    const wrapper = mountApp({ keepSave: true })

    expect(wrapper.text()).toContain('提现出了点问题')
    await click(wrapper, '继续当前事项')
    expect(wrapper.text()).toContain('停止操作并保留证据')
    // 已确认的首次垫付按钮不复现
    expect(findButton(wrapper, '确认垫付 100 元')).toBeUndefined()
    expect(readSave()?.balance).toBe(700)
  })

  it('B02 转账页有明确的模拟声明，且不要求敏感信息', async () => {
    const wrapper = mountApp()
    await startAndReachPayment(wrapper)
    const text = wrapper.text()
    expect(text).toContain('不会动你的真钱')
    expect(text).toContain('不用输卡号、验证码或密码')
    expect(wrapper.findAll('input')).toHaveLength(0)
    expect(wrapper.findAll('a')).toHaveLength(0)
  })

  it('B14 状态栏与只读应用都有响应', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    await click(wrapper, '打开通知')
    expect(wrapper.text()).toContain('通知')
    await click(wrapper, '收起通知')

    await click(wrapper, '相册')
    expect(wrapper.text()).toContain('没有照片')
    await click(wrapper, '桌面')

    await click(wrapper, '设置')
    expect(wrapper.text()).toContain('音效')
  })

  it('H 设置里的开关是真实可用按钮，且状态持久化', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await click(wrapper, '设置')

    // 两个开关都是 role=switch 的真实按钮
    const switches = wrapper.findAll('button[role="switch"]')
    expect(switches.length).toBe(2)

    const soundSwitch = switches.find((s) => s.attributes('aria-label') === '音效')
    expect(soundSwitch, '应有音效开关').toBeTruthy()
    expect(soundSwitch?.attributes('aria-checked')).toBe('true')

    // 关闭音效 → 状态与本地设置同步
    await soundSwitch?.trigger('click')
    expect(soundSwitch?.attributes('aria-checked')).toBe('false')
    const saved = JSON.parse(globalThis.localStorage.getItem('fj-juzhongju:settings:v1') as string)
    expect(saved.sound).toBe(false)

    // 重新挂载后设置被读回（有存档时直接进桌面，不回锁屏）
    const reopened = mountApp({ keepSave: true })
    expect(reopened.find('.lock__surface').exists()).toBe(false)
    await click(reopened, '设置')
    const soundAgain = reopened
      .findAll('button[role="switch"]')
      .find((s) => s.attributes('aria-label') === '音效')
    expect(soundAgain?.attributes('aria-checked')).toBe('false')
  })

  it('J 关闭顶部提醒后不再弹出，但提醒仍进入通知中心', async () => {
    // 先在设置里关闭顶部提醒
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await click(wrapper, '设置')
    const bannerSwitch = wrapper
      .findAll('button[role="switch"]')
      .find((s) => s.attributes('aria-label') === '顶部弹出提醒')
    expect(bannerSwitch?.attributes('aria-checked')).toBe('true')
    await bannerSwitch?.trigger('click')
    expect(bannerSwitch?.attributes('aria-checked')).toBe('false')
    // 关闭开关应立即收起当前正显示的横幅
    await new Promise((r) => setTimeout(r, 320))
    expect(wrapper.find('.banner').exists()).toBe(false)

    // 回到桌面并推进剧情：不应再出现横幅
    await click(wrapper, '桌面')
    await click(wrapper, '继续当前事项')
    await click(wrapper, '进群看看')
    await flush()
    expect(wrapper.find('.banner').exists()).toBe(false)

    // 但通知中心仍能看到这条提醒
    await click(wrapper, '桌面')
    await clickDesktopApp(wrapper, '通知')
    expect(wrapper.text()).toContain('国家反诈中心提醒您')
  })

  it('B06 动效与音频都不是必要交互：键盘可完成关键选择', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    // 跳过消息动画后立即可看到选项
    await click(wrapper, '青讯')
    await click(wrapper, '进群看看')
    await click(wrapper, '显示全部')
    // 跳过动画后能看到群聊里的风险提示
    expect(wrapper.text()).toContain('群里说「到账」的')
    // 选项都是真实 button，可聚焦
    const accept = findButton(wrapper, '接下任务')
    expect(accept?.element.tagName).toBe('BUTTON')
  })

  it('A08 浏览器返回：回到桌面而不离开游戏，且不重复提交选项', async () => {
    const wrapper = mountApp()
    await startAndReachPayment(wrapper)
    const before = readSave()
    expect(before?.node).toBe('transfer-100')

    // 模拟浏览器返回键
    globalThis.dispatchEvent(new PopStateEvent('popstate'))
    await flush()

    // 回到桌面，仍在游戏内（不回锁屏）
    expect(wrapper.find('.home').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('上滑解锁')

    // 剧情与金额完全未变，待确认请求仍在
    const after = readSave()
    expect(after?.node).toBe('transfer-100')
    expect(after?.balance).toBe(800)
    expect(after?.paidCount).toBe(0)

    await click(wrapper, '继续当前事项')
    expect(wrapper.text()).toContain('确认垫付 100 元')
  })

  it('A08 已确认付款后，返回键不能让旧按钮重新可点', async () => {
    const wrapper = mountApp()
    await startAndReachPayment(wrapper)
    await click(wrapper, '确认垫付 100 元')
    await flush()
    expect(readSave()?.balance).toBe(700)

    globalThis.dispatchEvent(new PopStateEvent('popstate'))
    await flush()
    globalThis.dispatchEvent(new PopStateEvent('popstate'))
    await flush()

    // 存档仍是已付款后的状态，且确认按钮不复现
    expect(readSave()?.balance).toBe(700)
    expect(findButton(wrapper, '确认垫付 100 元')).toBeUndefined()
  })
})
