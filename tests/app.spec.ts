import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from '@/app/AppShell.vue'
import { resetChatReveal } from '@/app/chatReveal'
import { DEFAULT_DURATIONS, FIRST_NOTICE_DELAY_MS, LEAVE_MS } from '@/app/notifications'
import { reloadSettings } from '@/app/settings'
import { __resetSoundForTests } from '@/app/sound'
import { BRAND } from '@/data/levels/shared'
import { GROUP_MESSAGES, REBATE_MESSAGES } from '@/data/levels/level01'
import { findForbiddenClaim } from '@/game/debrief'
import { loadSave, saveGame, saveKey } from '@/game/storage'
import { choose, createInitialState } from '@/game/engine'
import type { GameState, LevelId, OptionId } from '@/game/types'

/**
 * 集成测试：在 jsdom 中真实挂载整部手机并点击真实按钮。
 * 覆盖自由探索、资料、付款、结局、复盘与重开路径。
 *
 * 多关卡之后：默认在**第一关**，第二关的用例显式切关（`enterLevel`）。
 */

const mounted: VueWrapper[] = []

/**
 * 挂载一部新的手机；默认先清空存档（模拟全新开局）。
 *
 * 首屏现在是**关卡大厅**（一级菜单，书桌版），选定关卡后才进那一关的锁屏。
 * 为了让既有用例继续从「第一关的锁屏」开始，这里默认点桌上第一部手机进入第一关；
 * 需要停在书桌本身（例如断言首屏顺序）的用例传 `{ atDesk: true }`。
 *
 * **必须 await**：点手机之后转场是异步的，不等一拍的话调用方紧接着
 * 断言读到的还是书桌（`.deskphone` 还在、锁屏还没出现）。
 */
async function mountApp(
  options: {
    keepSave?: boolean
    atDesk?: boolean
    attach?: boolean
    resetReveal?: boolean
    keepIntro?: boolean
  } = {},
): Promise<VueWrapper> {
  if (!options.keepSave) globalThis.localStorage.clear()
  /*
   * 会话「逐条出现」的进度记在模块级（app/chatReveal.ts），这样离开消息应用
   * 再回来时不用重播动画。但它在同一个测试文件里会跨用例残留 ——
   * 真实场景中刷新页面等于新开局、这份内存记忆会一起重置，所以这里也重置，
   * 让每个用例都从「第一次进入会话」开始。
   */
  if (options.resetReveal !== false) resetChatReveal()
  /*
   * `attach`：默认挂载到游离容器（更快，也够用于大多数断言）。
   * 但**键盘焦点**相关用例必须挂到 document 上 —— 游离元素调 `.focus()`
   * 不会生效，`document.activeElement` 会一直是 `<body>`。
   */
  const wrapper = mount(AppShell, options.attach ? { attachTo: document.body } : undefined)
  mounted.push(wrapper)

  // 作品封面是首屏引导；除专门测试它的用例外，测试统一先进入作品。
  if (!options.keepIntro && wrapper.find('.work-intro').exists()) {
    await wrapper.find('.work-intro__start').trigger('click')
    await wrapper.vm.$nextTick()
  }

  if (!options.atDesk) {
    await tapPhone(wrapper, 0)
  }
  return wrapper
}

/**
 * 模拟「刷新回大厅」：关卡进行中不再有关卡入口，切关只能刷新页面后在大厅重选。
 * 卸载当前实例（保留存档），重新挂到书桌，返回新实例。
 */
async function remountAtDesk(wrapper: VueWrapper, resetReveal = true): Promise<VueWrapper> {
  wrapper.unmount()
  mounted.pop()
  return mountApp({ keepSave: true, atDesk: true, resetReveal })
}

/**
 * 直接结束转场：给飞行层派发一次 `propertyName === 'transform'` 的 `transitionend`。
 *
 * 为什么不真的等 520ms：集成测试有几十个用例都要从书桌进第一关，真等的话
 * 每个用例多花半秒，整套测试会慢几十秒；而且等真实定时器本身也不确定。
 * 派发事件走的是与真机**完全相同**的提交路径（`onTransitionEnd` → `commit`），
 * 所以覆盖度没有损失，速度却是确定的。超时兜底那条路径由 Y06 单独用假定时器覆盖。
 */
function finishFlight(wrapper: VueWrapper): void {
  const fly = wrapper.find('.desk__fly')
  if (!fly.exists()) return
  const event = new Event('transitionend', { bubbles: true })
  // jsdom 的 TransitionEvent 拿不到 propertyName，手动注入（与 pointerEvent 同一手法）
  Object.defineProperty(event, 'propertyName', { value: 'transform' })
  ;(fly.element as HTMLElement).dispatchEvent(event)
}

/** 点桌上第 `index` 部手机（0 起），并把转场直接走完。 */
async function tapPhone(wrapper: VueWrapper, index: number): Promise<void> {
  const phone = wrapper.findAll('.deskphone')[index]
  if (!phone) {
    const available = wrapper.findAll('.deskphone').map((p) => p.text().trim()).join(' | ')
    throw new Error(`书桌上找不到第 ${index + 1} 部手机。当前可用：${available}`)
  }
  await phone.trigger('click')
  /*
   * 这里**只能等微任务（$nextTick），不能等 setTimeout**。
   *
   * 原因：本文件里有三个用假定时器的通知用例，它们会在 try 块里调用
   * `mountApp()`。如果挂载过程中 await 了真实定时器（原先的 flush 就是
   * `setTimeout(…, 5)`），在假定时器下这个 promise 永远不会 settle ——
   * 用例超时、`finally` 里的 `useRealTimers()` 也就永远等不到，
   * 于是假定时器泄漏给后面所有用例，整份文件几十个用例一起超时。
   * 流程本身（点击 → 飞行层 → transitionend → 进入）全是微任务，够用。
   */
  await wrapper.vm.$nextTick()
  finishFlight(wrapper)
  await wrapper.vm.$nextTick()
}

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
  /*
   * 兜底复位：本文件有几处用假定时器的用例。一旦某个用例在假定时器下超时，
   * 它 `finally` 里的 `useRealTimers()` 可能永远等不到（异步函数停在永不
   * settle 的 await 上），假定时器就会泄漏给后面所有用例 —— 表现是几十个
   * 用例一起 5 秒超时。这里每个用例结束都强制复位，把「一个用例出问题」
   * 的爆炸半径限制在那一个用例内。
   */
  vi.useRealTimers()
  // 减弱动效的用例会替换 globalThis.matchMedia，同样用完必须还原
  vi.unstubAllGlobals()
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
 * 等模拟短信**真正弹出来**，再读出 6 位验证码。
 *
 * 为什么要等：进入系统后的第一条通知有一段「先让玩家看清桌面」的延迟
 * （`FIRST_NOTICE_DELAY_MS = 3000`）。测试不推进真实时间就永远读不到横幅，
 * 而读不到就说明不了任何事。这里轮询到 5 秒，超时才报错。
 *
 * 验证码是**本地随机生成**的，不能写死；正确做法与真人一样：从短信里读出来再填回去。
 */
async function waitForSmsCode(wrapper: VueWrapper): Promise<string> {
  for (let i = 0; i < 50; i += 1) {
    const matched = wrapper.text().match(/校验码\s*(\d{6})/)
    if (matched) return matched[1]
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(
    `等不到模拟验证码短信。当前文本前 200 字：${wrapper.text().slice(0, 200)}`,
  )
}

/** 在验证码输入区填入并提交（模拟玩家「把码发给他」）。 */
async function enterCode(wrapper: VueWrapper, code: string): Promise<void> {
  const input = wrapper.find('.gate__input')
  if (!input.exists()) throw new Error('验证码输入框不存在（是否已进入需要验证码的节点？）')
  await input.setValue(code)
  await wrapper.find('.gate__submit').trigger('click')
  await flush()
}

/**
 * 如果弹出了「国家反诈中心」弹窗，就点「我知道了」关掉。
 *
 * **必须真的点**：jsdom 里 `setValue` 与 `trigger('click')` 都不做命中测试，
 * 弹窗盖在上面也照样"成功"—— 用例会假绿。真人点不到被遮住的按钮，
 * 所以这里要把这一步补上，否则测出来的流程根本走不通。
 */
async function dismissAntifraud(wrapper: VueWrapper): Promise<boolean> {
  const ok = wrapper.find('.af__ok')
  if (!ok.exists()) return false

  // 转账环节的弹窗有倒计时：按钮在倒计时结束前是 disabled 的。
  if (ok.attributes('disabled') !== undefined) {
    const seconds = Number(wrapper.find('.af__countdown').text().match(/\d+/)?.[0] ?? 0)
    if (seconds > 0) await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000))
  }

  await ok.trigger('click')
  await flush()
  return true
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

/**
 * 开场 → 进群 → 接下任务（到达首次待付款页）。
 *
 * 到达 `transfer-100` 时会弹出「国家反诈中心」警告（该节点在 `popupReminders` 里），
 * 这里顺手关掉 —— 真人也得先点「我知道了」才能操作付款页。
 */
