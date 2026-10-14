import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from '@/app/AppShell.vue'
import { DEFAULT_DURATIONS, FIRST_NOTICE_DELAY_MS, LEAVE_MS } from '@/app/notifications'
import { reloadSettings } from '@/app/settings'
import { __resetSoundForTests } from '@/app/sound'
import { BRAND } from '@/data/level01'
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

/**
 * 点击桌面上的应用图标（避免与状态栏按钮的同名 aria-label 冲突）。
 * 图标分布在网格区与程序坞（Dock）两处，因此按整个桌面查找。
 */
async function clickDesktopApp(wrapper: VueWrapper, label: string): Promise<void> {
  const icon = wrapper
    .findAll('.home .app')
    .find((b) => (b.text() ?? '').includes(label))
  if (!icon) {
    const available = wrapper.findAll('.home .app').map((b) => b.text().trim()).join(' | ')
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
    // 桌面就是整页手机，没有外层网页导航
    expect(wrapper.findAll('a')).toHaveLength(0)
  })

  it('B01 角标与横幅时序一致：横幅未弹时角标不亮，弹出后才亮', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    // 延迟期间：横幅未弹，角标也不应亮（避免时序倒置）
    expect(wrapper.find('.banner').exists(), '延迟期间不应有横幅').toBe(false)
    expect(wrapper.find('.app__badge').exists(), '延迟期间不应有角标').toBe(false)

    // 等横幅弹出后，角标才出现
    await new Promise((r) => setTimeout(r, FIRST_NOTICE_DELAY_MS + 250))
    expect(wrapper.find('.banner').exists(), '延迟后应有横幅').toBe(true)
    expect(wrapper.find('.app__badge').exists(), '横幅弹出后应有角标').toBe(true)
  })

  it('B01 角标风格统一：青讯与通知都用数字徽标，不存在圆点样式', async () => {
    const wrapper = mountApp()
    await swipeUnlockAndWaitNotices(wrapper)

    // 所有角标都走同一个 .app__badge 类
    const badges = wrapper.findAll('.app__badge')
    expect(badges.length).toBeGreaterThan(0)
    for (const b of badges) {
      expect(b.classes(), '角标不应再有第二种（圆点）样式').not.toContain('app__badge--dot')
      expect(b.text().trim(), '角标应为数字或符号，不是空圆点').not.toBe('')
    }
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
    await swipeUnlockAndWaitNotices(wrapper)

    await click(wrapper, '安心钱包')
    expect(wrapper.text()).toContain('没有待处理的钱')
    expect(wrapper.text()).toContain('800')

    await click(wrapper, '桌面')
    await clickDesktopApp(wrapper, '国家反诈中心')
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
    // （资料入口现在是标题栏右侧的「···」，靠 aria-label 定位；
    //  真机消息应用里这个按钮的文案不会因为看过一次就变，因此断言保持不变即可）
    await click(wrapper, '群主资料')
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

    // 从结局回到桌面，再经桌面图标进入反诈应用（底部导航已改为三大金刚键，
    // 不再提供「反诈」快捷入口，因此这里显式走桌面图标）。
    await click(wrapper, '桌面')
    await clickDesktopApp(wrapper, '国家反诈中心')
    await click(wrapper, '看本局结果')
    expect(wrapper.text()).toContain('提前识破')

    await click(wrapper, '看复盘')
    await flush()
    expect(wrapper.text()).toContain('复盘')
    expect(wrapper.text()).toContain('你碰到的')

    // 复盘也可以离开再进入
    await click(wrapper, '桌面')
    await clickDesktopApp(wrapper, '国家反诈中心')
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
    // 相册不再空着：有自绘风景照片
    expect(wrapper.text()).toContain('张照片')
    expect(wrapper.findAll('.thumb').length).toBeGreaterThan(0)
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

/**
 * 安装一个假的 AudioContext，用来统计音效是否真的被请求播放。
 *
 * jsdom 没有 Web Audio，真实的 playSound 会静默降级，
 * 因此必须替换构造器才能在单元测试里断言「这一点击有没有出声」。
 */
function installFakeAudio(): { count: () => number } {
  let oscillators = 0

  const audioParam = () => ({
    value: 0,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  })

  class FakeAudioContext {
    state = 'running'
    currentTime = 0
    destination = {}
    resume(): Promise<void> {
      return Promise.resolve()
    }
    createOscillator() {
      oscillators += 1
      return {
        type: 'sine',
        frequency: audioParam(),
        connect: () => {},
        start: () => {},
        stop: () => {},
      }
    }
    createGain() {
      return { gain: audioParam(), connect: () => {} }
    }
  }

  Object.defineProperty(globalThis, 'AudioContext', {
    value: FakeAudioContext,
    configurable: true,
    writable: true,
  })

  return { count: () => oscillators }
}

/**
 * 音效覆盖：每个应用入口都必须出声。
 *
 * 回归用例：`openManual()` 曾经漏调 playSound，
 * 导致桌面「国家反诈中心」图标点击没有声音。
 */
describe('L. 音效覆盖（桌面大图标 / 底部导航）', () => {
  let audio: { count: () => number }

  beforeEach(() => {
    __resetSoundForTests()
    audio = installFakeAudio()
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'AudioContext')
    __resetSoundForTests()
  })

  it('L01 点击桌面「国家反诈中心」图标播放点击音效', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    const before = audio.count()
    await clickDesktopApp(wrapper, '国家反诈中心')

    // 确实进入了反诈应用（识骗手册是它的一个栏目）
    expect(wrapper.text()).toContain(BRAND.manualSection)
    expect(audio.count(), '桌面反诈图标点击后应创建振荡器').toBeGreaterThan(before)
  })

  it('L02 点击底部「最近任务」键播放点击音效', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    const key = wrapper
      .findAll('button')
      .find((b) => b.attributes('aria-label') === '最近任务')
    expect(key, '底部三大金刚键应有「最近任务」').toBeTruthy()

    const before = audio.count()
    await key?.trigger('click')

    expect(audio.count(), '「最近任务」点击后应创建振荡器').toBeGreaterThan(before)
  })
})

