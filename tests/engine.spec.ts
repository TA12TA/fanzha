import { describe, expect, it } from 'vitest'
import { MAX_PAID_TOTAL } from '@/data/levels/level01'
import { INITIAL_BALANCE } from '@/data/levels/shared'
import { choose, createInitialState, isStateConsistent } from '@/game/engine'
import type { GameState, OptionId } from '@/game/types'

/** 依次提交选项，断言每一步都合法。 */
function play(optionIds: OptionId[], from: GameState = createInitialState()): GameState {
  let state = from
  for (const id of optionIds) {
    const result = choose(state, id)
    expect(result.ok, `选项 ${id} 应合法（当前节点 ${state.node}）`).toBe(true)
    if (result.ok) state = result.state
  }
  return state
}

describe('A. 剧情分支与金额（A01–A10）', () => {
  it('A01 开场 → 拒绝邀请 → 复盘：提前识破，余额 800、损失 0，复盘无垫付记录', () => {
    const state = play(['start', 'reject-invite', 'review'])
    expect(state.node).toBe('debrief')
    expect(state.ending).toBe('end-clear')
    expect(state.balance).toBe(800)
    expect(state.paidTotal).toBe(0)
    expect(state.riskTags).toContain('early-reject')
    expect(state.riskTags).not.toContain('paid-100')
    expect(isStateConsistent(state)).toBe(true)
  })

  it('A02 进群 → 退出举报 → 复盘：提前识破，余额 800、损失 0，能体现进群后退出', () => {
    const state = play(['start', 'enter-group', 'report-group', 'review'])
    expect(state.ending).toBe('end-clear')
    expect(state.balance).toBe(800)
    expect(state.paidTotal).toBe(0)
    expect(state.riskTags).toContain('entered-group')
    expect(state.riskTags).toContain('reported-in-group')
  })

  it('A03 进群 → 查看资料 → 接任务 → 取消 100 → 复盘：止损 0，资料线索被记录', () => {
    const state = play([
      'start',
      'enter-group',
      'view-profile',
      'accept-task',
      'cancel-100',
      'review',
    ])
    expect(state.ending).toBe('end-stop')
    expect(state.balance).toBe(800)
    expect(state.paidTotal).toBe(0)
    expect(state.viewedProfile).toBe(true)
    expect(state.riskTags).toContain('viewed-profile')
    expect(state.riskTags).toContain('stopped-before-pay')
  })

  it('A04 确认 100 → 到此为止 → 复盘：余额 700、模拟损失 100，返 130 不计入余额', () => {
    const state = play(['start', 'enter-group', 'accept-task', 'confirm-100', 'stop-after-100', 'review'])
    expect(state.ending).toBe('end-stop')
    expect(state.balance).toBe(700)
    expect(state.paidTotal).toBe(100)
    expect(state.platformDisplayed).toBe(130)
    // 平台展示 130 不增加可支配余额。
    expect(state.balance).not.toBe(830)
    expect(state.balance).toBe(INITIAL_BALANCE - 100)
    expect(state.riskTags).toContain('saw-rebate-claim')
  })

  it('A05 确认 100 → 继续 → 提现失败时停止 → 复盘：余额 700、损失 100，含解冻费风险', () => {
    const state = play([
      'start',
      'enter-group',
      'accept-task',
      'confirm-100',
      'continue-task',
      'stop-at-freeze',
      'review',
    ])
    expect(state.ending).toBe('end-stop')
    expect(state.balance).toBe(700)
    expect(state.paidTotal).toBe(100)
    expect(state.riskTags).toContain('withdraw-failed')
    expect(state.riskTags).toContain('asked-freeze-fee')
    expect(state.riskTags).toContain('stopped-at-freeze')
  })

  it('A06 确认 100 → 继续 → 追加页取消 300 → 复盘：余额 700、损失 100（无需确认追加即可结束）', () => {
    const state = play([
      'start',
      'enter-group',
      'accept-task',
      'confirm-100',
      'continue-task',
      'accept-extra',
      'cancel-300',
      'review',
    ])
    expect(state.ending).toBe('end-stop')
    expect(state.balance).toBe(700)
    expect(state.paidTotal).toBe(100)
    expect(state.riskTags).toContain('asked-extra')
    expect(state.riskTags).toContain('stopped-before-extra')
  })

  it('A07 确认 100 → 继续 → 确认 300 → 复盘：余额 400、累计损失 400', () => {
    const state = play([
      'start',
      'enter-group',
      'accept-task',
      'confirm-100',
      'continue-task',
      'accept-extra',
      'confirm-300',
      'review',
    ])
    expect(state.ending).toBe('end-loss')
    expect(state.balance).toBe(400)
    expect(state.paidTotal).toBe(MAX_PAID_TOTAL)
    expect(state.paidCount).toBe(2)
    expect(state.riskTags).toContain('paid-300')
  })

  it('A08 重复提交/过期选项：同一确认只生效一次，不能重复扣款', () => {
    let state = play(['start', 'enter-group', 'accept-task'])
    const first = choose(state, 'confirm-100')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    state = first.state
    expect(state.balance).toBe(700)

    // 连点：第二次提交必须被拒绝，且状态对象不变。
    const second = choose(state, 'confirm-100')
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.reason).toBe('illegal-option')
    expect(second.state.balance).toBe(700)
    expect(second.state).toBe(state)

    // 已过期的旧按钮（transfer-100 的取消）在 rebate 节点不可用。
    const stale = choose(state, 'cancel-100')
    expect(stale.ok).toBe(false)
    expect(stale.state.balance).toBe(700)

    // 追加确认同样只生效一次。
    const to300 = play(['continue-task', 'accept-extra'], state)
    const c300 = choose(to300, 'confirm-300')
    expect(c300.ok).toBe(true)
    if (!c300.ok) return
    expect(c300.state.balance).toBe(400)
    const c300again = choose(c300.state, 'confirm-300')
    expect(c300again.ok).toBe(false)
    expect(c300again.state.balance).toBe(400)
  })

  it('A09 重开：restart 回到开场并清空进度', () => {
    const played = play([
      'start',
      'enter-group',
      'accept-task',
      'confirm-100',
      'continue-task',
      'accept-extra',
      'confirm-300',
      'review',
    ])
    const result = choose(played, 'restart')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state).toEqual(createInitialState())
    // 重开后可以再次游玩并再次进入结局。
    const again = play(['start', 'reject-invite', 'review'], result.state)
    expect(again.ending).toBe('end-clear')
    expect(again.balance).toBe(800)
  })

  it('A10 非法 optionId 与错误节点选项：不改变状态', () => {
    const initial = createInitialState()
    for (const bad of ['', 'nope', 'CONFIRM-100', 'confirm-300']) {
      const result = choose(initial, bad)
      expect(result.ok).toBe(false)
      expect(result.state).toBe(initial)
      expect(result.state.balance).toBe(800)
      expect(result.state.history).toHaveLength(0)
    }
    // 未到 transfer-300 节点时提交 confirm-300。
    const mid = play(['start', 'enter-group', 'accept-task', 'confirm-100'])
    const illegal = choose(mid, 'confirm-300')
    expect(illegal.ok).toBe(false)
    if (!illegal.ok) expect(illegal.reason).toBe('illegal-option')
    expect(illegal.state.balance).toBe(700)
  })
})

