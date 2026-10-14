<script setup lang="ts">
import { computed } from 'vue'
import { useBeijingClock } from '@/app/clock'

/**
 * 顶层状态栏：真实北京时间、信号与电量。
 * 时间取自设备时钟并固定按北京时间（Asia/Shanghai）显示；
 * 不访问任何系统权限，仅点击可打开只读通知面板。
 *
 * 右侧图标为自绘 SVG（信号格 / WiFi / 电池），模仿真实手机状态栏；
 * 不使用任何官方徽标。
 */
const props = defineProps<{
  /** 是否可点击打开只读通知面板。 */
  clickable?: boolean
  /** 通知面板是否已展开。 */
  expanded?: boolean
  /**
   * 深浅色：桌面（深色壁纸）用 dark，浅色应用页用 light。
   * 真机的状态栏会跟着当前页面调整图标颜色。
   */
  tone?: 'dark' | 'light'
}>()

const emit = defineEmits<{ (e: 'toggle-notice'): void }>()

/** 实时北京时间（每分钟对齐刷新）。 */
const { time: displayTime, date: displayDate } = useBeijingClock()

const batteryText = '78%'

const tag = computed(() => (props.expanded ? '收起通知' : '打开通知'))
</script>

<template>
  <div class="statusbar" :class="`statusbar--${tone ?? 'dark'}`">
    <span class="statusbar__time">
      <span class="sr-only">{{ displayDate }}</span>
      <span aria-hidden="true">{{ displayTime }}</span>
    </span>
    <span class="statusbar__spacer" aria-hidden="true"></span>
    <button
      v-if="clickable"
      type="button"
      class="statusbar__right"
      :aria-label="tag"
      :aria-expanded="expanded ? 'true' : 'false'"
      @click="emit('toggle-notice')"
    >
      <!-- 信号：四格（前三格满，第四格半亮，纯装饰） -->
      <svg class="sb-icon" viewBox="0 0 18 12" width="17" height="12" aria-hidden="true">
        <rect x="0" y="7.5" width="3" height="4.5" rx="0.8" fill="currentColor" />
        <rect x="4.6" y="5" width="3" height="7" rx="0.8" fill="currentColor" />
        <rect x="9.2" y="2.5" width="3" height="9.5" rx="0.8" fill="currentColor" />
        <rect x="13.8" y="0" width="3" height="12" rx="0.8" fill="currentColor" opacity="0.45" />
      </svg>
      <!-- WiFi：三段弧 + 圆点 -->
      <svg class="sb-icon" viewBox="0 0 16 12" width="15" height="11" aria-hidden="true">
        <path
          d="M1.2 4.4a9.6 9.6 0 0 1 13.6 0"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        />
        <path
          d="M3.9 7a5.8 5.8 0 0 1 8.2 0"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        />
        <circle cx="8" cy="9.9" r="1.4" fill="currentColor" />
      </svg>
      <!-- 电池：外框 + 电量填充 + 正极小帽（78% 约填四分之三） -->
      <svg class="sb-icon sb-battery" viewBox="0 0 27 12" width="25" height="11" aria-hidden="true">
        <rect
          x="0.5"
          y="0.5"
          width="22"
          height="11"
          rx="3.2"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          opacity="0.5"
        />
        <rect x="2" y="2" width="14.6" height="8" rx="2" fill="currentColor" />
        <path d="M24.2 4v4c1.1-.4 1.6-1 1.6-2s-.5-1.6-1.6-2Z" fill="currentColor" opacity="0.5" />
      </svg>
      <span>{{ batteryText }}</span>
    </button>
    <span v-else class="statusbar__right" aria-hidden="true">
      <svg class="sb-icon" viewBox="0 0 18 12" width="17" height="12" aria-hidden="true">
        <rect x="0" y="7.5" width="3" height="4.5" rx="0.8" fill="currentColor" />
        <rect x="4.6" y="5" width="3" height="7" rx="0.8" fill="currentColor" />
        <rect x="9.2" y="2.5" width="3" height="9.5" rx="0.8" fill="currentColor" />
        <rect x="13.8" y="0" width="3" height="12" rx="0.8" fill="currentColor" opacity="0.45" />
      </svg>
      <svg class="sb-icon" viewBox="0 0 16 12" width="15" height="11" aria-hidden="true">
        <path
          d="M1.2 4.4a9.6 9.6 0 0 1 13.6 0"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        />
        <path
          d="M3.9 7a5.8 5.8 0 0 1 8.2 0"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        />
        <circle cx="8" cy="9.9" r="1.4" fill="currentColor" />
      </svg>
      <svg class="sb-icon sb-battery" viewBox="0 0 27 12" width="25" height="11" aria-hidden="true">
        <rect
          x="0.5"
          y="0.5"
          width="22"
          height="11"
          rx="3.2"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          opacity="0.5"
        />
        <rect x="2" y="2" width="14.6" height="8" rx="2" fill="currentColor" />
        <path d="M24.2 4v4c1.1-.4 1.6-1 1.6-2s-.5-1.6-1.6-2Z" fill="currentColor" opacity="0.5" />
      </svg>
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
  height: 30px;
  padding: 0 var(--space-3);
  font-size: var(--font-xs);
  letter-spacing: 0.2px;
  flex: none;
  transition:
    background-color var(--dur-fast) ease,
    color var(--dur-fast) ease;
}

/* 桌面/锁屏：深色状态栏，浅色图标 */
.statusbar--dark {
  background: rgb(10 18 30 / 88%);
  color: var(--c-text-invert);
}

/* 浅色应用页：浅色状态栏，深色图标（真机状态栏会跟着页面变） */
.statusbar--light {
  background: rgb(247 247 249 / 92%);
  color: #2b3340;
  border-bottom: 1px solid var(--c-line);
}

.statusbar__time {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.statusbar__spacer {
  flex: 1;
}

.statusbar__right {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: var(--font-xs);
  font-variant-numeric: tabular-nums;
}

.sb-icon {
  display: block;
}

button.statusbar__right {
  border-color: rgb(255 255 255 / 26%);
}

button.statusbar__right:focus-visible {
  outline-offset: 1px;
}

@media (prefers-reduced-motion: reduce) {
  .statusbar {
    transition: none;
  }
}
</style>