/**
 * 底部三大金刚键（Android 导航栏）与最近任务面板。
 *
 * 背景：原先底部是「桌面/返回/反诈」，其中「反诈」与桌面程序坞里的
 * 「国家反诈中心」重复；换成真机的三个导航键后不再重复。
 * 最近任务必须是真实可用的面板，不能做成点了没反应的死按钮。
 */
describe('P. 底部导航键与最近任务', () => {
  it('P01 底部是三大金刚键，且不再有重复的「反诈」按钮', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    const keys = wrapper.findAll('.nav__btn')
    expect(keys.length, '底部应有三个导航键').toBe(3)

    const labels = keys.map((k) => k.attributes('aria-label'))
    expect(labels).toEqual(['返回上一层', '回到桌面', '最近任务'])

    // 三个键都必须可点（真机主页键不会变灰）
    for (const key of keys) {
      expect(key.attributes('disabled'), `${key.attributes('aria-label')} 不应被禁用`).toBeUndefined()
    }

    // 反诈入口只保留桌面程序坞那一个，底部不再重复
    const navText = keys.map((k) => k.text()).join('')
    expect(navText.trim(), '导航键不应有可见文字').toBe('')
    const manualInNav = wrapper
      .findAll('.nav__btn')
      .filter((b) => (b.attributes('aria-label') ?? '').includes('反诈'))
    expect(manualInNav.length, '底部导航不应再有反诈入口').toBe(0)
  })

  it('P02 最近任务列出打开过的应用，可再次打开，且空态明确', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    // 还没打开过任何应用：面板给出空态，而不是空白
    await click(wrapper, '最近任务')
    expect(wrapper.find('.recents__empty').exists(), '未打开过应用时应显示空态').toBe(true)
    await click(wrapper, '关闭最近任务')

    // 打开两个应用后，最近任务里应能看到它们（最新在前）
    await clickDesktopApp(wrapper, '相册')
    await click(wrapper, '最近任务')
    let items = wrapper.findAll('.recents__item')
    expect(items.length, '打开过相册后应有记录').toBe(1)
    expect(items[0]?.text()).toContain('相册')
    await click(wrapper, '关闭最近任务')

    await click(wrapper, '回到桌面')
    await clickDesktopApp(wrapper, '设置')
    await click(wrapper, '最近任务')
    items = wrapper.findAll('.recents__item')
    expect(items.length, '打开过两个应用后应有两条记录').toBe(2)
    expect(items[0]?.text(), '最近打开的应排在最前').toContain('设置')

    // 点击记录可切回该应用
    await click(wrapper, '切到相册')
    expect(wrapper.find('.album').exists(), '应从最近任务切回相册').toBe(true)
  })
})

