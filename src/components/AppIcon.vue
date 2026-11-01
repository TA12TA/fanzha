<script setup lang="ts">
import { computed } from 'vue'
import antifraudLogo from '@/assets/antifraud-logo.png'
import type { AppId } from '@/app/navigation'

/**
 * 应用图标（全项目唯一来源）。
 *
 * 桌面网格、程序坞、最近任务面板、桌面迷你屏都从这里取图标，
 * 避免同一批图标在多个组件里各画一份导致风格漂移。
 *
 * 本分支（feat/icons-open-source）使用 Google Material Symbols 的
 * filled 图标作为图形来源，许可证为 Apache-2.0，详见根目录
 * THIRD_PARTY_LICENSES.md。图标以 960 网格内联，`fill="currentColor"`，
 * 因此仍然跟随底板的前景色，不依赖外链或运行时字体。
 *
 * `levels` 是桌面上的「关卡」入口（打开关卡大厅），它不是一个应用，
 * 因此不属于 `AppId`，但同样需要图标与角标样式。
 *
 * 根元素沿用 `app__glyph` / `app__glyph--{id}` 类名：
 * 自动化验证（verify-edge）会读这两个类名下的计算尺寸与圆角。
 * 「国家反诈中心」使用官方 logo 图片，其余为内联矢量图标，不套底板。
 *
 * 所有矢量图标统一 960×960 viewBox、等宽高；`display: block` 避免
 * inline SVG 的基线偏移造成视觉变形。
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

/** 内部图形边长：保持与底板 58:34 的原比例。 */
const inner = computed(() => Math.round(props.size * 0.59))

type VectorIconId = Exclude<IconId, 'manual'>

/**
 * Material Symbols filled（960 网格）的 path。
 * 来源：@material-symbols/svg-400@0.48.2 / outlined/*-fill.svg
 * 原始 path 逐字内联，未做几何修改；许可证见 THIRD_PARTY_LICENSES.md。
 */
const ICON_PATHS: Record<VectorIconId, string> = {
  chat: 'M80-80v-740q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H240L80-80Z',
  wallet:
    'M180-120q-23 0-41.5-18T120-180v-600q0-23 18.5-41.5T180-840h600q24 0 42 18.5t18 41.5v54H538q-58 0-96 38t-38 95v227q0 57 38 95t96 38h302v53q0 24-18 42t-42 18H180Zm358-173q-34 0-54-20t-20-53v-227q0-34 20-53.5t54-19.5h269q34 0 54 19.5t20 53.5v227q0 33-20 53t-54 20H538Zm158.5-142.5Q716-455 716-481q0-25-19.5-44T652-544q-25 0-44.5 19T588-481q0 26 19.5 45.5T652-416q25 0 44.5-19.5Z',
  photos:
    'M345-377h391L609-548 506-413l-68-87-93 123Zm-85 177q-24 0-42-18t-18-42v-560q0-24 18-42t42-18h560q24 0 42 18t18 42v560q0 24-18 42t-42 18H260ZM140-80q-24 0-42-18t-18-42v-620h60v620h620v60H140Z',
  phone:
    'M795-120q-116 0-236.5-56T335-335Q232-438 176-558.5T120-795q0-19 13-32t32-13h140q14 0 24 10t14 25l27 126q2 14-.5 25.5T359-634L259-533q26 44 55 82t64 72q37 38 78 69.5t86 55.5l95-98q10-11 23-15t26-2l119 26q15 4 25 16t10 27v135q0 19-13 32t-32 13Z',
  sms: 'M80-80v-740q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H240L80-80Zm254.5-454.5Q346-546 346-563t-11.5-28.5Q323-603 306-603t-28.5 11.5Q266-580 266-563t11.5 28.5Q289-523 306-523t28.5-11.5Zm177 0Q523-546 523-563t-11.5-28.5Q500-603 483-603t-28.5 11.5Q443-580 443-563t11.5 28.5Q466-523 483-523t28.5-11.5Zm170 0Q693-546 693-563t-11.5-28.5Q670-603 653-603t-28.5 11.5Q613-580 613-563t11.5 28.5Q636-523 653-523t28.5-11.5Z',
  shop:
    'M220-80q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h110v-10q0-63 43.5-106.5T480-880q63 0 106.5 43.5T630-730v10h110q24 0 42 18t18 42v520q0 24-18 42t-42 18H220Zm170-640h180v-10q0-38-26-64t-64-26q-38 0-64 26t-26 64v10Zm231.5 171.5Q630-557 630-570v-90h-60v90q0 13 8.5 21.5T600-540q13 0 21.5-8.5Zm-240 0Q390-557 390-570v-90h-60v90q0 13 8.5 21.5T360-540q13 0 21.5-8.5Z',
  music:
    'M286.5-163.5Q243-207 243-270t43.5-106.5Q330-420 393-420q28 0 50.5 8t39.5 22v-450h234v135H543v435q0 63-43.5 106.5T393-120q-63 0-106.5-43.5Z',
  video:
    'm392-313 260-169-260-169v338ZM140-160q-24 0-42-18t-18-42v-520q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H140Z',
  levels:
    'M250-250h157v-133h103v-133h103v-134h97v-60H553v133H450v133H347v134h-97v60Zm-70 130q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Z',
  notifications:
    'M160-200v-60h80v-304q0-84 49.5-150.5T420-798v-22q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v22q81 17 130.5 83.5T720-564v304h80v60H160ZM480-80q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80Z',
  settings:
    'M427-120v-225h60v83h353v60H487v82h-60Zm-307-82v-60h247v60H120Zm187-166v-82H120v-60h187v-84h60v226h-60Zm120-82v-60h413v60H427Zm166-165v-225h60v82h187v60H653v83h-60Zm-473-83v-60h413v60H120Z',
}

