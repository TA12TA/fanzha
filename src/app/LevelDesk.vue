<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import DeskPhone from '@/app/DeskPhone.vue'
import { playSound } from '@/app/sound'
import { LEVELS, getPlayableLevel } from '@/data/levels'
import { isPlayable } from '@/game/level'
import type { LevelEntry } from '@/game/level'
import type { LevelId } from '@/game/types'
import type { LevelSlotSummary } from '@/game/storage'

/**
 * 关卡大厅（第二版）：一张书桌，上面平放着几部手机，点哪部就进哪一关。
 *
 * 与第一版（轮播卡片）的区别：
 * - **没有手机外框**：这一版不再画状态栏与底部导航，整屏就是一张桌子；
 * - 选关方式是**直接点桌上的手机**，而不是「先居中再确认」；
 * - 点击后有一段落**旋转 + 放大**的转场：被点的那部手机从卡片位置起飞，
 *   边转边长大，最后完全覆盖整个视口，然后换成那一关的手机（锁屏）。
 *
 * 为什么这版有意打破了 `SCENES.md` §0「整页只有一部手机、不得出现第二层
 * 手机外框」：书桌是**开局前的选关界面**，不是游戏过程；游戏过程仍然全程
 * 在一部手机里，而旋转放大的转场正是把「你选的这部手机」和「接下来用的
 * 这部手机」连成同一部的那一步。这条偏差在 SCENES.md / ACCEPTANCE.md /
 * README 里都做了记录；当前主分支即这一版，轮播版已归档在 git 历史中。
 */
const props = defineProps<{
  /** 当前正在玩的关卡（用于「返回当前关卡」）。 */
  currentLevelId: LevelId
  /** 各关存档摘要（key = 关卡 id）。 */
  slots: Record<string, LevelSlotSummary>
  /** 是否显示「返回当前关卡」（首屏还没进过关时不显示）。 */
  showReturn: boolean
  /** 壁纸主题，用于桌椅明暗与文字配色。 */
  theme: 'day' | 'night'
}>()

const emit = defineEmits<{
  (e: 'enter', levelId: LevelId): void
  (e: 'close'): void
}>()

/** 空摘要：还没记录的关卡用它，避免渲染出 undefined。 */
const EMPTY_SLOT: LevelSlotSummary = {
  started: false,
  finished: false,
  balance: null,
  endingTitle: null,
}

const entries = computed<LevelEntry[]>(() => LEVELS)

/**
 * 每部手机的倾斜角。
 * 刻意用**固定值**而不是随机数：桌上的手机看起来东倒西歪，但每次渲染、
 * 每次测试都完全一致（随机角度会让自动化断言无法写，也会让人怀疑是不是抖动）。
 */
const TILTS = [-7, 3, -2]

/** 转场时长：与 CSS 里的 `--fly-dur` 必须一致。 */
const FLY_MS = 520
/** 兜底提交时间：比动画略长，`transitionend` 没来也一定会进入。 */
const COMMIT_FALLBACK_MS = FLY_MS + 60

const rootRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const flyRef = ref<HTMLElement | null>(null)

/** 是否在转场中。`flying` 有值即表示飞行层正在渲染。 */
const flying = ref<{
  levelId: LevelId
  entry: LevelEntry
  style: Record<string, string>
  /** 拿不到有效矩形时走纯 CSS 的放大淡入（jsdom、元素不可见等）。 */
  fallback: boolean
} | null>(null)
/** 是否已经切到「放大到全屏」的终态（下一帧置真，触发 CSS 过渡）。 */
const flyingGo = ref(false)

/** 锁定关卡的提示（点了锁定的手机才显示）。 */
const lockHint = ref<string | null>(null)

let commitTimer: ReturnType<typeof setTimeout> | null = null
let rafId = 0

/** 是否偏好减弱动效：直接进入，不做那段转场。 */
const reduceMotion = ref(false)

function slotOf(entry: LevelEntry): LevelSlotSummary {
  return props.slots[entry.meta.id] ?? EMPTY_SLOT
}

/** 表格列的第三部手机单独一排，这里给第 2 排的补一点上边距，像随手放在桌上。 */
function tiltOf(index: number): number {
  return TILTS[index % TILTS.length]
}