/**
 * 音效覆盖（第二轮）：把「点了没声音」当成一类缺陷逐个清掉。
 *
 * 起因：用户报「反诈图标点击没声音」，查下来 `openManual()` 漏调 playSound。
 * 顺着同一类缺陷往下查，又发现 7 处按钮静音：横幅「×」、继续当前事项、
 * 清空通知、清掉重来、算了接着玩、关闭资料（两个按钮）、显示全部。
 *
 * 这些用例刻意逐个按钮断言，不写「随便点一下有声音就算过」的宽松断言 ——
 * 否则新增按钮再漏音效时，测试依然全绿。
 */
describe('M. 音效覆盖：没有静音按钮', () => {
  let audio: { count: () => number }

  beforeEach(() => {
    __resetSoundForTests()
    audio = installFakeAudio()
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'AudioContext')
    __resetSoundForTests()
  })

  /** 点击前记录振荡器数，点击后返回增量。找不到目标直接抛错，不让用例假性通过。 */
  async function soundDelta(
    wrapper: VueWrapper,
    selector: string,
    label: string,
  ): Promise<number> {
    const target = wrapper.find(selector)
    if (!target.exists()) throw new Error(`找不到「${label}」（${selector}）`)
    const before = audio.count()
    await target.trigger('click')
    await flush()
    return audio.count() - before
  }

  it('M01 锁屏上滑解锁有音效', async () => {
    const wrapper = mountApp()
    const before = audio.count()
    await swipeUnlock(wrapper)
    expect(audio.count(), '解锁应出声').toBeGreaterThan(before)
  })

  it('M02 桌面六个图标每一个都有音效', async () => {
    // 六个图标点击后都会切视图，因此每个都用全新挂载，避免互相影响
    for (const label of ['青讯', '安心钱包', '国家反诈中心', '相册', '通知', '设置']) {
      const wrapper = mountApp()
      await swipeUnlock(wrapper)
      const before = audio.count()
      await clickDesktopApp(wrapper, label)
      expect(audio.count(), `桌面「${label}」图标点击应出声`).toBeGreaterThan(before)
      wrapper.unmount()
    }
  })

  it('M03 桌面「继续当前事项」有音效', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    // 有存档时桌面才出现这个入口
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '进群看看')
    await click(wrapper, '桌面')

    const before = audio.count()
    await click(wrapper, '继续当前事项')
    expect(audio.count(), '「继续当前事项」应出声').toBeGreaterThan(before)
  })

  it('M04 顶部横幅手动「×」关闭有音效', async () => {
    const wrapper = mountApp()
    await swipeUnlockAndWaitNotices(wrapper)
    expect(wrapper.find('.banner').exists(), '延迟后应有横幅').toBe(true)
    // before 在横幅已弹出之后取值，已包含弹出时那声预警音，只测手动关闭这一声
    expect(await soundDelta(wrapper, '.banner__close', '横幅关闭'), '手动关闭横幅应出声').toBeGreaterThan(0)
  })

  it('M05 通知中心「清空通知」有音效', async () => {
    const wrapper = mountApp()
    await swipeUnlockAndWaitNotices(wrapper)
    await clickDesktopApp(wrapper, '通知')

    expect(await soundDelta(wrapper, '.center__clear', '清空通知'), '「清空通知」应出声').toBeGreaterThan(0)
  })

  it('M06 「清掉，重来」与「算了，接着玩」都有音效', async () => {
    // 取消分支
    const a = mountApp()
    await swipeUnlock(a)
    await click(a, '重新开始本局')
    expect(await soundDelta(a, '.overlay__close', '遮罩关闭'), '关闭确认框应出声').toBeGreaterThan(0)

    await click(a, '重新开始本局')
    const cancelBtn = a.findAll('button').find((b) => b.text().includes('算了，接着玩'))
    expect(cancelBtn, '应有「算了，接着玩」').toBeTruthy()
    const before = audio.count()
    await cancelBtn?.trigger('click')
    expect(audio.count(), '「算了，接着玩」应出声').toBeGreaterThan(before)

    // 确认清档分支
    await click(a, '重新开始本局')
    const wipeBtn = a.findAll('button').find((b) => b.text().includes('清掉，重来'))
    expect(wipeBtn, '应有「清掉，重来」').toBeTruthy()
    const beforeWipe = audio.count()
    await wipeBtn?.trigger('click')
    await flush()
    expect(audio.count(), '「清掉，重来」应出声').toBeGreaterThan(beforeWipe)
  })

  it('M07 青讯「显示全部」与关闭资料弹层都有音效', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    // 必须进群：邀请会话消息条数少，不会出现「显示全部」
    await click(wrapper, '进群看看')

    const skip = wrapper.findAll('button').find((b) => b.text().includes('显示全部'))
    expect(skip, '群聊里应有「显示全部」').toBeTruthy()
    const beforeSkip = audio.count()
    await skip?.trigger('click')
    expect(audio.count(), '「显示全部」应出声').toBeGreaterThan(beforeSkip)

    // 打开资料弹层 → 关闭
    await click(wrapper, '群主资料')
    expect(await soundDelta(wrapper, '.profilesheet__close', '关闭资料'), '关闭资料应出声').toBeGreaterThan(0)
  })

  it('M08 结局与复盘页的按钮都有音效', async () => {
    const wrapper = mountApp()
    await startAndOpenInvite(wrapper)
    await click(wrapper, '拒绝并举报')
    await flush()

    // 结局页 → 看复盘
    expect(await soundDelta(wrapper, '.ending__review', '看复盘'), '「看复盘」应出声').toBeGreaterThan(0)

    // 复盘页 → 再玩一次（会弹二次确认）
    await flush()
    expect(await soundDelta(wrapper, '.review__restart', '再玩一次'), '复盘页「再玩一次」应出声').toBeGreaterThan(0)
  })
})

