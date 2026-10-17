<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBeijingClock } from '@/app/clock'
import { playSound } from '@/app/sound'
import { UNLOCK_THRESHOLD_PX, dragOffset, shouldUnlock } from '@/app/unlock'
import type { LevelEntry } from '@/game/level'

/**
 * S0 锁屏：显示真实北京时间，上滑解锁。
 *
 * 副标题跟随**当前关卡**（第一关时文案与原来逐字一致）。
 *
 * 无障碍约束（AGENTS.md / DEVELOPMENT.md）：功能不得只依赖滑动，
 * 因此同时提供可点击的「上滑解锁」按钮与 Enter / 空格 / 方向键触发；
 * 尊重 `prefers-reduced-motion`，解锁动画可跳过。
 */
const props = defineProps<{ level: LevelEntry }>()

const emit = defineEmits<{ (e: 'start'): void }>()

const { time: clock, date: today } = useBeijingClock()

/** 解锁中状态：用于播放淡出动画，动画期间阻止重复触发。 */
const unlocking = ref(false)

/** 拖拽位移（负值向上）。 */
const dragY = ref(0)
const dragging = ref(false)
let startY = 0

/** 是否已拖过阈值（用于提示文案与视觉反馈）。 */
const armed = computed(() => shouldUnlock(dragY.value))

/** 解锁：只触发一次。 */
function unlock(): void {
  if (unlocking.value) return
  unlocking.value = true
  playSound('unlock')
  emit('start')
}

function onPointerDown(event: PointerEvent): void {
  if (unlocking.value) return
  dragging.value = true
  startY = event.clientY
  // 捕获指针，保证手指移出元素后仍能收到 move/up。
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value || unlocking.value) return
  dragY.value = dragOffset(startY, event.clientY)
}

function onPointerUp(): void {
  if (!dragging.value) return
  dragging.value = false
  if (shouldUnlock(dragY.value)) {
    unlock()
    return
  }
  // 未达阈值：回弹
  dragY.value = 0
}

/** 指针被系统取消（如来电）时回弹，避免卡在中间状态。 */
function onPointerCancel(): void {
  dragging.value = false
  dragY.value = 0
}

/** 键盘等效操作：Enter / 空格 / 上箭头均可解锁。 */
function onKeydown(event: KeyboardEvent): void {
  if (unlocking.value) return
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowUp') {
    event.preventDefault()
    unlock()
  }
}

/** 拖拽进度（0–1），用于指示条与提示文字。 */
const progress = computed(() => {
  const ratio = Math.abs(dragY.value) / UNLOCK_THRESHOLD_PX
  return Math.min(1, ratio)
})

/** 上滑提示文案。 */
const hintText = computed(() => {
  if (armed.value) return '松开解锁'
  if (dragging.value) return '继续上滑'
  return '上滑解锁'
})

/** 副标题跟随当前关卡：第一关时与原来逐字一致。 */
const subtitle = computed(
  () => `大学生反诈互动 · ${props.level.meta.ordinal}「${props.level.meta.title}」`,
)
</script>

<template>
  <section
    class="lock"
    :class="{ 'lock--unlocking': unlocking }"
    aria-labelledby="lock-title"
  >
    <!-- 壁纸与桌面共用同一份（styles/wallpaper.css），解锁时背景不会跳 -->
    <div class="wall" aria-hidden="true">
      <div class="wall__sky"></div>
      <div class="wall__hills"></div>
      <div class="wall__glow"></div>
    </div>

    <!-- 上滑区域：整屏可拖，同时是可聚焦的解锁按钮 -->
    <button
      type="button"
      class="lock__surface"
      :aria-label="`上滑解锁。当前北京时间 ${clock}，${today}`"
      :style="{ '--drag-y': `${dragY}px`, '--drag-progress': progress }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @keydown="onKeydown"
      @click="unlock"
    >
      <span class="lock__body">
        <span class="lock__clock">
          <span class="sr-only">现在是北京时间 {{ clock }}</span>
          <span aria-hidden="true">{{ clock }}</span>
        </span>
        <span class="lock__date">{{ today }}</span>

        <span class="lock__brand">
          <span id="lock-title" class="lock__title">反诈局中局：你的手机</span>
          <span class="lock__subtitle">{{ subtitle }}</span>
        </span>
      </span>

      <!-- 解锁指示：可点、可键盘触发 -->
      <span class="lock__hint">
        <span class="lock__hintline" aria-hidden="true">
          <span class="lock__hintfill"></span>
        </span>
        <span class="lock__hinttext">{{ hintText }}</span>
      </span>
    </button>
  </section>
</template>

