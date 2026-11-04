import { describe, expect, it, vi } from 'vitest'
import { IDLE_CHECK_MS, IDLE_RESET_MS, isIdleExpired, useIdleReset } from '@/app/idleReset'

describe('闲置重置判断', () => {
  it('25 分钟是阈值', () => {
    expect(IDLE_RESET_MS).toBe(25 * 60 * 1000)
    expect(IDLE_CHECK_MS).toBe(30 * 1000)
  })

  it('未到 25 分钟不重置，到点重置', () => {
    const last = 1_000_000
    expect(isIdleExpired(last, last + IDLE_RESET_MS - 1)).toBe(false)
    expect(isIdleExpired(last, last + IDLE_RESET_MS)).toBe(true)
    expect(isIdleExpired(last, last + IDLE_RESET_MS + 5_000)).toBe(true)
  })

  it('非法时间输入不触发重置', () => {
    expect(isIdleExpired(Number.NaN, Date.now())).toBe(false)
    expect(isIdleExpired(Date.now(), Number.NaN)).toBe(false)
  })

  it('活动会推迟重置，超时只触发一次', () => {
    vi.useFakeTimers()
    const target = new EventTarget()
    let count = 0
    const idle = useIdleReset(
      () => {
        count += 1
      },
      { timeout: 1_000, interval: 100, target: target as unknown as Window },
    )

    idle.start()
    vi.advanceTimersByTime(900)
    target.dispatchEvent(new Event('pointerdown'))
    vi.advanceTimersByTime(900)
    expect(count, '活动后应重新计时').toBe(0)

    vi.advanceTimersByTime(200)
    expect(count, '超过阈值后应触发一次').toBe(1)

    vi.advanceTimersByTime(500)
    expect(count, '下一轮阈值之前不应重复触发').toBe(1)

    idle.stop()
    vi.useRealTimers()
  })
})