/**
 * 桌面外观：模仿真实手机桌面。
 *
 * 用结构断言锁住这次改版的关键决策：
 * 图标不再套卡片、分网格区与程序坞两处、桌面有时钟组件。
 * （具体的尺寸/圆角/毛玻璃在真实浏览器由 verify-edge.mjs 断言。）
 */
describe('N. 桌面外观（真实手机样式）', () => {
  const dockLabels = ['青讯', '安心钱包', '国家反诈中心']
  const gridLabels = ['相册', '通知', '设置']

  it('N01 图标分布在程序坞与网格区，六个应用一个不少', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    const dock = wrapper.findAll('.dock .app')
    const grid = wrapper.findAll('.apps .app')
    expect(dock.length, '程序坞应有 3 个应用').toBe(3)
    expect(grid.length, '网格区应有 3 个应用').toBe(3)

    // 六个应用恰好各出现一次，没有重复也没有遗漏
    const labels = [...dock, ...grid].map((b) => b.text().replace(/\s+/g, ''))
    for (const label of [...dockLabels, ...gridLabels]) {
      expect(labels.filter((l) => l.includes(label)), `「${label}」应恰好出现一次`).toHaveLength(1)
    }
  })

  it('N02 图标本体不含卡片容器（真实手机桌面图标是裸浮的）', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    const buttons = wrapper.findAll('.home .app')
    expect(buttons.length).toBe(6)
    for (const btn of buttons) {
      // 图标容器只包含「图标 + 标签（+ 角标）」，不应再有卡片式的额外结构
      const classes = btn.classes()
      expect(classes).toContain('app')
      // 不再有旧的卡片式类名残留
      expect(classes).not.toContain('app--card')
      expect(btn.find('.app__glyph').exists(), '每个图标都应有图标本体').toBe(true)
      expect(btn.find('.app__label').exists(), '每个图标都应有文字标签').toBe(true)
    }
  })

  it('N03 桌面有时钟组件，显示北京时间 HH:mm', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    const time = wrapper.find('.clock__time')
    expect(time.exists(), '桌面应有时钟组件').toBe(true)
    expect(time.text(), '时钟应按 HH:mm 显示').toMatch(/^\d{2}:\d{2}$/)

    const date = wrapper.find('.clock__date')
    expect(date.exists(), '时钟组件应带日期').toBe(true)
    expect(date.text()).toContain('星期')
  })

  it('N04 钱包与继续当前事项以组件形式呈现，且仍可点击进入', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    // 钱包组件展示余额
    const wallet = wrapper.find('.widget--wallet')
    expect(wallet.exists(), '应有钱包组件').toBe(true)
    expect(wallet.text()).toContain('800')

    // 继续当前事项组件仍能导航（不推进剧情、不扣款）
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '进群看看')
    await click(wrapper, '桌面')
    const resume = wrapper.find('.resume')
    expect(resume.exists(), '应有「继续当前事项」组件').toBe(true)
    await resume.trigger('click')
    expect(wrapper.find('.chat').exists(), '点击后应回到消息视图').toBe(true)
  })
})

