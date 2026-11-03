<script setup lang="ts">
import { computed } from 'vue'
import antifraudLogo from '@/assets/antifraud-logo.png'
import type { AppId } from '@/app/navigation'

/**
 * 应用图标（全项目唯一来源）。
 *
 * 图形来自 Material Symbols Rounded / FILL1（Apache-2.0），
 * 底色改为同色相的轻渐变 + 顶部受光 + 内暗边，不再是单色色块。
 * 24px 迷你档会自动压平渐变、去掉高光，避免小尺寸发脏。
 *
 * 根元素沿用 `app__glyph` / `app__glyph--{id}` 类名：
 * verify-edge 会读取尺寸与圆角，所有图标必须保持同一尺寸/圆角。
 */
export type IconId = AppId | 'levels'

const props = withDefaults(
  defineProps<{
    id: IconId
    /** 图标底板边长（px）；内部图形按比例缩放。 */
    size?: number
  }>(),
  { size: 58 },
)

const isBrand = computed(() => props.id === 'manual')

/**
 * 内部图形边长：58px 留出更多呼吸，24px 反而放大以补偿视觉衰减。
 * 圆形/小细节图标在迷你档需要更大的光学尺寸。
 */
const inner = computed(() => {
  const ratio = props.size <= 24 ? 0.66 : props.size <= 42 ? 0.61 : 0.56
  return Math.round(props.size * ratio)
})

/**
 * Material Symbols Rounded FILL1（960 网格）的 path。
 * 来源：@material-symbols/svg-400@0.48.2 / rounded/*-fill.svg
 * 许可证：Apache-2.0，详见 THIRD_PARTY_LICENSES.md。
 */
