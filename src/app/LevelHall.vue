<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import LevelCard from '@/app/LevelCard.vue'
import PhoneStatusBar from '@/components/PhoneStatusBar.vue'
import { playSound } from '@/app/sound'
import { LEVELS, getPlayableLevel } from '@/data/levels'
import { isPlayable } from '@/game/level'
import type { LevelEntry } from '@/game/level'
import type { LevelId } from '@/game/types'
import type { LevelSlotSummary } from '@/game/storage'

/**
 * 关卡大厅：一关一部手机，中间轮播，玩家自行选择。
 *
 * 关键设计（见 SCENES.md 的视觉目标）：
 * - **整页仍然只有一部手机**：大厅是这部手机的「启动器」画面，
 *   顶部是同一个状态栏、背景是同一张壁纸、底部是同一条动作条。
 *   卡片上的迷你手机只是插图，不是第二层可操作的手机外框。
 * - 轮播用原生横向滚动 + CSS scroll-snap（触屏手感与真机一致），
 *   但**活动索引以显式状态为准**：箭头 / 圆点 / 键盘直接设 `activeIndex`
 *   再滚动过去，而不是反过来从滚动位置猜。这样在不支持真实布局的
 *   环境（jsdom）里也能断言，也不会出现「滚到一半索引就跳了」。
 * - 点非中心卡：先居中，再点一次才进入 —— 触屏与键盘行为一致。
 */
const props = defineProps<{
  /** 当前正在玩的关卡（用于「返回当前关卡」）。 */
  currentLevelId: LevelId
  /** 各关存档摘要（key = 关卡 id）。 */
  slots: Record<string, LevelSlotSummary>
  /**
   * 是否显示「返回当前关卡」。
   * 首屏大厅还没进过任何关，没有「当前关卡」可返回，此时不显示；
   * 从手机内打开大厅时才显示（可一键回到那部手机）。
   */
  showReturn: boolean
  /**
   * 壁纸主题（白天/夜间）。大厅也压在壁纸上，状态栏的深浅要跟着它走 ——
   * 否则白天壁纸（浅色）上会压一条深色状态栏。
   */
  theme: 'day' | 'night'
}>()

const emit = defineEmits<{
  /** 选定并进入某一关。 */
  (e: 'enter', levelId: LevelId): void
  /** 回到当前正在玩的那一关（不改变任何进度）。 */
  (e: 'close'): void
}>()

/** 空摘要：某一关还没有记录时用它，避免卡片渲染出 undefined。 */
const EMPTY_SLOT: LevelSlotSummary = {
  started: false,
  finished: false,
  balance: null,
  endingTitle: null,
}

const entries = computed<LevelEntry[]>(() => LEVELS)

/** 打开大厅时的初始选中项 = 当前在玩的那一关。 */
const activeIndex = ref(Math.max(0, entries.value.findIndex((e) => e.meta.id === props.currentLevelId)))

const trackRef = ref<HTMLElement | null>(null)
/** 锁定关卡的提示（点了锁定的卡才显示）。 */
const lockHint = ref<string | null>(null)

const activeEntry = computed<LevelEntry | undefined>(() => entries.value[activeIndex.value])

const isFirst = computed(() => activeIndex.value <= 0)
const isLast = computed(() => activeIndex.value >= entries.value.length - 1)

/** 是否偏好减弱动效（滚动时用 auto，不做平滑滚动）。 */
const reduceMotion = ref(false)

function slotOf(entry: LevelEntry): LevelSlotSummary {
  return props.slots[entry.meta.id] ?? EMPTY_SLOT
}

/**
 * 把中心卡滚到视野中央。
 *
 * `scrollIntoView` 不是所有环境都有（jsdom 就没有，部分老浏览器也没有），
 * 而它只影响「卡片是否在视觉中间」—— 纯呈现，不该让整个大厅挂掉。
 * 因此先探测再调用；没有它就退化成「依赖 scroll-snap 自己吸附」，
 * 选中状态（`activeIndex`）本来就不依赖它。
 */
function centerCard(index: number): void {
  void nextTick(() => {
    const track = trackRef.value
    if (!track) return
    const card = track.children[index] as HTMLElement | undefined
    if (typeof card?.scrollIntoView !== 'function') return
    card.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: reduceMotion.value ? 'auto' : 'smooth',
    })
  })
}

/** 切换选中项（箭头 / 圆点 / 键盘都走这里）。 */
function select(index: number): void {
  if (index < 0 || index >= entries.value.length) return
  if (index === activeIndex.value) return
  activeIndex.value = index
  lockHint.value = null
  playSound('tap')
  centerCard(index)
}

function prev(): void {
  select(activeIndex.value - 1)
}

function next(): void {
  select(activeIndex.value + 1)
}

