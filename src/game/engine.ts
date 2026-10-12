import {
  INITIAL_BALANCE,
  NODES,
  NODE_OPTIONS,
  OPTIONS,
} from '@/data/level01'
import type {
  EndingId,
  GameState,
  HistoryEntry,
  NodeId,
  OptionEffect,
  OptionId,
  RiskTag,
  TransitionResult,
} from '@/game/types'

/** 当前存档结构版本。变更状态结构时必须同步提升。 */
export const STATE_VERSION = 1

/** 合法的模拟余额取值（由数值口径推出，用于校验与断言）。 */
export const VALID_BALANCES = [800, 700, 400] as const

/** 创建初始状态。 */
export function createInitialState(): GameState {
  return {
    version: STATE_VERSION,
    node: 'intro',
    balance: INITIAL_BALANCE,
    platformDisplayed: 0,
    paidTotal: 0,
    paidCount: 0,
    viewedProfile: false,
    riskTags: [],
    history: [],
    appliedOnce: {},
    ending: null,
  }
}

/** 深拷贝状态，保证引擎不修改入参。 */
function clone(state: GameState): GameState {
  return {
    ...state,
    riskTags: [...state.riskTags],
    history: [...state.history],
    appliedOnce: { ...state.appliedOnce },
  }
}

/** 追加风险标记（去重，保持加入顺序）。 */
function pushTags(tags: RiskTag[] | undefined, target: RiskTag[]): void {
  if (!tags) return
  for (const tag of tags) {
    if (!target.includes(tag)) target.push(tag)
  }
}

/**
 * 在事务内应用一次效果。
 * 金额变化只在这里发生，且调用方保证「每个选项最多应用一次」。
 */
function applyEffect(state: GameState, effect: OptionEffect | undefined): boolean {
  if (!effect) return false
  let moneyChanged = false

  if (typeof effect.balanceDelta === 'number' && effect.balanceDelta !== 0) {
    state.balance += effect.balanceDelta
    moneyChanged = true
  }
  if (typeof effect.paidDelta === 'number' && effect.paidDelta !== 0) {
    state.paidTotal += effect.paidDelta
    state.paidCount += 1
    moneyChanged = true
  }
  if (effect.markProfileViewed) {
    state.viewedProfile = true
  }
  pushTags(effect.addTags, state.riskTags)

  return moneyChanged
}

/**
 * 剧情状态转移的唯一入口。
 *
 * - 非法选项、过期选项、一次性选项重复提交：返回 `{ ok: false }`，**不改变状态、不产生副作用**。
 * - 合法选项：在副本上应用效果，返回新状态；入参对象保持不变。
 */
export function choose(state: GameState, optionId: string): TransitionResult {
  const option = (OPTIONS as Record<string, (typeof OPTIONS)[OptionId] | undefined>)[optionId]

  if (!option) {
    return { ok: false, reason: 'unknown-option', state, optionId }
  }

  const allowed = NODE_OPTIONS[state.node] ?? []
  if (!allowed.includes(option.id)) {
    return { ok: false, reason: 'illegal-option', state, optionId }
  }

  if (option.effect?.once && state.appliedOnce[option.id]) {
    return { ok: false, reason: 'already-applied', state, optionId }
  }

  const next = clone(state)
  const moneyChanged = applyEffect(next, option.effect)

  if (option.effect?.once) {
    next.appliedOnce[option.id] = true
  }

  const entry: HistoryEntry = {
    optionId: option.id,
    from: state.node,
    to: option.to,
    moneyChanged,
  }
  next.history.push(entry)

  // 进入目标节点：应用一次性的进入效果（同一事务内，天然不会重复）。
  const targetNode = NODES[option.to]
  if (targetNode?.onEnter) {
    applyEffect(next, targetNode.onEnter)
  }
  next.node = option.to
  next.ending = targetNode?.ending ?? null

  return { ok: true, state: next, optionId: option.id, effect: option.effect ?? null }
}

/** 便捷封装：只要结果状态（失败时返回原状态）。 */
export function chooseOrKeep(state: GameState, optionId: string): GameState {
  const result = choose(state, optionId)
  return result.ok ? result.state : result.state
}

/** 判断状态是否满足内部不变式。开发期断言与存档校验共用。 */
export function isStateConsistent(state: GameState): boolean {
  if (state.version !== STATE_VERSION) return false
  if (!(state.node in NODES)) return false
  if (!Number.isFinite(state.balance) || !Number.isFinite(state.paidTotal)) return false
  if (state.paidTotal < 0 || state.balance < 0) return false
  // 核心不变式：可支配余额 = 初始余额 - 累计已确认垫付。
  if (state.balance !== INITIAL_BALANCE - state.paidTotal) return false
  if (![0, 130].includes(state.platformDisplayed)) return false
  if (state.paidCount < 0) return false
  // 平台展示金额永不计入余额：展示 130 时余额只能是 700（已垫付 100）。
  if (state.platformDisplayed === 130 && state.balance !== 700) return false
  const ending = state.ending
  if (ending !== null && NODES[ending]?.ending !== ending) return false
  if (ending !== null && state.node !== ending) return false
  if (state.node === 'intro' && state.history.length > 0 && state.paidTotal !== 0) return false
  return true
}

/** 结局展示信息所需的最小数据。 */
export interface OutcomeView {
  ending: EndingId
  balance: number
  paidTotal: number
  /** 是否为「转账前取消」型止损（损失 0）。 */
  stoppedBeforePaying: boolean
}

/** 由状态推导结局视图，保证 `end-stop` 不把止损误写成零损失。 */
export function outcomeOf(state: GameState): OutcomeView | null {
  if (!state.ending) return null
  return {
    ending: state.ending,
    balance: state.balance,
    paidTotal: state.paidTotal,
    stoppedBeforePaying: state.paidTotal === 0,
  }
}

/** 桌面「继续当前事项」入口文案，仅用于导航，不触发剧情。 */
export function resumeLabel(node: NodeId): string {
  switch (node) {
    case 'intro':
      return '开始体验'
    case 'invite':
      return '有一条兼职邀请'
    case 'group':
      return '继续群聊'
    case 'transfer-100':
      return '待确认的模拟垫付 100 元'
    case 'rebate':
      return '查看任务结果'
    case 'freeze':
      return '查看提现异常'
    case 'transfer-300':
      return '待确认的模拟垫付 300 元'
    case 'end-clear':
    case 'end-stop':
    case 'end-loss':
      return '查看本局结果与复盘'
    case 'debrief':
      return '查看本局结果与复盘'
    default:
      return '继续当前事项'
  }
}

/** 该节点是否已经进入过结局。 */
export function isEndingNode(node: NodeId): boolean {
  return node === 'end-clear' || node === 'end-stop' || node === 'end-loss'
}
