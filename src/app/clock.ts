import { onBeforeUnmount, ref } from 'vue'

/**
 * 北京时间时钟。
 *
 * 固定使用 `Asia/Shanghai` 时区格式化，因此无论玩家设备处在哪个时区，
 * 状态栏与锁屏显示的都是真实北京时间（含夏令时/时区规则由 Intl 处理）。
 *
 * 只读取本地系统时钟，不发起任何网络请求，也不访问设备权限。
 */

/** 目标时区：北京时间（UTC+8）。 */
export const BEIJING_TIME_ZONE = 'Asia/Shanghai'

/**
 * 时间格式化（HH:mm，24 小时制）。
 * 显式使用 `hourCycle: 'h23'`，避免部分环境下午夜被格式化为 24:00。
 */
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: BEIJING_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** 日期格式化（M月d日）。 */
const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: BEIJING_TIME_ZONE,
  month: 'long',
  day: 'numeric',
})

/** 星期格式化（星期X）。 */
const weekdayFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: BEIJING_TIME_ZONE,
  weekday: 'long',
})

/** 格式化为 HH:mm。 */
export function formatBeijingTime(date: Date = new Date()): string {
  return timeFormatter.format(date)
}

/** 格式化为「M月d日 星期X」。 */
export function formatBeijingDate(date: Date = new Date()): string {
  return `${dateFormatter.format(date)} ${weekdayFormatter.format(date)}`
}

/** 距离下一个整分的毫秒数（用于对齐刷新，避免每秒空转）。 */
export function msUntilNextMinute(date: Date = new Date()): number {
  const elapsed = date.getSeconds() * 1000 + date.getMilliseconds()
  // 额外留 20ms 余量，确保触发时已经跨过整分。
  return 60_000 - elapsed + 20
}

export interface BeijingClock {
  /** 当前北京时间 HH:mm。 */
  time: ReturnType<typeof ref<string>>
  /** 当前北京时间日期，如「10月12日 星期一」。 */
  date: ReturnType<typeof ref<string>>
  /** 立即按当前时间刷新（供页面重新可见时调用）。 */
  refresh: () => void
}

/**
 * 响应式北京时间时钟。
 *
 * - 每分钟对齐刷新一次，避免每秒触发渲染。
 * - 标签页被浏览器挂起后恢复时，通过 `visibilitychange` 立即校正，
 *   避免回到页面时看到过期时间。
 */
export function useBeijingClock(): BeijingClock {
  const time = ref(formatBeijingTime())
  const date = ref(formatBeijingDate())
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function refresh(): void {
    const now = new Date()
    time.value = formatBeijingTime(now)
    date.value = formatBeijingDate(now)
  }

  function schedule(): void {
    clearTimer()
    timer = setTimeout(() => {
      refresh()
      schedule()
    }, msUntilNextMinute())
  }

  /** 页面从后台恢复时立即校正时间，并重新对齐刷新节奏。 */
  function onVisibilityChange(): void {
    if (typeof document === 'undefined') return
    if (document.visibilityState === 'visible') {
      refresh()
      schedule()
    }
  }

  refresh()
  schedule()

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  onBeforeUnmount(() => {
    clearTimer()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  })

  return { time, date, refresh }
}
