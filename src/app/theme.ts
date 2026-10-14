import { computed, onBeforeUnmount, watch } from 'vue'
import { useBeijingClock } from '@/app/clock'
import { useSettings, type ThemeMode } from '@/app/settings'

/**
 * 壁纸主题（白天 / 夜间）。
 *
 * 规则：
 * - 默认 `auto`：按**北京时间**判断，07:00–18:59 为白天，其余为夜间；
 * - 玩家可在设置里锁定 `day` / `night`，锁定后不再随时间变化；
 * - 结果写到 `<html data-theme="day|night">`，CSS 里由 `[data-theme]` 选择器
 *   切换壁纸与深浅色，组件不需要各自判断时间。
 *
 * 为什么用北京时间而不是设备时间：本项目的时间一律以北京时间为准
 * （锁屏与状态栏也是），否则设备时区不同的人看到的壁纸会互相矛盾。
 */

/** 白天的时间范围（含起点，不含终点）。 */
export const DAY_START_HOUR = 7
export const DAY_END_HOUR = 19

/** 按小时判断是白天还是夜间。 */
export function themeForHour(hour: number): 'day' | 'night' {
  return hour >= DAY_START_HOUR && hour < DAY_END_HOUR ? 'day' : 'night'
}

/** 把设置里的模式 + 当前北京时间，解析成实际生效的主题。 */
export function resolveTheme(mode: ThemeMode, beijingHour: number): 'day' | 'night' {
  if (mode === 'day') return 'day'
  if (mode === 'night') return 'night'
  return themeForHour(beijingHour)
}

/** 从「HH:mm」里取小时；解析失败时回退到 12（视为白天）。 */
function hourOf(time: string | undefined): number {
  const hour = Number.parseInt((time ?? '').slice(0, 2), 10)
  return Number.isFinite(hour) ? hour : 12
}

export function useTheme() {
  const { settings } = useSettings()
  // 复用同一个北京时间时钟：分钟级刷新，页面从后台恢复时也会校正。
  const { time } = useBeijingClock()

  const resolved = computed(() => resolveTheme(settings.value.theme, hourOf(time.value)))

  /** 写到 html 上，供 CSS 与自动化断言读取。 */
  function apply(value: 'day' | 'night'): void {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute('data-theme', value)
    // 同时给出处：便于排查「现在是按时间自动还是玩家锁定的」
    document.documentElement.setAttribute('data-theme-mode', settings.value.theme)
  }

  watch(
    // 必须同时监听「解析后的主题」和「玩家选的模式」。
    // 只监听前者时，一旦模式变了但解析结果没变（例如晚上把 auto 改成 night，
    // 解析结果本来就是 night），watch 不会触发，`data-theme-mode` 会一直停在
    // 旧值。这个 bug 只在「切换到的模式正好等于当前自动结果」时出现 ——
    // 白天跑测试看不出来，晚上跑才暴露（本轮就是这么发现的）。
    [resolved, () => settings.value.theme],
    () => apply(resolved.value),
    { immediate: true },
  )

  onBeforeUnmount(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.removeAttribute('data-theme')
      document.documentElement.removeAttribute('data-theme-mode')
    }
  })

  return { theme: resolved }
}
