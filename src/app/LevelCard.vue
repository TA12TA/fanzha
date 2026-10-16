<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import type { LevelEntry } from '@/game/level'
import type { LevelSlotSummary } from '@/game/storage'

/**
 * 关卡卡片（大厅轮播里的一张）。
 *
 * 视觉是**一部手机的缩略预览**：迷你状态栏 + 迷你壁纸 + 2×2 迷你图标 +
 * 关卡信息。这不是「网页里套一个手机模型」—— 它是一张卡片插图，
 * 整页仍然只有一部可操作的手机（见 SCENES.md 的视觉目标）。
 *
 * 整张卡是**一个 `<button>`**：卡片内部不允许再嵌套按钮（非法 HTML，
 * 也会让键盘焦点错乱），因此底部的行动文案用 `<span>` 呈现。
 */
const props = defineProps<{
  entry: LevelEntry
  /** 是否处于轮播中心（居中放大、可进入）。 */
  active: boolean
  /** 该关的存档摘要。 */
  slot: LevelSlotSummary
}>()

const emit = defineEmits<{ (e: 'select'): void }>()

/** 锁定关卡：点了不进入，只给出提示。 */
const locked = computed(() => props.entry.kind !== 'playable')

/** 卡片上的状态行文案。 */
const statusText = computed(() => {
  if (locked.value) return '正在制作'
  const slot = props.slot
  if (!slot.started) return '还没开始'
  if (slot.finished) {
    const ending = slot.endingTitle ? ` · ${slot.endingTitle}` : ''
    return `已完成${ending}（余额 ${slot.balance} 元）`
  }
  return `进行中 · 余额 ${slot.balance} 元`
})

/** 行动文案（卡片底部那行）。 */
const ctaText = computed(() => {
  if (locked.value) return '敬请期待'
  if (!props.slot.started) return '开始'
  if (props.slot.finished) return '重看复盘'
  return '继续'
})

/**
 * 无障碍标签：把关号、标题、状态和「点了会发生什么」一次说清。
 * 读屏用户不该只听到「第二关 冒充客服退款」而不知道能不能进。
 */
const ariaLabel = computed(() => {
  const meta = props.entry.meta
  if (locked.value) {
    return `${meta.ordinal} ${meta.title}，${statusText.value}，暂不可进入`
  }
  if (!props.active) return `${meta.ordinal} ${meta.title}，${statusText.value}，先移到中间`
  return `${meta.ordinal} ${meta.title}，${statusText.value}，进入`
})

/** 迷你图标（纯装饰，不可聚焦、不进无障碍树）。 */
const miniApps = [
  { id: 'chat' as const },
  { id: 'wallet' as const },
  { id: 'manual' as const },
  { id: 'levels' as const },
]
</script>

<template>
  <button
    type="button"
    class="lvlcard"
    :class="{ 'lvlcard--active': active, 'lvlcard--locked': locked }"
    :aria-label="ariaLabel"
    :aria-current="active ? 'true' : undefined"
    :aria-disabled="locked ? 'true' : undefined"
    @click="emit('select')"
  >
    <!-- 手机样式的预览区 -->
    <span class="lvlcard__preview" :style="{ '--accent-a': entry.meta.accent[0], '--accent-b': entry.meta.accent[1] }">
      <span class="lvlcard__statusbar" aria-hidden="true">
        <span class="lvlcard__clock">9:41</span>
        <span class="lvlcard__battery">78%</span>
      </span>
      <span class="lvlcard__wall" aria-hidden="true"></span>
      <span class="lvlcard__icons" aria-hidden="true">
        <AppIcon v-for="app in miniApps" :key="app.id" :id="app.id" :size="26" />
      </span>
      <span v-if="locked" class="lvlcard__lock" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8">
          <rect x="5.4" y="10.6" width="13.2" height="9" rx="2.4" />
          <path d="M8.4 10.6V8a3.6 3.6 0 0 1 7.2 0v2.6" stroke-linecap="round" />
        </svg>
      </span>
    </span>

    <!-- 关卡信息 -->
    <span class="lvlcard__body">
      <span class="lvlcard__ordinal">{{ entry.meta.ordinal }} · {{ entry.meta.category }}</span>
      <span class="lvlcard__title">{{ entry.meta.title }}</span>
      <span class="lvlcard__blurb">{{ entry.meta.blurb }}</span>
      <span class="lvlcard__status">{{ statusText }}</span>
    </span>

    <span class="lvlcard__cta">{{ ctaText }}</span>
  </button>
</template>

<style scoped>
.lvlcard {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 0 0 var(--card-w, 268px);
  width: var(--card-w, 268px);
  padding: var(--space-3);
  border: 1px solid var(--c-wall-border);
  border-radius: var(--radius-lg);
  background: var(--c-wall-surface);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  color: var(--c-on-wall);
  text-align: left;
  scroll-snap-align: center;
  scroll-snap-stop: always;
  /* 非中心卡：缩小、压暗，一眼看出「先移到中间」 */
  transform: scale(0.88);
  opacity: 0.7;
  transition:
    transform var(--dur-base) ease,
    opacity var(--dur-base) ease;
}

.lvlcard--active {
  transform: scale(1);
  opacity: 1;
  border-color: var(--c-on-wall);
  box-shadow: var(--shadow-dock);
}

.lvlcard--locked {
  /* 锁定的关卡用虚线边框，与可玩的实线区分 */
  border-style: dashed;
}

/* ============ 手机样式预览 ============ */

.lvlcard__preview {
  position: relative;
  display: block;
  height: 116px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: linear-gradient(165deg, var(--accent-a), var(--accent-b));
}

.lvlcard__statusbar {
  position: absolute;
  inset: 0 0 auto 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: rgb(6 12 22 / 34%);
  color: #f2f6fb;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.lvlcard__clock {
  font-weight: 600;
}

/* 迷你壁纸：与真机同一套光斑，但更简化（卡片很小，细节看不出来） */
.lvlcard__wall {
  position: absolute;
  inset: 18px 0 0 0;
  background:
    radial-gradient(120% 70% at 78% 12%, rgb(255 255 255 / 26%), transparent 60%),
    radial-gradient(90% 60% at 12% 88%, rgb(255 255 255 / 14%), transparent 62%);
}

.lvlcard__icons {
  position: absolute;
  inset: auto 0 10px 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 0 12px;
  justify-items: center;
}

.lvlcard__lock {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(6 12 22 / 48%);
  color: #fff;
}

/* ============ 关卡信息 ============ */

.lvlcard__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lvlcard__ordinal {
  font-size: var(--font-xs);
  font-weight: 500;
  color: var(--c-on-wall-soft);
}

.lvlcard__title {
  font-size: var(--font-lg);
  font-weight: 800;
  line-height: 1.25;
}

.lvlcard__blurb {
  font-size: var(--font-sm);
  line-height: 1.5;
  color: var(--c-on-wall-soft);
}

.lvlcard__status {
  margin-top: var(--space-1);
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--c-on-wall-accent);
}

/* ============ 行动文案 ============ */

.lvlcard__cta {
  display: block;
  margin-top: var(--space-1);
  padding: 9px var(--space-3);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 92%);
  color: #16202e;
  font-size: var(--font-base);
  font-weight: 700;
  text-align: center;
}

.lvlcard--locked .lvlcard__cta {
  background: rgb(255 255 255 / 30%);
  color: var(--c-on-wall-soft);
}

@media (prefers-reduced-motion: reduce) {
  .lvlcard {
    transition: none;
  }
}
</style>
