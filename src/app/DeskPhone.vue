<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { levelCardAriaLabel, levelCtaText, levelStatusText, isLevelLocked } from '@/app/levelCardText'
import type { LevelEntry } from '@/game/level'
import type { LevelSlotSummary } from '@/game/storage'

/**
 * 书桌上的「一部手机」。
 *
 * 两种形态，共用同一套机身与屏幕样式：
 * - `card`：桌面上的可点卡片（机身 + 屏幕 + 关号/标题/状态 + 行动条），整块是一个 `<button>`；
 * - `screen`：只有机身与屏幕（不含文字与图标），给转场里的**飞行层**用 ——
 *   它由父级定位与缩放，因此起点能与卡片机身的矩形严丝合缝地对上。
 *
 * 视觉要点：
 * - **机身用关卡主色**（`meta.accent` 渐变）—— 三部手机靠机身颜色区分；
 * - **屏幕用真机那张共用壁纸**（`styles/wallpaper.css` 的 `.wall`），
 *   这样飞行层放大到覆盖全屏时，屏幕内容与紧随其后的锁屏是同源的，
 *   交接处不会出现颜色跳变（这是把用户「旋转放大覆盖全屏」做顺的关键）；
 * - 屏幕相对机身用**百分比内缩**，因此缩放时边框粗细按比例一起变，
 *   飞行层可以直接把内缩过渡到 0，不需要按缩放比反算像素值；
 * - **立体感靠三层光影**：机身曲面的受光/背光、机身底部的厚度边、桌面上的
 *   接触阴影与环境影；屏幕再叠一层很淡的玻璃反光。反光只在卡片态出现，
 *   飞行层放大到全屏时关闭，避免整屏出现一道亮带。
 */
const props = withDefaults(
  defineProps<{
    entry: LevelEntry
    slot: LevelSlotSummary
    /** 倾斜角（度）。桌面上的手机会被摆成轻微不同的角度。 */
    tilt?: number
    /** `card` = 桌面卡片；`screen` = 只给飞行层用。 */
    variant?: 'card' | 'screen'
    /** 迷你状态栏显示的实时北京时间；由大厅统一传入。 */
    clock?: string
  }>(),
  { tilt: 0, variant: 'card', clock: '9:41' },
)

const emit = defineEmits<{ (e: 'select'): void }>()

const locked = computed(() => isLevelLocked(props.entry))

const statusText = computed(() => levelStatusText(props.entry, props.slot))
const ctaText = computed(() => levelCtaText(props.entry, props.slot))
const ariaLabel = computed(() => levelCardAriaLabel(props.entry, props.slot))

/** 机身/屏幕的配色与倾斜都走内联变量，方便父级与测试读取。 */
const style = computed(() => ({
  '--tilt': `${props.tilt}deg`,
  '--accent-a': props.entry.meta.accent[0],
  '--accent-b': props.entry.meta.accent[1],
}))

/** 迷你应用图标（纯装饰，不进无障碍树）。 */
const miniApps = [
  { id: 'chat' as const },
  { id: 'wallet' as const },
  { id: 'manual' as const },
  { id: 'levels' as const },
]
</script>

<template>
  <!-- ===== 飞行层用：只有机身与屏幕 ===== -->
  <span
    v-if="variant === 'screen'"
    class="deskphone deskphone--screen"
    :style="style"
    aria-hidden="true"
  >
    <span class="deskphone__body">
      <span class="deskphone__screen">
        <span class="wall">
          <span class="wall__sky"></span>
          <span class="wall__hills"></span>
          <span class="wall__glow"></span>
        </span>
      </span>
    </span>
  </span>

  <!-- ===== 桌面上的可点卡片 ===== -->
  <button
    v-else
    type="button"
    class="deskphone"
    :class="{ 'deskphone--locked': locked }"
    :style="style"
    :aria-label="ariaLabel"
    :aria-disabled="locked ? 'true' : undefined"
    @click="emit('select')"
  >
    <span class="deskphone__body">
      <!-- 听筒：机身顶部的小横条，一眼看出这是手机而不是普通卡片 -->
      <span class="deskphone__earpiece" aria-hidden="true"></span>

      <span class="deskphone__screen">
        <span class="deskphone__statusbar" aria-hidden="true">
          <span class="deskphone__clock">{{ clock }}</span>
          <span class="deskphone__battery">78%</span>
        </span>

        <span class="wall" aria-hidden="true">
          <span class="wall__sky"></span>
          <span class="wall__hills"></span>
          <span class="wall__glow"></span>
        </span>

        <span class="deskphone__icons" aria-hidden="true">
          <AppIcon v-for="app in miniApps" :key="app.id" :id="app.id" :size="24" />
        </span>

        <!-- 实时预览：这部手机里当前可支配的模拟余额（未开始时不显示） -->
        <span v-if="slot.started && slot.balance !== null" class="deskphone__live" aria-hidden="true">
          ¥{{ slot.balance }}
        </span>

        <span v-if="locked" class="deskphone__lock" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="5.4" y="10.6" width="13.2" height="9" rx="2.4" />
            <path d="M8.4 10.6V8a3.6 3.6 0 0 1 7.2 0v2.6" stroke-linecap="round" />
          </svg>
        </span>
      </span>
    </span>

    <span class="deskphone__info">
      <span class="deskphone__ordinal">{{ entry.meta.ordinal }} · {{ entry.meta.category }}</span>
      <span class="deskphone__title">{{ entry.meta.title }}</span>
      <span class="deskphone__status">{{ statusText }}</span>
    </span>

    <span class="deskphone__cta">{{ ctaText }}</span>
  </button>
