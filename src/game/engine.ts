import { DEFAULT_LEVEL_ID, getLevel, requireLevel } from '@/data/levels'
import type { LevelEntry, PlayableLevel } from '@/game/level'
import { resumeTextOf } from '@/game/level'
import type {
  EndingId,
  GameState,
  HistoryEntry,
  LevelId,
  NodeId,
  OptionEffect,
  OptionId,
  RiskTag,
  TransitionResult,
} from '@/game/types'

/** 当前存档结构版本。变更状态结构时必须同步提升。 */
export const STATE_VERSION = 2

/** 创建初始状态。每关都从自己的初始模拟余额开始。 */
export function createInitialState(levelId: LevelId = DEFAULT_LEVEL_ID): GameState {
  const level = requireLevel(levelId)
  return {
    version: STATE_VERSION,
    levelId: level.meta.id,
    node: level.startNode,
    balance: level.initialBalance,
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
  if (typeof effect.platformDisplay === 'number') {
    // 平台展示数字只是页面数字，绝不进入 balance。
    state.platformDisplayed = effect.platformDisplay
  }
  if (effect.markProfileViewed) {
    state.viewedProfile = true
    // 资料线索同时记为风险标记，供复盘按经历引用（去重，因此可反复打开）。
    pushTags(['viewed-profile'], state.riskTags)
  }
  pushTags(effect.addTags, state.riskTags)

  return moneyChanged
}

/**
 * 剧情状态转移的唯一入口。
 *
 * 选项与可选项都从 `state.levelId` 对应的关卡读取，因此同一个选项 id
 * 在别的关卡里不会被误用（那是 `illegal-option`，不改变任何状态）。
 *
 * - 非法选项、过期选项、一次性选项重复提交：返回 `{ ok: false }`，**不改变状态、不产生副作用**。
 * - 合法选项：在副本上应用效果，返回新状态；入参对象保持不变。
 */
export function choose(state: GameState, optionId: string): TransitionResult {
  const level = getLevel(state.levelId)
  if (!level || level.kind !== 'playable') {
    return { ok: false, reason: 'unknown-option', state, optionId }
  }

  const option = level.options[optionId]

  if (!option) {
    return { ok: false, reason: 'unknown-option', state, optionId }
  }

  const allowed = level.nodeOptions[state.node] ?? []
  if (!allowed.includes(option.id)) {
    return { ok: false, reason: 'illegal-option', state, optionId }
  }

  if (option.effect?.once && state.appliedOnce[option.id]) {
    return { ok: false, reason: 'already-applied', state, optionId }
  }

  // `restart`：清空本关全部进度，恢复初始模拟余额与空历史。
  if (option.effect?.reset) {
    return {
      ok: true,
      state: createInitialState(state.levelId),
      optionId: option.id,
      effect: option.effect,
    }
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
  const targetNode = level.nodes[option.to]
  if (targetNode?.onEnter) {
    applyEffect(next, targetNode.onEnter)
  }
  next.node = option.to
  // 结局一旦产生就记录下来，进入复盘后仍然保留，供桌面/手册再次进入本局结果。
  next.ending = targetNode?.ending ?? state.ending

  return { ok: true, state: next, optionId: option.id, effect: option.effect ?? null }
}

/** 便捷封装：只要结果状态（失败时原样返回输入状态）。 */
export function chooseOrKeep(state: GameState, optionId: string): GameState {
  const result = choose(state, optionId)
  return result.state
}

/**
 * 判断状态是否满足内部不变式。开发期断言与存档校验共用。
 *
 * 所有金额口径都从状态所属关卡读取 —— 绝不能用第一关的 800/700/400
 * 去校验第二关的 600/300。
 */
export function isStateConsistent(state: GameState): boolean {
  if (state.version !== STATE_VERSION) return false
  const level = getLevel(state.levelId)
  if (!level || level.kind !== 'playable') return false
  if (!(state.node in level.nodes)) return false
  if (!Number.isFinite(state.balance) || !Number.isFinite(state.paidTotal)) return false
  if (state.paidTotal < 0 || state.balance < 0) return false
  // 核心不变式：可支配余额 = 本关初始余额 - 累计已确认付出。
  if (state.balance !== level.initialBalance - state.paidTotal) return false
  if (!level.validBalances.includes(state.balance)) return false
  if (!level.validPlatformDisplays.includes(state.platformDisplayed)) return false
  if (state.paidCount < 0) return false
  // 平台展示金额永不计入余额：它只能在满足本关声明的付款条件之后出现。
  for (const rule of level.platformRequiresPaid) {
    if (state.platformDisplayed === rule.display && state.paidTotal < rule.minPaid) return false
  }
  const ending = state.ending
  if (ending !== null) {
    if (!(ending in level.endings)) return false
    if (level.nodes[ending]?.ending !== ending) return false
    // 结局节点本身，或结局之后进入的复盘节点，都允许保留已记录的结局。
    if (state.node !== ending && state.node !== level.debriefNode) return false
  }
  // 复盘必须已经有结局，避免通过伪造存档进入复盘。
  if (state.node === level.debriefNode && ending === null) return false
  if (state.node === level.startNode && state.history.length > 0 && state.paidTotal !== 0) return false
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

/** 由状态推导结局视图，保证「及时止损」不把止损误写成零损失。 */
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
export function resumeLabel(level: PlayableLevel, node: NodeId): string {
  return resumeTextOf(level, node)
}

/** 该节点是否已经进入过结局。 */
export function isEndingNode(level: PlayableLevel, node: NodeId): boolean {
  return node in level.endings
}

/** 该状态所属关卡（可玩）。调用方保证 levelId 合法。 */
export function levelOf(state: GameState): PlayableLevel {
  return requireLevel(state.levelId)
}

/** 关卡条目（可能为锁定关卡），供界面展示。 */
export function entryOf(state: GameState): LevelEntry | null {
  return getLevel(state.levelId)
}

/** 该选项是否属于该状态所属关卡（不改变状态）。 */
export function canSubmit(state: GameState, optionId: OptionId): boolean {
  const level = getLevel(state.levelId)
  if (!level || level.kind !== 'playable') return false
  const option = level.options[optionId]
  if (!option) return false
  return (level.nodeOptions[state.node] ?? []).includes(option.id)
}
