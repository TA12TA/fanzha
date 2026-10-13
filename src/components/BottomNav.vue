<script setup lang="ts">
/**
 * 常驻底部导航：回桌面 / 返回上一层 / 打开国家反诈中心。
 * 仅改变 UI 视图，不影响剧情与金额。
 */
defineProps<{
  /** 是否在桌面（桌面时「回桌面」不可用）。 */
  atHome: boolean
  /** 是否可以返回上一层。 */
  canGoBack: boolean
}>()

const emit = defineEmits<{
  (e: 'home'): void
  (e: 'back'): void
  (e: 'manual'): void
}>()
</script>

<template>
  <nav class="nav" aria-label="手机内导航">
    <button
      type="button"
      class="nav__btn"
      :disabled="atHome"
      aria-label="回到桌面"
      @click="emit('home')"
    >
      <span class="nav__icon" aria-hidden="true">⌂</span>
      <span class="nav__text">桌面</span>
    </button>
    <button
      type="button"
      class="nav__btn"
      :disabled="!canGoBack"
      aria-label="返回上一层"
      @click="emit('back')"
    >
      <span class="nav__icon" aria-hidden="true">←</span>
      <span class="nav__text">返回</span>
    </button>
    <button type="button" class="nav__btn" aria-label="打开国家反诈中心" @click="emit('manual')">
      <span class="nav__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9">
          <path d="M12 2.8 5 5.7v5.7c0 4.3 3.1 8.2 7 9.6 3.9-1.4 7-5.3 7-9.6V5.7L12 2.8Z" stroke-linejoin="round" />
          <path d="M9 12l2.2 2.2 3.8-4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <span class="nav__text">反诈</span>
    </button>
  </nav>
</template>

<style scoped>
.nav {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  flex: none;
  padding: var(--space-2) var(--space-3);
  padding-bottom: calc(var(--space-2) + var(--safe-bottom));
  background: rgb(12 20 32 / 92%);
  border-top: 1px solid rgb(255 255 255 / 10%);
}

.nav__btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: var(--tap-min);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--c-text-invert);
  font-size: var(--font-xs);
}

.nav__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav__icon {
  font-size: 16px;
  line-height: 1;
}

.nav__text {
  font-size: var(--font-xs);
}
</style>