async function startAndReachPayment(wrapper: VueWrapper): Promise<void> {
  await startAndEnterGroup(wrapper)
  await click(wrapper, '接下任务')
  await dismissAntifraud(wrapper)
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

/** 读取当前关卡的存档（默认第一关）。 */
function readSave(levelId: LevelId = 'level-01'): GameState | null {
  return loadSave(globalThis.localStorage, levelId)
}

beforeEach(() => {
  globalThis.localStorage.clear()
  // 设置是模块级单例：清掉存储后必须重新加载，
  // 否则前一个用例关掉的开关会泄漏到后续用例。
  reloadSettings()
})

describe('E. 整部手机的交互（B01–B14）', () => {
  it('B01/B08 锁屏上滑解锁 → 桌面：先看到独立桌面，不是答题页', async () => {
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const shortSwipe = await mountApp()
    const surface = shortSwipe.find('.lock__surface')
    const el = surface.element
    el.dispatchEvent(pointerEvent('pointerdown', 600))
    el.dispatchEvent(pointerEvent('pointermove', 590))
    el.dispatchEvent(pointerEvent('pointerup', 590))
    await flush()
    expect(shortSwipe.text()).toContain('上滑解锁')
    expect(shortSwipe.find('.home').exists()).toBe(false)

    // 点击解锁面即可进入（不依赖滑动）
    const byClick = await mountApp()
    await clickUnlock(byClick)
    expect(byClick.find('.home').exists()).toBe(true)

    // 键盘 Enter 同样可解锁
    const byKey = await mountApp()
    await byKey.find('.lock__surface').trigger('keydown', { key: 'Enter' })
    await flush()
    expect(byKey.find('.home').exists()).toBe(true)
  })

  it('B01/B09 「青讯」图标与「继续当前事项」都能到达邀请', async () => {
    const viaIcon = await mountApp()
    await swipeUnlock(viaIcon)
    await clickDesktopApp(viaIcon, '青讯')
    expect(viaIcon.text()).toContain('拒绝并举报')

    const viaResume = await mountApp()
    await swipeUnlock(viaResume)
    expect(viaResume.find('.resume').exists(), '还没进入剧情前不应显示「继续当前事项」').toBe(false)
    await clickDesktopApp(viaResume, '青讯')
    await click(viaResume, '桌面')
    expect(viaResume.find('.resume').exists(), '进入剧情再回桌面后才显示「继续当前事项」').toBe(true)
    await click(viaResume, '继续当前事项')
    expect(viaResume.text()).toContain('拒绝并举报')
  })

  it('B11 邀请可忽略：先看钱包/反诈应用再回来，邀请仍在且未扣款', async () => {
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)
    await click(wrapper, '安心钱包')
    expect(wrapper.text()).toContain('没有待处理的钱')
    expect(findButton(wrapper, '确认垫付')).toBeUndefined()
  })

  it('A08 连点确认只扣一次款', async () => {
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)

    // 刚解锁时不应立刻有横幅（玩家要先看到桌面）
    expect(wrapper.find('.banner').exists(), '解锁瞬间不应弹通知').toBe(false)
    expect(wrapper.find('.home').exists(), '应已在桌面').toBe(true)

    // 等过延迟后通知才出现
    await new Promise((r) => setTimeout(r, FIRST_NOTICE_DELAY_MS + 200))
    expect(wrapper.find('.banner').exists(), '延迟后应弹出通知').toBe(true)
  })

  it('J 延迟后先弹反诈预警，学姐邀请排在它之后等待', async () => {
    const wrapper = await mountApp()
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
      const wrapper = await mountApp()
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
      const wrapper = await mountApp()
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
      const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '进群看看')
    await flush()
    expect(wrapper.find('.banner').exists()).toBe(false)

    // 但通知中心仍能看到预警
    await click(wrapper, '桌面')
    await clickDesktopApp(wrapper, '通知')
    expect(wrapper.text()).toContain('国家反诈中心提醒您')
  })
  it('B13 结局与复盘都可离开并从桌面/手册再次进入', async () => {
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
    await startAndReachPayment(wrapper)
    await click(wrapper, '确认垫付 100 元')
    await flush()
    await click(wrapper, '继续查看任务')
    await dismissAntifraud(wrapper)
    await click(wrapper, '查看追加垫付')
    await dismissAntifraud(wrapper)
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

  it('C04 损坏存档启动时安全回退到锁屏，页面仍可用', async () => {
    globalThis.localStorage.setItem(
      saveKey('level-01'),
      '{"version":2,"levelId":"level-01","node":"group","balance":999999}',
    )
    const wrapper = await mountApp({ keepSave: true })
    expect(wrapper.text()).toContain('上滑解锁')
    expect(readSave()).toBeNull()
  })

  it('C04 有效存档恢复进度，且不能重复扣款', async () => {
    const paid = play(['start', 'enter-group', 'accept-task', 'confirm-100', 'continue-task'])
    saveGame(paid)
    const wrapper = await mountApp({ keepSave: true })

    expect(wrapper.text()).toContain('提现出了点问题')
    await click(wrapper, '继续当前事项')
    expect(wrapper.text()).toContain('停止操作并保留证据')
    // 已确认的首次垫付按钮不复现
    expect(findButton(wrapper, '确认垫付 100 元')).toBeUndefined()
    expect(readSave()?.balance).toBe(700)
  })

  it('B02 转账页不要求敏感信息，也没有任何模拟声明牌', async () => {
    const wrapper = await mountApp()
    await startAndReachPayment(wrapper)
    const text = wrapper.text()
    /*
     * 按用户要求去掉了「游戏内模拟，不会动你的真钱」这类模拟声明：
     * 整个网站本身就是模拟叙事，不需要再挂一块"这是假的"的牌子。
     * 这里改为**反向**断言，防止它被顺手加回来。
     */
    expect(text, '不应再有「不会动你的真钱」这类模拟声明').not.toContain('不会动你的真钱')
    expect(text, '不应再有「剧情演示」字样').not.toContain('剧情演示')
    expect(text).toContain('这一页不用输卡号')
    /*
     * 仍然不允许真的收集敏感信息：
     * - 不许有链接（不能跳走）
     * - 不许有输入框——**例外**是第二关的模拟验证码输入，那是游戏内的剧情环节、
     *   不采集任何真实信息；第一关这里不该出现任何输入框。
     */
    expect(wrapper.findAll('input')).toHaveLength(0)
    expect(wrapper.findAll('a')).toHaveLength(0)
  })

  /**
   * 第一关「刷单返利」的三个掏钱时刻也要弹窗警告（用户要求）。
   *
   * 与第二关「索要验证码」同一套机制，由关卡数据的 `popupReminders` 声明：
   * 首次垫付 / 被要求交解冻费 / 追加垫付 —— 都是正要把钱转出去的那一步。
   */
  it('B02b 刷单返利的掏钱时刻弹「国家反诈中心」警告', async () => {
    const wrapper = await mountApp()
    await startAndEnterGroup(wrapper)

    // ① 接下任务 → 首次待付款：弹窗，第一行说明原因
    await click(wrapper, '接下任务')
    const payDialog = wrapper.find('.af')
    expect(payDialog.exists(), '首次垫付前应弹反诈警告').toBe(true)
    expect(payDialog.text()).toContain('检测到你疑似')
    expect(payDialog.text(), '要说明为什么提醒').toContain('垫付')
    expect(wrapper.find('.gate__input').exists(), '第一关不该有验证码输入').toBe(false)
    // 没点掉之前付款按钮就在弹窗下面，真人点不到 → 必须真的点掉
    expect(await dismissAntifraud(wrapper)).toBe(true)
    expect(wrapper.find('.af').exists()).toBe(false)

    // ② 付完 100 → 返利 → 提现异常：又要交钱，再弹一次
    await click(wrapper, '确认垫付 100 元')
    await flush()
    await click(wrapper, '继续查看任务')
    const freezeDialog = wrapper.find('.af')
    expect(freezeDialog.exists(), '要求交解冻费时应再弹一次警告').toBe(true)
    expect(freezeDialog.text()).toContain('解冻费')
    await dismissAntifraud(wrapper)

    // ③ 查看追加垫付：第三次掏钱，再弹
    await click(wrapper, '查看追加垫付')
    expect(wrapper.find('.af').exists(), '追加垫付前应再弹一次警告').toBe(true)
    await dismissAntifraud(wrapper)

    // 弹窗只警告、不改账本
    expect(readSave('level-01')?.balance, '关掉弹窗不该动钱').toBe(700)
  })

  it('B14 状态栏与只读应用都有响应；状态栏与桌面图标共用同一个通知中心', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)

    // 状态栏点击 → 真正的通知中心（不再有第二个只读面板）
    await click(wrapper, '打开通知')
    expect(wrapper.find('.center__list, .center__empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('国家反诈中心')

    await click(wrapper, '返回')
    await click(wrapper, '相册')
    // 相册不再空着：有真实照片（本地打包）
    expect(wrapper.text()).toContain('张照片')
    expect(wrapper.findAll('.thumb').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.thumb img').length).toBeGreaterThanOrEqual(6)
    await click(wrapper, '桌面')

    // 桌面「通知」图标进入同一个界面
    await clickDesktopApp(wrapper, '通知')
    expect(wrapper.find('.center').exists()).toBe(true)
    await click(wrapper, '返回')

    await clickDesktopApp(wrapper, '设置')
    expect(wrapper.text()).toContain('音效')
  })

  it('K 通知中心打开时不再有横幅遮挡内容', async () => {
    const wrapper = await mountApp()
    await swipeUnlockAndWaitNotices(wrapper)
    // 延迟过后应正在显示横幅
    expect(wrapper.find('.banner').exists(), '延迟后应有横幅').toBe(true)

    // 切到通知中心后横幅必须收起，避免盖住分组标题
    await clickDesktopApp(wrapper, '通知')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.banner').exists(), '进通知中心后横幅应已收起').toBe(false)
  })

  it('H 设置里的开关是真实可用按钮，且状态持久化', async () => {
    const wrapper = await mountApp()
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
    const reopened = await mountApp({ keepSave: true })
    expect(reopened.find('.lock__surface').exists()).toBe(false)
    await clickDesktopApp(reopened, '设置')
    const soundAgain = reopened
      .findAll('button[role="switch"]')
      .find((s) => s.attributes('aria-label') === '音效')
    expect(soundAgain?.attributes('aria-checked')).toBe('false')
  })

  it('B06 动效与音频都不是必要交互：键盘可完成关键选择', async () => {
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)

    const before = audio.count()
    await clickDesktopApp(wrapper, '国家反诈中心')

    // 确实进入了反诈应用（识骗手册是它的一个栏目）
    expect(wrapper.text()).toContain(BRAND.manualSection)
    expect(audio.count(), '桌面反诈图标点击后应创建振荡器').toBeGreaterThan(before)
  })

  it('L02 点击底部「最近任务」键播放点击音效', async () => {
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
    const before = audio.count()
    await swipeUnlock(wrapper)
    expect(audio.count(), '解锁应出声').toBeGreaterThan(before)
  })

  it('M02 桌面十一个入口每一个都有音效', async () => {
    // 十一个入口点击后都会切视图，因此每个都用全新挂载，避免互相影响
    for (const label of [
      '青讯',
      '安心钱包',
      '国家反诈中心',
      '电话',
      '短信',
      '青集商城',
      '青听音乐',
      '青影',
      '相册',
      '通知',
      '设置',
    ]) {
      const wrapper = await mountApp()
      await swipeUnlock(wrapper)
      const before = audio.count()
      await clickDesktopApp(wrapper, label)
      expect(audio.count(), `桌面「${label}」入口点击应出声`).toBeGreaterThan(before)
      wrapper.unmount()
    }
  })

  it('M03 桌面「继续当前事项」有音效', async () => {
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
    await swipeUnlockAndWaitNotices(wrapper)
    expect(wrapper.find('.banner').exists(), '延迟后应有横幅').toBe(true)
    // before 在横幅已弹出之后取值，已包含弹出时那声预警音，只测手动关闭这一声
    expect(await soundDelta(wrapper, '.banner__close', '横幅关闭'), '手动关闭横幅应出声').toBeGreaterThan(0)
  })

  it('M05 通知中心「清空通知」有音效', async () => {
    const wrapper = await mountApp()
    await swipeUnlockAndWaitNotices(wrapper)
    await clickDesktopApp(wrapper, '通知')

    expect(await soundDelta(wrapper, '.center__clear', '清空通知'), '「清空通知」应出声').toBeGreaterThan(0)
  })

  it('M06 「清掉，重来」与「算了，接着玩」都有音效', async () => {
    // 取消分支
    const a = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
  const dockLabels = ['电话', '短信', '青讯', '安心钱包']
  const gridLabels = ['青集商城', '青听音乐', '青影', '相册', '通知', '设置', '国家反诈中心']

  it('N01 图标分布在程序坞与网格区，十一个入口一个不少', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)

    const dock = wrapper.findAll('.dock .app')
    const grid = wrapper.findAll('.apps .app')
    expect(dock.length, '程序坞应有 4 个应用').toBe(4)
    expect(grid.length, '网格区应有 7 个入口').toBe(7)

    // 十一个入口恰好各出现一次，没有重复也没有遗漏
    const labels = [...dock, ...grid].map((b) => b.text().replace(/\s+/g, ''))
    for (const label of [...dockLabels, ...gridLabels]) {
      expect(labels.filter((l) => l.includes(label)), `「${label}」应恰好出现一次`).toHaveLength(1)
    }
    expect(labels.some((l) => l.includes('关卡')), '关卡进行中不应再有「关卡」入口').toBe(false)
  })

  it('N02 图标本体不含卡片容器（真实手机桌面图标是裸浮的）', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)

    const buttons = wrapper.findAll('.home .app')
    expect(buttons.length).toBe(11)
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
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)

    const time = wrapper.find('.clock__time')
    expect(time.exists(), '桌面应有时钟组件').toBe(true)
    expect(time.text(), '时钟应按 HH:mm 显示').toMatch(/^\d{2}:\d{2}$/)

    const date = wrapper.find('.clock__date')
    expect(date.exists(), '时钟组件应带日期').toBe(true)
    expect(date.text()).toContain('星期')
  })

  it('N04 钱包与继续当前事项以组件形式呈现，且仍可点击进入', async () => {
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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

  /**
   * 班级通知群「通知多一点、随机一点」（用户要求）。
   *
   * 固定的几条把群立起来，另外每局随机抽 3–5 条反诈通知。
   * 这里断言的正是关键性质：条数够、有反诈内容、而且**切走再回来不会换一批**
   * （换一批就说明抽签放在了渲染里，"群消息"立刻露馅）。
   */
  it('Q01b 班级通知群消息更多，且带随机反诈通知（重进不换）', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)

    /** 打开班级通知群：青讯会先落在待处理的邀请上，得先退到会话列表。 */
    const openClassGroup = async (): Promise<void> => {
      await clickDesktopApp(wrapper, '青讯')
      await click(wrapper, '返回上一层')
      await click(wrapper, '群聊：班级通知群')
      // 「逐条出现」的进度会被记住，第二次进来可能已经没有这个按钮了
      if (findButton(wrapper, '显示全部')) await click(wrapper, '显示全部')
    }

    await openClassGroup()

    const list = wrapper.find('.chat__list')
    expect(list.exists(), '应进入班级通知群').toBe(true)
    const first = list.findAll('.row')
    expect(first.length, '班级群消息应不止一条').toBeGreaterThanOrEqual(6)

    // 固定内容还在（群才立得住）
    expect(list.text(), '辅导员的教材通知应保留').toContain('教材科')
    // 随机部分来自反诈通知池
    expect(list.text(), '应包含反诈类通知').toContain('验证码')

    const before = first.map((row) => row.text()).join('|')

    // 切到别的应用再回来：仍是同一批（缓存生效），不会当场换一批
    await click(wrapper, '桌面')
    await openClassGroup()
    const after = wrapper
      .find('.chat__list')
      .findAll('.row')
      .map((row) => row.text())
      .join('|')
    expect(after, '同一局内重进班级群，通知不该换一批').toBe(before)
  })

  it('Q02 生活费 800 元来自妈妈转账，以转账卡片呈现', async () => {
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
 * 照片是真实照片、打包为本地资源；这里锁住结构与交互。
 */
describe('R. 相册（真实照片 + 全屏查看器）', () => {
  it('R01 相册里有照片，按日期分组显示', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '相册')

    const thumbs = wrapper.findAll('.thumb')
    expect(thumbs.length, '相册应有照片').toBeGreaterThanOrEqual(6)
    expect(wrapper.findAll('.thumb img').length, '相册应使用真实照片 img').toBeGreaterThanOrEqual(6)
    expect(wrapper.findAll('.thumb svg').length, '相册不应再使用自绘 SVG').toBe(0)
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
    const wrapper = await mountApp()
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
  it('S01 锁屏只有时间、日期与标题，没有任何说明文字', async () => {
    const wrapper = await mountApp()

    /*
     * 按用户要求，连「剧情演示 · 不涉及真实资金」这类模拟标记也去掉了：
     * 整个网站本身就是模拟叙事。这里改成反向断言，防止它被顺手加回来。
     */
    expect(wrapper.text(), '不应再有「剧情演示」模拟标记').not.toContain('剧情演示')
    expect(wrapper.text(), '不应再有「不涉及真实资金」').not.toContain('不涉及真实资金')

    // 元叙述已删除
    expect(wrapper.text(), '不应再解释「这是虚构手机」').not.toContain('虚构的手机')
    expect(wrapper.text(), '不应再解释「给你 800 元虚拟生活费」').not.toContain('虚拟生活费')
    // 但仍要能正常解锁
    expect(wrapper.text()).toContain('上滑解锁')
  })

  it('S02 解锁后桌面用解锁过渡进入（类名可断言）', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)

    const page = wrapper.find('.viewport__page')
    expect(page.exists(), '换页容器应存在').toBe(true)
    expect(page.classes(), '锁屏→桌面应使用解锁过渡').toContain('viewport__page--unlock')
    expect(wrapper.find('.home').exists()).toBe(true)
  })

  it('S03 通知中心与结局/复盘不再有元叙述提示', async () => {
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    await mountApp()
    await flush()

    const html = globalThis.document.documentElement
    const theme = html.getAttribute('data-theme')
    expect(['day', 'night'], 'data-theme 只能是 day 或 night').toContain(theme)
    expect(html.getAttribute('data-theme-mode'), '默认模式是 auto').toBe('auto')
  })

  it('T02 设置里可切换白天/夜间，且写入本地设置', async () => {
    const wrapper = await mountApp()
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

  /**
   * 回归：把模式切到「正好等于当前自动解析结果」的那一档。
   *
   * 之前的实现只 `watch(resolved)`，此时解析结果没变 → watch 不触发
   * → `data-theme-mode` 停在旧值。这是真实 bug，且**只在特定时间暴露**：
   * 白天把 auto 改成 day 会中招，晚上把 auto 改成 night 会中招。
   * 所以这里两种情形都覆盖，避免测试结果随运行时段变化。
   */
  it('T02b 切到与当前自动结果相同的模式，模式标记也要立刻更新', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '设置')

    const html = globalThis.document.documentElement

    // 情形一：auto → day（当自动结果本就是 day 时，解析值不变）
    await click(wrapper, '壁纸：白天')
    expect(html.getAttribute('data-theme'), '锁定白天').toBe('day')
    expect(html.getAttribute('data-theme-mode'), '模式标记应变成 day').toBe('day')

    // 情形二：day → auto（解析值同样仍是 day）
    await click(wrapper, '壁纸：自动')
    expect(html.getAttribute('data-theme-mode'), '模式标记应回到 auto').toBe('auto')

    // 情形三：auto → night（当自动结果本就是 night 时，解析值不变）
    await click(wrapper, '壁纸：夜间')
    expect(html.getAttribute('data-theme'), '锁定夜间').toBe('night')
    expect(html.getAttribute('data-theme-mode'), '模式标记应变成 night').toBe('night')

    // 情形四：night → auto（解析值仍为 night）
    await click(wrapper, '壁纸：自动')
    expect(html.getAttribute('data-theme-mode'), '模式标记应回到 auto').toBe('auto')

    const saved = JSON.parse(globalThis.localStorage.getItem('fj-juzhongju:settings:v1') as string)
    expect(saved.theme).toBe('auto')
  })

  it('T03 打开相册总是回到网格第一屏，不停在上次翻到的那张', async () => {
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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
    const wrapper = await mountApp()
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

  it('U03 设置页壁纸不再重复写「当前：X」（分段控件已表示选中）', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '设置')

    const text = wrapper.text()
    // 分段控件已高亮当前档位，再来一行「当前：自动」是同一信息的第二次表达
    expect(text, '不应再出现「当前：X」这种重复说明').not.toMatch(/当前：/)
    // 但解释自动切换规则的一行要保留（这不是重复，是必要说明）
    expect(text, '应保留自动切换规则说明').toContain('自动按北京时间切换')

    // 切换档位后，选中态仍然由分段控件表达（aria-pressed）
    await click(wrapper, '壁纸：夜间')
    const pressed = wrapper
      .findAll('.seg__btn')
      .filter((b) => b.attributes('aria-pressed') === 'true')
    expect(pressed.length, '应只有一个档位处于选中态').toBe(1)
    expect(pressed[0].text()).toBe('夜间')
  })
})