/**
 * 点一部手机。
 *
 * 不是中心卡也能直接进 —— 这是第二版与第一版最大的交互差别：
 * 桌上摆着的手机每一部都是可以直接拿起来的，不需要先「选中」。
 */
function onSelect(index: number): void {
  const entry = entries.value[index]
  if (!entry) return

  // 转场期间忽略后续点击：避免连点导致重复进入 / 重复写存档
  if (flying.value) return

  if (!isPlayable(entry)) {
    // 锁定关卡：给明确反馈而不进入（看起来可点就必须有响应）
    lockHint.value = `${entry.meta.ordinal}「${entry.meta.title}」${entry.note}`
    playSound('cancel')
    return
  }

  playSound('tap')

  // 减弱动效：跳过转场，直接进入
  if (reduceMotion.value) {
    emit('enter', entry.meta.id)
    return
  }

  startFlight(index, entry)
}

/**
 * 开始转场。
 *
 * 用 FLIP：飞行层的**终态**是「铺满整个视口」（`inset: 0`），
 * 起始态则由「卡片机身的矩形」与「视口矩形」算出的位移与缩放得到。
 * 这样起点与卡片严丝合缝，终点正好覆盖全屏，中间那段旋转 + 放大交给 CSS 过渡。
 *
 * 拿不到有效矩形时（宽或高为 0，例如 jsdom）退化为纯 CSS 放大，
 * **但 commit 路径完全相同** —— 测试因此能覆盖真实行为。
 */
function startFlight(index: number, entry: LevelEntry): void {
  const stage = stageRef.value
  const frame = rootRef.value
  const card = stage?.children[index] as HTMLElement | undefined
  const body = card?.querySelector('.deskphone__body') as HTMLElement | null | undefined

  let style: Record<string, string> = {}
  let fallback = true

  if (frame && body) {
    const frameRect = frame.getBoundingClientRect()
    const bodyRect = body.getBoundingClientRect()
    const usable =
      frameRect.width > 0 && frameRect.height > 0 && bodyRect.width > 0 && bodyRect.height > 0
    if (usable) {
      fallback = false
      const sx = bodyRect.width / frameRect.width
      const sy = bodyRect.height / frameRect.height
      // 以中心对齐：transform-origin 是元素中心，所以平移量 = 卡片中心 - 视口中心
      const tx = bodyRect.left - frameRect.left + bodyRect.width / 2 - frameRect.width / 2
      const ty = bodyRect.top - frameRect.top + bodyRect.height / 2 - frameRect.height / 2
      style = {
        '--fly-sx': String(sx),
        '--fly-sy': String(sy),
        '--fly-tx': `${tx}px`,
        '--fly-ty': `${ty}px`,
        '--fly-rot': `${tiltOf(index)}deg`,
      }
    }
  }

  flying.value = { levelId: entry.meta.id, entry, style, fallback }
  flyingGo.value = false
  lockHint.value = null

  /*
   * 下一帧再切到终态。
   *
   * 这里有个 FLIP 的经典坑，必须两件事都做，否则**动画根本不会播**：
   * 1. 先用 `offsetHeight` **强制一次样式刷新**，让浏览器真正接受「起始态」
   *    （读到起始态的计算值）。不做这一步的话，起始态与终态会被合并成
   *    同一次样式计算，浏览器只看到终态，过渡无从发生；
   * 2. 再等一帧 `requestAnimationFrame` 才写终态，确保中间隔了一次绘制。
   *
   * 症状很有欺骗性：DOM 里飞行层存在、`--fly-*` 变量也都对，
   * 但 `getComputedStyle(fly).transform` 一直是单位矩阵 —— 对象瞬间到位、
   * 没有任何放大过程。已在 verify 里加了「飞行中途 transform 必须不是单位矩阵」
   * 的断言来盯住它。
   */
  void nextTick(() => {
    void flyRef.value?.offsetHeight
    rafId = requestAnimationFrame(() => {
      flyingGo.value = true
    })
  })

  // 兜底：`transitionend` 可能永远不来（标签页被挂起、过渡被中断、或环境不支持），
  // 没有它玩家会永远卡在动画里。所以无论如何都会提交一次。
  clearCommitTimer()
  commitTimer = setTimeout(commit, COMMIT_FALLBACK_MS)
}

/** 提交：换成目标关卡的那部手机。 */
function commit(): void {
  const target = flying.value
  if (!target) return
  clearCommitTimer()
  flying.value = null
  flyingGo.value = false
  emit('enter', target.levelId)
}