</template>

<style scoped>
.deskphone {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  /*
   * 宽度由父级用 `--phone-max-w` 控制，并在格子里居中。
   *
   * 为什么不让它铺满格子：整张卡（含文字与行动条）会跟着倾斜角一起旋转，
   * 一个铺满格子的宽盒子旋转后会**溢出到相邻格子**，把旁边那部手机的文字
   * 和按钮压住（实拍截图发现的）。把卡片本身收窄、居中，旋转的溢出量
   * 就落在格子的留白里了。
   */
  width: var(--phone-max-w, 100%);
  margin-inline: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  /* 摆在桌上的手机：轻微不同角度 */
  transform: rotate(var(--tilt, 0deg));
  transition: transform var(--dur-base) ease;
}

/* ============ 机身 ============ */

/*
 * 机身 = 关卡主色渐变 + 圆角。
 * 屏幕用百分比内缩，所以整块可以自由缩放而不需要重算像素。
 */
.deskphone__body {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 9 / 17;
  border-radius: 22px;
  padding: 0;
  background:
    /* 曲面明暗：左上受光、右下背光，机身因此不是一块纯色渐变 */
    linear-gradient(
      145deg,
      rgb(255 255 255 / 26%) 0%,
      rgb(255 255 255 / 4%) 28%,
      transparent 52%,
      rgb(0 0 0 / 22%) 100%
    ),
    linear-gradient(165deg, var(--accent-a), var(--accent-b));
  box-shadow:
    /* 机身厚度：底部两层窄边，让手机像一块有厚度的机身而不是贴纸 */
      0 2px 0 rgb(0 0 0 / 28%),
    0 4px 0 rgb(0 0 0 / 14%),
    /* 近距离接触阴影：紧贴机身底部 */
      0 10px 18px -6px rgb(0 0 0 / 50%),
    /* 远处环境影：把手机从桌面上「抬起来」 */
      0 24px 38px -14px rgb(0 0 0 / 45%),
    /* 顶部高光与底部暗边：金属/玻璃边框的受光关系 */
      inset 0 1px 0 rgb(255 255 255 / 38%),
    inset 0 -1px 0 rgb(0 0 0 / 32%),
    /* 左右边缘的曲面高光/暗边 */
      inset 1px 0 0 rgb(255 255 255 / 14%),
    inset -1px 0 0 rgb(0 0 0 / 18%),
    /* 一圈内描边勾出机身轮廓 */
      inset 0 0 0 1px rgb(255 255 255 / 18%);
  /*
   * 圆角也跟着转场时长过渡，让飞行层放大到全屏时机身「摊平」成整块屏幕。
   * 普通卡片上 `--fly-dur` 没有定义，回退到 0ms —— 也就是不参与动画。
   */
  transition: border-radius var(--fly-dur, 0ms) cubic-bezier(0.22, 0.61, 0.36, 1);
}

/*
 * 桌面上的**落地投影**：机身正下方一枚压扁的椭圆阴影。
 *
 * 只有 `box-shadow` 时，手机看起来是「贴在屏幕上的一张图」；补一枚离机身很近、
 * 边缘发虚的地面阴影，才会被读成「一部手机平放在桌面上」。
 * 伪元素实现，不改 DOM。
 */
.deskphone__body::after {
  content: '';
  position: absolute;
  left: 2%;
  right: 2%;
  /* 只占机身下方那一段（卡片里正是 8px 的 gap），不会压到下面的关号 */
  bottom: -8px;
  height: 16px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at 50% 38%,
    rgb(0 0 0 / 52%) 0%,
    rgb(0 0 0 / 26%) 48%,
    transparent 74%
  );
  filter: blur(2.5px);
  pointer-events: none;
}

/* 听筒：机身顶部居中的一小段深色横条 */
.deskphone__earpiece {
  position: absolute;
  top: 5px;
  left: 50%;
  width: 24%;
  height: 4px;
  border-radius: 999px;
  background: rgb(6 12 22 / 46%);
  box-shadow: 0 1px 0 rgb(255 255 255 / 12%);
  transform: translateX(-50%);
}

/* ============ 屏幕 ============ */