<style scoped>
.lock {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  /*
   * 锁屏文字全部走「壁纸上的内容」变量组，跟桌面同一套。
   * 之前这里是写死的浅灰（#b9c9de / #8ba0b8 / #cddcee）与深色兜底色，
   * 白天壁纸一切换，字就压在浅蓝天空上几乎看不见 —— 桌面改了、锁屏没改。
   */
  color: var(--c-on-wall);
  /* 底色由 .wall 提供（白天/夜间两套），这里只兜底 */
  background: var(--c-desktop-2);
  overflow: hidden;
}

.lock--unlocking {
  animation: lock-out var(--dur-slow) ease forwards;
}

/* 整屏都是解锁热区：既是滑动面，也是真实 button（键盘可达） */
.lock__surface {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  width: 100%;
  min-height: 0;
  padding: var(--space-6) var(--space-5);
  padding-bottom: calc(var(--space-5) + var(--safe-bottom));
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  touch-action: none;
  cursor: grab;
}

.lock__surface:active {
  cursor: grabbing;
}

.lock__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  transform: translateY(calc(var(--drag-y, 0px) * 0.45));
  opacity: calc(1 - var(--drag-progress, 0) * 0.5);
  transition: transform var(--dur-fast) ease-out;
}

/*
 * 2026-10-17 画面打磨：时钟放大并收紧字距。
 *
 * 大字号 + 细字重 + 负字距是「时钟」这类数字最耐看的组合；配合下面日期的
 * 正字距，两者形成明确的层级差，而不是两个同色同粗细的行堆在一起。
 * 320px 宽下「13:15」仍在一行内（约 145px），不会挤出横向滚动。
 */
.lock__clock {
  font-size: 52px;
  font-weight: 300;
  line-height: 1.02;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.lock__date {
  margin-top: calc(-1 * var(--space-1));
  font-size: var(--font-sm);
  letter-spacing: 0.06em;
  color: var(--c-on-wall-soft);
}

/*
 * 品牌/标题块：上方加一小段短横线做视觉锚点。
 *
 * 之前时钟、日期、标题三段全靠「间距」区分，在浅色壁纸上读起来是一整片文字。
 * 一条 44px 的短横线（伪元素，不进无障碍树、不改 DOM）把「现在几点」和
 * 「这是什么作品」分开，这一屏立刻就有的结构感。
 */
.lock__brand {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: var(--space-5);
  padding-top: var(--space-4);
}

.lock__brand::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 44px;
  height: 2px;
  border-radius: 2px;
  background: currentcolor;
  opacity: 0.32;
}

.lock__title {
  font-size: var(--font-xl);
  font-weight: 800;
  line-height: 1.3;
}

.lock__subtitle {
  font-size: var(--font-base);
  color: var(--c-on-wall-soft);
}

/* 底部上滑提示 */
.lock__hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  transform: translateY(var(--drag-y, 0px));
  transition: transform var(--dur-fast) ease-out;
}

/*
 * 上滑箭头：暗示「往上走」。
 *
 * 原来只有一根细横条 + 一行小字，可操作性暗示太弱（第一眼容易当成装饰）。
 * 加一个小箭头（伪元素，纯装饰、不进无障碍树）之后，方向就一目了然了。
 */
.lock__hint::before {
  content: '';
  width: 10px;
  height: 10px;
  margin-bottom: 2px;
  border-top: 2px solid var(--c-on-wall-dim);
  border-left: 2px solid var(--c-on-wall-dim);
  border-radius: 1px;
  transform: rotate(45deg);
  opacity: 0.85;
}

.lock__hintline {
  position: relative;
  width: 58px;
  height: 6px;
  border-radius: 999px;
  background: var(--c-wall-hint-track);
  box-shadow: inset 0 1px 2px rgb(4 10 20 / 12%);
  overflow: hidden;
}

.lock__hintfill {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  /* 浅色壁纸上白色填充看不见，跟着壁纸主题走 */
  background: var(--c-on-wall);
  transform: scaleX(var(--drag-progress, 0));
  transform-origin: center;
  transition: transform var(--dur-fast) ease-out;
}

.lock__hinttext {
  font-size: var(--font-sm);
  font-weight: 500;
  letter-spacing: 0.16em;
  color: var(--c-on-wall-soft);
  animation: hint-breathe 2.4s ease-in-out infinite;
}

@keyframes lock-out {
  to {
    transform: translateY(-14px);
    opacity: 0;
  }
}

@keyframes hint-breathe {
  50% {
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lock--unlocking,
  .lock__hinttext {
    animation: none;
  }

  .lock__body,
  .lock__hint,
  .lock__hintfill {
    transition: none;
  }
}
</style>