const ICON_PATHS: Record<Exclude<IconId, 'manual'>, string> = {
  chat:
    'M850-123q-5 0-10.5-2t-10.5-7L721-240H300q-25 0-42.5-17.5T240-300v-80h440q25 0 42.5-17.5T740-440v-280h80q25 0 42.5 17.5T880-660v507q0 14-9.5 22t-20.5 8ZM110-322q-11 0-20.5-8T80-352v-468q0-25 17.5-42.5T140-880h480q25 0 42.5 17.5T680-820v320q0 25-17.5 42.5T620-440H240L131-331q-5 5-10.5 7t-10.5 2Z',
  wallet:
    'M240-160q-66 0-113-47T80-320v-320q0-66 47-113t113-47h480q66 0 113 47t47 113v320q0 66-47 113t-113 47H240Zm0-470h480q29 0 54.5 9t45.5 26v-45q0-42-29-71t-71-29H240q-42 0-71 29t-29 71v45q20-17 45.5-26t54.5-9Zm-97 136 477 115q7 2 14.5.5T647-385l160-134q-13-23-36-37t-51-14H240q-35 0-62 21.5T143-494Z',
  photos:
    'M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Zm86-157h429q9 0 13-8t-1-16L590-457q-5-6-12-6t-12 6L446-302l-81-111q-5-6-12-6t-12 6l-86 112q-6 8-2 16t13 8Zm109.5-307.5Q390-599 390-620t-14.5-35.5Q361-670 340-670t-35.5 14.5Q290-641 290-620t14.5 35.5Q319-570 340-570t35.5-14.5Z',
  phone:
    'M795-120q-116 0-236.5-56T335-335Q232-438 176-558.5T120-795q0-19 13-32t32-13h140q14 0 24 10t14 25l27 126q2 14-.5 25.5T359-634L259-533q26 44 55 82t64 72q37 38 78 69.5t86 55.5l95-98q10-11 23-15t26-2l119 26q15 4 25 16t10 27v135q0 19-13 32t-32 13Z',
  sms: 'M270-400h420q13 0 21.5-8.5T720-430q0-13-8.5-21.5T690-460H270q-13 0-21.5 8.5T240-430q0 13 8.5 21.5T270-400Zm0-130h420q13 0 21.5-8.5T720-560q0-13-8.5-21.5T690-590H270q-13 0-21.5 8.5T240-560q0 13 8.5 21.5T270-530Zm0-130h420q13 0 21.5-8.5T720-690q0-13-8.5-21.5T690-720H270q-13 0-21.5 8.5T240-690q0 13 8.5 21.5T270-660ZM140-240q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h680q24 0 42 18t18 42v668q0 20-18.5 27.5T829-131L720-240H140Z',
  shop:
    'M220-80q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h110v-10q0-63 43.5-106.5T480-880q63 0 106.5 43.5T630-730v10h110q24 0 42 18t18 42v520q0 24-18 42t-42 18H220Zm170-640h180v-10q0-38-26-64t-64-26q-38 0-64 26t-26 64v10Zm231.5 171.5Q630-557 630-570v-90h-60v90q0 13 8.5 21.5T600-540q13 0 21.5-8.5Zm-240 0Q390-557 390-570v-90h-60v90q0 13 8.5 21.5T360-540q13 0 21.5-8.5Z',
  music:
    'M286.5-163.5Q243-207 243-270t43.5-106.5Q330-420 393-420q28 0 50.5 8t39.5 22v-420q0-13 8.5-21.5T513-840h174q13 0 21.5 8.5T717-810v75q0 13-8.5 21.5T687-705H543v435q0 63-43.5 106.5T393-120q-63 0-106.5-43.5Z',
  video:
    'm415-328 218-141q7-5 7-13t-7-13L415-636q-8-5-15.5-.5T392-623v282q0 9 7.5 13.5t15.5-.5ZM140-160q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H140Z',
  levels:
    'M407-383h73q12.75 0 21.38-8.63Q510-400.25 510-413v-103h73q12.75 0 21.38-8.63Q613-533.25 613-546v-104h67q12.75 0 21.38-8.68 8.62-8.67 8.62-21.5 0-12.82-8.62-21.32-8.63-8.5-21.38-8.5h-97q-12.75 0-21.37 8.62Q553-692.75 553-680v103h-73q-12.75 0-21.37 8.62Q450-559.75 450-547v103h-73q-12.75 0-21.37 8.62Q347-426.75 347-414v104h-67q-12.75 0-21.37 8.68-8.63 8.67-8.63 21.5 0 12.82 8.63 21.32 8.62 8.5 21.37 8.5h97q12.75 0 21.38-8.63Q407-267.25 407-280v-103ZM180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Z',
  notifications:
    'M190-200q-13 0-21.5-8.5T160-230q0-13 8.5-21.5T190-260h50v-304q0-84 49.5-150.5T420-798v-22q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v22q81 17 130.5 83.5T720-564v304h50q13 0 21.5 8.5T800-230q0 13-8.5 21.5T770-200H190ZM480-80q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80Z',
  settings:
    'M421-80q-14 0-25-9t-13-23l-15-94q-19-7-40-19t-37-25l-86 40q-14 6-28 1.5T155-226L97-330q-8-13-4.5-27t15.5-23l80-59q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521l-80-59q-12-9-15.5-23t4.5-27l58-104q8-13 22-17.5t28 1.5l86 40q16-13 37-25t40-18l15-95q2-14 13-23t25-9h118q14 0 25 9t13 23l15 94q19 7 40.5 18.5T669-710l86-40q14-6 27.5-1.5T804-734l59 104q8 13 4.5 27.5T852-580l-80 57q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l80 58q12 8 15.5 22.5T863-330l-58 104q-8 13-22 17.5t-28-1.5l-86-40q-16 13-36.5 25.5T592-206l-15 94q-2 14-13 23t-25 9H421Zm59-270q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Z',
}

const iconPath = computed(() => (isBrand.value ? '' : ICON_PATHS[props.id as Exclude<IconId, 'manual'>]))

const style = computed(() => ({
  '--glyph-size': `${props.size}px`,
  '--glyph-inner': `${inner.value}px`,
}))
</script>

<template>
  <span
    class="app__glyph"
    :class="[
      `app__glyph--${id}`,
      { 'app__glyph--brand': isBrand, 'app__glyph--mini': size <= 24 },
    ]"
    :style="style"
    aria-hidden="true"
  >
    <img v-if="isBrand" :src="antifraudLogo" alt="" class="app__logo" />

    <svg v-else viewBox="0 -960 960 960" fill="currentColor">
      <path :d="iconPath" />
    </svg>
  </span>
</template>

