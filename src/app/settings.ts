import { ref } from 'vue'
import { safeStorage } from '@/game/storage'

/**
 * 玩家设置（版本化本地存储）。
 *
 * 与剧情存档分开保存：重新开始本局不会重置玩家的音效偏好。
 */

export const SETTINGS_KEY = 'fj-juzhongju:settings:v1'
export const SETTINGS_VERSION = 1

/** 壁纸主题。`auto` 表示按北京时间自动在白天/夜间之间切换。 */
export type ThemeMode = 'auto' | 'day' | 'night'

export const THEME_MODES: ThemeMode[] = ['auto', 'day', 'night']

export interface AppSettings {
  version: number
  /** 音效总开关。关闭后不播放任何声音。 */
  sound: boolean
  /** 顶部反诈提醒横幅开关。关闭后提醒仍会进入通知中心。 */
  banner: boolean
  /** 壁纸主题：默认按时间自动切换，也可手动锁定白天/夜间。 */
  theme: ThemeMode
}

function defaults(): AppSettings {
  return { version: SETTINGS_VERSION, sound: true, banner: true, theme: 'auto' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'auto' || value === 'day' || value === 'night'
}

/**
 * 校验反序列化结果；任何不符一律判为损坏并回退默认值。
 *
 * `theme` 是后加的字段：老存档里没有它，这里按 `auto` 迁移而不是整份丢弃 ——
 * 否则玩家已经调好的音效偏好会被一次升级清掉。
 */
export function parseSettings(raw: unknown): AppSettings | null {
  if (!isRecord(raw)) return null
  if (raw.version !== SETTINGS_VERSION) return null
  if (typeof raw.sound !== 'boolean') return null
  if (typeof raw.banner !== 'boolean') return null
  if (raw.theme !== undefined && !isThemeMode(raw.theme)) return null
  return {
    version: SETTINGS_VERSION,
    sound: raw.sound,
    banner: raw.banner,
    theme: isThemeMode(raw.theme) ? raw.theme : 'auto',
  }
}

export function loadSettings(storage?: Storage | null): AppSettings {
  const store = storage ?? safeStorage()
  if (!store) return defaults()
  try {
    const text = store.getItem(SETTINGS_KEY)
    if (!text) return defaults()
    const parsed = parseSettings(JSON.parse(text) as unknown)
    if (!parsed) {
      store.removeItem(SETTINGS_KEY)
      return defaults()
    }
    return parsed
  } catch {
    return defaults()
  }
}

export function saveSettings(settings: AppSettings, storage?: Storage | null): boolean {
  const store = storage ?? safeStorage()
  if (!store) return false
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(settings))
    return true
  } catch {
    return false
  }
}

/** 全局响应式设置。 */
const state = ref<AppSettings>(loadSettings())

/**
 * 从存储重新加载全局设置。
 * 供测试在用例之间复位单例状态，避免一个用例改设置影响后续用例；
 * 运行时也可用于「恢复默认设置」后同步内存状态。
 */
export function reloadSettings(): AppSettings {
  state.value = loadSettings()
  return state.value
}

export function useSettings() {
  function update(patch: Partial<Pick<AppSettings, 'sound' | 'banner' | 'theme'>>): void {
    state.value = { ...state.value, ...patch, version: SETTINGS_VERSION }
    saveSettings(state.value)
  }

  function setSound(enabled: boolean): void {
    update({ sound: enabled })
  }

  function setBanner(enabled: boolean): void {
    update({ banner: enabled })
  }

  function setTheme(mode: ThemeMode): void {
    update({ theme: mode })
  }

  function reset(): void {
    state.value = defaults()
    saveSettings(state.value)
  }

  return { settings: state, setSound, setBanner, setTheme, reset }
}