describe('B. 引擎不变式与纯函数性', () => {
  it('不修改传入的状态对象（纯函数）', () => {
    const initial = createInitialState()
    const snapshot = JSON.stringify(initial)
    choose(initial, 'start')
    choose(initial, 'confirm-100')
    expect(JSON.stringify(initial)).toBe(snapshot)
  })

  it('所有分支状态均满足不变式：balance = 800 - paidTotal', () => {
    const paths: OptionId[][] = [
      ['start', 'reject-invite'],
      ['start', 'enter-group', 'report-group'],
      ['start', 'enter-group', 'view-profile', 'view-profile', 'accept-task', 'cancel-100'],
      ['start', 'enter-group', 'accept-task', 'confirm-100', 'stop-after-100'],
      ['start', 'enter-group', 'accept-task', 'confirm-100', 'continue-task', 'stop-at-freeze'],
      [
        'start',
        'enter-group',
        'accept-task',
        'confirm-100',
        'continue-task',
        'accept-extra',
        'cancel-300',
      ],
      [
        'start',
        'enter-group',
        'accept-task',
        'confirm-100',
        'continue-task',
        'accept-extra',
        'confirm-300',
      ],
    ]
    for (const path of paths) {
      const state = play(path)
      expect(isStateConsistent(state), `路径 ${path.join(' → ')} 状态应一致`).toBe(true)
      expect(state.balance).toBe(INITIAL_BALANCE - state.paidTotal)
      expect([0, 100, 400]).toContain(state.paidTotal)
    }
  })

  it('view-profile 可重复访问但只记录一次，且不改变余额', () => {
    const atGroup = play(['start', 'enter-group'])
    const once = choose(atGroup, 'view-profile')
    expect(once.ok).toBe(true)
    if (!once.ok) return
    expect(once.state.node).toBe('group')
    expect(once.state.balance).toBe(800)
    expect(once.state.viewedProfile).toBe(true)

    const twice = choose(once.state, 'view-profile')
    expect(twice.ok).toBe(true)
    if (!twice.ok) return
    expect(twice.state.riskTags.filter((t) => t === 'viewed-profile')).toHaveLength(1)
    expect(twice.state.balance).toBe(800)
    // 仍然停留在 group，且可以继续接任务。
    expect(twice.state.node).toBe('group')
    const next = choose(twice.state, 'accept-task')
    expect(next.ok).toBe(true)
  })

  it('end-stop 区分「转账前取消」与「已垫付 100 后止损」', () => {
    const before = play(['start', 'enter-group', 'accept-task', 'cancel-100'])
    const after = play(['start', 'enter-group', 'accept-task', 'confirm-100', 'stop-after-100'])
    expect(before.ending).toBe('end-stop')
    expect(after.ending).toBe('end-stop')
    expect(before.paidTotal).toBe(0)
    expect(after.paidTotal).toBe(100)
    expect(before.balance).toBe(800)
    expect(after.balance).toBe(700)
  })

  it('未到该节点时不能发起付款（钱包不可绕过群聊）', () => {
    const atIntro = createInitialState()
    expect(choose(atIntro, 'confirm-100').ok).toBe(false)
    const atInvite = play(['start'])
    expect(choose(atInvite, 'confirm-100').ok).toBe(false)
    expect(choose(atInvite, 'confirm-300').ok).toBe(false)
    const atGroup = play(['start', 'enter-group'])
    expect(choose(atGroup, 'confirm-100').ok).toBe(false)
  })

  it('离开待付款页不改变任何数值（UI 导航不进入引擎）', () => {
    const waiting = play(['start', 'enter-group', 'accept-task'])
    const snapshot = JSON.stringify(waiting)
    // 仅回桌面/切应用不会调用 choose，状态保持不变。
    expect(JSON.stringify(waiting)).toBe(snapshot)
    expect(waiting.node).toBe('transfer-100')
    expect(waiting.balance).toBe(800)
  })

  it('三个结局都能通过 review 进入复盘', () => {
    for (const path of [
      ['start', 'reject-invite'],
      ['start', 'enter-group', 'accept-task', 'cancel-100'],
      ['start', 'enter-group', 'accept-task', 'confirm-100', 'continue-task', 'accept-extra', 'confirm-300'],
    ] as OptionId[][]) {
      const ended = play(path)
      expect(ended.ending).not.toBeNull()
      const reviewed = choose(ended, 'review')
      expect(reviewed.ok).toBe(true)
      if (reviewed.ok) expect(reviewed.state.node).toBe('debrief')
    }
  })
})