.deskphone__screen {
  position: absolute;
  inset: 3.5%;
  border-radius: 17px;
  overflow: hidden;
  background: #0b1424;
  /*
   * 屏幕比机身低一档：
   * - 外圈 1px 深色 + 短投影 = 屏幕嵌进机身的接缝；
   * - 内阴影 = 玻璃凹进去的层次；
   * - 底部 1px 高光 = 屏幕边缘的玻璃反光。
   */
  box-shadow:
    0 0 0 1px rgb(6 12 22 / 55%),
    0 1px 3px rgb(0 0 0 / 45%),
    inset 0 2px 10px rgb(0 0 0 / 38%),
    inset 0 -1px 0 rgb(255 255 255 / 8%);
  /*
   * 飞行层放大时把内缩过渡到 0（机身因此「消失」，只剩屏幕）。
   * 用百分比而不是像素：缩放时边框粗细会按比例一起变，
   * 所以不需要按缩放比反算像素值。普通卡片上 `--fly-dur` 未定义 → 不参与动画。
   */
  transition:
    inset var(--fly-dur, 0ms) cubic-bezier(0.22, 0.61, 0.36, 1),
    border-radius var(--fly-dur, 0ms) cubic-bezier(0.22, 0.61, 0.36, 1);
}

/*
 * 玻璃反光：一层斜向高光 + 左上角一小片柔光。
 * z-index 放在状态栏/图标（z-index: 2）之下、壁纸之上，
 * 既有玻璃质感，又不会把迷你图标和锁图标洗淡。
 */
.deskphone__screen::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(
      122deg,
      rgb(255 255 255 / 20%) 0%,
      rgb(255 255 255 / 7%) 14%,
      transparent 38%
    ),
    radial-gradient(80% 45% at 28% 6%, rgb(255 255 255 / 14%), transparent 70%);
}

.deskphone__statusbar {
  position: absolute;
  inset: 0 0 auto 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px;
  background: rgb(6 12 22 / 34%);
  color: #f2f6fb;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.deskphone__clock {
  font-weight: 600;
}

.deskphone__icons {
  position: absolute;
  z-index: 2;
  inset: 34% 14% auto 14%;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  justify-items: center;
}

/* 桌面上的实时余额小标签：只做“这块屏幕在反映存档状态”的提示 */
.deskphone__live {
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 2;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgb(6 12 22 / 48%);
  color: #fff;
  font-size: 8px;
  font-weight: 700;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.deskphone__lock {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(6 12 22 / 52%);
  color: #fff;
}

/* ============ 手机下方的信息 ============ */

.deskphone__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.deskphone__ordinal {
  font-size: var(--font-xs);
  font-weight: 500;
  color: var(--c-on-wall-soft);
}

.deskphone__title {
  font-size: var(--font-md);
  font-weight: 800;
  line-height: 1.25;
}

.deskphone__status {
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--c-on-wall-accent);
}

.deskphone__cta {
  display: block;
  padding: 8px var(--space-2);
  border: 1px solid rgb(255 255 255 / 40%);
  border-radius: var(--radius-md);
  /* 略微半透明：纯白块压在木桌上会显得像贴纸，留一点底色透出来更自然 */
  background: rgb(255 255 255 / 94%);
  color: #16202e;
  font-size: var(--font-sm);
  font-weight: 700;
  text-align: center;
  box-shadow: 0 2px 8px rgb(0 0 0 / 18%);
}

/* ============ 锁定 / 飞行层 ============ */

.deskphone--locked {
  /*
   * 锁定关卡整体降饱和，与可玩的区分开。
   * 亮度只压到 0.94：再压就变成一团深棕，机身主色和屏幕内容都糊掉了 ——
   * 「不可进入」应该一眼看出，但不该看着像坏掉的机器。
   */
  filter: saturate(0.4) brightness(0.94);
}

.deskphone--locked .deskphone__cta {
  border-color: rgb(255 255 255 / 22%);
  background: rgb(255 255 255 / 22%);
  color: var(--c-on-wall-soft);
  box-shadow: none;
}

/*
 * 飞行层形态：只保留机身与屏幕，铺满父级（父级负责定位与缩放）。
 * 这里所有尺寸都用百分比，缩放时边框粗细会按比例一起变 ——
 * 于是飞行层可以把 `inset` 过渡到 0，让「机身」在放大过程中自然消失。
 *
 * 注意要覆盖掉卡片态的 `width: var(--phone-max-w)`：飞行层必须铺满父级。
 */
.deskphone--screen {
  width: 100%;
  margin-inline: 0;
  height: 100%;
  transform: none;
}

.deskphone--screen .deskphone__body {
  height: 100%;
  aspect-ratio: auto;
}

/* 飞行层是「屏幕上的一块」，不需要落地投影（放大到全屏时它会变成屏幕边缘的一团脏影） */
.deskphone--screen .deskphone__body::after {
  display: none;
}

/* 全屏过渡时玻璃反光会变成一道盖住锁屏的亮带，飞行层不显示 */
.deskphone--screen .deskphone__screen::before {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .deskphone {
    transition: none;
  }
}
</style>