<style scoped>
/*
 * 现代简约系统图标：
 * - 同色相轻渐变（不要彩虹渐变）；
 * - 顶部 1px 受光 + 上半片柔光；
 * - 底部内暗边制造厚度；
 * - 1px 深描边 + 柔和投影把图标从壁纸里托起来。
 *
 * 所有尺寸/圆角仍由 --glyph-size 统一计算，verify-edge 会读取这两个值。
 */
.app__glyph {
  --glyph-top: #42584d;
  --glyph-bottom: #2c3d35;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--glyph-size, 58px);
  height: var(--glyph-size, 58px);
  border-radius: calc(var(--glyph-size, 58px) * 0.224);
  color: #f7f0e2;
  background-color: var(--glyph-top);
  background-image:
    radial-gradient(130% 90% at 30% 0%, rgb(255 255 255 / 26%), transparent 58%),
    linear-gradient(158deg, var(--glyph-top), var(--glyph-bottom));
  box-shadow:
    inset 0 2px 2px rgb(255 255 255 / 18%),
    inset 0 -3px 7px rgb(0 0 0 / 24%),
    inset 1px 0 0 rgb(255 255 255 / 10%),
    inset -1px 0 0 rgb(0 0 0 / 12%),
    0 1px 0 rgb(0 0 0 / 28%),
    0 1px 2px rgb(0 0 0 / 24%),
    0 7px 16px -5px rgb(3 8 5 / 46%);
  overflow: hidden;
}

/* 上半片柔光：模拟图标受光，不遮住前景图形 */
.app__glyph::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgb(255 255 255 / 10%), transparent 38%);
}

.app__glyph svg {
  position: relative;
  z-index: 1;
  display: block;
  width: var(--glyph-inner, 34px);
  height: var(--glyph-inner, 34px);
  filter:
    drop-shadow(0 1px 0 rgb(255 255 255 / 12%))
    drop-shadow(0 2px 3px rgb(0 0 0 / 26%));
}

/* ============ 11 个应用的色族（同族分深浅，明度差控制在 10–15%） ============ */

.app__glyph--chat {
  --glyph-top: #357a64;
  --glyph-bottom: #1e4a3c;
}

.app__glyph--wallet {
  --glyph-top: #a87f4a;
  --glyph-bottom: #6f4f2a;
}

.app__glyph--photos {
  --glyph-top: #b87347;
  --glyph-bottom: #7a4428;
}

.app__glyph--phone {
  --glyph-top: #3e8567;
  --glyph-bottom: #24523f;
}

.app__glyph--sms {
  --glyph-top: #487e93;
  --glyph-bottom: #2a4d5c;
}

.app__glyph--shop {
  --glyph-top: #b25a48;
  --glyph-bottom: #743229;
}

.app__glyph--music {
  --glyph-top: #79607f;
  --glyph-bottom: #4a384f;
}

.app__glyph--video {
  --glyph-top: #4a6b86;
  --glyph-bottom: #2b4154;
}

.app__glyph--levels {
  --glyph-top: #7d6748;
  --glyph-bottom: #4b3b29;
}

.app__glyph--notifications {
  --glyph-top: #c08a45;
  --glyph-bottom: #7c5424;
}

.app__glyph--settings {
  --glyph-top: #6d766d;
  --glyph-bottom: #3f4741;
}

/*
 * 24px 迷你档：渐变、柔光、内暗边在 5px 圆角里只会变成脏点，
 * 压平成单色 + 一圈极淡内描边，图形自动放大到 0.66。
 */
.app__glyph--mini {
  background-image: none;
  box-shadow:
    inset 0 0 0 1px rgb(246 239 223 / 16%),
    0 1px 3px rgb(3 8 5 / 22%);
}

.app__glyph--mini::before {
  display: none;
}

.app__glyph--mini svg {
  filter: none;
}

/*
 * 国家反诈中心：官方 logo 自带蓝色方底，直接把整张图作为图标底板。
 * 不套米纸托、不内缩，只用父级圆角裁切 + 统一高光/内暗边，
 * 这样它和其余渐变色图标处在同一套材质语言里。
 */
.app__glyph--brand {
  background-color: #1f4f9e;
  background-image: none;
}

.app__glyph--brand::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  pointer-events: none;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 28%),
    inset 0 -2px 5px rgb(0 0 0 / 18%);
}

.app__logo {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 0;
  filter: brightness(0.94) saturate(0.9);
}
</style>
