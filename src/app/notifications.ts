import { computed, ref, type ComputedRef } from 'vue'

/**
 * 通知队列。
 *
 * 两类通知彼此独立、互不覆盖：
 * - `antifraud`：国家反诈中心预警（关键剧情节点触发）
 * - `message`：消息类通知（学姐邀请、群消息等）
 *
 * 设计约束：
 * - 同一时刻只展示一条，展示完自动关闭后轮到下一条，避免顶部互相遮挡。
 * - 每条有独立的自动关闭时长。
 * - 手动关闭与自动关闭**不会竞态**：手动关闭会先取消该条的倒计时，
 *   再播放退场动画、最后出队，因此不会出现「点一下跳过两条」。
 * - 退场动画时长由本模块统一管理，组件不再自己 setTimeout。
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
  antifraud: 6000,
  // 消息类更短，避免干扰操作。
  message: 4000,
}

/** 退场动画时长（与 CSS 中的 --dur-base 对齐）。 */
export const LEAVE_MS = 200

/**
 * 进入系统后延迟多久才弹出第一条通知。
 * 让玩家先看到桌面本身（像真机开机后要先看清主屏），
 * 而不是解锁瞬间就被通知盖住。
 */
export const FIRST_NOTICE_DELAY_MS = 3000

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
  /** 队列长度（含当前正在展示的一条）。 */
  pendingCount: ComputedRef<number>
  /** 正在等待展示的条数（不含当前这条）。 */
  waitingCount: ComputedRef<number>
  /** 当前通知是否正在退场（用于播放动画）。 */
  leaving: ComputedRef<boolean>
  /**
   * 当前通知是否已可以展示。
   * 进入系统后的第一条通知会先等待一段延迟（让玩家看清桌面），
   * 延迟结束前该值为 false，组件据此不渲染横幅。
   */
  visible: ComputedRef<boolean>
  /**
   * 是否有通知**已经真正弹出过**（至少有一条开始展示）。
   * 用于让桌面角标与横幅时序一致：横幅还没弹时，角标不应先亮。
   */
  hasShownAny: ComputedRef<boolean>
  /** 已收到的全部通知（倒序，最新在前），供通知中心查看。 */
  history: ComputedRef<PhoneNotification[]>
  /** 推送一条通知（进入展示队列，会弹横幅）。 */
  push: (input: {
    kind: NotificationKind
    title: string
    body: string
    durationMs?: number
  }) => void
  /** 只记入通知中心，不进入展示队列（用于关闭弹出、或避免与桌面提示重复）。 */
  record: (input: { kind: NotificationKind; title: string; body: string }) => void
  /** 玩家主动关闭当前通知（先停倒计时，再动画，最后出队）。 */
  dismissCurrent: () => void
  /**
   * 立即丢弃**整个展示队列**，不播动画（用于切换视图/重开）。
   * 只清展示队列，通知中心的历史保留。
   */
  dropCurrent: () => void
  /** 清空队列与历史。 */
  clear: () => void
  /** 卸载时清理定时器。 */
  dispose: () => void
}

/**
 * 通知队列（响应式）。
 * 所有定时器都由这里管理，组件不自己 setTimeout。
 */