/**
 * W. 会话「逐条出现」只播一次
 *
 * 用户反馈：第二次进同一个会话，消息又像第一次那样一条一条蹦出来。
 * 原因是进度只存在组件里，而离开消息应用时 ChatScene 会被卸载，
 * 组件状态一起丢掉。现在进度记在模块级（app/chatReveal.ts）：
 * 看过的立刻出现，只有**新来的**消息才继续逐条出现。
 */
describe('W. 会话逐条出现只播一次', () => {
  /** 打开会话列表里的某个会话。 */
  async function openSession(wrapper: VueWrapper, keyword: string): Promise<void> {
    const row = wrapper.findAll('.session').find((s) => s.text().includes(keyword))
    expect(row, `会话列表里应有「${keyword}」`).toBeTruthy()
    await row!.trigger('click')
    await flush()
  }

  it('W01 第二次进同一个会话，消息直接全部出现，不再逐条播放', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)

    // 第一次进入群聊（打开青讯会直接落到剧情相关会话）：先看到一部分
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '进群看看')
    expect(
      wrapper.findAll('.chat__list .row').length,
      '第一次进入时消息是逐条出现的，不是一次全出来',
    ).toBeLessThan(GROUP_MESSAGES.length)
    await click(wrapper, '显示全部')
    expect(wrapper.findAll('.chat__list .row').length).toBe(GROUP_MESSAGES.length)

    // 退回会话列表，再点进同一个会话：应当立刻全部可见
    await click(wrapper, '返回上一层')
    expect(wrapper.findAll('.session').length, '返回后是会话列表').toBeGreaterThan(0)
    await openSession(wrapper, '校园兼职')

    expect(
      wrapper.findAll('.chat__list .row').length,
      '第二次进入应当直接全部显示，而不是又从第一条开始',
    ).toBe(GROUP_MESSAGES.length)
    expect(
      wrapper.find('.chat__skiprow').exists(),
      '已经没有要跳过的内容，不该再出现「显示全部」',
    ).toBe(false)
  })

  it('W02 剧情推进带来的新消息仍然逐条出现（看过的部分不重播）', async () => {
    const wrapper = await mountApp()
    await startAndEnterGroup(wrapper)
    // 先看完群聊，已看过的记为 GROUP_MESSAGES.length
    await click(wrapper, '显示全部')
    expect(wrapper.findAll('.chat__list .row').length).toBe(GROUP_MESSAGES.length)

    // 推进到返利节点：群里会多出返利卡片
    await click(wrapper, '接下任务')
    await dismissAntifraud(wrapper)
    await flush()
    await click(wrapper, '回到桌面')
    await click(wrapper, '继续当前事项')
    await click(wrapper, '确认垫付 100 元')
    await flush()

    // 再打开青讯：剧情节点是 rebate，会直接落到群聊
    await click(wrapper, '回到桌面')
    await clickDesktopApp(wrapper, '青讯')

    const total = GROUP_MESSAGES.length + REBATE_MESSAGES.length
    const now = wrapper.findAll('.chat__list .row').length
    expect(now, '看过的部分应当立刻出现').toBeGreaterThanOrEqual(GROUP_MESSAGES.length)
    expect(now, '新卡片还没到时间，不应一次全出').toBeLessThan(total)
    expect(wrapper.find('.chat__skiprow').exists(), '有新内容时仍应提供「显示全部」').toBe(true)

    await click(wrapper, '显示全部')
    expect(wrapper.findAll('.chat__list .row').length, '跳过动画后应看到全部').toBe(total)
  })

  it('W03 两关的同名会话不共享已读进度（切关后仍从头逐条出现）', async () => {
    /*
     * 「逐条出现」的进度按会话 id 记在模块级（app/chatReveal.ts）。
     * 两关都有 `mom` 会话 —— 如果键只用 sessionId，第二关的妈妈会话会继承
     * 第一关的已读条数，表现为「刚进第二关，妈妈的消息就全都直接显示了」。
     * 所以键必须带关卡命名空间（`${levelId}:${sessionId}`）。
     *
     * 这条用例就是那个命名空间的回归：把键改回纯 sessionId 时它会变红。
     */
    let wrapper = await mountApp()
    await swipeUnlock(wrapper)

    // 第一关：把妈妈会话看完（写入 level-01:mom 的进度）
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '返回上一层')
    await click(wrapper, '私聊：妈妈')
    await click(wrapper, '显示全部')
    const l1Count = wrapper.findAll('.chat__list .row').length
    expect(l1Count, '第一关妈妈会话应有消息').toBeGreaterThan(0)

    // 切到第二关（同名 mom 会话，但还没有任何已读进度）。
    // 关卡内不再有关卡入口，切关 = 刷新回大厅；这里保留已读进度，只重挂大厅。
    wrapper = await remountAtDesk(wrapper, false)
    await tapPhone(wrapper, 1)
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '返回上一层')
    await click(wrapper, '私聊：妈妈')

    expect(
      wrapper.findAll('.chat__list .row').length,
      '第二关的妈妈会话应从头逐条出现，而不是继承第一关的已读进度',
    ).toBeLessThan(l1Count)
    expect(
      wrapper.find('.chat__skiprow').exists(),
      '第二关的妈妈会话应当还能「显示全部」',
    ).toBe(true)
  })
})

