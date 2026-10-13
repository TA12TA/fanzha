import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from '@/app/AppShell.vue'
import { DEFAULT_DURATIONS, FIRST_NOTICE_DELAY_MS, LEAVE_MS } from '@/app/notifications'
import { reloadSettings } from '@/app/settings'
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

/**
 * 解锁并等过「首条通知延迟」。
 * 进入系统后第一条通知会先等 FIRST_NOTICE_DELAY_MS 才弹出，
 * 需要断言通知行为的用例要先跨过这段延迟。
 */
async function swipeUnlockAndWaitNotices(wrapper: VueWrapper): Promise<void> {
  await swipeUnlock(wrapper)
  await new Promise((r) => setTimeout(r, FIRST_NOTICE_DELAY_MS + 150))
}

/** 锁屏等效解锁：点击解锁面（不滑动也能进）。 */
async function clickUnlock(wrapper: VueWrapper): Promise<void> {
  const surface = wrapper.find('.lock__surface')
  await surface.trigger('click')
  await flush()
}

/** 开场 → 桌面 → 进入邀请会话（邀请提示已改为通知留存，走「青讯」图标进入）。 */
async function startAndOpenInvite(wrapper: VueWrapper): Promise<void> {
  await swipeUnlock(wrapper)
  await clickDesktopApp(wrapper, '青讯')
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
  // 设置是模块级单例：清掉存储后必须重新加载，
  // 否则前一个用例关掉的开关会泄漏到后续用例。
  reloadSettings()
})

