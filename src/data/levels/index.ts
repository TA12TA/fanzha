import { isPlayable } from '@/game/level'
import type { LevelEntry, PlayableLevel } from '@/game/level'
import type { LevelId } from '@/game/types'
import { level01 } from '@/data/levels/level01'
import { level02 } from '@/data/levels/level02'
import { level03 } from '@/data/levels/level03'

/**
 * 关卡注册表。
 *
 * 这是全项目唯一知道「有哪些关卡」的地方：引擎、存档、大厅、手册都从这里
 * 取关卡定义，不再直接 import 某个关卡文件。新增一关的步骤见 `LEVELS.md`。
 */

/** 全部关卡（顺序即大厅展示顺序）。 */
export const LEVELS: LevelEntry[] = [level01, level02, level03]

/** 默认关卡：首次进入游戏时打开的那一关。 */
export const DEFAULT_LEVEL_ID: LevelId = 'level-01'

/** 按 id 取关卡；未知 id 返回 null（存档校验依赖这一点）。 */
export function getLevel(id: string): LevelEntry | null {
  return LEVELS.find((entry) => entry.meta.id === id) ?? null
}

/** 按 id 取**可玩**关卡；锁定关卡或未知 id 返回 null。 */
export function getPlayableLevel(id: string): PlayableLevel | null {
  const entry = getLevel(id)
  return entry && isPlayable(entry) ? entry : null
}

/** 全部可玩关卡。 */
export function playableLevels(): PlayableLevel[] {
  return LEVELS.filter(isPlayable)
}

/** 该 id 是否是可玩关卡。 */
export function isPlayableLevelId(id: string): boolean {
  return getPlayableLevel(id) !== null
}

/** 取关卡显示标题（找不到时回退到 id，避免界面出现空白）。 */
export function levelTitleOf(id: string): string {
  return getLevel(id)?.meta.title ?? id
}

/**
 * 取一个可玩关卡；找不到时**抛错**。
 *
 * 用在「调用方保证 id 合法」的位置（例如已经过 `parseSave` 校验的状态），
 * 这类地方静默回退反而会掩盖真正的 bug。
 */
export function requireLevel(id: string): PlayableLevel {
  const level = getPlayableLevel(id)
  if (!level) throw new Error(`未知的可玩关卡：${id}`)
  return level
}
