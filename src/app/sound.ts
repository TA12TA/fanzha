/**
 * 音效引擎：用 Web Audio 实时合成，不引入任何音频文件。
 *
 * 设计约束（AGENTS.md / DEVELOPMENT.md）：
 * - 音效不是必要交互：任何情况下静音都必须能完整游玩。
 * - 只在玩家交互后尝试播放；浏览器拒绝自动播放时静默降级，不报错、不阻塞。
 * - 不使用外部资源，无网络请求。
 */

/** 可用的音效类型。 */
export type SoundName =
  | 'tap' // 通用点击
  | 'toggle' // 开关切换
  | 'send' // 消息发出
  | 'receive' // 消息到达
  | 'alert' // 顶部反诈提醒
  | 'confirm' // 确认付款
  | 'cancel' // 取消/退出
  | 'unlock' // 解锁

interface Tone {
  /** 频率（Hz）。 */
  freq: number
  /** 起始时间偏移（秒）。 */
  at: number
  /** 时长（秒）。 */
  dur: number
  /** 音量峰值（0–1）。 */
  gain: number
  /** 波形。 */
  type: OscillatorType
}

/** 各音效的音符序列（全部为短促提示音）。 */
const RECIPES: Record<SoundName, Tone[]> = {
  tap: [{ freq: 1180, at: 0, dur: 0.045, gain: 0.16, type: 'triangle' }],
  toggle: [
    { freq: 880, at: 0, dur: 0.04, gain: 0.15, type: 'triangle' },
    { freq: 1320, at: 0.045, dur: 0.05, gain: 0.15, type: 'triangle' },
  ],
  send: [{ freq: 660, at: 0, dur: 0.07, gain: 0.14, type: 'sine' }],
  receive: [
    { freq: 780, at: 0, dur: 0.06, gain: 0.13, type: 'sine' },
    { freq: 1040, at: 0.07, dur: 0.08, gain: 0.13, type: 'sine' },
  ],
  alert: [
    { freq: 880, at: 0, dur: 0.1, gain: 0.18, type: 'sine' },
    { freq: 1174, at: 0.12, dur: 0.12, gain: 0.18, type: 'sine' },
  ],
  confirm: [
    { freq: 523, at: 0, dur: 0.08, gain: 0.16, type: 'triangle' },
    { freq: 784, at: 0.08, dur: 0.12, gain: 0.16, type: 'triangle' },
  ],
  cancel: [
    { freq: 440, at: 0, dur: 0.08, gain: 0.15, type: 'triangle' },
    { freq: 311, at: 0.08, dur: 0.12, gain: 0.15, type: 'triangle' },
  ],
  unlock: [
    { freq: 659, at: 0, dur: 0.07, gain: 0.15, type: 'sine' },
    { freq: 988, at: 0.07, dur: 0.1, gain: 0.15, type: 'sine' },
  ],
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
/** 全局静音开关（由设置驱动）。 */
let enabled = true
/** 环境是否支持 Web Audio。 */
let supported = true

/** 首次使用时才创建 AudioContext（避免页面加载即初始化音频）。 */
function ensureContext(): AudioContext | null {
  if (!supported) return null
  if (ctx) return ctx
  try {
    const Ctor =
      (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) {
      supported = false
      return null
    }
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
    return ctx
  } catch {
    supported = false
    return null
  }
}

/** 由设置同步总开关。 */
export function setSoundEnabled(value: boolean): void {
  enabled = value
}

export function isSoundEnabled(): boolean {
  return enabled
}

export function isSoundSupported(): boolean {
  return supported
}

/**
 * 播放音效。
 * 任何异常都被吞掉：音频失败绝不能影响游戏进行。
 */
export function playSound(name: SoundName): void {
  if (!enabled) return
  const audio = ensureContext()
  if (!audio || !master) return

  try {
    // 浏览器可能在后台挂起音频上下文；恢复失败则本次静默跳过。
    if (audio.state === 'suspended') {
      void audio.resume().catch(() => {})
    }
    const now = audio.currentTime
    for (const tone of RECIPES[name]) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = tone.type
      osc.frequency.value = tone.freq
      const start = now + tone.at
      const end = start + tone.dur
      // 短促包络：快速起音 + 指数衰减，避免爆音。
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.linearRampToValueAtTime(tone.gain, start + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      osc.connect(gain)
      gain.connect(master)
      osc.start(start)
      osc.stop(end + 0.02)
    }
  } catch {
    /* 静默降级 */
  }
}

/** 供测试重置内部状态。 */
export function __resetSoundForTests(): void {
  ctx = null
  master = null
  enabled = true
  supported = true
}
