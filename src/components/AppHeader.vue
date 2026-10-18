<script setup lang="ts">
/**
 * 应用内顶部标题栏（各应用统一使用）。
 * 左返回、中间标题（可带一行灰字副标题）、右侧操作位。
 * 右侧操作位优先用 `#action` 插槽，其次用 `actionLabel` 文案。
 */
defineProps<{
  title: string
  subtitle?: string
  /** 显示返回按钮。 */
  showBack?: boolean
  /** 右侧按钮文案（可选）。 */
  actionLabel?: string
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'action'): void
}>()
</script>

<template>
  <header class="appbar">
    <button
      v-if="showBack"
      type="button"
      class="appbar__back"
      aria-label="返回上一层"
      @click="emit('back')"
    >
      <span aria-hidden="true">←</span>
    </button>
    <span v-else class="appbar__spacer" aria-hidden="true"></span>

    <span class="appbar__titles">
      <span class="appbar__title">{{ title }}</span>
      <span v-if="subtitle" class="appbar__subtitle">{{ subtitle }}</span>
    </span>

    <slot name="action">
      <button
        v-if="actionLabel"
        type="button"
        class="appbar__action"
        @click="emit('action')"
      >
        {{ actionLabel }}
      </button>
      <span v-else class="appbar__spacer" aria-hidden="true"></span>
    </slot>
  </header>
</template>

<style scoped>
.appbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  min-height: 46px;
  padding: var(--space-1) var(--space-2);
  background: var(--c-surface);
  border-bottom: 1px solid var(--c-line);
}

.appbar__back,
.appbar__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--tap-min);
  min-height: var(--tap-min);
  padding: 0 var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--c-primary);
  font-size: var(--font-base);
  font-weight: 600;
}

.appbar__action {
  min-width: auto;
  font-size: var(--font-sm);
}

.appbar__spacer {
  min-width: var(--tap-min);
  flex: none;
}

.appbar__titles {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.appbar__title {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.03em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.appbar__subtitle {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
