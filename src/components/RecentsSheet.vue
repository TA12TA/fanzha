<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import { BRAND } from '@/data/level01'
import type { AppId } from '@/app/navigation'

/**
 * 最近任务（Android 多任务键）。
 *
 * 做成真实可用的最近应用面板而不是摆设：真机上这个键一定会有反应，
 * 如果做成死按钮就违反了「看起来可操作的元素不能无响应」。
 * 这里只列出玩家真正打开过的应用，点击即可回到那个应用。
 */
defineProps<{
  /** 最近打开过的应用（最新在前）。 */
  apps: AppId[]
  /** 当前已经打开的应用，用于标出「正在使用」。 */
  current: AppId | null
}>()

const emit = defineEmits<{
  (e: 'open', app: AppId): void
  (e: 'close'): void
}>()

const LABELS: Record<AppId, string> = {
  chat: BRAND.chat,
  wallet: BRAND.wallet,
  manual: BRAND.manual,
  photos: '相册',
  notifications: '通知',
  settings: '设置',
}
</script>

<template>
  <div class="recents" role="dialog" aria-modal="true" aria-label="最近任务">
    <!-- 点击遮罩关闭 -->
    <button type="button" class="recents__mask" aria-label="关闭最近任务" @click="emit('close')"></button>

    <section class="recents__panel">
      <header class="recents__head">
        <h2 class="recents__title">最近使用</h2>
        <button type="button" class="recents__clear" aria-label="关闭最近任务" @click="emit('close')">
          ✕
        </button>
      </header>

      <p v-if="apps.length === 0" class="recents__empty">还没打开过应用。</p>

      <ul v-else class="recents__list">
        <li v-for="app in apps" :key="app">
          <button
            type="button"
            class="recents__item"
            :aria-label="`切到${LABELS[app]}`"
            @click="emit('open', app)"
          >
            <AppIcon :id="app" :size="42" />
            <span class="recents__name">{{ LABELS[app] }}</span>
            <span v-if="app === current" class="recents__now">正在使用</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.recents {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
}

.recents__mask {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgb(8 14 24 / 52%);
  border-radius: 0;
}

.recents__panel {
  position: relative;
  width: 100%;
  max-height: 76%;
  display: flex;
  flex-direction: column;
  padding: var(--space-3) var(--space-4);
  padding-bottom: calc(var(--space-4) + var(--safe-bottom));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--c-surface);
  box-shadow: var(--shadow-sheet);
}

.recents__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--c-line);
}

.recents__title {
  font-size: var(--font-md);
  font-weight: 700;
}

.recents__clear {
  width: var(--tap-min);
  height: var(--tap-min);
  border: 0;
  background: transparent;
  color: var(--c-text-soft);
  font-size: var(--font-md);
}

.recents__empty {
  padding: var(--space-5) 0;
  text-align: center;
  font-size: var(--font-sm);
  color: var(--c-text-soft);
}

.recents__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3) 0 0;
  list-style: none;
  overflow-y: auto;
}

.recents__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: var(--tap-min);
  padding: var(--space-2);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  text-align: left;
}

.recents__item:active {
  background: var(--c-surface-2);
}

.recents__name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-base);
  font-weight: 600;
}

.recents__now {
  flex: none;
  font-size: var(--font-xs);
  color: var(--c-accent);
}
</style>