/**
 * P. 常用生活应用：购物、音乐、视频。
 *
 * 用户要求「手机里的软件太少，添加购物、听歌、视频等，像正常手机」。
 * 这些应用不参与剧情或金额，只提供可浏览、可操作的拟真界面。
 */
describe('P. 常用生活应用', () => {
  it('P01 购物：搜索、商品详情与心愿单', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青集商城')

    expect(wrapper.find('.shop').exists(), '应打开青集商城').toBe(true)
    expect(wrapper.text()).toContain('青集商城')

    const input = wrapper.find('.shop__search input')
    expect(input.exists(), '商城应有搜索框').toBe(true)
    await input.setValue('耳机')
    expect(wrapper.text(), '搜索结果应包含耳机').toContain('静音降噪耳机')
    expect(wrapper.text(), '搜索结果不应包含无关商品').not.toContain('云感轻便帆布鞋')

    const product = wrapper.findAll('.product').find((item) => item.text().includes('静音降噪耳机'))
    expect(product, '应能点开商品').toBeTruthy()
    await product!.trigger('click')
    expect(wrapper.find('.detail').exists(), '应打开商品详情').toBe(true)
    await click(wrapper, '加入心愿单')
    expect(wrapper.text(), '加入后按钮应变成已加入').toContain('已加入心愿单')
  })

  it('P02 音乐：切歌与播放/暂停有反馈', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青听音乐')

    expect(wrapper.find('.music').exists(), '应打开青听音乐').toBe(true)
    expect(wrapper.text()).toContain('晚风寄信')

    const play = wrapper.find('.player__btn--main')
    expect(play.attributes('aria-label'), '默认应可播放').toBe('播放')
    await play.trigger('click')
    expect(wrapper.find('.player__btn--main').attributes('aria-label'), '点击后应暂停').toBe('暂停')

    const track = wrapper.findAll('.track').find((item) => item.text().includes('山城夜行'))
    expect(track, '应能找到另一首歌').toBeTruthy()
    await track!.trigger('click')
    expect(wrapper.find('.player__title').text(), '播放器应切到新歌').toContain('山城夜行')
  })

  it('P03 青影：竖向短视频可点赞、评论与分享', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青影')

    expect(wrapper.find('.video').exists(), '应打开青影').toBe(true)
    expect(wrapper.findAll('.clip').length, '应有一屏一条的短视频').toBeGreaterThanOrEqual(6)
    expect(wrapper.find('.clip__image').exists(), '短视频应使用真实封面图').toBe(true)

    const like = wrapper.find('button[aria-label="点赞"]')
    await like.trigger('click')
    expect(wrapper.find('button[aria-label="取消点赞"]').exists(), '点赞后应可取消').toBe(true)

    await wrapper.find('button[aria-label="评论"]').trigger('click')
    expect(wrapper.find('.sheet').exists(), '应打开评论面板').toBe(true)
    expect(wrapper.text()).toContain('这个点地铁里真的全是故事')
    await wrapper.find('button[aria-label="关闭评论"]').trigger('click')

    await wrapper.find('button[aria-label="分享"]').trigger('click')
    expect(wrapper.find('.sheet').exists(), '应打开分享面板').toBe(true)
    expect(wrapper.text()).toContain('分享给')
    await wrapper.find('button[aria-label="关闭分享"]').trigger('click')
  })

  it('P05 订单核验在购物 App 里完成，并记录一次线索', async () => {
    const wrapper = await mountApp({ atDesk: true })
    await tapPhone(wrapper, 1)
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')

    await click(wrapper, '订单详情')
    await flush()

    expect(wrapper.find('.shop').exists(), '应切到购物 App').toBe(true)
    expect(wrapper.find('.order').exists(), '应直接落在订单页').toBe(true)
    expect(wrapper.text()).toContain('轻跑运动鞋')
    expect(wrapper.text()).toContain('199')
    expect(wrapper.text()).toContain('重复扣款')
    expect(
      readSave('level-02')?.riskTags,
      '打开订单详情应记录一次「自己查了订单」的线索',
    ).toContain('l2-checked-order')
  })

  it('P06 钱包显示虚构银行卡与账户信息', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '安心钱包')

    expect(wrapper.text()).toContain('账户与安全')
    expect(wrapper.text()).toContain('尾号 0427')
    expect(wrapper.text()).toContain('发送到本机通知')
    expect(wrapper.text(), '不应再出现说教式安全提醒').not.toContain('不会索要短信验证码')
    expect(wrapper.text(), '不应再出现说教式共享屏幕提醒').not.toContain('不会让你共享屏幕')
  })

  it('P07 反诈手册展示带来源的真实案例，且不放外链', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '国家反诈中心')

    expect(wrapper.text()).toContain('真实案例')
    expect(wrapper.text()).toContain('8901')
    expect(wrapper.text()).toContain('98961')
    expect(wrapper.text()).toContain('陵水县政府网')
    expect(wrapper.text()).toContain('天津理工大学')
    expect(wrapper.findAll('a').length, '案例卡不应包含可点击外链').toBe(0)
  })

  it('P08 电话：拨号盘与通话界面可用', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '电话')

    expect(wrapper.find('.phone').exists(), '应打开电话应用').toBe(true)
    for (const digit of ['6', '6', '1']) {
      const key = wrapper.findAll('.key').find((item) => item.text().includes(digit))
      expect(key, `应能按 ${digit}`).toBeTruthy()
      await key!.trigger('click')
    }
    expect(wrapper.find('.dial__number').text()).toContain('661')

    await wrapper.find('.dialbtn').trigger('click')
    expect(wrapper.find('.call').exists(), '应出现通话界面').toBe(true)
    expect(wrapper.text()).toContain('正在呼叫')
    await wrapper.find('.call__end').trigger('click')
    expect(wrapper.find('.call').exists(), '挂断后应关闭通话界面').toBe(false)
  })

  it('P09 短信：收件箱、会话与本机回复', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '短信')

    expect(wrapper.find('.sms').exists(), '应打开短信应用').toBe(true)
    expect(wrapper.text()).toContain('青集商城')
    expect(wrapper.text()).toContain('安心钱包')
    expect(
      wrapper.findAll('.thread').length,
      '收件箱里应有很多日常短信，而不是只有剧情相关几条',
    ).toBeGreaterThanOrEqual(10)

    const wallet = wrapper.findAll('.thread').find((item) => item.text().includes('安心钱包'))
    expect(wallet, '应能找到安心钱包短信').toBeTruthy()
    await wallet!.trigger('click')
    expect(wrapper.text()).toContain('收入 800.00 元')
    expect(wrapper.text(), '不应再出现说教式安全提醒').not.toContain('任何客服都不会索要短信验证码')
    expect(wrapper.text(), '不应再出现说教式验证码提示').not.toContain('转给别人就等于把账户交出去')

    const input = wrapper.find('.composer__input')
    await input.setValue('好的')
    await wrapper.find('.composer').trigger('submit')
    expect(wrapper.text(), '本机回复应出现在会话里').toContain('好的')
  })

  it('P10 短信应用显示当前剧情验证码', async () => {
    const wrapper = await mountApp({ atDesk: true })
    await tapPhone(wrapper, 1)
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '按他说的做')
    await flush()
    await click(wrapper, '确认转出 200 元')
    await flush()
    await dismissAntifraud(wrapper)

    // 离开聊天去短信应用看：验证码应出现在「安心钱包」会话里
    await click(wrapper, '桌面')
    await clickDesktopApp(wrapper, '短信')
    const wallet = wrapper.findAll('.thread').find((item) => item.text().includes('安心钱包'))
    expect(wallet, '应能找到安心钱包短信').toBeTruthy()
    await wallet!.trigger('click')
    expect(wrapper.text(), '短信里应有 6 位验证码').toMatch(/校验码 \d{6}/)
  })

  it('P04 误刷新保护：关卡开始后才拦截 beforeunload', async () => {
    const wrapper = await mountApp()

    // 还在开场节点：刷新不会丢进行中的进度，不拦截
    const initial = new Event('beforeunload', { cancelable: true })
    globalThis.dispatchEvent(initial)
    expect(initial.defaultPrevented, '开场不应拦截刷新').toBe(false)

    // 解锁并推进到群聊后：有关卡进度，刷新前弹浏览器确认
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '进群看看')
    const progress = new Event('beforeunload', { cancelable: true })
    globalThis.dispatchEvent(progress)
    expect(progress.defaultPrevented, '关卡进行中应拦截刷新').toBe(true)
  })
})