/**
 * Q. 青讯重做成真手机消息应用的样子。
 *
 * 用户要求「聊天软件也需要重新设计一下，比如像微信一样，
 * 同时必须区分群聊和私聊（比如生活费是父母转账过来的，也要在聊天软件里体现）」。
 * 这些用例锁住三件事：会话列表分群聊/私聊、群聊与私聊的显示差异、
 * 生活费 800 元在会话里有明确来源（转账卡片）。
 */
describe('Q. 青讯：会话列表 / 群聊与私聊 / 妈妈转账', () => {
  it('Q01 会话列表区分群聊与私聊，群聊带成员数，未处理的邀请有角标', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')

    // 从会话详情返回会话列表
    await click(wrapper, '返回上一层')

    const rows = wrapper.findAll('.session')
    expect(rows.length, '会话列表应有多个会话').toBeGreaterThanOrEqual(3)

    const labels = rows.map((r) => r.attributes('aria-label') ?? '')
    // 私聊与群聊都要有，且类型写在无障碍标签里（读屏也能区分）
    expect(labels.some((l) => l.startsWith('私聊：')), '应有私聊会话').toBe(true)
    expect(labels.some((l) => l.startsWith('群聊：')), '应有群聊会话').toBe(true)
    expect(labels).toContain('私聊：妈妈')
    expect(labels).toContain('群聊：班级通知群')

    // 群聊行显示成员数，私聊不显示
    const groupRow = rows.find((r) => (r.text() ?? '').includes('班级通知群'))
    expect(groupRow?.text(), '群聊应显示成员数').toContain('42')

    // 未处理的学姐邀请在列表里有未读角标
    const badge = wrapper.find('.session__badge')
    expect(badge.exists(), '未处理的邀请应有未读角标').toBe(true)
    expect(badge.text()).toBe('1')
  })

  it('Q02 生活费 800 元来自妈妈转账，以转账卡片呈现', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '返回上一层') // 回到会话列表

    // 会话列表里能定位到妈妈（会话摘要按真机做法显示最新一条消息）
    const momRow = wrapper.findAll('.session').find((r) => (r.text() ?? '').includes('妈妈'))
    expect(momRow, '会话列表应有妈妈的会话').toBeTruthy()
    expect(momRow?.text()).toContain('在外边别乱花')

    // 打开妈妈会话：应有转账卡片，金额与钱包初始余额一致
    await click(wrapper, '私聊：妈妈')
    await click(wrapper, '显示全部') // 消息逐条出现，先跳过动画
    const card = wrapper.find('.msg--transfer')
    expect(card.exists(), '妈妈会话里应有转账卡片').toBe(true)
    expect(card.text()).toContain('800')
    expect(card.text()).toContain('生活费')
    expect(card.text()).toContain('已收款')
  })

  it('Q03 群聊显示发言人昵称，私聊不显示（真机消息应用的做法）', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '进群看看')
    await click(wrapper, '显示全部')

    // 群聊：他人消息上方有发言人昵称
    const groupNames = wrapper.findAll('.row__name').map((n) => n.text())
    expect(groupNames.length, '群聊应显示发言人昵称').toBeGreaterThan(0)
    expect(groupNames.join(' ')).toContain('群主')

    // 群聊标题带成员数
    expect(wrapper.text()).toContain('128 人')

    // 私聊：不显示昵称（妈妈会话里没有任何 .row__name）
    await click(wrapper, '返回上一层')
    expect(wrapper.findAll('.row__name').length, '回到列表后不应有消息行').toBe(0)
    await click(wrapper, '私聊：妈妈')
    expect(wrapper.findAll('.row__name').length, '私聊不应显示发言人昵称').toBe(0)
    expect(wrapper.findAll('.msg__name').length, '私聊气泡里也不该重复出现昵称').toBe(0)
    // 但不影响消息本身
    expect(wrapper.find('.chat__list').text()).toContain('生活费')
  })
})

