<script setup lang="ts">
import antifraudLogo from '@/assets/antifraud-logo.png'

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
      <span class="nav__icon" aria-hidden="true">
        <!-- 图标统一为自绘 SVG（原先用字符 ⌂ / ←，与真图标风格不一致） -->
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">
          <path d="M4 10.5 12 4l8 6.5" />
          <path d="M6.2 12v7.2h11.6V12" />
        </svg>
      </span>
      <span class="nav__text">桌面</span>
    </button>
    <button
      type="button"
      class="nav__btn"
      :disabled="!canGoBack"
      aria-label="返回上一层"
      @click="emit('back')"
    >
      <span class="nav__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">
          <path d="M14.5 5.5 8 12l6.5 6.5" />
        </svg>
      </span>
      <span class="nav__text">返回</span>
    </button>
    <button type="button" class="nav__btn" aria-label="打开国家反诈中心" @click="emit('manual')">
      <span class="nav__icon" aria-hidden="true">
        <img :src="antifraudLogo" alt="" width="18" height="18" class="nav__logo" />
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
  /* 磨砂半透明：与桌面的程序坞同一种质感 */
  background: rgb(12 20 32 / 78%);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  line-height: 1;
}

.nav__logo {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 4px;
}

.nav__text {
  font-size: var(--font-xs);
}
</style>