/**
 * Y. 关卡大厅（第二版：书桌）。
 *
 * 用户要求：「做成几个卡片（像手机样式）放在桌面上，点击相应关卡后
 * 手机旋转过渡逐渐完全放大覆盖全屏」。这一组锁住五件事：
 * 1. 首屏是书桌，桌上是几部手机，**没有手机外框**；
 * 2. 点手机 → 出现飞行层 → 转场结束后落在那一关的锁屏；
 * 3. 转场不会把玩家卡住：`transitionend` 不来有兜底，减弱动效直接进；
 * 4. 锁定关与连点都有明确处理；
 * 5. 换关确实换了「一部手机」，且两关进度各自保留。
 */
describe('Y. 关卡大厅（书桌选关）', () => {
  it('Y00 首屏是作品封面：作品名、简介与进入入口', async () => {
    const wrapper = await mountApp({ atDesk: true, keepIntro: true })

    expect(wrapper.find('.work-intro').exists(), '首屏应有作品封面').toBe(true)
    expect(wrapper.text(), '封面应出现网络文化节作品信息').toContain('2026 网络文化节')
    expect(wrapper.text()).toContain('反诈局中局')
    expect(wrapper.text()).toContain('你的手机')
    expect(wrapper.text()).toContain('进入作品')

    await click(wrapper, '进入作品')
    expect(wrapper.find('.work-intro').exists(), '进入作品后封面应关闭').toBe(false)
    expect(wrapper.find('.desk').exists()).toBe(true)
    expect(wrapper.text()).toContain('关卡大厅')
  })

  it('Y01 首屏是书桌：三部手机、没有手机外框', async () => {
    const wrapper = await mountApp({ atDesk: true })

    expect(wrapper.find('.desk').exists(), '首屏应是书桌场景').toBe(true)
    expect(wrapper.text()).toContain('关卡大厅')
    expect(wrapper.text()).toContain('选一部手机开始挑战')

    const phones = wrapper.findAll('.deskphone')
    expect(phones.length, '三关应有三部手机（三关都可玩）').toBe(3)

    // 关键：这一版**没有**状态栏与底部导航 —— 整屏就是一张桌子
    expect(wrapper.find('.statusbar').exists(), '书桌版不该有手机状态栏').toBe(false)
    expect(wrapper.findAll('.nav__btn').length, '书桌版不该有底部三大金刚键').toBe(0)

    const text = wrapper.text()
    for (const label of ['第一关', '刷单返利', '第二关', '冒充客服退款', '第三关', '冒充公检法']) {
      expect(text, `桌上应写清「${label}」`).toContain(label)
    }
  })

  it('Y02 每部手机都是手机样式（机身 + 屏幕 + 迷你状态栏 + 迷你图标）', async () => {
    const wrapper = await mountApp({ atDesk: true })

    for (const phone of wrapper.findAll('.deskphone')) {
      expect(phone.find('.deskphone__body').exists(), '应有手机机身').toBe(true)
      expect(phone.find('.deskphone__screen').exists(), '机身里应有屏幕').toBe(true)
      expect(phone.find('.deskphone__statusbar').exists(), '屏幕里应有迷你状态栏').toBe(true)
      expect(phone.find('.deskphone__clock').text(), '迷你状态栏应显示实时北京时间').toMatch(/^\d{2}:\d{2}$/)
      expect(phone.find('.deskphone__icons').exists(), '屏幕里应有迷你图标').toBe(true)
      expect(phone.find('.deskphone__mini').exists(), '屏幕里应有该关的预览文案').toBe(true)
      // 屏幕用的是真机那张共用壁纸（飞行层放大后与锁屏同源）
      expect(phone.find('.deskphone__screen .wall').exists(), '屏幕应是同一张壁纸').toBe(true)
      // 信息与行动条在手机下方
      expect(phone.find('.deskphone__info').exists()).toBe(true)
      expect(phone.find('.deskphone__cta').exists()).toBe(true)
    }

    const phones = wrapper.findAll('.deskphone')
    const captions = phones.map((phone) => phone.find('.deskphone__mini').text())
    expect(new Set(captions).size, '三部手机的迷你屏幕文案应各不相同').toBe(3)
    const glyphSets = phones.map((phone) =>
      phone
        .findAll('.app__glyph')
        .map((icon) => icon.classes().find((name) => name.startsWith('app__glyph--')))
        .join(','),
    )
    expect(new Set(glyphSets).size, '三部手机的迷你图标组合应各不相同').toBe(3)
  })

  it('Y03 三部手机被摆成不同角度（固定值，不是随机）', async () => {
    const wrapper = await mountApp({ atDesk: true })

    const tilts = wrapper
      .findAll('.deskphone')
      .map((p) => (p.element as HTMLElement).style.getPropertyValue('--tilt'))
    expect(tilts.length).toBe(3)
    for (const tilt of tilts) expect(tilt, '每部手机都应有倾斜角').toMatch(/^-?\d+deg$/)
    expect(new Set(tilts).size, '三部手机的倾斜角应互不相同').toBe(3)
  })

  it('Y04 点手机 → 出现飞行层 → 转场结束后落在该关锁屏', async () => {
    const wrapper = await mountApp({ atDesk: true })

    // 只点，不结束转场
    await wrapper.findAll('.deskphone')[0].trigger('click')
    await flush()

    const fly = wrapper.find('.desk__fly')
    expect(fly.exists(), '点手机后应出现飞行层').toBe(true)
    expect(fly.find('.deskphone__body').exists(), '飞行层里应是被点的那部手机').toBe(true)
    // 转场期间桌上的手机会淡出，避免叠影
    expect(wrapper.find('.desk__stage--flying').exists()).toBe(true)
    expect(wrapper.find('.lock__surface').exists(), '转场还没结束，不该已经进锁屏').toBe(false)

    // 结束转场
    finishFlight(wrapper)
    await flush()

    expect(wrapper.find('.desk').exists(), '转场结束后应离开书桌').toBe(false)
    expect(wrapper.find('.desk__fly').exists(), '飞行层应被撤掉').toBe(false)
    expect(wrapper.find('.lock__surface').exists(), '应落在这一关的锁屏').toBe(true)
    expect(wrapper.find('.handoff').exists(), '应由同源壁纸交接层遮住挂载空档').toBe(true)
    expect(wrapper.text()).toContain('上滑解锁')
  })

  it('Y05 转场期间连点被忽略（只进入一次）', async () => {
    const wrapper = await mountApp({ atDesk: true })

    // 第一下：开始转场
    await wrapper.findAll('.deskphone')[0].trigger('click')
    await flush()
    expect(wrapper.find('.desk__fly').exists()).toBe(true)

    // 转场中再连点几下：都该被忽略，不能叠加飞行层
    await wrapper.findAll('.deskphone')[1].trigger('click')
    await wrapper.findAll('.deskphone')[2].trigger('click')
    await flush()
    expect(wrapper.findAll('.desk__fly').length, '转场期间不应叠加第二个飞行层').toBe(1)

    finishFlight(wrapper)
    await flush()
    // 落在第一部手机对应的关卡（第一关），而不是后来点的那两部
    expect(wrapper.text()).toContain('刷单返利')
    expect(wrapper.text()).not.toContain('冒充客服退款')
  })

  it('Y06 transitionend 不触发时，兜底超时仍会进入（不会卡在动画里）', async () => {
    const wrapper = await mountApp({ atDesk: true })

    vi.useFakeTimers()
    try {
      await wrapper.findAll('.deskphone')[0].trigger('click')
      await vi.advanceTimersByTimeAsync(700)

      expect(wrapper.find('.lock__surface').exists(), '兜底超时后应已进入锁屏').toBe(true)
      expect(wrapper.find('.desk__fly').exists(), '飞行层应被撤掉').toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Y07 prefers-reduced-motion 下直接进入，不播转场', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false
      },
    }))

    const wrapper = await mountApp({ atDesk: true })
    await wrapper.findAll('.deskphone')[0].trigger('click')
    await flush()

    expect(wrapper.find('.desk__fly').exists(), '减弱动效时不该出现飞行层').toBe(false)
    expect(wrapper.find('.lock__surface').exists(), '减弱动效时应直接落在锁屏').toBe(true)
  })

  it('Y08 转场期间按 Esc 取消：留在书桌、不进入、不写存档', async () => {
    const wrapper = await mountApp({ atDesk: true })

    await wrapper.findAll('.deskphone')[0].trigger('click')
    await flush()
    expect(wrapper.find('.desk__fly').exists()).toBe(true)

    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flush()

    expect(wrapper.find('.desk__fly').exists(), '按 Esc 应取消转场').toBe(false)
    expect(wrapper.find('.desk').exists(), '应留在书桌上').toBe(true)
    expect(wrapper.find('.lock__surface').exists(), '取消后不该进关').toBe(false)
    expect(readSave('level-01'), '取消转场不该写存档').toBeNull()
  })

  it('Y09 第三关已开放：可以进入冒充公检法关卡', async () => {
    const wrapper = await mountApp({ atDesk: true })

    const third = wrapper.findAll('.deskphone')[2]
    expect(third.attributes('aria-disabled'), '第三关不应再标记为锁定').toBeUndefined()
    expect(third.text()).toContain('冒充公检法')
    expect(third.text(), '第三关应有开始/继续入口').toMatch(/开始|继续/)

    await tapPhone(wrapper, 2)
    expect(wrapper.find('.lock__surface').exists(), '第三关应落在锁屏').toBe(true)
    expect(wrapper.text()).toContain('冒充公检法')
  })

  it('Y09b 第三关：挂断核实 → 提前识破且不扣款', async () => {
    const wrapper = await mountApp({ atDesk: true })
    await tapPhone(wrapper, 2)
    await swipeUnlock(wrapper)
    expect(wrapper.find('.af').exists(), '刚解锁、来电通知阶段不应提前弹').toBe(false)
    await clickDesktopApp(wrapper, '青讯')
    expect(wrapper.find('.af').text(), '进入来电会话后才弹冒充公检法预警').toContain('冒充公检法诈骗')
    await dismissAntifraud(wrapper)
    // 第三关的 preferredSession 会直接把青讯定位到“陈警官”会话。
    await click(wrapper, '挂断，自己去核实')
    await flush()

    expect(wrapper.text()).toContain('提前识破')
    expect(readSave('level-03' as LevelId)?.balance, '提前识破不应扣款').toBe(800)
    expect(readSave('level-03' as LevelId)?.ending, '应记录第三关结局').toBe('l3-end-clear')
  })

  it('Y09c 第三关：协查通知、屏幕共享与付款前停手', async () => {
    const wrapper = await mountApp({ atDesk: true })
    await tapPhone(wrapper, 2)
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await dismissAntifraud(wrapper)
    await click(wrapper, '显示全部')
    await flush()

    expect(wrapper.text(), '应看到对方发来的协查通知').toContain('协查通知（对方发来的文件）')
    expect(wrapper.text(), '通知里应写出可疑要求').toContain('安全账户')

    await click(wrapper, '继续听他说')
    await click(wrapper, '按他说的共享屏幕')
    expect(wrapper.find('.af__countdown').exists(), '转账弹窗应有倒计时').toBe(true)
    expect(wrapper.find('.af__ok').attributes('disabled'), '倒计时结束前不能关闭').toBeDefined()
    await dismissAntifraud(wrapper)
    expect(wrapper.find('.wallet').exists(), '应进入第三关钱包待确认页').toBe(true)
    expect(wrapper.text()).toContain('500')
    await click(wrapper, '取消，不再操作')
    await flush()

    expect(wrapper.text()).toContain('及时止损')
    expect(readSave('level-03' as LevelId)?.balance, '取消后不应扣款').toBe(800)
    expect(readSave('level-03' as LevelId)?.paidTotal, '取消后累计转出应为 0').toBe(0)
    expect(readSave('level-03' as LevelId)?.ending).toBe('l3-end-stop')
  })

  it('Y10 手机是真实 button，方向键可在手机之间移动焦点', async () => {
    // 焦点用例必须把组件挂到 document 上，游离元素调 focus() 不生效
    const wrapper = await mountApp({ atDesk: true, attach: true })

    const phones = wrapper.findAll('.deskphone')
    for (const phone of phones) {
      expect(phone.element.tagName, '手机应是真实 button（键盘可达）').toBe('BUTTON')
    }

    // 方向键移动焦点：与第一版的 ←→ 切卡对齐（第二版没有选中态，但有焦点）
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await flush()
    expect(document.activeElement, '右方向键应把焦点落在第一部手机上').toBe(phones[0].element)

    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await flush()
    expect(document.activeElement, '再按一次应移到第二部').toBe(phones[1].element)

    // 两列网格、最后一行只有一部：从第二列往下没有正下方的手机，
    // 应当「就近」落到最后一个，而不是原地不动（按了没反应会让人以为键盘坏了）
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await flush()
    expect(document.activeElement, '往下应就近落到第三部').toBe(phones[2].element)

    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    await flush()
    expect(document.activeElement, '往上应回到第一部').toBe(phones[0].element)
  })

  it('Y11 进入第二关：换了一部手机（会话、文案、余额都变）', async () => {
    const wrapper = await mountApp({ atDesk: true })

    await tapPhone(wrapper, 1)

    expect(wrapper.find('.desk').exists(), '应离开书桌进入手机').toBe(false)
    // 换了一部手机：锁屏副标题跟着变
    expect(wrapper.text(), '第二关的锁屏应写明本关标题').toContain('冒充客服退款')
    expect(wrapper.text(), '不应还显示第一关的标题').not.toContain('刷单返利')

    // 解锁进桌面 → 青讯：会话是「客服」，不是兼职群
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await flush()
    expect(wrapper.text(), '第二关的会话应是青讯客服').toContain('青集商城')
    expect(wrapper.text(), '不该出现第一关的兼职群').not.toContain('校园兼职')
    expect(wrapper.text(), '不该出现第一关的话术').not.toContain('先垫 100')
    expect(wrapper.text(), '第二关应有退款话术').toContain('重复扣款')

    // 桌面钱包组件显示第二关的余额口径
    await click(wrapper, '桌面')
    expect(wrapper.text()).toContain('800')
  })

  it('Y12 第二关金额口径：800 → 600 → 300，平台 199 不入账', async () => {
    const wrapper = await mountApp({ atDesk: true })
    await tapPhone(wrapper, 1)

    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '按他说的做')
    await flush()

    // 第一笔：账户验证金 200
    expect(wrapper.text()).toContain('200')
    await click(wrapper, '确认转出 200 元')
    await flush()
    await dismissAntifraud(wrapper)
    expect(readSave('level-02')?.balance, '确认 200 后余额应为 600').toBe(600)
    expect(wrapper.text(), '退款 199 只是平台数字').toContain('199')
    expect(readSave('level-02')?.balance, '199 不得计入余额').not.toBe(799)

    // 第二笔：保证金 300（这一步要在聊天里把收到的验证码填回去）
    await enterCode(wrapper, await waitForSmsCode(wrapper))
    await click(wrapper, '查看这笔保证金')
    await flush()
    await click(wrapper, '确认转出 300 元')
    await flush()
    expect(readSave('level-02')?.balance, '确认 300 后余额应为 300').toBe(300)
    expect(wrapper.text(), '结局应显示累计 500').toContain('500')
  })

  it('Y13 两关进度各自保留：切关回来仍是原来的余额与节点', async () => {
    let wrapper = await mountApp()
    await swipeUnlock(wrapper)

    // 第一关：付掉 100
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '进群看看')
    await click(wrapper, '接下任务')
    await dismissAntifraud(wrapper)
    await click(wrapper, '确认垫付 100 元')
    await flush()
    expect(readSave('level-01')?.balance, '第一关应为 700').toBe(700)

    // 切到第二关：刷新回大厅再选第二部手机，付掉 200
    wrapper = await remountAtDesk(wrapper)
    await tapPhone(wrapper, 1)
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '按他说的做')
    await click(wrapper, '确认转出 200 元')
    await flush()
    await dismissAntifraud(wrapper)
    expect(readSave('level-02')?.balance, '第二关应为 600').toBe(600)
    // 第一关的存档没被动过
    expect(readSave('level-01')?.balance, '第一关必须保持 700').toBe(700)

    // 切回第一关：刷新回大厅再选第一部手机；已有存档，因此**直接回到桌面**（不回锁屏），进度仍是 700
    wrapper = await remountAtDesk(wrapper)
    await tapPhone(wrapper, 0)
    expect(
      wrapper.find('.lock__surface').exists(),
      '已有进度的关卡应直接回到桌面，不重新走一遍锁屏',
    ).toBe(false)
    expect(wrapper.find('.home').exists(), '应回到第一关的桌面').toBe(true)
    expect(wrapper.text(), '第一关应恢复「看看任务结果」的入口').toContain('看看任务结果')
    await click(wrapper, '继续当前事项')
    expect(wrapper.text(), '第一关余额仍是 700').toContain('700')
    expect(readSave('level-02')?.balance, '第二关的进度也不该被覆盖').toBe(600)
  })

  it('Y14 手机上的状态行显示各关进度（未开始 / 进行中 / 已完成）', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)

    // 第一关走到结局
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '拒绝并举报')
    await flush()

    await click(wrapper, '返回关卡大厅')
    await flush()

    const phones = wrapper.findAll('.deskphone')
    const firstText = phones[0].text()
    expect(firstText, '第一关已完成，状态行应显示结局').toContain('已完成')
    expect(firstText).toContain('提前识破')
    expect(
      phones[0].find('.deskphone__live').text(),
      '已完成关卡的迷你屏幕应实时显示余额',
    ).toContain('800')
    expect(phones[1].text(), '第二关还没开始').toContain('还没开始')
    expect(phones[2].text(), '第三关还没开始').toContain('还没开始')
  })

  it('Y15 复盘页可返回关卡大厅', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '拒绝并举报')
    await flush()
    await click(wrapper, '看复盘')
    await flush()

    await click(wrapper, '返回关卡大厅')
    await flush()
    expect(wrapper.find('.desk').exists(), '应进入关卡大厅').toBe(true)

    // 「返回当前关卡」回到手机（不改变进度）
    await click(wrapper, '返回当前关卡')
    await flush()
    expect(wrapper.find('.desk').exists()).toBe(false)
    expect(readSave('level-01')?.ending, '来回切界面不得改变剧情').toBe('end-clear')
  })

  it('Y16 设置页不再有大厅入口，可重新开始本局，且清空全部关卡需二次确认', async () => {
    const wrapper = await mountApp()
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '设置')

    expect(wrapper.text(), '设置页应写明当前关卡').toContain('刷单返利')
    expect(wrapper.text(), '关卡进行中不应再有「关卡大厅」入口').not.toContain('关卡大厅')

    // 重新开始本局仍需二次确认（文案保持原样）
    await click(wrapper, '重新开始本局')
    expect(wrapper.text()).toContain('重来一次？')
    await click(wrapper, '算了，接着玩')

    // 清空全部关卡：二次确认
    await click(wrapper, '清空全部关卡进度')
    expect(wrapper.text()).toContain('清空全部关卡？')
    await click(wrapper, '算了，留着')
    expect(readSave('level-01'), '取消后存档应还在').not.toBeNull()
  })

  it('Y17 清空全部关卡：所有存档清掉并回到大厅', async () => {
    let wrapper = await mountApp()
    await swipeUnlock(wrapper)

    // 两关都留点进度：第一关进群，再刷新回大厅进第二关
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '进群看看')
    wrapper = await remountAtDesk(wrapper)
    await tapPhone(wrapper, 1)
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '按他说的做')
    await click(wrapper, '确认转出 200 元')
    await flush()
    await dismissAntifraud(wrapper)
    expect(readSave('level-01')).not.toBeNull()
    expect(readSave('level-02')).not.toBeNull()

    // 设置 → 清空全部关卡 → 确认
    await click(wrapper, '回到桌面')
    await clickDesktopApp(wrapper, '设置')
    await click(wrapper, '清空全部关卡进度')
    await click(wrapper, '全部清掉')
    await flush()

    expect(readSave('level-01'), '第一关应被清掉').toBeNull()
    expect(readSave('level-02'), '第二关应被清掉').toBeNull()
    expect(wrapper.find('.desk').exists(), '清完应回到大厅重新挑').toBe(true)
  })

  it('Y18 刷新回大厅切关后不会残留上一关的通知', async () => {
    let wrapper = await mountApp()
    await swipeUnlockAndWaitNotices(wrapper)
    // 第一关的通知已经弹出过
    expect(wrapper.find('.banner').exists()).toBe(true)

    wrapper = await remountAtDesk(wrapper)
    await tapPhone(wrapper, 1)

    // 换了一部手机：书桌/新手机里不该还压着第一关的横幅
    expect(wrapper.find('.banner').exists(), '切关后不应残留上一关的横幅').toBe(false)
  })

  /**
   * 模拟验证码（第二关「把短信验证码发我」那一步）。
   *
   * 用户要求：有验证码的地方要真的能填，验证码像通知一样弹出来、每次都不一样，
   * 输错了对方会要求重新输入，但**语气不能突兀**。
   */
  it('Y19 验证码：短信弹出、输错会换新码并要求重输、输对才继续', async () => {
    const wrapper = await mountApp({ atDesk: true })
    await tapPhone(wrapper, 1)
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '按他说的做')
    await flush()
    await click(wrapper, '确认转出 200 元')
    await flush()

    // 到了索要验证码这一步：出现输入框，且「继续按他说的做」不再渲染成按钮
    expect(wrapper.find('.gate__input').exists(), '应出现验证码输入框').toBe(true)

    /*
     * 这一步会弹出「国家反诈中心」弹窗（该节点在关卡的 `popupReminders` 里），
     * 模态的，必须先点掉 —— 真人在弹窗盖着的时候点不到下面的按钮。
     */
    expect(await dismissAntifraud(wrapper), '索要验证码时应弹出国家反诈中心弹窗').toBe(true)
    expect(
      findButton(wrapper, '继续按他说的做'),
      '这一步不能再用一个「继续」按钮糊过去，必须真的填码',
    ).toBeUndefined()
    // 中止的退路还在（不能只剩填码这一条路）
    expect(findButton(wrapper, '停下来，自己查订单'), '必须仍能中止').toBeTruthy()

    const first = await waitForSmsCode(wrapper)
    expect(first, '验证码应是 6 位数字').toMatch(/^\d{6}$/)

    // 填错：对方平和地要求重看短信，并换一条新的验证码
    await enterCode(wrapper, '000000')
    expect(wrapper.text(), '输错时对方应平和地要求重输').toContain('好像不太对')
    expect(wrapper.text(), '语气不能施压').not.toContain('你骗我')
    const second = await waitForSmsCode(wrapper)
    expect(second, '输错后应换一个新的验证码').not.toBe(first)
    expect(wrapper.find('.gate__input').exists(), '输错后仍停留在输入区').toBe(true)

    // 填对：继续剧情（走到要 300 保证金那一步）
    await enterCode(wrapper, second)
    expect(wrapper.text(), '填对之后应继续剧情').toContain('保证金')
    expect(wrapper.find('.gate__input').exists(), '离开该节点后输入区应消失').toBe(false)
  })

  it('Y20 验证码：可以要求重新发一条（换新码），且不改变剧情与余额', async () => {
    const wrapper = await mountApp({ atDesk: true })
    await tapPhone(wrapper, 1)
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '按他说的做')
    await flush()
    await click(wrapper, '确认转出 200 元')
    await flush()
    await dismissAntifraud(wrapper)

    const before = await waitForSmsCode(wrapper)
    await click(wrapper, '重新发一条')
    await flush()
    const after = await waitForSmsCode(wrapper)
    expect(after, '重发应换一个新验证码').not.toBe(before)
    expect(readSave('level-02')?.balance, '重发短信不该动钱').toBe(600)
  })

  /**
   * 反诈提示搬到弹窗里（用户要求）。
   *
   * 「页面上的退款进度不是你的余额。验证码给出去，等于把账户交出去。」这种
   * **宣导式**提示原本是聊天里的一条系统气泡，现在改成「国家反诈中心」弹窗，
   * 并且第一行要说明原因（检测到你疑似被诈骗）。
   */
  it('Y21 关键节点弹「国家反诈中心」弹窗，说明原因并给出判断依据', async () => {
    const wrapper = await mountApp({ atDesk: true })
    await tapPhone(wrapper, 1)
    await swipeUnlock(wrapper)
    await clickDesktopApp(wrapper, '青讯')
    await click(wrapper, '按他说的做')
    await flush()
    await click(wrapper, '确认转出 200 元')
    await flush()

    const dialog = wrapper.find('.af')
    expect(dialog.exists(), '索要验证码这一步应弹出国家反诈中心弹窗').toBe(true)
    expect(dialog.text(), '应有「国家反诈中心」标题').toContain('国家反诈中心')
    expect(dialog.text(), '第一行应说明原因').toContain('检测到你疑似')
    expect(dialog.text(), '弹窗里要给出判断依据').toContain('验证码给出去')
    expect(dialog.text(), '也要点出页面数字不是余额').toContain('不是你的余额')

    // 同一条内容不再在聊天里重复一遍：判断依据集中在弹窗
    const chatList = wrapper.find('.chat__list')
    expect(chatList.exists()).toBe(true)
    expect(chatList.text(), '聊天里不该再重复这条宣导').not.toContain('验证码给出去')

    // 关掉弹窗才轮到验证码输入
    expect(await dismissAntifraud(wrapper), '弹窗上应有「我知道了」').toBe(true)
    expect(wrapper.find('.af').exists(), '关闭后弹窗应消失').toBe(false)
    expect(wrapper.find('.gate__input').exists(), '关掉弹窗后才是填验证码').toBe(true)

    // 内容仍记进通知中心，可回看
    await click(wrapper, '桌面')
    await clickDesktopApp(wrapper, '通知')
    expect(wrapper.text(), '通知中心应保留这条预警').toContain('验证码给出去')
  })
})

