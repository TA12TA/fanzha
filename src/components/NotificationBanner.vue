<script setup lang="ts">
/**
 * 顶部反诈提醒横幅（手机通知样式）。
 *
 * 与手机内其他界面统一画风：圆角卡片、状态栏下方滑入、可点击进入通知中心。
 * 自动消失由父组件控制；这里只负责展示与交互。
 */
defineProps<{
  /** 通知标题，如「国家反诈中心提醒您」。 */
  title: string
  /** 通知正文。 */
  body: string
  /** 是否正在滑出（用于退场动画）。 */
  leaving?: boolean
}>()

const emit = defineEmits<{
  (e: 'open'): void
  (e: 'dismiss'): void
}>()
</script>

<template>
  <div class="banner" :class="{ 'banner--leaving': leaving }" role="status" aria-live="polite">
    <button type="button" class="banner__main" @click="emit('open')">
      <span class="banner__icon" aria-hidden="true">
        <!-- 简化的盾牌图形：自绘 SVG，不使用任何官方徽标 -->
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M12 3.2 5 6v5.4c0 4 2.9 7.6 7 9 4.1-1.4 7-5 7-9V6l-7-2.8Z" stroke-linejoin="round" />
          <path d="M9.3 12.2l2 2 3.4-3.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <span class="banner__text">
        <span class="banner__title">{{ title }}</span>
        <span class="banner__body">{{ body }}</span>
      </span>
    </button>
    <button type="button" class="banner__close" aria-label="关闭提醒" @click="emit('dismiss')">
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
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: var(--radius-md);
  background: rgb(28 40 58 / 96%);
  color: #eef4fb;
  box-shadow: 0 8px 26px rgb(4 10 20 / 45%);
  backdrop-filter: blur(6px);
  animation: banner-in var(--dur-base) ease-out;
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
  background: rgb(64 132 224 / 26%);
  color: #9fd8ff;
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
  color: #ffffff;
}

.banner__body {
  font-size: var(--font-sm);
  line-height: 1.5;
  color: #c6d5e6;
}

.banner__close {
  flex: none;
  width: 32px;
  height: 32px;
  margin: -4px -4px 0 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #93a6bd;
  font-size: var(--font-sm);
  line-height: 1;
}

.banner__close:hover {
  background: rgb(255 255 255 / 10%);
  color: #ffffff;
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
