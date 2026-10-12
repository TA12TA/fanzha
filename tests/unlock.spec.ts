import { describe, expect, it } from 'vitest'
import {
  MAX_DRAG_PX,
  UNLOCK_THRESHOLD_PX,
  dragOffset,
  shouldUnlock,
} from '@/app/unlock'

describe('G. 上滑解锁判定', () => {
  it('向上拖动产生负位移（屏幕坐标向下为正）', () => {
    expect(dragOffset(500, 400)).toBe(-100)
    expect(dragOffset(500, 460)).toBe(-40)
  })

  it('向下或原地拖动不产生位移（锁屏不跟随下拉）', () => {
    expect(dragOffset(500, 500)).toBe(0)
    expect(dragOffset(500, 560)).toBe(0)
    expect(dragOffset(0, 100)).toBe(0)
  })

  it('位移被限制在上限内，避免内容被拖出屏幕', () => {
    expect(dragOffset(800, 0)).toBe(-MAX_DRAG_PX)
    expect(dragOffset(9999, 0)).toBe(-MAX_DRAG_PX)
    // 刚好在限内不裁剪，超出才裁剪
    expect(dragOffset(500, 500 - MAX_DRAG_PX)).toBe(-MAX_DRAG_PX)
    expect(dragOffset(500, 500 - MAX_DRAG_PX + 10)).toBe(-(MAX_DRAG_PX - 10))
  })

  it('非法输入（NaN / Infinity）按未拖动处理', () => {
    expect(dragOffset(Number.NaN, 400)).toBe(0)
    expect(dragOffset(500, Number.NaN)).toBe(0)
    expect(dragOffset(Number.POSITIVE_INFINITY, 400)).toBe(0)
    expect(shouldUnlock(Number.NaN)).toBe(false)
    expect(shouldUnlock(Number.NEGATIVE_INFINITY)).toBe(false)
  })

  it('达到阈值才解锁，阈值边界包含在内', () => {
    expect(shouldUnlock(0)).toBe(false)
    expect(shouldUnlock(-10)).toBe(false)
    expect(shouldUnlock(-(UNLOCK_THRESHOLD_PX - 1))).toBe(false)
    // 达到与超过阈值都算解锁
    expect(shouldUnlock(-UNLOCK_THRESHOLD_PX)).toBe(true)
    expect(shouldUnlock(-UNLOCK_THRESHOLD_PX - 1)).toBe(true)
    expect(shouldUnlock(-MAX_DRAG_PX)).toBe(true)
  })

  it('轻微上滑（不足阈值）不解锁', () => {
    const offset = dragOffset(500, 500 - 20)
    expect(shouldUnlock(offset)).toBe(false)
  })
})
