<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import LevelDesk from '@/app/LevelDesk.vue'
import PhoneShell from '@/app/PhoneShell.vue'
import { getPlayableLevel, playableLevels } from '@/data/levels'
import { clearAllSaves, loadActiveLevel, readSlotSummary, saveActiveLevel } from '@/game/storage'
import { resetChatReveal } from '@/app/chatReveal'
import { useTheme } from '@/app/theme'
import { isLongAbsence, useIdleReset, writeLastActive } from '@/app/idleReset'
import { resetWorkIntro } from '@/app/workIntro'
import type { LevelSlotSummary } from '@/game/storage'
import type { LevelId } from '@/game/types'

/**
 * 根壳：一张书桌（选关）+ 一部虚构手机，两种形态。
 *
 * 两级结构（用户要求）：
 * - **一级 = 关卡大厅**：打开页面/刷新后的首屏就是大厅，先选关；
 * - **二级 = 该关的手机**：选定后才出现这一关的**锁屏**，上滑解锁进桌面；
 * - 结局页与复盘页都能回到一级（大厅）重新选关。
 *
 * 为什么大厅在这一层而不是手机内部：
 * 大厅要能**换掉整部手机**（一关一部手机）。如果把大厅做成手机里的一个应用，
 * 切关时就得在手机内部替换全部剧情状态，容易残留通知、最近任务、当前会话
 * 等属于「上一部手机」的状态。放在外层，切关 = 用 `:key` 重挂载整部手机，
 * 干净且不用手写一堆重置逻辑；剧情进度早已由 `dispatch` 落盘，不会丢。
 *
 * 手机内部的「关卡」图标、设置页入口仍然保留：玩到一半想换关不必刷新。
 */
const screen = ref<'desk' | 'phone'>('desk')
/** 当前在玩的关卡：读上次的选择，用于大厅初始居中与卡片状态。 */
const activeLevelId = ref<LevelId>(loadActiveLevel())

/**
 * 壁纸主题（白天/夜间）挂在**根壳**上，而不是挂在手机里。
 *
 * 为什么必须放到这一层：大厅也是压在壁纸上的界面（首屏就是它），
 * 而主题是通过 `<html data-theme>` 决定壁纸与文字明暗的。
 * 之前 `useTheme()` 只在 `PhoneShell` 里调用，于是首屏大厅根本读不到主题 ——
 * 白天时段打开页面，大厅仍然按夜间配色渲染（字与壁纸的明暗关系是错的）。
 * 提到根壳后，大厅与手机共用同一次主题解析。
 *
 * 同时这里也是唯一的所有者：`useTheme()` 会在卸载时摘掉 html 上的属性，
 * 若手机内层也调一次，从手机退回大厅时会连根壳需要的属性一起摘掉。
 */
const { theme } = useTheme()

/**
 * 本次会话是否已经从大厅进入过某一关。
 *
 * 用途：首屏大厅**没有**「当前关卡」可返回（还没选过），因此不该显示
 * 「返回当前关卡」，按返回键也不该把玩家带进手机。只有从手机内回到大厅时，
 * 这个返回动作才成立。
 */
const enteredLevel = ref(false)

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

/**
 * 浏览器重新打开时先判断“上次活动”：
 * 超过 25 分钟没打开，就当作第一次打开——清空全部进度，
 * 并清掉封面的已看过标记。必须在大厅子组件挂载前做，
 * 否则 LevelDesk 已经按「看过封面」初始化了。
 */
if (isLongAbsence()) {
  clearAllSaves()
  resetChatReveal()
  resetWorkIntro()
  activeLevelId.value = playableLevels()[0]?.meta.id ?? 'level-01'
  enteredLevel.value = false
  screen.value = 'desk'
  refreshSlots()
}

/** 当前关卡（一定是可玩关卡）。 */
const activeLevel = computed(() => getPlayableLevel(activeLevelId.value) ?? playableLevels()[0])

/** 手机挂载钥匙：切关时 +1，强制整部手机重挂载。 */
const phoneKey = ref(0)
/** 大厅挂载钥匙：闲置重置时 +1，让封面重新按新的 localStorage 状态挂载。 */
const deskKey = ref(0)

/**
 * 进入关卡时的壁纸交接层。
 *
 * 飞行层结束 → LevelDesk 卸载 → PhoneShell 挂载，中间只要有一帧空档，
 * 全屏壁纸上就会闪一下深色/白色底。交接层由 PhoneShell 用同源壁纸画在最上层，
 * 等新手机完成挂载后淡出，避免“铺开全屏后闪一下”。
 */
const handoff = ref(false)
let handoffTimer: ReturnType<typeof setTimeout> | null = null

/** 闲置重置提示：重置后短暂显示，避免玩家以为进度自己消失。 */
const idleNotice = ref(false)
let idleNoticeTimer: ReturnType<typeof setTimeout> | null = null

/** 25 分钟无操作：清空全部关卡进度，回到大厅，整部手机重挂载。 */
function resetForInactivity(): void {
  const hadSession = screen.value === 'phone' || enteredLevel.value
  clearAllSaves()
  resetChatReveal()
  resetWorkIntro()
  deskKey.value += 1
  // 不写回 active level：新设备第一次打开时没有这个键。
  activeLevelId.value = playableLevels()[0]?.meta.id ?? 'level-01'
  phoneKey.value += 1
  refreshSlots()
  enteredLevel.value = false
  screen.value = 'desk'
  handoff.value = false
  idleNotice.value = hadSession
  if (idleNoticeTimer) clearTimeout(idleNoticeTimer)
  idleNoticeTimer = setTimeout(() => {
    idleNotice.value = false
    idleNoticeTimer = null
  }, 6000)
}

