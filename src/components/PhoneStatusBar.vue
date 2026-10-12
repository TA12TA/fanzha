<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

/**
 * 顶层模拟状态栏：虚构时间、网络/电量与常驻「剧情模拟」标识。
 * 不访问任何系统权限，仅点击可打开只读通知面板。
 */
const props = defineProps<{
  /** 是否可点击打开只读通知面板。 */
  clickable?: boolean
  /** 通知面板是否已展开。 */
  expanded?: boolean
}>()

const emit = defineEmits<{ (e: 'toggle-notice'): void }>()

/** 固定虚构时间，避免暗示读取真实系统时间。 */
const displayTime = '9:41'

const batteryText = ref('78%')
let timer: ReturnType<typeof setTimeout> | null = null

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

const tag = computed(() => (props.expanded ? '收起模拟通知' : '打开模拟通知'))
</script>

<template>
  <div class="statusbar">
    <span class="statusbar__time">{{ displayTime }}</span>
    <span class="statusbar__sim" aria-hidden="true">剧情模拟 · 无真实交易</span>
    <button
      v-if="clickable"
      type="button"
      class="statusbar__right"
      :aria-label="tag"
      :aria-expanded="expanded ? 'true' : 'false'"
      @click="emit('toggle-notice')"
    >
      <span aria-hidden="true">信号</span>
      <span aria-hidden="true">·</span>
      <span>{{ batteryText }}</span>
    </button>
    <span v-else class="statusbar__right" aria-hidden="true">
      <span>信号</span>
      <span>·</span>
      <span>{{ batteryText }}</span>
    </span>
  </div>
</template>

<style scoped>
.statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  height: 28px;
  padding: 0 var(--space-3);
  background: rgb(10 18 30 / 88%);
  color: var(--c-text-invert);
  font-size: var(--font-xs);
  letter-spacing: 0.2px;
  flex: none;
}

.statusbar__time {
  font-variant-numeric: tabular-nums;
}

.statusbar__sim {
  flex: 1;
  overflow: hidden;
  text-align: center;
  color: var(--c-sim-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.statusbar__right {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-height: 24px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: var(--font-xs);
  font-variant-numeric: tabular-nums;
}

button.statusbar__right {
  border-color: rgb(255 255 255 / 26%);
}

button.statusbar__right:focus-visible {
  outline-offset: 1px;
}
</style>
