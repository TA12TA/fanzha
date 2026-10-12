import { describe, expect, it } from 'vitest'
import {
  BEIJING_TIME_ZONE,
  formatBeijingDate,
  formatBeijingTime,
  msUntilNextMinute,
} from '@/app/clock'

describe('F. 北京时间时钟', () => {
  it('固定按 Asia/Shanghai 格式化，与设备本地时区无关', () => {
    expect(BEIJING_TIME_ZONE).toBe('Asia/Shanghai')

    // 2026-10-12T07:30:00Z = 北京时间 15:30
    const utcMorning = new Date('2026-10-12T07:30:00Z')
    expect(formatBeijingTime(utcMorning)).toBe('15:30')

    // 2026-10-12T16:05:00Z = 北京时间次日 00:05（跨日边界）
    const utcEvening = new Date('2026-10-12T16:05:00Z')
    expect(formatBeijingTime(utcEvening)).toBe('00:05')
    expect(formatBeijingDate(utcEvening)).toContain('10月13日')
  })

  it('使用 24 小时制且午夜显示为 00:xx 而非 24:xx', () => {
    const midnight = new Date('2026-10-12T16:00:00Z') // 北京 00:00
    expect(formatBeijingTime(midnight)).toBe('00:00')

    const justBeforeMidnight = new Date('2026-10-12T15:59:00Z') // 北京 23:59
    expect(formatBeijingTime(justBeforeMidnight)).toBe('23:59')
  })

  it('小时与分钟始终补零为两位', () => {
    const earlyMorning = new Date('2026-10-11T23:05:00Z') // 北京 07:05
    expect(formatBeijingTime(earlyMorning)).toBe('07:05')
  })

  it('日期包含月日与星期', () => {
    const monday = new Date('2026-10-12T07:30:00Z') // 北京 2026-10-12 星期一
    const formatted = formatBeijingDate(monday)
    expect(formatted).toContain('10月12日')
    expect(formatted).toContain('星期')
  })

  it('对齐到下一个整分，且不会返回 0 或负数', () => {
    // 整分整秒：应等待约一整分钟
    const onTheMinute = new Date('2026-10-12T07:30:00.000Z')
    expect(msUntilNextMinute(onTheMinute)).toBeGreaterThan(59_000)
    expect(msUntilNextMinute(onTheMinute)).toBeLessThanOrEqual(60_020)

    // 差一点到整分：应很快触发
    const almost = new Date('2026-10-12T07:30:59.900Z')
    expect(msUntilNextMinute(almost)).toBeGreaterThan(0)
    expect(msUntilNextMinute(almost)).toBeLessThanOrEqual(120)

    // 任意时刻都为正数，避免定时器空转
    for (const ms of [0, 1, 500, 30_000, 59_999]) {
      const t = new Date(Date.UTC(2026, 9, 12, 7, 30, 0, ms))
      expect(msUntilNextMinute(t)).toBeGreaterThan(0)
    }
  })
})