/** 把最后活动时间持久化；5 秒节流，避免滚动时频繁写 localStorage。 */
let lastPersisted = 0
function rememberActivity(now: number): void {
  if (now - lastPersisted < 5000) return
  lastPersisted = now
  writeLastActive(now)
}

const idleReset = useIdleReset(resetForInactivity, { onActivity: rememberActivity })

/** 打开大厅（书桌）。 */
function openHall(): void {
  idleNotice.value = false
  refreshSlots()
  screen.value = 'desk'
}

/** 从大厅回到当前关卡（不改变任何进度）。首屏还没进过任何关时为空操作。 */
function closeHall(): void {
  if (!enteredLevel.value) return
  screen.value = 'phone'
}

/** 在大厅选定并进入某一关。 */
function enterLevel(levelId: LevelId): void {
  if (!getPlayableLevel(levelId)) return
  idleNotice.value = false
  enteredLevel.value = true
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
  handoff.value = true
  screen.value = 'phone'
  if (handoffTimer) clearTimeout(handoffTimer)
  handoffTimer = setTimeout(() => {
    handoff.value = false
    handoffTimer = null
  }, 360)
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
  // 同时清掉「进过关」的标记 —— 现在等于回到没选过任何关的状态。
  enteredLevel.value = false
  screen.value = 'desk'
}

/**
 * 浏览器返回键。
 *
 * 大厅这一层只在「从手机内回到大厅」时才接管返回（回到那部手机）；
 * 首屏大厅按返回是空操作 —— 不能跳过选关直接把玩家送进手机。
 * 手机内部有自己的 popstate 处理（回桌面），两层各自 pushState。
 */
let hallGuardActive = false

function onPopState(): void {
  if (screen.value === 'desk' && enteredLevel.value) {
    screen.value = 'phone'
  }
  if (hallGuardActive) globalThis.history.pushState({ hall: true }, '')
}

onMounted(() => {
  globalThis.history.pushState({ hall: true }, '')
  hallGuardActive = true
  globalThis.addEventListener('popstate', onPopState)
  idleReset.start()
})

onBeforeUnmount(() => {
  globalThis.removeEventListener('popstate', onPopState)
  idleReset.stop()
  if (handoffTimer) clearTimeout(handoffTimer)
  handoffTimer = null
  if (idleNoticeTimer) clearTimeout(idleNoticeTimer)
  idleNoticeTimer = null
  hallGuardActive = false
})

// 切关或清档后刷新卡片状态，避免大厅显示过期余额。
watch(screen, (value) => {
  if (value === 'desk') refreshSlots()
})
</script>

<template>
  <div class="phone">
    <p v-if="idleNotice" class="phone__idle" role="status">
      已闲置 25 分钟，进度已清空
    </p>

    <LevelDesk
      v-if="screen === 'desk'"
      :key="deskKey"
      class="phone__frame"
      :current-level-id="activeLevelId"
      :slots="slots"
      :show-return="enteredLevel"
      :theme="theme"
      @enter="enterLevel"
      @close="closeHall"
    />

    <PhoneShell
      v-else-if="activeLevel"
      :key="phoneKey"
      class="phone__frame"
      :level="activeLevel"
      :theme="theme"
      :handoff="handoff"
      @open-levels="openHall"
      @clear-all="clearAll"
    />
  </div>
</template>

<style scoped>
.phone {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--c-bg-outer);
}

/*
 * 2026-10-17 画面打磨：桌面预览的「落地感」。
 *
 * 之前 ≥480px 预览时，手机浮在一块纯黑底上，四周什么都没有 —— 这是电脑上
 * 打开链接的第一印象。现在给背景加一层柔和的径向光晕 + 边缘暗角，
 * 手机本身加一圈极淡的外发光，看起来像「放在桌面上」而不是「悬在虚空里」。
 * 只在宽屏生效，手机端铺满可见区域时这套背景完全看不见。
 */
@media (min-width: 480px) {
  .phone {
    background:
      radial-gradient(ellipse 70% 55% at 50% 38%, rgb(34 66 52 / 58%), transparent 72%),
      radial-gradient(ellipse 120% 90% at 50% 50%, transparent 45%, rgb(0 0 0 / 48%)),
      var(--c-bg-outer);
  }
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
  box-shadow: 0 0 0 1px rgb(247 240 226 / 8%);
}

/* 桌面预览时居中展示手机尺寸画面；移动端铺满可见区域 */
@media (min-width: 480px) {
  .phone :deep(.phone__frame) {
    height: min(100dvh, 900px);
    border-radius: 18px;
    /*
     * 外发光 + 落地投影：外发光勾出机身轮廓，投影让它与背景分开。
     * 这两层只在宽屏预览时加，手机端铺满时加了也看不见。
     */
    box-shadow:
      0 0 0 1px rgb(247 240 226 / 10%),
      0 0 60px rgb(78 126 102 / 17%),
      0 24px 60px rgb(0 0 0 / 50%);
  }
}

@media (max-height: 420px) {
  .phone :deep(.phone__frame) {
    height: 100dvh;
  }
}

/* 闲置重置提示：只解释一次，不参与交互 */
.phone__idle {
  position: absolute;
  top: calc(var(--safe-top) + 12px);
  left: 50%;
  z-index: 120;
  transform: translateX(-50%);
  margin: 0;
  padding: 7px 14px;
  border-radius: var(--radius-pill);
  background: rgb(9 18 14 / 88%);
  color: var(--c-text-invert);
  font-size: var(--font-xs);
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 6px 18px rgb(3 8 5 / 32%);
  pointer-events: none;
}
</style>