/** `transform` 过渡结束即提交（只认飞行层自己的 transform，忽略子元素冒泡上来的事件）。 */
function onTransitionEnd(event: TransitionEvent): void {
  if (event.target !== flyRef.value) return
  if (event.propertyName !== 'transform') return
  commit()
}

/** 取消转场（转场中按 Esc / 返回）：留在书桌，不进入。 */
function cancelFlight(): void {
  if (!flying.value) return
  clearCommitTimer()
  if (rafId) cancelAnimationFrame(rafId)
  flying.value = null
  flyingGo.value = false
}

function clearCommitTimer(): void {
  if (commitTimer) {
    clearTimeout(commitTimer)
    commitTimer = null
  }
}

function close(): void {
  playSound('tap')
  emit('close')
}

/** 网格列数：与 CSS 里的 `repeat(2, ...)` 保持一致（↑↓ 按它跳行）。 */
const COLUMNS = 2

/** 当前焦点在第几部手机上（没有焦点时为 -1）。 */
function focusedIndex(): number {
  const stage = stageRef.value
  if (!stage || typeof document === 'undefined') return -1
  return [...stage.children].indexOf(document.activeElement as Element)
}

/** 把焦点移到第 index 部手机（越界则不动）。 */
function focusPhone(index: number): void {
  const stage = stageRef.value
  const count = stage?.children.length ?? 0
  if (!stage || index < 0 || index >= count) return
  ;(stage.children[index] as HTMLElement).focus()
}

/**
 * 按方向键移动焦点。
 *
 * 网格是两列、三部手机，最后一行只有一个 —— 所以「往下」在第二列上没有
 * 正下方的手机。这时**就近落到最后一个**，而不是原地不动：玩家按了向下
 * 却什么都没发生，会以为键盘坏了。
 */
function stepFocus(from: number, delta: number): void {
  const count = stageRef.value?.children.length ?? 0
  if (count === 0) return
  if (from === -1) {
    focusPhone(delta >= 0 ? 0 : count - 1)
    return
  }
  const target = from + delta
  if (target >= 0 && target < count) {
    focusPhone(target)
    return
  }
  if (delta > 0 && from < count - 1) focusPhone(count - 1)
}

/**
 * 键盘：Esc 返回 / 取消转场，方向键在桌上的手机之间移动焦点。
 *
 * 方向键移动焦点是**与第一版对齐**的无障碍能力：第一版可以用 ←→ 切卡，
 * 第二版没有「选中态」，但同样要能不用鼠标就走到任意一部手机上。
 * 进关本身是 `Enter` / `Space`，由原生 `<button>` 行为提供，不在这里模拟。
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (flying.value) {
      cancelFlight()
      return
    }
    close()
    return
  }

  const step =
    event.key === 'ArrowRight' ? 1
    : event.key === 'ArrowLeft' ? -1
    : event.key === 'ArrowDown' ? COLUMNS
    : event.key === 'ArrowUp' ? -COLUMNS
    : 0
  if (step === 0) return

  event.preventDefault()
  stepFocus(focusedIndex(), step)
}

onMounted(() => {
  reduceMotion.value =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  clearCommitTimer()
  if (rafId) cancelAnimationFrame(rafId)
  if (typeof globalThis.removeEventListener === 'function') {
    globalThis.removeEventListener('keydown', onKeydown)
  }
})

/** 当前关卡的显示名（用于「返回当前关卡」按钮）。 */
const currentTitle = computed(() => getPlayableLevel(props.currentLevelId)?.meta.title ?? '')
const canReturn = computed(() => props.showReturn && currentTitle.value !== '')
</script>