/** 点卡片：非中心卡先居中；中心卡才真正进入。 */
function onCardClick(index: number): void {
  if (index !== activeIndex.value) {
    select(index)
    return
  }
  const entry = entries.value[index]
  if (!entry) return

  if (!isPlayable(entry)) {
    // 锁定关卡：给明确反馈而不进入（看起来可点就必须有响应）
    lockHint.value = `${entry.meta.ordinal}「${entry.meta.title}」${entry.note}`
    playSound('cancel')
    return
  }
  playSound('tap')
  emit('enter', entry.meta.id)
}

/** 底部主按钮：进入当前中心卡。 */
function enterActive(): void {
  onCardClick(activeIndex.value)
}

/** 键盘：← → 切卡，Enter 进入，Esc 回当前关卡。 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    prev()
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    next()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    enterActive()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

function close(): void {
  playSound('tap')
  emit('close')
}

/**
 * 滚动同步：用户用手指滑动时把索引跟上。
 * 用 rAF 节流，并且**只在索引真的变了才写**，避免与 `select` 互相打架。
 */
let scrollFrame = 0
function onScroll(): void {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const track = trackRef.value
    if (!track) return
    const center = track.scrollLeft + track.clientWidth / 2
    let best = activeIndex.value
    let bestDistance = Number.POSITIVE_INFINITY
    for (let i = 0; i < track.children.length; i += 1) {
      const card = track.children[i] as HTMLElement
      const cardCenter = card.offsetLeft + card.offsetWidth / 2
      const distance = Math.abs(cardCenter - center)
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    }
    if (best !== activeIndex.value) {
      activeIndex.value = best
      lockHint.value = null
    }
  })
}

onMounted(() => {
  reduceMotion.value =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  // 初始把当前关卡的卡滚到中间（无动画，避免一进来就滑一下）
  void nextTick(() => {
    const track = trackRef.value
    const card = track?.children[activeIndex.value] as HTMLElement | undefined
    if (typeof card?.scrollIntoView === 'function') {
      card.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' })
    }
  })
  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  if (typeof globalThis.removeEventListener === 'function') {
    globalThis.removeEventListener('keydown', onKeydown)
  }
})

/** 当前关卡的显示名（用于「返回当前关卡」按钮）。 */
const currentTitle = computed(() => getPlayableLevel(props.currentLevelId)?.meta.title ?? '')

/** 只有「从手机内打开大厅」且当前关卡可玩时，才提供「返回当前关卡」。 */
const canReturn = computed(() => props.showReturn && currentTitle.value !== '')

/** 状态栏深浅跟随壁纸主题（与手机内同一套规则）。 */
const chromeTone = computed<'dark' | 'light'>(() => (props.theme === 'day' ? 'light' : 'dark'))

watch(activeIndex, () => {
  // 切卡时清掉锁定提示，避免提示与当前卡对不上
  lockHint.value = null
})
</script>

<template>
  <div class="hall" aria-label="关卡大厅">
    <PhoneStatusBar :tone="chromeTone" :clickable="false" />

    <!-- 与锁屏/桌面共用同一份壁纸：大厅也是同一部手机 -->
    <div class="wall" aria-hidden="true">
      <div class="wall__sky"></div>
      <div class="wall__hills"></div>
      <div class="wall__glow"></div>
    </div>

    <header class="hall__head">
      <h1 class="hall__title">关卡大厅</h1>
      <p class="hall__subtitle">选一部手机开始挑战</p>
    </header>

    <!-- 轮播轨道：原生横向滚动 + scroll-snap -->
    <div
      ref="trackRef"
      class="hall__track"
      role="listbox"
      aria-label="可挑战的关卡"
      @scroll.passive="onScroll"
    >
      <LevelCard
        v-for="(entry, index) in entries"
        :key="entry.meta.id"
        :entry="entry"
        :active="index === activeIndex"
        :slot="slotOf(entry)"
        @select="onCardClick(index)"
      />
    </div>

    <!-- 箭头 + 圆点：触屏与键盘都有等效操作 -->
    <div class="hall__nav">
      <button
        type="button"
        class="hall__arrow"
        aria-label="上一个关卡"
        :disabled="isFirst"
        @click="prev"
      >
        <span aria-hidden="true">←</span>
      </button>

      <span class="hall__dots" role="tablist" aria-label="关卡选择">
        <button
          v-for="(entry, index) in entries"
          :key="entry.meta.id"
          type="button"
          role="tab"
          class="hall__dot"
          :class="{ 'hall__dot--on': index === activeIndex }"
          :aria-selected="index === activeIndex ? 'true' : 'false'"
          :aria-label="`${entry.meta.ordinal} ${entry.meta.title}`"
          @click="select(index)"
        ></button>
      </span>

      <button
        type="button"
        class="hall__arrow"
        aria-label="下一个关卡"
        :disabled="isLast"
        @click="next"
      >
        <span aria-hidden="true">→</span>
      </button>
    </div>

    <!-- 锁定提示：点了锁定的关卡后出现，明确说明为什么进不去 -->
    <p v-if="lockHint" class="hall__lock" role="status">{{ lockHint }}</p>

    <footer class="hall__foot">
      <button
        v-if="canReturn"
        type="button"
        class="btn btn--ghost hall__back"
        @click="close"
      >
        返回当前关卡
      </button>
      <button type="button" class="btn btn--primary hall__enter" @click="enterActive">
        {{ activeEntry && isPlayable(activeEntry) ? `进入${activeEntry.meta.ordinal}` : '暂不可进入' }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.hall {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  /* 压在壁纸上的内容统一用这套「on-wall」变量：白天壁纸浅、文字转深 */
  color: var(--c-on-wall);
  background: var(--c-desktop-2);
  overflow: hidden;
}

/* 暗角，与桌面同一套观感 */
.hall::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 40%, transparent 58%, var(--wall-vignette));
  pointer-events: none;
}

