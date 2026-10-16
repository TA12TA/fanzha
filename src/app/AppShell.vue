<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import LevelHall from '@/app/LevelHall.vue'
import PhoneShell from '@/app/PhoneShell.vue'
import { getPlayableLevel, playableLevels } from '@/data/levels'
import { clearAllSaves, loadActiveLevel, readSlotSummary, saveActiveLevel } from '@/game/storage'
import { resetChatReveal } from '@/app/chatReveal'
import type { LevelSlotSummary } from '@/game/storage'
import type { LevelId } from '@/game/types'

/**
 * 根壳：一部虚构手机 + 关卡大厅两种形态。
 *
 * 为什么大厅在这一层而不是手机内部：
 * 大厅要能**换掉整部手机**（一关一部手机）。如果把大厅做成手机里的一个应用，
 * 切关时就得在手机内部替换全部剧情状态，容易残留通知、最近任务、当前会话
 * 等属于「上一部手机」的状态。放在外层，切关 = 用 `:key` 重挂载整部手机，
 * 干净且不用手写一堆重置逻辑；剧情进度早已由 `dispatch` 落盘，不会丢。
 *
 * 首屏仍是**当前关卡的锁屏**（不是大厅）：保住「打开就是一部手机」的形态，
 * 大厅从桌面「关卡」图标、设置页、复盘页三处进入。
 */
const screen = ref<'hall' | 'phone'>('phone')
/** 当前在玩的关卡：读上次的选择，刷新后回到同一关。 */
const activeLevelId = ref<LevelId>(loadActiveLevel())

/** 各关存档摘要（大厅卡片显示状态用）。切关/清档后重新读。 */
const slots = ref<Record<string, LevelSlotSummary>>({})

/** 重新读取所有关卡的存档摘要。 */
function refreshSlots(): void {
  const next: Record<string, LevelSlotSummary> = {}
  for (const level of playableLevels()) {
    next[level.meta.id] = readSlotSummary(level)
  }
  slots.value = next
}

refreshSlots()

/** 当前关卡（一定是可玩关卡）。 */
const activeLevel = computed(() => getPlayableLevel(activeLevelId.value) ?? playableLevels()[0])

/** 手机挂载钥匙：切关时 +1，强制整部手机重挂载。 */
const phoneKey = ref(0)

/** 打开大厅。 */
function openHall(): void {
  refreshSlots()
  screen.value = 'hall'
}

/** 从大厅回到当前关卡（不改变任何进度）。 */
function closeHall(): void {
  screen.value = 'phone'
}

/** 在大厅选定并进入某一关。 */
function enterLevel(levelId: LevelId): void {
  if (!getPlayableLevel(levelId)) return
  if (levelId !== activeLevelId.value) {
    activeLevelId.value = levelId
    saveActiveLevel(levelId)
    // 换了一部手机：视图、通知、最近任务都应当从该关的开头开始。
    phoneKey.value += 1
    // 这一关可能已经玩到一半，进度在存档里，但「看过哪些消息」属于内存动效状态，
    // 换关时清掉，避免上一关的已读进度串到这一关。
    resetChatReveal(levelId)
  }
  refreshSlots()
  screen.value = 'phone'
}

/** 清空全部关卡进度（在设置页确认后由手机层发出）。 */
function clearAll(): void {
  clearAllSaves()
  resetChatReveal()
  activeLevelId.value = playableLevels()[0]?.meta.id ?? 'level-01'
  saveActiveLevel(activeLevelId.value)
  phoneKey.value += 1
  refreshSlots()
  // 清完回大厅：玩家会想重新挑一关，而且卡片状态刚刚全变了。
  screen.value = 'hall'
}

/**
 * 浏览器返回键：大厅里按返回回到当前关卡，而不是离开页面。
 * 手机内部有自己的 popstate 处理（回桌面），两层各自 pushState，
 * 因此大厅这一层只在 `screen === 'hall'` 时接管。
 */
let hallGuardActive = false

function onPopState(): void {
  if (screen.value === 'hall') {
    screen.value = 'phone'
  }
  if (hallGuardActive) globalThis.history.pushState({ hall: true }, '')
}

onMounted(() => {
  globalThis.history.pushState({ hall: true }, '')
  hallGuardActive = true
  globalThis.addEventListener('popstate', onPopState)
})

onBeforeUnmount(() => {
  globalThis.removeEventListener('popstate', onPopState)
  hallGuardActive = false
})

// 切关或清档后刷新卡片状态，避免大厅显示过期余额。
watch(screen, (value) => {
  if (value === 'hall') refreshSlots()
})
</script>

<template>
  <div class="phone">
    <LevelHall
      v-if="screen === 'hall'"
      class="phone__frame"
      :current-level-id="activeLevelId"
      :slots="slots"
      @enter="enterLevel"
      @close="closeHall"
    />

    <PhoneShell
      v-else-if="activeLevel"
      :key="phoneKey"
      class="phone__frame"
      :level="activeLevel"
      @open-levels="openHall"
      @clear-all="clearAll"
    />
  </div>
</template>

<style scoped>
.phone {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--c-bg-outer);
}

/*
 * 手机外框样式放在根壳上，由大厅与手机两种形态共用：
 * 两者都是「同一部手机的当前画面」，因此宽度、圆角、高度规则必须一致。
 * `:deep()` 让子组件根元素吃到这层样式。
 */
.phone :deep(.phone__frame) {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--phone-max-width);
  height: 100vh;
  height: 100dvh;
  padding-top: var(--safe-top);
  overflow: hidden;
  background: var(--c-desktop-2);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 6%);
}

/* 桌面预览时居中展示手机尺寸画面；移动端铺满可见区域 */
@media (min-width: 480px) {
  .phone :deep(.phone__frame) {
    height: min(100dvh, 900px);
    border-radius: 18px;
  }
}

@media (max-height: 420px) {
  .phone :deep(.phone__frame) {
    height: 100dvh;
  }
}
</style>