/**
 * R. 相册：不能是空白的。
 * 用户要求「相册里面也放一些风景照片不能空着」。
 * 照片是自绘 SVG（无外部资源、无版权风险），这里锁住结构与交互。
 */
describe('R. 相册（自绘风景照片 + 全屏查看器）', () => {
  it('R01 相册里有照片，按日期分组显示', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '相册')

    const thumbs = wrapper.findAll('.thumb')
    expect(thumbs.length, '相册应有照片').toBeGreaterThanOrEqual(6)
    expect(wrapper.text(), '不再出现「相册是空的」这类说明').not.toContain('用不到它')

    // 每张照片都有可读名称，供读屏与查看器使用
    for (const thumb of thumbs) {
      expect(thumb.attributes('aria-label') ?? '').toContain('查看照片：')
    }

    // 按日期分组
    expect(wrapper.findAll('.album__date').length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('张照片')
  })

  it('R02 点击照片可全屏查看，可翻页、可关闭', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '相册')

    const first = wrapper.findAll('.thumb')[0]
    await first?.trigger('click')

    const viewer = wrapper.find('.viewer')
    expect(viewer.exists(), '点击照片应打开全屏查看器').toBe(true)
    expect(viewer.text()).toContain('第 1 / ')
    expect(wrapper.find('.viewer__nav[aria-label="上一张"]').attributes('disabled')).toBeDefined()

    // 翻到下一张
    await click(wrapper, '下一张')
    expect(wrapper.text()).toContain('第 2 / ')

    // 关闭后回到网格
    await click(wrapper, '关闭照片')
    expect(wrapper.find('.viewer').exists(), '关闭后应回到网格').toBe(false)
    expect(wrapper.findAll('.thumb').length).toBeGreaterThan(0)
  })
})

/**
 * S. 沉浸感：去掉多余的文字介绍 + 锁屏到桌面的过渡 + 设置页重开入口。
 *
 * 用户要求「在不需要文字介绍的地方去除掉文字介绍，要真实沉浸感」，
 * 以及「锁屏解锁屏幕需要有一点过渡动画」。
 * 真手机的锁屏只有时间、日期和壁纸，不会先解释一遍这是什么。
 */
