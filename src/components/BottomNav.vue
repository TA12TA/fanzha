<script setup lang="ts">
/**
 * 常驻底部导航：回桌面 / 返回上一层 / 打开识骗手册。
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
    <button type="button" class="nav__btn" aria-label="打开识骗手册" @click="emit('manual')">
      <span class="nav__icon" aria-hidden="true">▤</span>
      <span class="nav__text">手册</span>
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
