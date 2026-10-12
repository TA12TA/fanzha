import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DURATIONS,
  MAX_KEPT,
  countByKind,
  createIdFactory,
  dequeue,
  enqueue,
  head,
  type PhoneNotification,
} from '@/app/notifications'

function note(id: number, kind: PhoneNotification['kind'] = 'antifraud'): PhoneNotification {
  return {
    id,
    kind,
    title: kind === 'antifraud' ? '国家反诈中心提醒您' : '青讯',
    body: `内容 ${id}`,
    durationMs: DEFAULT_DURATIONS[kind],
  }
}

describe('K. 通知队列（两类通知独立、定时关闭）', () => {
  it('两类通知有不同的自动关闭时长', () => {
    // 预警内容更长，停留时间应大于消息类
    expect(DEFAULT_DURATIONS.antifraud).toBeGreaterThan(DEFAULT_DURATIONS.message)
    expect(DEFAULT_DURATIONS.antifraud).toBeGreaterThan(0)
    expect(DEFAULT_DURATIONS.message).toBeGreaterThan(0)
  })

  it('入队按顺序排列，先入先出', () => {
    let list: PhoneNotification[] = []
    list = enqueue(list, note(1, 'message'))
    list = enqueue(list, note(2, 'antifraud'))
    expect(head(list)?.id).toBe(1)
    list = dequeue(list)
    expect(head(list)?.id).toBe(2)
    list = dequeue(list)
    expect(head(list)).toBeNull()
  })

  it('两类通知混在队列里互不覆盖，各自都保留', () => {
    let list: PhoneNotification[] = []
    list = enqueue(list, note(1, 'antifraud'))
    list = enqueue(list, note(2, 'message'))
    list = enqueue(list, note(3, 'antifraud'))
    expect(countByKind(list, 'antifraud')).toBe(2)
    expect(countByKind(list, 'message')).toBe(1)
    expect(list.map((n) => n.id)).toEqual([1, 2, 3])
  })

  it('超过上限时丢弃最旧的，避免无限增长', () => {
    let list: PhoneNotification[] = []
    for (let i = 1; i <= MAX_KEPT + 5; i += 1) list = enqueue(list, note(i))
    expect(list).toHaveLength(MAX_KEPT)
    // 最旧的 5 条被丢弃
    expect(head(list)?.id).toBe(6)
    expect(list[list.length - 1].id).toBe(MAX_KEPT + 5)
  })

  it('空队列出队与取队首是安全的', () => {
    const empty: PhoneNotification[] = []
    expect(dequeue(empty)).toEqual([])
    expect(head(empty)).toBeNull()
  })

  it('纯函数：入队/出队不修改原数组', () => {
    const original = [note(1)]
    const snapshot = JSON.stringify(original)
    enqueue(original, note(2))
    dequeue(original)
    expect(JSON.stringify(original)).toBe(snapshot)
  })

  it('id 工厂连续且不重复', () => {
    const next = createIdFactory()
    const ids = [next(), next(), next()]
    expect(ids).toEqual([1, 2, 3])
    expect(new Set(ids).size).toBe(3)
  })
})
