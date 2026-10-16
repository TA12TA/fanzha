import { DEFAULT_LEVEL_ID, LEVELS, getLevel, getPlayableLevel, isPlayableLevelId } from '@/data/levels'
import type { PlayableLevel } from '@/game/level'
import { STATE_VERSION, createInitialState, isStateConsistent } from '@/game/engine'
import type { GameState, LevelId, NodeId } from '@/game/types'

/**
 * 版本化本地存档：**每关一个键**。
 *
 * 为什么不是一个大键：切关要保留各自的进度（玩家可能在第二关付了钱、
 * 切回第一关继续），而且单关数据损坏时只应清掉那一关，不该把其他关的
 * 进度一起带走。每关一个键让「清一关」和「清全部」都是自然操作。
 */

/** 存档结构版本。 */
export const SAVE_VERSION = 2

/** 每关存档键前缀。 */
export const SAVE_KEY_PREFIX = 'fj-juzhongju:save:v2'

/** 单关存档键（导出供测试与迁移使用）。 */
export function saveKey(levelId: LevelId): string {
  return `${SAVE_KEY_PREFIX}:${levelId}`
}

/** 当前选中关卡的键（只记 id，不含剧情）。 */
export const ACTIVE_LEVEL_KEY = 'fj-juzhongju:active:v1'

/**
 * 第一关时期的旧存档键。
 *
 * v1 只有一关，键名里没有关卡信息。升级到 v2 时把它迁移进第一关的槽位
 * （校验通过才迁移），而不是直接丢掉 —— 玩家正玩到一半的进度不该因为
 * 一次升级消失。
 */
export const LEGACY_SAVE_KEY = 'fj-juzhongju:save:v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 该 id 是否是合法关卡（含锁定关卡：它们的存档不该存在，但报错更精确）。 */
function isKnownLevelId(value: unknown): value is LevelId {
  return typeof value === 'string' && LEVELS.some((entry) => entry.meta.id === value)
}

/**
 * 校验反序列化结果。
 *
 * 任何字段不符、金额不变式被破坏、节点/选项未知，一律判定为损坏存档。
 * 校验用的节点表、选项表、金额口径全部来自 `raw.levelId` 对应的关卡。
 */