describe('E. 整部手机的交互（B01–B14）', () => {
  it('B01/B08 锁屏上滑解锁 → 桌面：先看到独立桌面，不是答题页', async () => {
    const wrapper = mountApp()
    expect(wrapper.text()).toContain('反诈局中局：你的手机')
    expect(wrapper.text()).toContain('上滑解锁')

    await swipeUnlock(wrapper)
    expect(wrapper.find('.home').exists(), '解锁后应进入桌面').toBe(true)
    for (const label of ['青讯', '安心钱包', '国家反诈中心']) {
      expect(wrapper.text(), `桌面应有「${label}」入口`).toContain(label)
    }
    // 邀请提示已改为通知留存：桌面上不再有邀请卡片
    expect(wrapper.find('.notice').exists(), '桌面不应再有邀请卡片').toBe(false)
    // 但「青讯」图标有角标提示待处理
    expect(wrapper.find('.app__badge').exists(), '青讯图标应有角标').toBe(true)
    // 桌面就是整页手机，没有外层网页导航
    expect(wrapper.findAll('a')).toHaveLength(0)
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
    expect(shortSwipe.find('.home').exists()).toBe(false)

    // 点击解锁面即可进入（不依赖滑动）
    const byClick = mountApp()
    await clickUnlock(byClick)
    expect(byClick.find('.home').exists()).toBe(true)

    // 键盘 Enter 同样可解锁
    const byKey = mountApp()
    await byKey.find('.lock__surface').trigger('keydown', { key: 'Enter' })
    await flush()
    expect(byKey.find('.home').exists()).toBe(true)
  })

  it('B01/B09 「青讯」图标与「继续当前事项」都能到达邀请', async () => {
    const viaIcon = mountApp()
    await swipeUnlock(viaIcon)
    await clickDesktopApp(viaIcon, '青讯')
    expect(viaIcon.text()).toContain('拒绝并举报')

    const viaResume = mountApp()
    await swipeUnlock(viaResume)
    await click(viaResume, '继续当前事项')
    expect(viaResume.text()).toContain('拒绝并举报')
  })

  it('B11 邀请可忽略：先看钱包/反诈应用再回来，邀请仍在且未扣款', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    await click(wrapper, '安心钱包')
    expect(wrapper.text()).toContain('没有待处理的钱')
    expect(wrapper.text()).toContain('800')

    await click(wrapper, '桌面')
    await click(wrapper, '国家反诈中心')
    expect(wrapper.text()).toContain('让你先垫钱的兼职')

    // 回桌面：邀请提示靠图标角标与入口保留，仍能找到
    await click(wrapper, '桌面')
    expect(wrapper.find('.app__badge').exists(), '青讯角标应仍在').toBe(true)

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

    await click(wrapper, '国家反诈中心')
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

  it('J 进入系统后先看清桌面，延迟若干秒才弹通知', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    // 刚解锁时不应立刻有横幅（玩家要先看到桌面）
    expect(wrapper.find('.banner').exists(), '解锁瞬间不应弹通知').toBe(false)
    expect(wrapper.find('.home').exists(), '应已在桌面').toBe(true)

    // 等过延迟后通知才出现
    await new Promise((r) => setTimeout(r, FIRST_NOTICE_DELAY_MS + 200))
    expect(wrapper.find('.banner').exists(), '延迟后应弹出通知').toBe(true)
  })

  it('J 延迟后先弹反诈预警，学姐邀请排在它之后等待', async () => {
    const wrapper = mountApp()
    await swipeUnlockAndWaitNotices(wrapper)

    // 横幅先弹反诈预警
    const banner = wrapper.find('.banner')
    expect(banner.exists(), '延迟后应有反诈预警横幅').toBe(true)
    expect(banner.classes()).toContain('banner--antifraud')
    expect(banner.text()).toContain('国家反诈中心提醒您')

    // 学姐邀请排在后面等待（角标提示还有一条）
    expect(wrapper.find('.banner__queued').exists(), '应提示还有一条通知在等待').toBe(true)

    // 消息记录在通知中心（不丢档）
    await clickDesktopApp(wrapper, '通知')
    expect(wrapper.text()).toContain('一位学姐邀请你加入兼职群')
  })

  it('J 邀请改为通知留存：横幅消失后仍能从通知中心找回并进入会话', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mountApp()
      await wrapper.find('.lock__surface').trigger('click')
      // 跨过首条延迟 + 两条通知都播完（预警 + 邀请）
      await vi.advanceTimersByTimeAsync(
        FIRST_NOTICE_DELAY_MS +
          DEFAULT_DURATIONS.antifraud +
          DEFAULT_DURATIONS.message +
          LEAVE_MS * 2 +
          400,
      )
      expect(wrapper.find('.banner').exists(), '横幅应已全部消失').toBe(false)

      vi.useRealTimers()
      // 桌面上没有邀请卡片
      expect(wrapper.find('.notice').exists()).toBe(false)
      // 但通知中心留存了这条邀请，且可点击进入会话
      await clickDesktopApp(wrapper, '通知')
      expect(wrapper.text()).toContain('一位学姐邀请你加入兼职群')
      await click(wrapper, '一位学姐邀请你加入兼职群')
      expect(wrapper.text()).toContain('拒绝并举报')
    } finally {
      vi.useRealTimers()
    }
  })

  it('K 通知自动关闭后，排在后面的学姐邀请自动接上', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mountApp()
      // 用假定时器时，锁屏解锁流程需手动推进
      await wrapper.find('.lock__surface').trigger('click')
      await vi.advanceTimersByTimeAsync(50)

      // 延迟期间不应有横幅
      expect(wrapper.find('.banner').exists(), '延迟期间不应弹通知').toBe(false)

      // 跨过首条延迟后，第一条是反诈预警
      await vi.advanceTimersByTimeAsync(FIRST_NOTICE_DELAY_MS + 60)
      const first = wrapper.find('.banner')
      expect(first.exists(), '延迟后应出现通知').toBe(true)
      expect(first.classes()).toContain('banner--antifraud')

      // 预警播完自动关闭后，学姐邀请接上（用户要求：邀请在反诈通知之后弹出）
      await vi.advanceTimersByTimeAsync(DEFAULT_DURATIONS.antifraud + LEAVE_MS + 60)
      const second = wrapper.find('.banner')
      expect(second.exists(), '预警之后应轮到学姐邀请').toBe(true)
      expect(second.classes()).toContain('banner--message')
      expect(second.text()).toContain('一位学姐邀请你加入兼职群')

      // 邀请播完后队列清空，横幅不再出现
      await vi.advanceTimersByTimeAsync(DEFAULT_DURATIONS.message + LEAVE_MS + 60)
      expect(wrapper.find('.banner').exists(), '两条都播完后应无横幅').toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('K 手动关闭不会连带跳过下一条通知（关闭与自动关闭不竞态）', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mountApp()
      await wrapper.find('.lock__surface').trigger('click')
      // 跨过首条延迟
      await vi.advanceTimersByTimeAsync(FIRST_NOTICE_DELAY_MS + 50)

      // 解锁后有两条排队：预警（当前）+ 学姐邀请（等待）
      expect(wrapper.find('.banner').exists()).toBe(true)
      expect(wrapper.find('.banner').classes()).toContain('banner--antifraud')

      // 手动关闭第一条
      const close = wrapper
        .findAll('button')
        .find((b) => b.attributes('aria-label') === '关闭通知')
      await close?.trigger('click')
      await vi.advanceTimersByTimeAsync(LEAVE_MS + 50)

      // 第二条必须仍在展示，而不是被连带跳过
      const second = wrapper.find('.banner')
      expect(second.exists(), '手动关闭后应轮到第二条，而不是全部消失').toBe(true)
      expect(second.classes()).toContain('banner--message')

      // 再推进到第一条原本的自动关闭时间点，不应造成二次出队
      await vi.advanceTimersByTimeAsync(200)
      expect(wrapper.find('.banner').classes()).toContain('banner--message')

      // 第二条播完后才清空
      await vi.advanceTimersByTimeAsync(DEFAULT_DURATIONS.message + LEAVE_MS + 60)
      expect(wrapper.find('.banner').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('K 通知中心按类型分组，两类都能回看', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await new Promise((r) => setTimeout(r, 50))

    await clickDesktopApp(wrapper, '通知')
    expect(wrapper.text()).toContain('国家反诈中心')
    expect(wrapper.text()).toContain('消息')
    expect(wrapper.text()).toContain('国家反诈中心提醒您')
    expect(wrapper.text()).toContain('一位学姐邀请你加入兼职群')

    const groups = wrapper.findAll('.center__group').map((g) => g.text())
    expect(groups).toContain('国家反诈中心')
    expect(groups).toContain('消息')
  })

  it('J 关闭「顶部弹出通知」后两类横幅都不再弹，但仍进通知中心', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '设置')

    const bannerSwitch = wrapper
      .findAll('button[role="switch"]')
      .find((s) => s.attributes('aria-label') === '顶部弹出通知')
    expect(bannerSwitch?.attributes('aria-checked')).toBe('true')
    await bannerSwitch?.trigger('click')
    await new Promise((r) => setTimeout(r, 320))
    expect(wrapper.find('.banner').exists()).toBe(false)

    // 回到桌面并推进剧情：不应再弹任何横幅
    await click(wrapper, '桌面')
    await click(wrapper, '继续当前事项')
    await click(wrapper, '进群看看')
    await flush()
    expect(wrapper.find('.banner').exists()).toBe(false)

    // 但通知中心仍能看到预警
    await click(wrapper, '桌面')
    await clickDesktopApp(wrapper, '通知')
    expect(wrapper.text()).toContain('国家反诈中心提醒您')
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

    await click(wrapper, '国家反诈中心')
    await click(wrapper, '看本局结果')
    expect(wrapper.text()).toContain('提前识破')

    await click(wrapper, '看复盘')
    await flush()
    expect(wrapper.text()).toContain('复盘')
    expect(wrapper.text()).toContain('你碰到的')

    // 复盘也可以离开再进入
    await click(wrapper, '桌面')
    await click(wrapper, '国家反诈中心')
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

  it('B14 状态栏与只读应用都有响应；状态栏与桌面图标共用同一个通知中心', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    // 状态栏点击 → 真正的通知中心（不再有第二个只读面板）
    await click(wrapper, '打开通知')
    expect(wrapper.find('.center__list, .center__empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('国家反诈中心')

    await click(wrapper, '返回')
    await click(wrapper, '相册')
    expect(wrapper.text()).toContain('没有照片')
    await click(wrapper, '桌面')

    // 桌面「通知」图标进入同一个界面
    await clickDesktopApp(wrapper, '通知')
    expect(wrapper.find('.center').exists()).toBe(true)
    await click(wrapper, '返回')

    await clickDesktopApp(wrapper, '设置')
    expect(wrapper.text()).toContain('音效')
  })

  it('K 通知中心打开时不再有横幅遮挡内容', async () => {
    const wrapper = mountApp()
    await swipeUnlockAndWaitNotices(wrapper)
    // 延迟过后应正在显示横幅
    expect(wrapper.find('.banner').exists(), '延迟后应有横幅').toBe(true)

    // 切到通知中心后横幅必须收起，避免盖住分组标题
    await clickDesktopApp(wrapper, '通知')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.banner').exists(), '进通知中心后横幅应已收起').toBe(false)
  })

  it('H 设置里的开关是真实可用按钮，且状态持久化', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '设置')

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
    await clickDesktopApp(reopened, '设置')
    const soundAgain = reopened
      .findAll('button[role="switch"]')
      .find((s) => s.attributes('aria-label') === '音效')
    expect(soundAgain?.attributes('aria-checked')).toBe('false')
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
