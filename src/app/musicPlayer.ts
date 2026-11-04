import { computed, reactive } from 'vue'
import { MUSIC_TRACKS } from '@/data/music'
import type { MusicTrack } from '@/data/music'

/**
 * 青听音乐的全局播放状态。
 *
 * 音频元素由 PhoneShell 常驻持有，MusicScene 只负责显示与发指令。
 * 这样切到别的应用时音频不会随组件卸载而停，回到音乐页时进度也还在。
 * 不引入播放器库：队列、循环/随机、Media Session 都是原生 API 的薄封装。
 */
export type RepeatMode = 'off' | 'all' | 'one'

interface MusicPlayerState {
  currentId: string
  playing: boolean
  loading: boolean
  error: string
  position: number
  duration: number
  volume: number
  muted: boolean
  repeat: RepeatMode
  shuffle: boolean
  queue: string[]
}

/** Media Session 的极小类型面，避免依赖浏览器实现差异。 */
interface MediaActionDetails {
  seekTime?: number
  seekOffset?: number
}

interface MediaSessionLike {
  metadata: unknown
  playbackState: 'none' | 'paused' | 'playing'
  setActionHandler: (action: string, handler: ((details?: MediaActionDetails) => void) | null) => void
  setPositionState?: (state?: { duration: number; playbackRate: number; position: number }) => void
}

const tracks = MUSIC_TRACKS
const firstTrack = tracks[0]

const state = reactive<MusicPlayerState>({
  currentId: firstTrack.id,
  playing: false,
  loading: false,
  error: '',
  position: 0,
  duration: firstTrack.duration,
  volume: 1,
  muted: false,
  repeat: 'all',
  shuffle: false,
  queue: tracks.map((track) => track.id),
})

export const musicState = state

export const currentTrack = computed<MusicTrack>(
  () => tracks.find((track) => track.id === state.currentId) ?? firstTrack,
)

let audio: HTMLAudioElement | null = null
let loadedId = ''
let mediaWired = false
let endedGuard = false
let history: string[] = []
const wired = new WeakSet<HTMLAudioElement>()

function trackOf(id: string): MusicTrack | undefined {
  return tracks.find((track) => track.id === id)
}

function mediaSession(): MediaSessionLike | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as Navigator & { mediaSession?: MediaSessionLike }).mediaSession
}

function syncPositionState(): void {
  const session = mediaSession()
  if (!session?.setPositionState) return
  const duration = state.duration
  if (!Number.isFinite(duration) || duration <= 0) return
  try {
    session.setPositionState({
      duration,
      playbackRate: 1,
      position: Math.min(Math.max(0, state.position), duration),
    })
  } catch {
    // 元数据尚未就绪时浏览器会拒绝，忽略即可。
  }
}

function syncMediaSession(): void {
  const session = mediaSession()
  if (!session) return
  const track = currentTrack.value
  const Metadata = (
    globalThis as unknown as {
      MediaMetadata?: new (init: Record<string, unknown>) => unknown
    }
  ).MediaMetadata
  if (Metadata) {
    session.metadata = new Metadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
    })
  }
  session.playbackState = state.playing ? 'playing' : 'paused'
  syncPositionState()
}

function wireMediaSession(): void {
  if (mediaWired) return
  const session = mediaSession()
  if (!session) return
  mediaWired = true

  const bind = (action: string, handler: (details?: MediaActionDetails) => void): void => {
    try {
      session.setActionHandler(action, handler)
    } catch {
      // 浏览器不支持某个 action 时会抛错，不能影响其它控制。
    }
  }

  bind('play', () => playMusic())
  bind('pause', () => pauseMusic())
  bind('previoustrack', () => previousTrack())
  bind('nexttrack', () => nextTrack())
  bind('seekbackward', (details) => seekTo(state.position - (details?.seekOffset ?? 10)))
  bind('seekforward', (details) => seekTo(state.position + (details?.seekOffset ?? 10)))
  bind('seekto', (details) => seekTo(details?.seekTime ?? 0))
  bind('stop', () => stopMusic())
}

function syncDuration(element: HTMLAudioElement): void {
  if (Number.isFinite(element.duration) && element.duration > 0) {
    state.duration = element.duration
  }
}

function onEnded(): void {
  if (endedGuard) return
  endedGuard = true
  globalThis.setTimeout(() => {
    endedGuard = false
  }, 0)

  if (state.repeat === 'one') {
    seekTo(0)
    playMusic()
    return
  }
  nextTrack(true)
}

function wireAudio(element: HTMLAudioElement): void {
  if (wired.has(element)) return
  wired.add(element)

  element.addEventListener('timeupdate', () => {
    state.position = element.currentTime
    if (Number.isFinite(element.duration) && element.duration > 0) {
      state.duration = element.duration
    }
    syncPositionState()
  })
  element.addEventListener('loadedmetadata', () => syncDuration(element))
  element.addEventListener('durationchange', () => syncDuration(element))
  element.addEventListener('play', () => {
    state.playing = true
    state.loading = false
    syncMediaSession()
  })
  element.addEventListener('playing', () => {
    state.playing = true
    state.loading = false
  })
  element.addEventListener('pause', () => {
    state.playing = false
    syncMediaSession()
  })
  element.addEventListener('waiting', () => {
    state.loading = true
  })
  element.addEventListener('canplay', () => {
    state.loading = false
  })
  element.addEventListener('ended', onEnded)
  element.addEventListener('error', () => {
    state.playing = false
    state.loading = false
    state.error = '音频加载失败，请重新点一次播放'
  })
}

