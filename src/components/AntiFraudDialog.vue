<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { playSound } from '@/app/sound'

/**
 * 「国家反诈中心」弹窗（2026-10-17 新增）。
 *
 * 用户要求：像「页面上的退款进度不是你的余额。验证码给出去，等于把账户交出去。」
 * 这种形式的提示，做到国家反诈中心的**弹窗**里去，并且提示的第一句应该是
 * 「检测到你疑似被诈骗」这类**说明原因**的话。
 *
 * 设计取舍：
 * - 它是**模态**的：必须点一下才能继续。这一步是整关的分水岭，
 *   横幅只停留几秒、还可能被下一条通知顶掉，不能指望玩家看到。
 * - 但它只用在少数几个节点（关卡数据 `popupReminders` 声明）。
 *   每个节点都弹，玩家就开始无脑点「知道了」，等于没弹。
 * - 不用真实徽标、不画警徽、不给任何链接：文字与自绘图形。
 */
const props = withDefaults(
  defineProps<{
    /** 提醒正文（来自关卡数据的 `reminders`）。 */
    body: string
    /** 第一行：「检测到你疑似正在被诈骗」。 */
    headline: string
    /** 顶部小标题：国家反诈中心。 */
    title: string
    /** 需要先等待的秒数；转账环节用，0 表示可以立即关闭。 */
    countdownSeconds?: number
  }>(),
  { countdownSeconds: 0 },
)

const emit = defineEmits<{
  (e: 'close'): void
}>()

const okRef = ref<HTMLButtonElement | null>(null)
const remaining = ref(Math.max(0, Math.ceil(props.countdownSeconds)))
const canClose = computed(() => remaining.value <= 0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

function clearCountdown(): void {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

function close(): void {
  if (!canClose.value) return
  playSound('tap')
  emit('close')
}

/** Esc 关闭 —— 倒计时结束前不响应，避免绕过“先停一下”。 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && canClose.value) {
    event.preventDefault()
    close()
  }
}

onMounted(() => {
  // 焦点落到唯一的按钮上：读屏会先念标题与正文，再让玩家确认。
  okRef.value?.focus()
  if (remaining.value > 0) {
    countdownTimer = setInterval(() => {
      remaining.value = Math.max(0, remaining.value - 1)
      if (remaining.value === 0) clearCountdown()
    }, 1000)
  }
  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  clearCountdown()
  if (typeof globalThis.removeEventListener === 'function') {
    globalThis.removeEventListener('keydown', onKeydown)
  }
})
</script>

<template>
  <div class="af" role="presentation">
    <section
      class="af__panel"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="af-headline"
      aria-describedby="af-body"
    >
      <header class="af__head">
        <span class="af__shield" aria-hidden="true">
          <!-- 自绘盾牌，不使用任何官方徽标 -->
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9">
            <path d="M12 3.2 5 6v5.4c0 4 2.9 7.6 7 9 4.1-1.4 7-5 7-9V6l-7-2.8Z" stroke-linejoin="round" />
            <path d="M12 8.6v4.2" stroke-linecap="round" />
            <circle cx="12" cy="15.6" r="0.9" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <span class="af__app">{{ title }}</span>
      </header>

      <h2 id="af-headline" class="af__headline">{{ headline }}</h2>
      <p id="af-body" class="af__body">{{ body }}</p>

      <p v-if="!canClose" id="af-countdown" class="af__countdown" role="status" aria-live="polite">
        {{ remaining }} 秒后可继续
      </p>

      <button
        ref="okRef"
        type="button"
        class="af__ok"
        :disabled="!canClose"
        :aria-describedby="!canClose ? 'af-countdown' : undefined"
        @click="close"
      >
        {{ canClose ? '我知道了' : `请稍等 ${remaining} 秒` }}
      </button>
    </section>
  </div>
</template>

<style scoped>
.af {
  position: absolute;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: rgb(3 8 5 / 56%);
  animation: af-fade var(--dur-fast) ease-out;
}

.af__panel {
  width: 100%;
  max-width: 320px;
  padding: var(--space-4);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-lg);
  background: var(--c-surface);
  box-shadow: var(--shadow-sheet);
  animation: af-in var(--dur-base) ease-out;
}

.af__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.af__shield {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--c-primary-soft);
  color: var(--c-primary);
}

.af__app {
  font-size: var(--font-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--c-text-soft);
}

/* 第一行就是「检测到你疑似正在被诈骗」：先给判断，再给依据 */
.af__headline {
  margin-bottom: var(--space-2);
  font-family: var(--font-display);
  font-size: var(--font-lg);
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.35;
  color: var(--c-text);
}

.af__body {
  margin-bottom: var(--space-4);
  font-size: var(--font-sm);
  line-height: 1.65;
  color: var(--c-text-soft);
}

.af__countdown {
  margin-bottom: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-left: 2px solid var(--c-danger);
  border-radius: var(--radius-sm);
  background: var(--c-warn-bg);
  color: var(--c-warn-text);
  font-size: var(--font-xs);
  font-weight: 600;
  line-height: 1.45;
}

.af__ok {
  width: 100%;
  min-height: var(--tap-min);
  border: 0;
  border-radius: var(--radius-md);
  background: var(--c-primary);
  color: #fff;
  font-size: var(--font-base);
  font-weight: 700;
}

.af__ok:active:not(:disabled) {
  transform: scale(0.99);
}

.af__ok:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@keyframes af-fade {
  from {
    opacity: 0;
  }
}

@keyframes af-in {
  from {
    transform: translateY(10px) scale(0.97);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .af,
  .af__panel {
    animation: none;
  }
}
</style>