const iconPath = computed(() => (isBrand.value ? '' : ICON_PATHS[props.id as VectorIconId]))

const style = computed(() => ({
  '--glyph-size': `${props.size}px`,
  '--glyph-inner': `${inner.value}px`,
}))
</script>

<template>
  <span
    class="app__glyph"
    :class="[`app__glyph--${id}`, { 'app__glyph--brand': isBrand }]"
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
 * 图标底板：每个应用一块哑光色方，外加米白图形。
 * 本分支保留 main 的单色底板；图形换成 Material Symbols filled。
 * 「国家反诈中心」用官方 logo 图片，不再叠底板。
 */
.app__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--glyph-size, 58px);
  height: var(--glyph-size, 58px);
  border-radius: calc(var(--glyph-size, 58px) * 0.2414);
  color: #f7f0e2;
  background: #42584d;
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / 14%),
    0 3px 8px rgb(3 8 5 / 24%);
}

.app__glyph svg {
  display: block;
  width: var(--glyph-inner, 34px);
  height: var(--glyph-inner, 34px);
}

.app__glyph--chat {
  background: #2f6b58;
}

.app__glyph--wallet {
  background: #9a7440;
}

.app__glyph--photos {
  background: #a9663f;
}

.app__glyph--phone {
  background: #36775c;
}

.app__glyph--sms {
  background: #3f6f82;
}

.app__glyph--shop {
  background: #a24d3e;
}

.app__glyph--music {
  background: #6a516f;
}

.app__glyph--video {
  background: #3f5d75;
}

/* 关卡入口：用暖褐色与普通应用区分开（它不是一个「应用」） */
.app__glyph--levels {
  background: #6f5a3e;
}

.app__glyph--notifications {
  background: #b07b3a;
}

.app__glyph--settings {
  background: #5e675f;
}

.app__glyph--brand {
  background: transparent;
  box-shadow: none;
}

.app__logo {
  display: block;
  width: var(--glyph-size, 58px);
  height: var(--glyph-size, 58px);
  border-radius: calc(var(--glyph-size, 58px) * 0.2414);
}
</style>
