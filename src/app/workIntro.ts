/**
 * 首屏作品封面的「已看过」标记。
 *
 * 单独放一个模块，让 AppShell 在闲置重置 / 长时间未打开时可以清掉它，
 * 而不需要把 localStorage 的 key 复制到两个组件里。
 */

export const WORK_INTRO_KEY = 'fj-juzhongju:work-intro:v1'

export function hasSeenWorkIntro(): boolean {
  try {
    return globalThis.localStorage?.getItem(WORK_INTRO_KEY) === 'seen'
  } catch {
    return false
  }
}

export function markWorkIntroSeen(): void {
  try {
    globalThis.localStorage?.setItem(WORK_INTRO_KEY, 'seen')
  } catch {
    // localStorage 不可用时只影响下次是否再展示，不影响进入。
  }
}

/** 重置为「没看过」：下一次大厅挂载会重新弹封面。 */
export function resetWorkIntro(): void {
  try {
    globalThis.localStorage?.removeItem(WORK_INTRO_KEY)
  } catch {
    // 忽略存储不可用。
  }
}
