<script setup lang="ts">
/** 模拟声明标记。默认文案保持简短，避免满屏重复提示。 */
defineProps<{
  /** 强调样式（转账确认页使用）。 */
  strong?: boolean
  text?: string
}>()
</script>

<template>
  <p class="sim" :class="{ 'sim--strong': strong }" role="note">
    <span class="sim__dot" aria-hidden="true"></span>
    <span>{{ text ?? '游戏内模拟' }}</span>
  </p>
</template>

<style scoped>
.sim {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--c-sim-bg);
  color: var(--c-sim-text);
  font-size: var(--font-xs);
  line-height: 1.45;
}

.sim--strong {
  background: #fff4e5;
  border: 1px solid var(--c-warn-line);
  color: var(--c-warn-text);
  font-weight: 600;
}

.sim__dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentcolor;
}
</style>