/**
 * Z. 两级菜单：先选关，再进锁屏。
 *
 * 用户要求：「应该是先选择关卡，选了之后才进入锁屏解锁界面，然后结束后可以返回，
 * 相当于做出一二级菜单那种」。
 *
 * 因此顺序是：**首屏 = 关卡大厅（书桌）** → 点手机选关 → 该关**锁屏** →
 * 上滑解锁 → 桌面；结局页与复盘页都能回到大厅重新选关。
 */
describe('Z. 两级菜单：先选关再进锁屏', () => {
  it('Z01 首屏是关卡大厅，不是锁屏', async () => {
    const wrapper = await mountApp({ atDesk: true })

    expect(wrapper.find('.desk').exists(), '首屏应是关卡大厅（书桌）').toBe(true)
    expect(wrapper.find('.lock__surface').exists(), '首屏不该直接是某一关的锁屏').toBe(false)
    expect(wrapper.text()).toContain('关卡大厅')
    expect(wrapper.findAll('.deskphone').length, '大厅应列出全部关卡').toBe(3)
  })

  it('Z02 大厅选定关卡后才进锁屏，上滑解锁进桌面', async () => {
    const wrapper = await mountApp({ atDesk: true })

    await tapPhone(wrapper, 0)

    expect(wrapper.find('.desk').exists(), '进入后应离开大厅').toBe(false)
    expect(wrapper.find('.lock__surface').exists(), '应先落在这一关的锁屏').toBe(true)
    expect(wrapper.text()).toContain('上滑解锁')

    await swipeUnlock(wrapper)
    expect(wrapper.find('.home').exists(), '解锁后进入桌面').toBe(true)
  })

  it('Z03 首屏大厅没有「返回当前关卡」（还没进过任何关）', async () => {
    const wrapper = await mountApp({ atDesk: true })
    expect(
      wrapper.findAll('button').some((b) => b.text().includes('返回当前关卡')),
      '首屏还没选过关，不该有「返回当前关卡」',
    ).toBe(false)

    // 进关之后：桌面不再有「关卡」入口，也不会出现「返回当前关卡」
    await tapPhone(wrapper, 0)
    await swipeUnlock(wrapper)
    expect(wrapper.find('.desk').exists(), '关卡进行中不应再进入大厅').toBe(false)
    expect(
      wrapper.findAll('.home .app').some((b) => b.text().includes('关卡')),
      '关卡进行中不应再有「关卡」入口',
    ).toBe(false)
  })

  it('Z04 结局页可直接返回关卡大厅（一级菜单）', async () => {
    const wrapper = await mountApp()
    await startAndOpenInvite(wrapper)
    await click(wrapper, '拒绝并举报')
    await flush()

    expect(wrapper.text(), '应已到结局页').toContain('本局结果')
    await click(wrapper, '返回关卡大厅')
    await flush()
    expect(wrapper.find('.desk').exists(), '结局页应能一步回到大厅').toBe(true)
  })

  it('Z05 复盘页也能返回关卡大厅', async () => {
    const wrapper = await mountApp()
    await startAndOpenInvite(wrapper)
    await click(wrapper, '拒绝并举报')
    await flush()
    await click(wrapper, '看复盘')
    await flush()

    await click(wrapper, '返回关卡大厅')
    await flush()
    expect(wrapper.find('.desk').exists(), '复盘页应能回到大厅').toBe(true)
  })

  it('Z06 玩到一半重新挂载（模拟刷新）回大厅，进度仍在', async () => {
    const wrapper = await mountApp()
    await startAndReachPayment(wrapper)
    await click(wrapper, '确认垫付 100 元')
    await flush()
    expect(readSave()?.balance).toBe(700)

    // 刷新：重新挂载，存档保留 → 首屏回大厅，手机显示「进行中」
    const reopened = await mountApp({ keepSave: true, atDesk: true })
    expect(reopened.find('.desk').exists(), '刷新后应先回到大厅').toBe(true)
    expect(reopened.text(), '大厅应显示这一关进行中').toContain('进行中')

    // 再进这一关：进度没丢
    await tapPhone(reopened, 0)
    expect(readSave()?.balance, '进度不该因刷新丢失').toBe(700)
  })
})