<template>
  <div ref="rootRef" class="desk" aria-label="关卡大厅">
    <!-- 桌面纹理：纯 CSS，不引入图片 -->
    <div class="desk__surface" aria-hidden="true"></div>

    <header class="desk__head">
      <h1 class="desk__title">关卡大厅</h1>
      <p class="desk__subtitle">选一部手机开始挑战</p>
    </header>

    <div ref="stageRef" class="desk__stage" :class="{ 'desk__stage--flying': flying }">
      <DeskPhone
        v-for="(entry, index) in entries"
        :key="entry.meta.id"
        class="desk__slot"
        :entry="entry"
        :slot="slotOf(entry)"
        :tilt="tiltOf(index)"
        @select="onSelect(index)"
      />
    </div>

    <!-- 锁定提示：点了锁定的手机后出现，明确说明为什么进不去 -->
    <p v-if="lockHint" class="desk__lock" role="status">{{ lockHint }}</p>

    <footer class="desk__foot">
      <p v-if="!lockHint" class="desk__hint">点一下手机，进入这一关</p>
      <button v-if="canReturn" type="button" class="desk__back" @click="close">
        返回当前关卡
      </button>
    </footer>

    <!--
      飞行层：被点的那部手机。
      起始态是卡片机身的矩形（位移 + 缩放 + 卡片自己的倾斜角），
      终态是铺满整个视口（`--go` 类把 transform 归零、机身内缩过渡到 0），
      所以放大结束时屏幕上正好只剩那张共用壁纸 —— 与紧随其后的锁屏同源，
      交接处不会出现颜色跳变。
    -->
    <div
      v-if="flying"
      ref="flyRef"
      class="desk__fly"
      :class="{ 'desk__fly--go': flyingGo, 'desk__fly--fallback': flying.fallback }"
      :style="flying.style"
      aria-hidden="true"
      @transitionend="onTransitionEnd"
    >
      <DeskPhone variant="screen" :entry="flying.entry" :slot="EMPTY_SLOT" />
    </div>
  </div>
</template>

<style scoped>
.desk {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  color: var(--c-on-wall);
  /*
   * 注意：桌面的**底色不在这里**，而是画在下面的 `.desk__surface` 上。
   *
   * 原因：`.desk` 这个元素同时被根壳套上了 `.phone__frame`，而后者带
   * `background: var(--c-desktop-2)`（深蓝黑）。两条规则选择器权重相同，
   * 谁生效取决于样式表顺序 —— 实测是 `.phone__frame` 赢，于是木纹底色被
   * 盖掉，界面变成「深色标题压在深蓝黑底上」几乎看不清
   * （verify 的书桌文字对比度断言就是这么发现的）。
   * 把底色放到子元素 `.desk__surface`（`inset: 0`）上，就不受这条冲突影响。
   */
}

/*
 * 木纹桌面：底色 + 双向细纹理 + 顶部柔光 + 暗角。
 *
 * 底色用 `background-color` 而不是渐变，是为了让自动化能用
 * `getComputedStyle(...).backgroundColor` **可靠地**量到它 ——
 * 从 `background-image` 的渐变字符串里抠色标又脆又容易误判。
 *
 * 2026-10-17 画面打磨：
 * - 纹理从单向一层改成**两向两层**（一层压深、一层提亮），桌子才像有木纹，
 *   而不是一块斜条纹布；
 * - 暗角改成**固定深色**。原来用 `--wall-vignette`，白天主题下那是个白色变量
 *   （为浅色壁纸准备的），压在木桌上会把四边提亮，木头反而显得发灰；
 * - 顶部柔光收窄一点，光斑不要盖住第一排手机的机身。
 */
.desk__surface {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-color: #2e2015;
  background-image:
    /* 细密纹理：压深 */
      repeating-linear-gradient(93deg, rgb(0 0 0 / 6%) 0 1px, transparent 1px 7px),
    /* 细密纹理：提亮（与上一层的角度错开一点，避免摩尔纹那种呆板感） */
      repeating-linear-gradient(99deg, rgb(255 240 214 / 4%) 0 1px, transparent 1px 15px),
    /* 顶部柔光 */
      radial-gradient(120% 52% at 50% -14%, rgb(255 236 200 / 20%), transparent 66%),
    /* 暗角：收住四边，固定深色，两个主题都压暗。
       只压到 26%：再深一点画面两侧的机身会被吞进暗角里 */
      radial-gradient(ellipse 88% 62% at 50% 44%, transparent 46%, rgb(0 0 0 / 26%));
}

/* 白天主题下换成浅色木头，文字仍用同一套 on-wall 变量（自动转深）
   取值让「深色标题 / 浅色木头」的对比度有富余（约 5.5:1，不是刚过 4.5） */
[data-theme='day'] .desk__surface {
  background-color: #b8925f;
}