describe('S. 沉浸感（去说明文字 / 解锁过渡 / 设置页重开）', () => {
  it('S01 锁屏只留一行必要标记，不再有大段解释', async () => {
    const wrapper = mountApp()

    // 必要的模拟标记仍在（合规要求：持续可见）
    expect(wrapper.text()).toContain('剧情演示')

    // 元叙述已删除
    expect(wrapper.text(), '不应再解释「这是虚构手机」').not.toContain('虚构的手机')
    expect(wrapper.text(), '不应再解释「给你 800 元虚拟生活费」').not.toContain('虚拟生活费')
    // 但仍要能正常解锁
    expect(wrapper.text()).toContain('上滑解锁')
  })

  it('S02 解锁后桌面用解锁过渡进入（类名可断言）', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    const page = wrapper.find('.viewport__page')
    expect(page.exists(), '换页容器应存在').toBe(true)
    expect(page.classes(), '锁屏→桌面应使用解锁过渡').toContain('viewport__page--unlock')
    expect(wrapper.find('.home').exists()).toBe(true)
  })

  it('S03 通知中心与结局/复盘不再有元叙述提示', async () => {
    const wrapper = mountApp()
    await swipeUnlockAndWaitNotices(wrapper)

    // 通知中心：可点的通知行右侧改为箭头，不再写「点击查看」
    await clickDesktopApp(wrapper, '通知')
    expect(wrapper.find('.center__item--message').exists(), '应有可点的消息通知').toBe(true)
    expect(wrapper.text(), '不应再提示「点击查看」').not.toContain('点击查看')
    await click(wrapper, '返回')

    // 结局与复盘：不再解释「可以先去别处逛逛」「会先问一句」
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '拒绝并举报')
    await flush()
    expect(wrapper.text()).toContain('提前识破')
    expect(wrapper.text(), '结局页不应再解释怎么离开').not.toContain('先去别处逛逛')

    await click(wrapper, '看复盘')
    await flush()
    expect(wrapper.text(), '复盘页不应再解释二次确认').not.toContain('会先问一句')
  })

  it('S04 设置页也提供「重新开始本局」，且仍需二次确认', async () => {
    const wrapper = mountApp()
    // startAndReachPayment 内部已包含「解锁 → 进群 → 接下任务」
    await startAndReachPayment(wrapper)
    await click(wrapper, '确认垫付 100 元')
    await flush()
    expect(readSave()?.balance).toBe(700)

    // 从设置页重开（真机把「清空数据」放在设置里）
    await click(wrapper, '回到桌面')
    await clickDesktopApp(wrapper, '设置')
    await click(wrapper, '重新开始本局')
    expect(wrapper.text()).toContain('重来一次？')

    // 取消后进度不变
    await click(wrapper, '算了，接着玩')
    expect(readSave()?.balance).toBe(700)
  })
})

/**
 * T. 壁纸主题 + 应用打开逻辑。
 *
 * 用户要求：壁纸分白天/夜间两套、默认按时间切换、设置里保留开关；
 * 并优化「应用打开逻辑」（此前有几个明显的怪行为，见下面各条）。
 */
