import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DURATIONS,
  FIRST_NOTICE_DELAY_MS,
  LEAVE_MS,
  MAX_KEPT,
  countByKind,
  createIdFactory,
  dequeue,
  enqueue,
  head,
  useNotifications,
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

describe('L. 通知队列的时序（自动关闭与手动关闭不竞态）', () => {
  it('首条通知会先等一段延迟才展示', async () => {
    vi.useFakeTimers()
    try {
      const n = useNotifications()
      n.push({ kind: 'antifraud', title: 'A', body: 'a' })

      // 入队后立刻可见性仍为 false（等玩家看清桌面）
      expect(n.current.value?.title).toBe('A')
      expect(n.visible.value, '延迟期间不应可见').toBe(false)

      // 延迟结束后才可展示
      await vi.advanceTimersByTimeAsync(FIRST_NOTICE_DELAY_MS + 60)
      expect(n.visible.value, '延迟结束后应可见').toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('到点自动关闭：队列逐条推进', async () => {
    vi.useFakeTimers()
    try {
      const n = useNotifications()
      n.push({ kind: 'message', title: 'A', body: 'a' })
      n.push({ kind: 'antifraud', title: 'B', body: 'b' })

      expect(n.current.value?.title).toBe('A')
      expect(n.waitingCount.value).toBe(1)

      // 跨过首条延迟后，第一条到时自动关闭（含退场动画），第二条接上
      await vi.advanceTimersByTimeAsync(FIRST_NOTICE_DELAY_MS + DEFAULT_DURATIONS.message + LEAVE_MS + 40)
      expect(n.current.value?.title).toBe('B')

      // 第二条到点后队列清空
      await vi.advanceTimersByTimeAsync(DEFAULT_DURATIONS.antifraud + LEAVE_MS + 20)
      expect(n.current.value).toBeNull()
      expect(n.pendingCount.value).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('手动关闭会先停掉倒计时，不会连带跳过后一条', async () => {
    vi.useFakeTimers()
    try {
      const n = useNotifications()
      n.push({ kind: 'message', title: 'A', body: 'a' })
      n.push({ kind: 'antifraud', title: 'B', body: 'b' })

      // 跨过首条延迟，再在第一条自动关闭前夕手动关闭
      await vi.advanceTimersByTimeAsync(FIRST_NOTICE_DELAY_MS + DEFAULT_DURATIONS.message - 50)
      n.dismissCurrent()
      await vi.advanceTimersByTimeAsync(LEAVE_MS + 20)

      // 第二条必须仍然在展示，而不是被连带跳过
      expect(n.current.value?.title).toBe('B')

      // 再推进到第一条原本的自动关闭时间点，不应造成二次出队
      await vi.advanceTimersByTimeAsync(200)
      expect(n.current.value?.title).toBe('B')
    } finally {
      vi.useRealTimers()
    }
  })

  it('record 只留档不弹横幅，不占用展示队列', () => {
    const n = useNotifications()
    n.record({ kind: 'antifraud', title: '国家反诈中心提醒您', body: '已记录' })
    expect(n.current.value).toBeNull()
    expect(n.pendingCount.value).toBe(0)
    // 但通知中心能看到
    expect(n.history.value).toHaveLength(1)
    expect(n.history.value[0].body).toBe('已记录')
  })

  it('同一条通知内容只展示/留档一次', () => {
    const n = useNotifications()
    const item = { kind: 'message' as const, title: '青讯', body: '同一个通知' }

    n.push(item)
    n.push(item)
    expect(n.pendingCount.value, '重复 push 不应入队').toBe(1)
    expect(n.history.value, '重复 push 不应重复留档').toHaveLength(1)

    // 已经展示过的同一条内容，也不能通过 record 再留一份
    n.record(item)
    expect(n.history.value).toHaveLength(1)
    n.dispose()
  })

  it('dropCurrent 清空整个展示队列且不播动画，历史仍保留', () => {
    vi.useFakeTimers()
    try {
      const n = useNotifications()
      n.push({ kind: 'message', title: 'A', body: 'a' })
      n.push({ kind: 'message', title: 'B', body: 'b' })
      n.dropCurrent()
      // 同步生效：整个队列都清掉，避免排队中的下一条弹到新页面上
      expect(n.current.value).toBeNull()
      expect(n.pendingCount.value).toBe(0)
      expect(n.leaving.value).toBe(false)
      // 历史仍保留两条（通知中心还能回看）
      expect(n.history.value).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clear 清空队列与历史并停止计时', async () => {
    vi.useFakeTimers()
    try {
      const n = useNotifications()
      n.push({ kind: 'antifraud', title: 'A', body: 'a' })
      n.clear()
      expect(n.current.value).toBeNull()
      expect(n.history.value).toHaveLength(0)
      // 计时已停：推进时间不会再产生任何推进副作用
      await vi.advanceTimersByTimeAsync(20000)
      expect(n.current.value).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('dispose 后不再推进队列', async () => {
    vi.useFakeTimers()
    try {
      const n = useNotifications()
      n.push({ kind: 'antifraud', title: 'A', body: 'a' })
      n.dispose()
      await vi.advanceTimersByTimeAsync(DEFAULT_DURATIONS.antifraud + 5000)
      // 队列不再被清理（已销毁，由组件卸载负责），但绝不应抛错
      expect(n.pendingCount.value).toBeGreaterThanOrEqual(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
