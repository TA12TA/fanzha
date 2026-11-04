/**
 * 闲置重置：25 分钟没有任何用户操作后，把整部手机恢复成“新设备”状态。
 *
 * 只清关卡存档与当前关卡，不清音效/主题等设备设置 —— 后者不是“进度”。
 * 时间判断抽成纯函数，便于测试；事件监听放在组合式函数里，由根壳启动一次。
 */

/** 触发重置的闲置时长：25 分钟。 */
export const IDLE_RESET_MS = 25 * 60 * 1000

/** 检查间隔：30 秒。比每秒轮询便宜，也能在后台节流后及时补判。 */
export const IDLE_CHECK_MS = 30 * 1000

/** 给定最后一次活动时间与当前时间，是否已经超过闲置阈值。 */
export function isIdleExpired(
  lastActivity: number,
  now: number,
  timeout = IDLE_RESET_MS,
): boolean {
  if (!Number.isFinite(lastActivity) || !Number.isFinite(now)) return false
  return now - lastActivity >= timeout
}

export interface IdleResetOptions {
  /** 闲置阈值，默认 25 分钟。 */
  timeout?: number
  /** 检查间隔，默认 30 秒。 */
  interval?: number
  /** 事件目标；测试或 SSR 时可注入。 */
  target?: Window | null
}

/**
 * 在 target 上监听用户操作，超时后调用 onReset。
 * 返回 start/stop，由根壳在挂载/卸载时调用。
 */
export function useIdleReset(onReset: () => void, options: IdleResetOptions = {}) {
  const timeout = options.timeout ?? IDLE_RESET_MS
  const interval = options.interval ?? IDLE_CHECK_MS
  const target =
    options.target ?? (typeof globalThis.window !== 'undefined' ? globalThis.window : null)

  let lastActivity = Date.now()
  let timer: ReturnType<typeof setInterval> | null = null
  let running = false

  /**
   * 滚动事件不冒泡，所以用 capture 监听；
   * passive 保证不会阻塞页面内聊天/列表的原生滚动。
   */
  const events: (keyof WindowEventMap)[] = [
    'pointerdown',
    'keydown',
    'touchstart',
    'wheel',
    'scroll',
  ]

  function markActive(): void {
    lastActivity = Date.now()
  }

  function check(): void {
    if (!isIdleExpired(lastActivity, Date.now(), timeout)) return
    // 先重置基准，避免 onReset 后下一轮又触发一次。
    markActive()
    onReset()
  }

  function start(): void {
    if (running || !target) return
    running = true
    markActive()
    for (const event of events) {
      target.addEventListener(event, markActive, { capture: true, passive: true })
    }
    timer = setInterval(check, interval)
  }

  function stop(): void {
    if (!running) return
    running = false
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (!target) return
    for (const event of events) {
      target.removeEventListener(event, markActive, { capture: true })
    }
  }

  return { start, stop, markActive }
}