.hall__head {
  position: relative;
  flex: none;
  padding: var(--space-5) var(--space-4) var(--space-3);
}

/*
 * 状态栏必须压在壁纸之上。
 *
 * `.wall` 是 `position: absolute; inset: 0`，覆盖整个大厅（含顶部状态栏那一条）。
 * 按 CSS 绘制顺序，绝对定位元素画在**普通流**内容之上，而状态栏默认没有定位，
 * 于是壁纸把状态栏整条盖住了 —— 实测该区域的像素就是壁纸色，而不是状态栏底色。
 * （手机上没这个问题：桌面里的壁纸在 `.home` 内部，与状态栏在纵向不重叠。）
 */
.hall :deep(.statusbar) {
  position: relative;
  z-index: 1;
}

.hall__title {
  font-size: var(--font-xl);
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.06em;
  text-shadow: 0 2px 10px rgb(0 0 0 / 20%);
}

.hall__subtitle {
  margin-top: 2px;
  font-size: var(--font-sm);
  letter-spacing: 0.04em;
  color: var(--c-on-wall-soft);
}

/*
 * 轮播轨道。
 *
 * `padding-inline` 用「(100% - 卡片宽)/2」把第一张与最后一张也推到正中间，
 * 否则首尾卡片永远贴边、没法居中。
 * 轨道本身 `overflow-x: auto`，整页不产生横向溢出（verify 会按 320/375/390 实测）。
 *
 * `align-items: center` 是必须的：默认的 `stretch` 会把卡片拉满轨道高度，
 * 于是卡片底部留出一大片空白、按钮浮在半空（实拍截图发现的）。
 * 卡片应当按内容自然高度居中摆放。
 */
.hall__track {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex: 1;
  min-height: 0;
  padding-block: var(--space-2);
  padding-inline: calc((100% - var(--card-w)) / 2);
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.hall__track::-webkit-scrollbar {
  display: none;
}

.hall__nav {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex: none;
  padding: var(--space-2) var(--space-4) 0;
}

.hall__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tap-min);
  height: var(--tap-min);
  border: 1px solid var(--c-wall-border);
  border-radius: 50%;
  background: var(--c-wall-surface);
  color: inherit;
  font-size: var(--font-md);
  /* 磨砂 + 投影：与桌面上的组件同一套玻璃质感，而不是一枚扁平圆圈 */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 14px rgb(4 10 20 / 18%);
  transition:
    background-color var(--dur-fast) ease,
    transform var(--dur-fast) ease;
}

.hall__arrow:active:not(:disabled) {
  transform: scale(0.94);
}

.hall__arrow:disabled {
  opacity: 0.32;
  box-shadow: none;
  cursor: not-allowed;
}

.hall__dots {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.hall__dot {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  position: relative;
}

/* 圆点本体用伪元素：把 26px 热区留给手指，视觉上仍是小圆点 */
.hall__dot::before {
  content: '';
  position: absolute;
  inset: 9px;
  border-radius: 50%;
  background: var(--c-on-wall-soft);
  opacity: 0.5;
  transition:
    inset var(--dur-fast) ease,
    opacity var(--dur-fast) ease;
}

/* 选中项从圆点拉长成一小段胶囊：比「同一形状换个亮度」更容易一眼分辨 */
.hall__dot--on::before {
  inset: 11px 4px;
  border-radius: 999px;
  opacity: 1;
  background: var(--c-on-wall);
}

.hall__lock {
  position: relative;
  flex: none;
  margin: 0 var(--space-4);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--c-wall-chip);
  border: 1px solid var(--c-wall-chip-border);
  font-size: var(--font-sm);
  font-weight: 600;
}

.hall__foot {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: none;
  padding: var(--space-3) var(--space-4);
  padding-bottom: calc(var(--space-3) + var(--safe-bottom));
}

.hall__enter {
  min-height: 50px;
}

.hall__back {
  border-color: var(--c-wall-border);
  background: var(--c-wall-surface);
  color: inherit;
}

@media (prefers-reduced-motion: reduce) {
  .hall__track {
    scroll-behavior: auto;
  }
}
</style>
