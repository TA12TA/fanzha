import { isPlayable } from '@/game/level'
import type { LevelEntry } from '@/game/level'
import type { LevelSlotSummary } from '@/game/storage'

/**
 * 关卡卡片的**文案推导**（纯函数，不碰 DOM）。
 *
 * 为什么单独抽一个模块：卡片上这三行字（状态 / 行动 / 无障碍标签）是
 * 「关卡数据 + 存档摘要」推导出来的，属于逻辑而不是模板。抽出来之后
 * 可以脱离组件直接对四种状态（未开始 / 进行中 / 已完成 / 锁定）做断言，
 * 不必挂载整个手机。这与项目里 `app/unlock.ts`、`app/theme.ts` 的做法一致。
 */

/** 该关卡是否锁定（尚未开放）。 */
export function isLevelLocked(entry: LevelEntry): boolean {
  return !isPlayable(entry)
}

/**
 * 状态行文案。
 * 锁定关卡没有存档，直接说明「正在制作」，不读摘要（读了会显示 undefined）。
 */
export function levelStatusText(entry: LevelEntry, slot: LevelSlotSummary): string {
  if (isLevelLocked(entry)) return '正在制作'
  if (!slot.started) return '还没开始'
  if (slot.finished) {
    const ending = slot.endingTitle ? ` · ${slot.endingTitle}` : ''
    return `已完成${ending}（余额 ${slot.balance} 元）`
  }
  return `进行中 · 余额 ${slot.balance} 元`
}

/** 行动条文案。 */
export function levelCtaText(entry: LevelEntry, slot: LevelSlotSummary): string {
  if (isLevelLocked(entry)) return '敬请期待'
  if (!slot.started) return '开始'
  if (slot.finished) return '重看复盘'
  return '继续'
}

/**
 * 无障碍标签：把关号、标题、状态和「点了会发生什么」一次说清。
 * 读屏用户不该只听到「第二关 冒充客服退款」而不知道能不能进。
 *
 * @param action 可玩关卡上「点了会发生什么」。书桌版直接用默认的「进入」；
 *   历史轮播版对非中心卡传「先移到中间」，因为那时点一下只是居中、不会进入。
 */
export function levelCardAriaLabel(
  entry: LevelEntry,
  slot: LevelSlotSummary,
  action = '进入',
): string {
  const meta = entry.meta
  const status = levelStatusText(entry, slot)
  if (isLevelLocked(entry)) {
    return `${meta.ordinal} ${meta.title}，${status}，暂不可进入`
  }
  return `${meta.ordinal} ${meta.title}，${status}，${action}`
}