function ensureSource(): boolean {
  if (!audio) {
    state.error = '当前浏览器不支持音频播放'
    return false
  }
  const track = currentTrack.value
  if (loadedId !== track.id) {
    audio.src = track.audio
    loadedId = track.id
  }
  return true
}

/** PhoneShell 挂载时把常驻 audio 元素交给播放器。 */
export function attachMusicAudio(element: HTMLAudioElement): void {
  if (audio === element) return
  audio = element
  loadedId = ''
  element.preload = 'metadata'
  element.volume = state.volume
  element.muted = state.muted
  wireAudio(element)
  wireMediaSession()
  syncMediaSession()
}

/** 切换曲目；`queue` 省略时沿用当前队列。 */
function loadTrack(id: string, queue?: string[], autoplay = true): void {
  const track = trackOf(id)
  if (!track) return
  if (queue) {
    const valid = queue.filter((item) => !!trackOf(item))
    if (valid.length) state.queue = valid
  }
  if (state.shuffle && state.currentId !== id && state.currentId) {
    history.push(state.currentId)
  }
  state.currentId = id
  state.position = 0
  state.duration = track.duration
  state.error = ''
  state.loading = autoplay
  loadedId = ''
  if (autoplay) {
    playMusic()
  } else {
    state.playing = false
    audio?.pause()
  }
  syncMediaSession()
}

/** 用户点某首歌：队列回到完整曲库，除非队列里本来就有它。 */
export function selectTrack(id: string, queue?: string[]): void {
  const currentQueue = state.queue.includes(id) ? state.queue : undefined
  loadTrack(id, queue ?? currentQueue)
}

/** 点歌单：只在这个歌单内部上一首/下一首。 */
export function selectPlaylist(trackIds: string[]): void {
  const first = trackIds.find((id) => !!trackOf(id))
  if (!first) return
  loadTrack(first, trackIds)
}

export function playMusic(): void {
  if (!ensureSource()) return
  const element = audio
  if (!element) return
  state.error = ''
  state.playing = true
  try {
    const result = element.play()
    if (result && typeof result.catch === 'function') {
      result.catch((error: DOMException) => {
        state.playing = false
        state.loading = false
        state.error =
          error?.name === 'NotAllowedError'
            ? '浏览器拦截了自动播放，点一下播放按钮即可'
            : '播放失败，请重新点一次'
        syncMediaSession()
      })
    }
  } catch {
    state.playing = false
    state.loading = false
    state.error = '播放失败，请重新点一次'
    syncMediaSession()
  }
}

export function pauseMusic(): void {
  state.playing = false
  try {
    audio?.pause()
  } catch {
    // 平台不支持暂停时保持状态即可。
  }
  syncMediaSession()
}

export function togglePlay(): void {
  if (state.playing) {
    pauseMusic()
  } else {
    playMusic()
  }
}

function stopAtEnd(): void {
  state.playing = false
  state.position = state.duration
  try {
    audio?.pause()
  } catch {
    // 忽略平台差异。
  }
  syncMediaSession()
}

/** 下一首；`auto` 表示由 ended 触发，列表循环结束时可停住。 */
export function nextTrack(auto = false): void {
  const queue = state.queue.length ? state.queue : tracks.map((track) => track.id)
  const index = queue.indexOf(state.currentId)

  if (auto && state.repeat === 'one') {
    seekTo(0)
    playMusic()
    return
  }

  let nextId: string | undefined
  if (state.shuffle && queue.length > 1) {
    const candidates = queue.filter((id) => id !== state.currentId)
    nextId = candidates[Math.floor(Math.random() * candidates.length)]
  } else {
    const nextIndex = index + 1
    if (nextIndex >= queue.length) {
      if (auto && state.repeat === 'off') {
        stopAtEnd()
        return
      }
      nextId = queue[0]
    } else {
      nextId = queue[nextIndex]
    }
  }

  if (nextId) loadTrack(nextId)
}

export function previousTrack(): void {
  if (state.position > 3) {
    seekTo(0)
    return
  }
  if (state.shuffle && history.length) {
    const previous = history.pop()
    if (previous) {
      loadTrack(previous)
      return
    }
  }
  const queue = state.queue.length ? state.queue : tracks.map((track) => track.id)
  const index = queue.indexOf(state.currentId)
  const previousId = queue[(index - 1 + queue.length) % queue.length]
  if (previousId) loadTrack(previousId)
}

export function seekTo(seconds: number): void {
  const duration = state.duration || currentTrack.value.duration
  const next = Math.min(Math.max(0, seconds), duration)
  state.position = next
  if (audio && loadedId === state.currentId) {
    try {
      audio.currentTime = next
    } catch {
      // 元数据未就绪时忽略，只更新界面进度。
    }
  }
  syncPositionState()
}

export function setVolume(value: number): void {
  const next = Math.min(1, Math.max(0, value))
  state.volume = next
  if (next > 0) state.muted = false
  if (audio) {
    audio.volume = next
    audio.muted = state.muted
  }
}

export function toggleMute(): void {
  state.muted = !state.muted
  if (audio) audio.muted = state.muted
}

export function cycleRepeat(): void {
  state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off'
}

export function toggleShuffle(): void {
  state.shuffle = !state.shuffle
  history = []
}

/** 离开这一关时调用：停声并复位，不保留后台播放。 */
export function stopMusic(): void {
  state.playing = false
  state.loading = false
  state.position = 0
  if (audio) {
    try {
      audio.pause()
      audio.currentTime = 0
    } catch {
      // 忽略平台差异。
    }
  }
  syncMediaSession()
}