export function parseSave(raw: unknown): GameState | null {
  if (!isRecord(raw)) return null
  if (raw.version !== STATE_VERSION) return null
  if (!isKnownLevelId(raw.levelId)) return null
  const level: PlayableLevel | null = getPlayableLevel(raw.levelId)
  if (!level) return null
  if (typeof raw.node !== 'string' || !(raw.node in level.nodes)) return null
  if (typeof raw.balance !== 'number' || typeof raw.paidTotal !== 'number') return null
  if (typeof raw.paidCount !== 'number') return null
  if (typeof raw.platformDisplayed !== 'number') return null
  if (typeof raw.viewedProfile !== 'boolean') return null
  if (!Array.isArray(raw.riskTags) || !raw.riskTags.every((tag) => typeof tag === 'string')) return null
  // 风险标记必须是**本关**登记过的：未知标记一律判为损坏存档。
  // 少这道校验时，伪造一个不存在的标记会让复盘页渲染出 undefined。
  if (!raw.riskTags.every((tag) => typeof tag === 'string' && tag in level.riskTagLabels)) return null
  if (!Array.isArray(raw.history)) return null
  if (!isRecord(raw.appliedOnce)) return null
  if (!Object.keys(raw.appliedOnce).every((key) => key in level.options)) return null
  if (raw.ending !== null && !(typeof raw.ending === 'string' && raw.ending in level.endings)) {
    return null
  }

  const history: GameState['history'] = []
  for (const item of raw.history) {
    if (!isRecord(item)) return null
    if (typeof item.optionId !== 'string' || !(item.optionId in level.options)) return null
    if (typeof item.from !== 'string' || !(item.from in level.nodes)) return null
    if (typeof item.to !== 'string' || !(item.to in level.nodes)) return null
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
    if (value === true && key in level.options) appliedOnce[key] = true
  }

  const state: GameState = {
    version: STATE_VERSION,
    levelId: level.meta.id,
    node: raw.node,
    balance: raw.balance,
    platformDisplayed: raw.platformDisplayed,
    paidTotal: raw.paidTotal,
    paidCount: raw.paidCount,
    viewedProfile: raw.viewedProfile,
    riskTags: [...(raw.riskTags as string[])],
    history,
    appliedOnce,
    ending: (raw.ending as GameState['ending']) ?? null,
  }

  if (!isStateConsistent(state)) return null

  // 历史中的每个选项都必须在该历史时点的节点合法（防止被伪造的存档绕过节点）。
  let cursor: NodeId = level.startNode
  for (const entry of history) {
    if (entry.from !== cursor) return null
    if (!(level.nodeOptions[cursor] ?? []).includes(entry.optionId)) return null
    cursor = entry.to
  }
  if (cursor !== state.node) return null

  return state
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

/**
 * 把第一关时期的 v1 存档迁移进第一关槽位。
 *
 * 规则：
 * 1. **校验通过才迁移**，迁移成功后删除旧键（否则旧键会在下次启动时
 *    复活，把玩家在新版里的进度覆盖掉）。校验不通过就按损坏存档处理 ——
 *    与「损坏存档回退开场」的既有行为一致。
 * 2. **只在槽位为空时写入**。如果第一关已经有 v2 存档（玩家升级后又玩了
 *    一会儿，而旧键因为某种原因还在），绝不能拿旧数据盖掉新进度。
 *
 * @returns 是否真的迁移了一份有效进度
 */
export function ensureMigrated(storage?: Storage | null): boolean {
  const store = storage ?? safeStorage()
  if (!store) return false
  let text: string | null = null
  try {
    text = store.getItem(LEGACY_SAVE_KEY)
  } catch {
    return false
  }
  if (!text) return false

  try {
    const parsed: unknown = JSON.parse(text) as unknown
    const migrated = isRecord(parsed)
      ? parseSave({ ...parsed, version: STATE_VERSION, levelId: DEFAULT_LEVEL_ID })
      : null
    if (migrated && store.getItem(saveKey(migrated.levelId)) === null) {
      store.setItem(saveKey(migrated.levelId), JSON.stringify(migrated))
    }
    // 无论迁移成功与否都要删掉旧键：留着它只会在每次启动时重复尝试。
    store.removeItem(LEGACY_SAVE_KEY)
    return migrated !== null
  } catch {
    try {
      store.removeItem(LEGACY_SAVE_KEY)
    } catch {
      /* 忽略 */
    }
    return false
  }
}

/**
 * 读取某一关的存档；损坏/旧版/不可用时返回 null（调用方回退开场）。
 *
 * 只影响这一关：其他关卡的槽位不受影响。
 */
export function loadSave(storage?: Storage | null, levelId: LevelId = DEFAULT_LEVEL_ID): GameState | null {
  const store = storage ?? safeStorage()
  if (!store) return null
  ensureMigrated(store)
  try {
    const text = store.getItem(saveKey(levelId))
    if (!text) return null
    const parsed: unknown = JSON.parse(text)
    const state = parseSave(parsed)
    // 槽位里的关卡必须与请求的关卡一致，否则视为损坏。
    if (!state || state.levelId !== levelId) {
      store.removeItem(saveKey(levelId))
      return null
    }
    return state
  } catch {
    try {
      store.removeItem(saveKey(levelId))
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
  if (!isPlayableLevelId(state.levelId)) return false
  try {
    store.setItem(saveKey(state.levelId), JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

/** 清除**某一关**的存档（重新开始本关）。其他关卡不受影响。 */
export function clearSave(storage?: Storage | null, levelId: LevelId = DEFAULT_LEVEL_ID): void {
  const store = storage ?? safeStorage()
  if (!store) return
  try {
    store.removeItem(saveKey(levelId))
  } catch {
    /* 忽略 */
  }
}

/** 清除全部关卡的存档与「当前关卡」记录。 */
export function clearAllSaves(storage?: Storage | null): void {
  const store = storage ?? safeStorage()
  if (!store) return
  for (const entry of LEVELS) {
    try {
      store.removeItem(saveKey(entry.meta.id))
    } catch {
      /* 忽略 */
    }
  }
  try {
    store.removeItem(ACTIVE_LEVEL_KEY)
  } catch {
    /* 忽略 */
  }
}

/** 读取「上次在玩哪一关」；无效或不可用时回退默认关卡。 */
export function loadActiveLevel(storage?: Storage | null): LevelId {
  const store = storage ?? safeStorage()
  if (!store) return DEFAULT_LEVEL_ID
  try {
    const value = store.getItem(ACTIVE_LEVEL_KEY)
    if (value && isPlayableLevelId(value)) return value as LevelId
  } catch {
    /* 忽略 */
  }
  return DEFAULT_LEVEL_ID
}

/** 记住「当前在玩哪一关」。 */
export function saveActiveLevel(levelId: LevelId, storage?: Storage | null): void {
  const store = storage ?? safeStorage()
  if (!store || !isPlayableLevelId(levelId)) return
  try {
    store.setItem(ACTIVE_LEVEL_KEY, levelId)
  } catch {
    /* 忽略 */
  }
}

/** 恢复或回退：读取失败时返回该关的全新初始状态。 */
export function restoreOrInitial(storage?: Storage | null, levelId: LevelId = DEFAULT_LEVEL_ID): GameState {
  return loadSave(storage, levelId) ?? createInitialState(levelId)
}

/** 某一关的存档摘要（供大厅卡片显示状态，不加载完整状态）。 */
export interface LevelSlotSummary {
  /** 是否已经开过这一关（有存档）。 */
  started: boolean
  /** 是否已经产生结局。 */
  finished: boolean
  /** 当前模拟余额；未开始时为 null。 */
  balance: number | null
  /** 已产生结局时的标题。 */
  endingTitle: string | null
}

/** 读一关的存档摘要。损坏存档按「未开始」处理。 */
export function readSlotSummary(
  level: PlayableLevel,
  storage?: Storage | null,
): LevelSlotSummary {
  const state = loadSave(storage, level.meta.id)
  if (!state) {
    return { started: false, finished: false, balance: null, endingTitle: null }
  }
  return {
    started: true,
    finished: state.ending !== null,
    balance: state.balance,
    endingTitle: state.ending ? (level.endings[state.ending]?.title ?? null) : null,
  }
}

/** 该关卡 id 是否在注册表里（供调用方提前校验用户输入）。 */
export function isKnownLevel(levelId: string): boolean {
  return getLevel(levelId) !== null
}
