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

/** 开场 → 桌面 → 点通知进入邀请会话。 */
async function startAndOpenInvite(wrapper: VueWrapper): Promise<void> {
  await click(wrapper, '开始体验')
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

/** 读取当前存档。 */
function readSave(): GameState | null {
  const text = globalThis.localStorage.getItem(SAVE_KEY)
  return text ? (JSON.parse(text) as GameState) : null
}

beforeEach(() => {
  globalThis.localStorage.clear()
})

describe('E. 整部手机的交互（B01–B14）', () => {
  it('B01/B08 开场 → 桌面：先看到独立桌面与邀请通知，不是答题页', async () => {
    const wrapper = mountApp()
    expect(wrapper.text()).toContain('反诈局中局：你的手机')
    expect(wrapper.text()).toContain('剧情模拟')

    await click(wrapper, '开始体验')
    expect(wrapper.text()).toContain('青屏 OS · 虚构桌面')
    expect(wrapper.text()).toContain('一位学姐邀请你加入兼职群')
    for (const label of ['青讯', '安心钱包', '识骗手册']) {
      expect(wrapper.text(), `桌面应有「${label}」入口`).toContain(label)
    }
    // 桌面就是整页手机，没有外层网页导航
    expect(wrapper.findAll('a')).toHaveLength(0)
  })

  it('B01/B09 通知与消息图标是两条独立入口，都能到达邀请', async () => {
    const viaNotice = mountApp()
    await startAndOpenInvite(viaNotice)
    expect(viaNotice.text()).toContain('拒绝并举报')

    const viaIcon = mountApp()
    await click(viaIcon, '开始体验')
    await click(viaIcon, '青讯')
    expect(viaIcon.text()).toContain('拒绝并举报')
  })

  it('B11 邀请可忽略：先看钱包/手册再回来，邀请仍在且未扣款', async () => {
    const wrapper = mountApp()
    await click(wrapper, '开始体验')

    await click(wrapper, '安心钱包')
    expect(wrapper.text()).toContain('当前没有待处理的模拟付款')
    expect(wrapper.text()).toContain('800')

    await click(wrapper, '桌面')
    await click(wrapper, '识骗手册')
    expect(wrapper.text()).toContain('先垫钱的兼职')

    await click(wrapper, '桌面')
    expect(wrapper.text()).toContain('一位学姐邀请你加入兼职群')

    await click(wrapper, '继续当前事项')
    expect(wrapper.text()).toContain('拒绝并举报')
    expect(wrapper.text()).not.toContain('你已付款')
  })

  it('B03 资料可点击、可返回，且不改变余额', async () => {
    const wrapper = mountApp()
    await startAndEnterGroup(wrapper)

    await click(wrapper, '查看群主资料')
    expect(wrapper.text()).toContain('最近 7 天内')
    expect(wrapper.text()).toContain('独立渠道')

    await click(wrapper, '返回群聊')
    expect(wrapper.text()).toContain('接下任务')

    // 反复查看资料不改变余额、不重复推进
    await click(wrapper, '再看对方资料')
    await click(wrapper, '返回群聊')
    await click(wrapper, '桌面')
    expect(wrapper.text()).toContain('800')
    expect(readSave()?.balance).toBe(800)
  })

  it('B12 群聊待付款：切走再回来，请求仍待确认、金额不变；确认后才扣款一次', async () => {
    const wrapper = mountApp()
    await startAndReachPayment(wrapper)
    expect(wrapper.text()).toContain('待确认的模拟垫付')

    await click(wrapper, '桌面')
    expect(wrapper.text()).toContain('800')
    expect(wrapper.text()).toContain('待确认的模拟垫付 100 元')
    expect(readSave()?.balance).toBe(800)

    await click(wrapper, '识骗手册')
    await click(wrapper, '桌面')
    await click(wrapper, '继续当前事项')
    expect(wrapper.text()).toContain('确认模拟垫付 100 元')

    await click(wrapper, '确认模拟垫付 100 元')
    await flush()
    expect(readSave()?.balance).toBe(700)
    // 回到群聊看到平台展示数字，且明确不可提现
    expect(wrapper.text()).toContain('平台内显示（未兑现，不可提现）')
    expect(wrapper.text()).toContain('130')
  })

  it('B10 离开待付款页 ≠ 取消：切走后仍可回来取消并进入止损结局', async () => {
    const wrapper = mountApp()
    await startAndReachPayment(wrapper)

    await click(wrapper, '桌面')
    await click(wrapper, '安心钱包')
    expect(wrapper.text()).toContain('确认模拟垫付 100 元')

    await click(wrapper, '取消，停止参与')
    await flush()
    expect(wrapper.text()).toContain('及时止损')
    expect(wrapper.text()).toContain('模拟损失 0 元（在付款前停止）')
    expect(readSave()?.balance).toBe(800)
  })

  it('B12/B14 钱包平时不能绕过剧情付款', async () => {
    const wrapper = mountApp()
    await click(wrapper, '开始体验')
    await click(wrapper, '安心钱包')
    expect(wrapper.text()).toContain('当前没有待处理的模拟付款')
    expect(findButton(wrapper, '确认模拟垫付')).toBeUndefined()
  })

  it('A08 连点确认只扣一次款', async () => {
    const wrapper = mountApp()
    await startAndReachPayment(wrapper)

    const confirm = findButton(wrapper, '确认模拟垫付 100 元')
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
    expect(wrapper.text()).toContain('查看本局结果与复盘')

    await click(wrapper, '继续当前事项')
    expect(wrapper.text()).toContain('提前识破')

    await click(wrapper, '识骗手册')
    await click(wrapper, '查看本局结果与复盘')
    expect(wrapper.text()).toContain('提前识破')

    await click(wrapper, '查看我的反诈复盘')
    await flush()
    expect(wrapper.text()).toContain('本局复盘')
    expect(wrapper.text()).toContain('本局经历标注')

    // 复盘也可以离开再进入
    await click(wrapper, '桌面')
    await click(wrapper, '识骗手册')
    expect(wrapper.text()).toContain('本局经历标注')
  })

  it('B13/A09 重开必须二次确认；取消则进度不变', async () => {
    const wrapper = mountApp()
    await startAndReachPayment(wrapper)
    await click(wrapper, '确认模拟垫付 100 元')
    await flush()

    await click(wrapper, '桌面')
    await click(wrapper, '重新开始本局')
    expect(wrapper.text()).toContain('重新开始本局？')

    await click(wrapper, '继续当前进度')
    expect(wrapper.text()).toContain('700')
    expect(readSave()).not.toBeNull()

    await click(wrapper, '重新开始本局')
    await click(wrapper, '确认重新开始')
    expect(wrapper.text()).toContain('开始体验')
    expect(readSave()).toBeNull()
  })

  it('B04 复盘只引用亲历环节：早拒绝者不会看到解冻费与追加', async () => {
    const wrapper = mountApp()
    await startAndOpenInvite(wrapper)
    await click(wrapper, '拒绝并举报')
    await flush()
    await click(wrapper, '查看我的反诈复盘')
    await flush()

    const text = wrapper.text()
    expect(text).toContain('陌生兼职邀请')
    expect(text).not.toContain('解冻费')
    expect(text).not.toContain('追加 300')
    expect(text).not.toContain('你确认了首次模拟垫付')
  })

  it('B04 追加后损失：复盘显示 400，且无「保证追回」表述', async () => {
    const wrapper = mountApp()
    await startAndReachPayment(wrapper)
    await click(wrapper, '确认模拟垫付 100 元')
    await flush()
    await click(wrapper, '继续查看任务')
    await click(wrapper, '查看追加垫付')
    await click(wrapper, '确认模拟垫付 300 元')
    await flush()

    expect(wrapper.text()).toContain('追加后损失')
    expect(readSave()?.balance).toBe(400)

    await click(wrapper, '查看我的反诈复盘')
    await flush()
    const text = wrapper.text()
    expect(text).toContain('400')
    expect(text).toContain('解冻费')
    // 只拦截肯定式误导表述；「不保证追回」是必须保留的正确表述。
    expect(findForbiddenClaim(text)).toBeNull()
    expect(text).toContain('不保证追回')
  })

  it('C04 损坏存档启动时安全回退到开场，页面仍可用', () => {
    globalThis.localStorage.setItem(SAVE_KEY, '{"version":1,"node":"group","balance":999999}')
    const wrapper = mountApp({ keepSave: true })
    expect(wrapper.text()).toContain('开始体验')
    expect(readSave()).toBeNull()
  })

  it('C04 有效存档恢复进度，且不能重复扣款', async () => {
    const paid = play(['start', 'enter-group', 'accept-task', 'confirm-100', 'continue-task'])
    saveGame(paid)
    const wrapper = mountApp({ keepSave: true })

    expect(wrapper.text()).toContain('查看提现异常')
    await click(wrapper, '继续当前事项')
    expect(wrapper.text()).toContain('停止操作并保留证据')
    // 已确认的首次垫付按钮不复现
    expect(findButton(wrapper, '确认模拟垫付 100 元')).toBeUndefined()
    expect(readSave()?.balance).toBe(700)
  })

  it('B02 转账页有明确的模拟声明，且不要求敏感信息', async () => {
    const wrapper = mountApp()
    await startAndReachPayment(wrapper)
    const text = wrapper.text()
    expect(text).toContain('不会扣现实资金')
    expect(text).toContain('不需要输入银行卡号、验证码或支付密码')
    expect(wrapper.findAll('input')).toHaveLength(0)
    expect(wrapper.findAll('a')).toHaveLength(0)
  })

  it('B14 状态栏与只读应用都有响应', async () => {
    const wrapper = mountApp()
    await click(wrapper, '开始体验')

    await click(wrapper, '打开模拟通知')
    expect(wrapper.text()).toContain('模拟通知（只读）')
    await click(wrapper, '收起模拟通知')

    await click(wrapper, '相册')
    expect(wrapper.text()).toContain('虚构截图占位卡')
    await click(wrapper, '桌面')

    await click(wrapper, '设置')
    expect(wrapper.text()).toContain('不采集姓名、手机号、银行卡或验证码')
  })

  it('B06 动效与音频都不是必要交互：键盘可完成关键选择', async () => {
    const wrapper = mountApp()
    await click(wrapper, '开始体验')
    // 跳过消息动画后立即可看到选项
    await click(wrapper, '青讯')
    await click(wrapper, '进群看看')
    await click(wrapper, '跳过动画，显示全部')
    expect(wrapper.text()).toContain('正规兼职不会要求你先垫钱')
    // 选项都是真实 button，可聚焦
    const accept = findButton(wrapper, '接下任务')
    expect(accept?.element.tagName).toBe('BUTTON')
  })
})
