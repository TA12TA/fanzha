/**
 * 上滑解锁的判定逻辑。
 *
 * 抽成纯函数以便单元测试；组件只负责把指针事件换算成坐标。
 */

/** 触发解锁所需的最小上滑距离（CSS px）。 */
export const UNLOCK_THRESHOLD_PX = 56

/** 拖拽最大位移限制，避免内容被拖出屏幕。 */
export const MAX_DRAG_PX = 140

/**
 * 计算拖拽位移。
 *
 * 只接受向上拖动（返回负值）；向下拖动返回 0（锁屏不跟随下拉），
 * 并限制最大位移，防止内容被拖出可视区。
 */
export function dragOffset(startY: number, currentY: number, max = MAX_DRAG_PX): number {
  const raw = currentY - startY
  if (!Number.isFinite(raw) || raw >= 0) return 0
  return Math.max(raw, -Math.abs(max))
}

/** 位移是否已达到解锁阈值。 */
export function shouldUnlock(offsetY: number, threshold = UNLOCK_THRESHOLD_PX): boolean {
  return Number.isFinite(offsetY) && offsetY <= -Math.abs(threshold)
}