describe('T. 壁纸主题与应用打开逻辑', () => {
  it('T01 主题默认自动，写在 html 上供样式与断言读取', async () => {
    mountApp()
    await flush()

    const html = globalThis.document.documentElement
    const theme = html.getAttribute('data-theme')
    expect(['day', 'night'], 'data-theme 只能是 day 或 night').toContain(theme)
    expect(html.getAttribute('data-theme-mode'), '默认模式是 auto').toBe('auto')
  })

  it('T02 设置里可切换白天/夜间，且写入本地设置', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '设置')

    const html = globalThis.document.documentElement
    await click(wrapper, '壁纸：夜间')
    expect(html.getAttribute('data-theme'), '锁定夜间后立即生效').toBe('night')
    expect(html.getAttribute('data-theme-mode')).toBe('night')

    await click(wrapper, '壁纸：白天')
    expect(html.getAttribute('data-theme'), '锁定白天后立即生效').toBe('day')

    const saved = JSON.parse(globalThis.localStorage.getItem('fj-juzhongju:settings:v1') as string)
    expect(saved.theme).toBe('day')
  })

  it('T03 打开相册总是回到网格第一屏，不停在上次翻到的那张', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)

    await clickDesktopApp(wrapper, '相册')
    await wrapper.findAll('.thumb')[1]?.trigger('click')
    expect(wrapper.find('.viewer').exists(), '应打开查看器').toBe(true)

    // 回桌面再进相册：不应还停在查看器里
    await click(wrapper, '回到桌面')
    await clickDesktopApp(wrapper, '相册')
    expect(wrapper.find('.viewer').exists(), '重新打开相册应回到网格').toBe(false)
    expect(wrapper.findAll('.thumb').length).toBeGreaterThan(0)
  })

  it('T04 结局/复盘之后再点青讯，给的是会话列表而不是某个会话', async () => {
    const wrapper = mountApp()
    await startAndOpenInvite(wrapper)
    await click(wrapper, '拒绝并举报')
    await flush()
    // 此时节点已是 end-clear，剧情会话已经结束
    await click(wrapper, '回到桌面')
    await clickDesktopApp(wrapper, '青讯')

    expect(wrapper.find('.sessions').exists(), '应进入会话列表').toBe(true)
    expect(wrapper.find('.chat__list').exists(), '不应直接进入某个会话').toBe(false)
  })

  it('T05 跳过消息动画的入口在消息末尾，不在顶部挤压第一条消息', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')

    const body = wrapper.find('.chat__body')
    // 「显示全部」应出现在消息列表之后（DOM 顺序上晚于 .chat__list）
    const list = body.find('.chat__list')
    const skip = body.find('.chat__skiprow')
    expect(skip.exists(), '应有跳过动画的入口').toBe(true)
    const children = [...body.element.children].map((el) => el.className)
    expect(
      children.indexOf('chat__skiprow'),
      '「显示全部」应排在消息列表之后',
    ).toBeGreaterThan(children.indexOf('chat__list'))
    expect(list.exists()).toBe(true)
  })
})

/**
 * U. 文案冗余（实拍审计发现）
 *
 * 用脚本把每个界面玩家真正看到的文字全打印出来后，发现两处「重复提示」：
 * 钱包组件在没垫付时也写「已垫付 0 元」，以及群里连续两条自称到账
 * 各带一句「他自己说的」。重复提示等于没有提示，这里锁住修复结果。
 */
describe('U. 文案不重复', () => {
  it('U01 钱包组件没垫付时不写「已垫付 0 元」，垫付后才显示', async () => {
    const wrapper = mountApp()
    // startAndReachPayment 内部已包含「解锁 → 进群 → 接下任务」，
    // 这里不要再单独解锁一次（会因为没有锁屏而失败）。
    await startAndReachPayment(wrapper)
    await click(wrapper, '回到桌面')

    const note = wrapper.find('.walletcard__note')
    expect(note.text()).toContain('生活费 800 元')
    expect(note.text(), '没垫付时不必显示「已垫付 0 元」').not.toContain('已垫付')

    // 垫付一笔后，这条信息才有意义
    await click(wrapper, '继续当前事项')
    await click(wrapper, '确认垫付 100 元')
    await flush()
    await click(wrapper, '回到桌面')
    const after = wrapper.find('.walletcard__note')
    expect(after.text(), '垫付后应显示已垫付金额').toContain('已垫付 100 元')
  })

  it('U02 「他自己说的」只标一次，不逐条重复', async () => {
    const wrapper = mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '进群看看')
    await click(wrapper, '显示全部')

    // 群里有多条自称到账的消息，但标注只应出现一次
    const claims = wrapper.findAll('.msg--claim')
    const notes = wrapper.findAll('.msg__note').filter((n) => n.text().includes('他自己说的'))
    expect(claims.length, '群里应有不止一条自称到账的消息').toBeGreaterThan(1)
    expect(notes.length, '「他自己说的」只标一次').toBe(1)
  })
})
