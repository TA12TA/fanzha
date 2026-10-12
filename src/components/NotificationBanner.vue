<script setup lang="ts">
import type { NotificationKind } from '@/app/notifications'

/**
 * 顶部通知横幅（手机通知样式）。
 *
 * 两类通知视觉上明确区分：
 * - `antifraud`：国家反诈中心预警，深色警示卡片 + 盾牌图标
 * - `message`：消息通知，浅色卡片 + 消息图标
 *
 * 与手机内其他界面统一画风：圆角卡片、状态栏下方滑入、可点击查看、可关闭。
 * 自动关闭由通知队列控制，这里只负责展示与交互。
 */
defineProps<{
  /** 通知类型，决定视觉样式。 */
  kind: NotificationKind
  /** 通知标题。 */
  title: string
  /** 通知正文。 */
  body: string
  /** 是否正在滑出（用于退场动画）。 */
  leaving?: boolean
  /** 同类型等待展示的条数（>0 时显示角标）。 */
  queued?: number
}>()

const emit = defineEmits<{
  (e: 'open'): void
  (e: 'dismiss'): void
}>()
</script>

<template>
  <div
    class="banner"
    :class="[`banner--${kind}`, { 'banner--leaving': leaving }]"
    role="status"
    aria-live="polite"
  >
    <button type="button" class="banner__main" @click="emit('open')">
      <span class="banner__icon" aria-hidden="true">
        <!-- 预警：盾牌；消息：对话气泡。均为自绘 SVG，不使用任何官方徽标 -->
        <svg
          v-if="kind === 'antifraud'"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
        >
          <path d="M12 3.2 5 6v5.4c0 4 2.9 7.6 7 9 4.1-1.4 7-5 7-9V6l-7-2.8Z" stroke-linejoin="round" />
          <path d="M9.3 12.2l2 2 3.4-3.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
        >
          <path d="M4 6.5h16v10H9l-4 3.5v-3.5H4Z" stroke-linejoin="round" />
        </svg>
      </span>

      <span class="banner__text">
        <span class="banner__title">{{ title }}</span>
        <span class="banner__body">{{ body }}</span>
      </span>
    </button>

    <span v-if="queued && queued > 0" class="banner__queued" :aria-label="`还有 ${queued} 条通知`">
      +{{ queued }}
    </span>

    <button type="button" class="banner__close" aria-label="关闭通知" @click="emit('dismiss')">
      <span aria-hidden="true">✕</span>
    </button>
  </div>
</template>

<style scoped>
.banner {
  position: absolute;
  top: calc(var(--safe-top) + 34px);
  left: var(--space-2);
  right: var(--space-2);
  z-index: 60;
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
  padding: var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  box-shadow: 0 8px 26px rgb(4 10 20 / 45%);
  backdrop-filter: blur(6px);
  animation: banner-in var(--dur-base) ease-out;
}

/* 预警：深色警示卡片 */
.banner--antifraud {
  border-color: rgb(255 255 255 / 14%);
  background: rgb(28 40 58 / 96%);
  color: #eef4fb;
}

/* 消息：浅色卡片，与预警明显区分 */
.banner--message {
  border-color: var(--c-line);
  background: rgb(255 255 255 / 97%);
  color: var(--c-text);
  box-shadow: 0 8px 26px rgb(4 10 20 / 26%);
}

.banner--leaving {
  animation: banner-out var(--dur-base) ease-in forwards;
}

.banner__main {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.banner__icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
}

.banner--antifraud .banner__icon {
  background: rgb(64 132 224 / 26%);
  color: #9fd8ff;
}

.banner--message .banner__icon {
  background: var(--c-primary-soft);
  color: var(--c-primary);
}

.banner__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.banner__title {
  font-size: var(--font-sm);
  font-weight: 700;
}

.banner--antifraud .banner__title {
  color: #ffffff;
}

.banner__body {
  font-size: var(--font-sm);
  line-height: 1.5;
}

.banner--antifraud .banner__body {
  color: #c6d5e6;
}

.banner--message .banner__body {
  color: var(--c-text-soft);
}

.banner__queued {
  flex: none;
  align-self: center;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgb(255 255 255 / 16%);
  font-size: var(--font-xs);
  font-variant-numeric: tabular-nums;
}

.banner--message .banner__queued {
  background: var(--c-surface-2);
  color: var(--c-text-soft);
}

.banner__close {
  flex: none;
  width: 32px;
  height: 32px;
  margin: -4px -4px 0 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  font-size: var(--font-sm);
  line-height: 1;
}

.banner--antifraud .banner__close {
  color: #93a6bd;
}

.banner--message .banner__close {
  color: var(--c-text-soft);
}

.banner__close:hover {
  background: rgb(128 128 128 / 18%);
}

@keyframes banner-in {
  from {
    transform: translateY(-16px);
    opacity: 0;
  }
}

@keyframes banner-out {
  to {
    transform: translateY(-16px);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .banner,
  .banner--leaving {
    animation: none;
  }

  .banner--leaving {
    opacity: 0;
  }
}
</style>
