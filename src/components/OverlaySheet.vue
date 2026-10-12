<script setup lang="ts">
/** 底部弹层：用于资料、确认等；遮罩存在时不点透，关闭后回到原位置。 */
defineProps<{
  title: string
  /** 弹层尺寸。 */
  size?: 'sheet' | 'dialog'
}>()

const emit = defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <div class="overlay" role="presentation" @click.self="emit('close')">
    <section
      class="overlay__panel"
      :class="`overlay__panel--${size ?? 'sheet'}`"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <header class="overlay__head">
        <h2 class="overlay__title">{{ title }}</h2>
        <button type="button" class="overlay__close" aria-label="关闭" @click="emit('close')">
          <span aria-hidden="true">✕</span>
        </button>
      </header>
      <div class="overlay__body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="overlay__foot">
        <slot name="footer" />
      </footer>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgb(8 14 24 / 48%);
}

.overlay__panel {
  width: 100%;
  max-height: 84%;
  display: flex;
  flex-direction: column;
  background: var(--c-surface);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow-sheet);
  animation: sheet-in var(--dur-base) ease;
}

.overlay__panel--dialog {
  margin-bottom: 18%;
  max-width: 340px;
  border-radius: var(--radius-md);
  animation: none;
}

.overlay__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--c-line);
}

.overlay__title {
  font-size: var(--font-md);
  font-weight: 700;
}

.overlay__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tap-min);
  height: var(--tap-min);
  margin-right: calc(-1 * var(--space-2));
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--c-text-soft);
  font-size: var(--font-base);
}

.overlay__body {
  padding: var(--space-4);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.overlay__foot {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  padding-bottom: calc(var(--space-3) + var(--safe-bottom));
  border-top: 1px solid var(--c-line);
}

@keyframes sheet-in {
  from {
    transform: translateY(14px);
    opacity: 0.4;
  }
}

@media (prefers-reduced-motion: reduce) {
  .overlay__panel {
    animation: none;
  }
}
</style>
