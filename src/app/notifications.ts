import { computed, ref, type ComputedRef } from 'vue'

/**
 * 通知队列。
 *
 * 两类通知彼此独立、互不覆盖：
 * - `antifraud`：国家反诈中心预警（关键剧情节点触发）
 * - `message`：消息类通知（学姐邀请、群消息等）
 *
 * 同一时刻只展示一条，展示完自动关闭后轮到下一条，保证每条都能看全，
 * 也避免多条横幅在顶部互相遮挡。每条都有独立的自动关闭时长。
 */

/** 通知类型。 */
export type NotificationKind = 'antifraud' | 'message'

/** 一条通知。 */
export interface PhoneNotification {
  id: number
  kind: NotificationKind
  /** 标题：预警类固定为「国家反诈中心提醒您」，消息类为发送方。 */
  title: string
  body: string
  /** 自动关闭时长（毫秒）。 */
  durationMs: number
}

/** 各类通知的默认自动关闭时长。 */
export const DEFAULT_DURATIONS: Record<NotificationKind, number> = {
  // 预警内容需要读完，停留久一些。
  antifraud: 7000,
  // 消息类更短，避免干扰操作。
  message: 4500,
}

/** 通知中心最多保留的条数。 */
export const MAX_KEPT = 30

/**
 * 追加一条通知（纯函数，返回新数组）。
 * 超过上限时丢弃最旧的。
 */
export function enqueue(
  list: PhoneNotification[],
  item: PhoneNotification,
  max = MAX_KEPT,
): PhoneNotification[] {
  const next = [...list, item]
  return next.length > max ? next.slice(next.length - max) : next
}

/** 移除队首（纯函数）。 */
export function dequeue(list: PhoneNotification[]): PhoneNotification[] {
  return list.length === 0 ? list : list.slice(1)
}

/** 队首通知，空队列返回 null。 */
export function head(list: PhoneNotification[]): PhoneNotification | null {
  return list.length > 0 ? list[0] : null
}

/** 按类型统计条数，用于通知中心分组标题。 */
export function countByKind(list: PhoneNotification[], kind: NotificationKind): number {
  return list.filter((n) => n.kind === kind).length
}

/** 生成递增 id 的工厂（避免同一毫秒内 id 冲突）。 */
export function createIdFactory(start = 0): () => number {
  let seq = start
  return () => {
    seq += 1
    return seq
  }
}

export interface NotificationApi {
  /** 当前正在展示的通知。 */
  current: ComputedRef<PhoneNotification | null>
  /** 等待展示的队列长度。 */
  pendingCount: ComputedRef<number>
  /** 已收到的全部通知（倒序，最新在前），供通知中心查看。 */
  history: ComputedRef<PhoneNotification[]>
  /** 推送一条通知。 */
  push: (input: {
    kind: NotificationKind
    title: string
    body: string
    durationMs?: number
  }) => void
  /** 立即关闭当前通知，轮到下一条。 */
  dismissCurrent: () => void
  /** 清空队列与历史。 */
  clear: () => void
  /** 卸载时清理定时器。 */
  dispose: () => void
}

/**
 * 通知队列（响应式）。
 * 定时器只由这里管理，组件不自己 setTimeout。
 */
export function useNotifications(): NotificationApi {
  const queue = ref<PhoneNotification[]>([])
  const history = ref<PhoneNotification[]>([])
  const nextId = createIdFactory()
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  const current = computed(() => head(queue.value))
  const pendingCount = computed(() => queue.value.length)
  /** 通知中心展示：最新在前。 */
  const historyView = computed(() => [...history.value].reverse())

  /** 为队首安排自动关闭。 */
  function schedule(): void {
    clearTimer()
    if (disposed) return
    const top = head(queue.value)
    if (!top) return
    timer = setTimeout(() => {
      advance()
    }, top.durationMs)
  }

  /** 关闭队首，并让下一条接上。 */
  function advance(): void {
    clearTimer()
    queue.value = dequeue(queue.value)
    schedule()
  }

  function push(input: {
    kind: NotificationKind
    title: string
    body: string
    durationMs?: number
  }): void {
    const item: PhoneNotification = {
      id: nextId(),
      kind: input.kind,
      title: input.title,
      body: input.body,
      durationMs: input.durationMs ?? DEFAULT_DURATIONS[input.kind],
    }
    history.value = enqueue(history.value, item)
    const wasEmpty = queue.value.length === 0
    queue.value = enqueue(queue.value, item)
    // 原本空闲时立刻开始计时；否则等前一条结束后自动接上。
    if (wasEmpty) schedule()
  }

  function clear(): void {
    clearTimer()
    queue.value = []
    history.value = []
  }

  function dispose(): void {
    disposed = true
    clearTimer()
  }

  return {
    current,
    pendingCount,
    history: historyView,
    push,
    dismissCurrent: advance,
    clear,
    dispose,
  }
}
