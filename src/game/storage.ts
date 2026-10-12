import { NODES, NODE_OPTIONS, OPTIONS } from '@/data/level01'
import { STATE_VERSION, createInitialState, isStateConsistent } from '@/game/engine'
import type { GameState, NodeId, OptionId, RiskTag } from '@/game/types'

/** 存档键名（版本化）。 */
export const SAVE_KEY = 'fj-juzhongju:save:v1'

const NODE_IDS = Object.keys(NODES) as NodeId[]
const OPTION_IDS = Object.keys(OPTIONS) as OptionId[]
const ENDING_IDS = ['end-clear', 'end-stop', 'end-loss'] as const

const RISK_TAGS: RiskTag[] = [
  'early-reject',
  'entered-group',
  'reported-in-group',
  'viewed-profile',
  'saw-pad-request',
  'stopped-before-pay',
  'paid-100',
  'saw-rebate-claim',
  'stopped-after-100',
  'withdraw-failed',
  'asked-freeze-fee',
  'stopped-at-freeze',
  'asked-extra',
  'stopped-before-extra',
  'paid-300',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNodeId(value: unknown): value is NodeId {
  return typeof value === 'string' && (NODE_IDS as string[]).includes(value)
}

function isOptionId(value: unknown): value is OptionId {
  return typeof value === 'string' && (OPTION_IDS as string[]).includes(value)
}

function isRiskTag(value: unknown): value is RiskTag {
  return typeof value === 'string' && (RISK_TAGS as string[]).includes(value)
}

/**
 * 校验反序列化结果。
 * 任何字段不符、金额不变式被破坏、节点/选项未知，一律判定为损坏存档。
 */
export function parseSave(raw: unknown): GameState | null {
  if (!isRecord(raw)) return null
  if (raw.version !== STATE_VERSION) return null
  if (!isNodeId(raw.node)) return null
  if (typeof raw.balance !== 'number' || typeof raw.paidTotal !== 'number') return null
  if (typeof raw.paidCount !== 'number') return null
  if (typeof raw.platformDisplayed !== 'number') return null
  if (typeof raw.viewedProfile !== 'boolean') return null
  if (!Array.isArray(raw.riskTags) || !raw.riskTags.every(isRiskTag)) return null
  if (!Array.isArray(raw.history)) return null
  if (!isRecord(raw.appliedOnce)) return null
  if (!Object.keys(raw.appliedOnce).every((key) => isOptionId(key))) return null
  if (raw.ending !== null && !(ENDING_IDS as readonly string[]).includes(raw.ending as string)) {
    return null
  }

  const history: GameState['history'] = []
  for (const item of raw.history) {
    if (!isRecord(item)) return null
    if (!isOptionId(item.optionId)) return null
    if (!isNodeId(item.from) || !isNodeId(item.to)) return null
    if (typeof item.moneyChanged !== 'boolean') return null
    history.push({
      optionId: item.optionId,
      from: item.from,
      to: item.to,
      moneyChanged: item.moneyChanged,
    })
  }

  const appliedOnce: GameState['appliedOnce'] = {}
  for (const [key, value] of Object.entries(raw.appliedOnce)) {
    if (value === true && isOptionId(key)) appliedOnce[key] = true
  }

  const state: GameState = {
    version: STATE_VERSION,
    node: raw.node,
    balance: raw.balance,
    platformDisplayed: raw.platformDisplayed,
    paidTotal: raw.paidTotal,
    paidCount: raw.paidCount,
    viewedProfile: raw.viewedProfile,
    riskTags: [...(raw.riskTags as RiskTag[])],
    history,
    appliedOnce,
    ending: (raw.ending as GameState['ending']) ?? null,
  }

  if (!isStateConsistent(state)) return null

  // 历史中的每个选项都必须在该历史时点的节点合法（防止被伪造的存档绕过节点）。
  let cursor: NodeId = 'intro'
  for (const entry of history) {
    if (entry.from !== cursor) return null
    if (!(NODE_OPTIONS[cursor] ?? []).includes(entry.optionId)) return null
    cursor = entry.to
  }
  if (cursor !== state.node) return null

  return state
}

/** 读取存档；损坏/旧版/不可用时返回 null（调用方回退开场）。 */
export function loadSave(storage?: Storage | null): GameState | null {
  const store = storage ?? safeStorage()
  if (!store) return null
  try {
    const text = store.getItem(SAVE_KEY)
    if (!text) return null
    const parsed: unknown = JSON.parse(text)
    const state = parseSave(parsed)
    if (!state) {
      store.removeItem(SAVE_KEY)
      return null
    }
    return state
  } catch {
    try {
      store.removeItem(SAVE_KEY)
    } catch {
      /* 忽略：存储不可用时无需处理 */
    }
    return null
  }
}

/** 写入存档；失败（隐私模式/配额）时静默降级，不影响游戏进行。 */
export function saveGame(state: GameState, storage?: Storage | null): boolean {
  const store = storage ?? safeStorage()
  if (!store) return false
  try {
    store.setItem(SAVE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

/** 清除存档（重新开始）。 */
export function clearSave(storage?: Storage | null): void {
  const store = storage ?? safeStorage()
  if (!store) return
  try {
    store.removeItem(SAVE_KEY)
  } catch {
    /* 忽略 */
  }
}

/** 获取可用的 localStorage；不可用时返回 null。 */
export function safeStorage(): Storage | null {
  try {
    if (typeof globalThis.localStorage === 'undefined') return null
    const probe = '__fj_probe__'
    globalThis.localStorage.setItem(probe, '1')
    globalThis.localStorage.removeItem(probe)
    return globalThis.localStorage
  } catch {
    return null
  }
}

/** 恢复或回退：读取失败时返回全新初始状态。 */
export function restoreOrInitial(storage?: Storage | null): GameState {
  return loadSave(storage) ?? createInitialState()
}