.desk__head {
  position: relative;
  flex: none;
  /* 顶部多留一点：标题紧贴状态栏会显得压抑 */
  padding: var(--space-4) var(--space-2) var(--space-3);
  text-align: center;
}

.desk__title {
  font-size: var(--font-xl);
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.08em;
  text-shadow: 0 2px 10px rgb(0 0 0 / 22%);
}

.desk__subtitle {
  margin-top: 2px;
  font-size: var(--font-sm);
  letter-spacing: 0.04em;
  color: var(--c-on-wall-soft);
}

/*
 * 桌上的手机。
 *
 * 两列网格，第三部跨两列居中 —— 读起来就是「两部在上一排、一部在下面」，
 * 像随手把手机摆在桌上，而不是一行排开的缩略图。
 *
 * `--phone-max-w` 限住每部手机的宽度，这一步是必须的：整张卡会跟着倾斜角
 * 旋转，铺满格子的宽盒子旋转后会溢出到相邻格子，压住旁边那部手机的文字和
 * 按钮（实拍截图发现的）。收窄居中之后，旋转的溢出量落在格子留白里。
 *
 * `align-items: start` 同样必须：默认 stretch 会把卡片拉成等高，
 * 「还没开始」与「已完成（余额 800 元）」两种不同长度的状态行会把机身
 * 的宽高比拉坏。
 */
.desk__stage {
  --phone-max-w: 124px;

  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--space-4) var(--space-2);
  flex: 1;
  min-height: 0;
  padding: var(--space-4) var(--space-3) var(--space-5);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  transition: opacity 200ms ease;
}

/* 第三部手机单独一排，居中摆放 */
.desk__slot:last-child {
  grid-column: 1 / -1;
}

/* 转场期间：桌上的手机整体淡出，避免与飞行层叠影 */
.desk__stage--flying {
  opacity: 0;
  pointer-events: none;
}

.desk__lock {
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

.desk__foot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  padding: var(--space-3) var(--space-4) calc(var(--space-3) + var(--safe-bottom));
}

.desk__hint {
  font-size: var(--font-xs);
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--c-on-wall-dim);
}

.desk__back {
  width: 100%;
  min-height: var(--tap-min);
  border: 1px solid var(--c-wall-border);
  border-radius: var(--radius-md);
  background: var(--c-wall-surface);
  color: inherit;
  font-size: var(--font-base);
  font-weight: 600;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* ============ 飞行层 ============ */

/*
 * 起始态就是卡片机身的位置与大小（由内联变量算出），终态是铺满视口。
 *
 * 三个要点：
 * 1. `transform: translate(...) scale(...) rotate(...)`，`transform-origin`
 *    是元素中心（默认），所以平移量直接用「卡片中心 - 视口中心」，不需要
 *    再做原点换算；
 * 2. 缩放**非等比**（sx ≠ sy），因为卡片是 9:17、视口不是 —— 只有这样才能
 *    让起点与卡片严丝合缝。代价是旋转时会有极轻微剪切，在 ≤7° 下看不出来；
 * 3. 透明度一起过渡：起始 0 → 终态 1，配合桌上的手机淡出，
 *    交接处不会出现「图标突然消失」的跳变。
 */
.desk__fly {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  opacity: 0;
  --fly-dur: 520ms;
  transform: translate(var(--fly-tx, 0px), var(--fly-ty, 0px)) scale(var(--fly-sx, 1), var(--fly-sy, 1))
    rotate(var(--fly-rot, 0deg));
  transition:
    transform var(--fly-dur) cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity 150ms ease-out;
}

.desk__fly--go {
  opacity: 1;
  transform: translate(0, 0) scale(1, 1) rotate(0deg);
}

/* 终态：机身内缩归零，屏幕上只剩那张与锁屏同源的壁纸 */
.desk__fly--go :deep(.deskphone__body) {
  border-radius: 0;
}

.desk__fly--go :deep(.deskphone__screen) {
  inset: 0;
  border-radius: 0;
}

/* 拿不到有效矩形时的兜底：不做位移，只从略小放大到铺满 */
.desk__fly--fallback {
  transform: scale(0.42) rotate(var(--fly-rot, 0deg));
}

.desk__fly--fallback.desk__fly--go {
  transform: scale(1, 1) rotate(0deg);
}

@media (prefers-reduced-motion: reduce) {
  .desk__stage,
  .desk__fly {
    transition: none;
  }
}
</style>
