<script setup lang="ts">
import type { NotificationKind } from '@/app/notifications'

/**
 * 顶部通知横幅（手机通知样式）。
 *
 * **两类通知共用同一套视觉风格**：同一张卡片底色、同一套排版与间距，
 * 仅通过左侧强调色与图标区分类型（预警=盾牌+蓝，消息=气泡+绿）。
 * 早期版本把预警做成深色卡、消息做成浅色卡，看起来像两套界面，已统一。
 *
 * 与手机内其他界面统一画风：圆角卡片、状态栏下方滑入、可点击查看、可关闭。
 * 自动关闭由通知队列控制，这里只负责展示与交互。
 */
defineProps<{
  /** 通知类型，决定图标与强调色。 */
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
/* 统一底色：两类通知用同一张卡片，只靠左侧强调色与图标区分 */
.banner {
  position: absolute;
  top: calc(var(--safe-top) + 34px);
  left: var(--space-2);
  right: var(--space-2);
  z-index: 60;
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  padding-left: calc(var(--space-3) + 3px);
  border: 1px solid var(--c-line);
  border-left-width: 3px;
  border-radius: var(--radius-md);
  /*
   * 2026-10-17 画面打磨：从「不透明纯白大卡片」改成**磨砂玻璃**。
   *
   * 横幅是浮在应用之上的一层（真实手机的横幅也会盖住应用页头），这一层
   * 结构没法也不该改。之前的问题是它完全不透明、又高又白，整块压住页头时
   * 看起来像布局崩了。改成半透明 + 强模糊之后，页头会隐约透出来，
   * 「这是盖在上面的一条通知」这层语义就成立了。
   */
  background: rgb(255 255 255 / 80%);
  color: var(--c-text);
  box-shadow:
    0 10px 30px rgb(4 10 20 / 22%),
    inset 0 1px 0 rgb(255 255 255 / 70%);
  backdrop-filter: blur(22px) saturate(180%);
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  animation: banner-in var(--dur-base) ease-out;
}

/* 强调色只在左边框与图标上体现类型差异 */
.banner--antifraud {
  border-left-color: #4084e0;
}

.banner--message {
  border-left-color: var(--c-accent);
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
  background: var(--c-primary-soft);
  color: #2b6fd4;
}

.banner--message .banner__icon {
  background: #e2f4ee;
  color: var(--c-accent);
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
  line-height: 1.4;
  color: var(--c-text);
}

/*
 * 正文最多两行（CSS 裁切）。
 *
 * 用 `-webkit-line-clamp` 而不是在 JS 里截断字符串：**文本内容必须完整保留**，
 * 通知中心会回放同一条正文，测试也按文本查找。裁切只是视觉行为。
 * 两行足够放下现有全部通知文案，同时把横幅高度压下来，少盖住一点内容。
 */
.banner__body {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: var(--font-sm);
  line-height: 1.45;
  color: var(--c-text-soft);
}

.banner__queued {
  flex: none;
  /* 与标题行对齐，而不是垂直居中 —— 居中会显得挂在正文旁边 */
  align-self: flex-start;
  margin-top: 1px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgb(22 32 46 / 8%);
  color: var(--c-text-soft);
  font-size: var(--font-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.banner__close {
  flex: none;
  width: 32px;
  height: 32px;
  margin: -4px -4px 0 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--c-text-soft);
  font-size: var(--font-sm);
  line-height: 1;
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