export function useNotifications(): NotificationApi {
  const queue = ref<PhoneNotification[]>([])
  const history = ref<PhoneNotification[]>([])
  const leaving = ref(false)
  const nextId = createIdFactory()

  /** 队首的自动关闭倒计时。 */
  let autoTimer: ReturnType<typeof setTimeout> | null = null
  /** 退场动画计时。 */
  let leaveTimer: ReturnType<typeof setTimeout> | null = null
  /** 首次展示前的延迟计时（进入系统后先让玩家看清桌面）。 */
  let delayTimer: ReturnType<typeof setTimeout> | null = null
  /** 首次通知是否仍处于「等待延迟结束」状态。 */
  let awaitingFirst = true
  let disposed = false

  function clearAutoTimer(): void {
    if (autoTimer) {
      clearTimeout(autoTimer)
      autoTimer = null
    }
  }

  function clearLeaveTimer(): void {
    if (leaveTimer) {
      clearTimeout(leaveTimer)
      leaveTimer = null
    }
  }

  function clearDelayTimer(): void {
    if (delayTimer) {
      clearTimeout(delayTimer)
      delayTimer = null
    }
  }

  const current = computed(() => head(queue.value))
  const pendingCount = computed(() => queue.value.length)
  const waitingCount = computed(() => Math.max(0, queue.value.length - 1))
  /** 是否已过首次延迟（延迟期间不渲染横幅）。 */
  const ready = ref(false)
  const visible = computed(() => ready.value && current.value !== null && !disposed)
  /**
   * 是否已有通知真正弹出过。
   * `ready` 一旦为 true 即表示第一条已经开始展示；
   * 用它驱动桌面角标，保证「先弹横幅、后亮角标」。
   */
  const hasShownAny = computed(() => ready.value)
  /** 通知中心展示：最新在前。 */
  const historyView = computed(() => [...history.value].reverse())

  /** 出队并让下一条开始计时。 */
  function advanceNow(): void {
    clearAutoTimer()
    queue.value = dequeue(queue.value)
    leaving.value = false
    schedule()
  }

  /**
   * 为队首安排自动关闭。
   * 若这是本次进入系统后的第一条通知，先等 `FIRST_NOTICE_DELAY_MS`
   * 让玩家看清桌面，再开始展示（展示时长仍按类型计算）。
   */
  function schedule(): void {
    clearAutoTimer()
    if (disposed) return
    const top = head(queue.value)
    if (!top) return

    if (awaitingFirst) {
      awaitingFirst = false
      clearDelayTimer()
      delayTimer = setTimeout(() => {
        delayTimer = null
        // 延迟结束：允许展示，并开始这条通知的展示计时。
        ready.value = true
        schedule()
      }, FIRST_NOTICE_DELAY_MS)
      return
    }

    autoTimer = setTimeout(() => {
      autoTimer = null
      beginLeave()
    }, top.durationMs)
  }

  /**
   * 开始退场：先停掉倒计时（关键：避免与手动关闭竞态），
   * 播放退场动画后再出队。
   */
  function beginLeave(): void {
    if (!head(queue.value)) return
    clearAutoTimer()
    clearLeaveTimer()
    leaving.value = true
    leaveTimer = setTimeout(() => {
      leaveTimer = null
      advanceNow()
    }, LEAVE_MS)
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

  /**
   * 只记入通知中心，不弹横幅。
   * 用于「玩家关闭了顶部横幅」或「桌面已有同内容的持久提示」时，
   * 保证通知中心仍留档，同时不占用展示队列与定时器。
   */
  function record(input: { kind: NotificationKind; title: string; body: string }): void {
    const item: PhoneNotification = {
      id: nextId(),
      kind: input.kind,
      title: input.title,
      body: input.body,
      durationMs: DEFAULT_DURATIONS[input.kind],
    }
    history.value = enqueue(history.value, item)
  }

  function dismissCurrent(): void {
    beginLeave()
  }

  /**
   * 立即丢弃整个展示队列（不播动画）。
   * 用于切换视图时避免过期横幅压住新页面——必须清整队，
   * 否则排队中的下一条会紧接着弹到新页面上。
   */
  function dropCurrent(): void {
    clearAutoTimer()
    clearLeaveTimer()
    leaving.value = false
    queue.value = []
  }

  function clear(): void {
    clearAutoTimer()
    clearLeaveTimer()
    clearDelayTimer()
    leaving.value = false
    ready.value = false
    awaitingFirst = true
    queue.value = []
    history.value = []
  }

  function dispose(): void {
    disposed = true
    clearAutoTimer()
    clearLeaveTimer()
    clearDelayTimer()
  }

  return {
    current,
    pendingCount,
    waitingCount,
    leaving: computed(() => leaving.value),
    visible,
    hasShownAny,
    history: historyView,
    push,
    record,
    dismissCurrent,
    dropCurrent,
    clear,
    dispose,
  }
}
