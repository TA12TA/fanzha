<script setup lang="ts">
import { computed } from 'vue'
import antifraudLogo from '@/assets/antifraud-logo.png'
import type { AppId } from '@/app/navigation'

/**
 * 应用图标（全项目唯一来源）。
 *
 * 桌面网格、程序坞、最近任务面板、通知中心都从这里取图标，
 * 避免同一批图标在多个组件里各画一份导致风格漂移。
 *
 * `levels` 是桌面上的「关卡」入口（打开关卡大厅），它不是一个应用，
 * 因此不属于 `AppId`，但同样需要图标与角标样式。
 *
 * 根元素沿用 `app__glyph` / `app__glyph--{id}` 类名：
 * 自动化验证（verify-edge）会读这两个类名下的计算尺寸与圆角。
 * 「国家反诈中心」使用官方 logo 图片，其余为自绘 SVG，不套底板。
 *
 * 所有自绘 SVG 统一 24×24 viewBox、1.7px 线性描边，底板与 SVG 都用等宽高，
 * 不允许非等比缩放；`display: block` 避免 inline SVG 的基线偏移造成视觉变形。
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

    <svg
      v-else-if="id === 'chat'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
    >
      <path d="M3.6 6.2h16.8v10.4H8.8l-4 3.4v-3.4H3.6Z" stroke-linejoin="round" />
    </svg>

    <svg
      v-else-if="id === 'wallet'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>

    <svg
      v-else-if="id === 'photos'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
    >
      <path d="M3.8 5.4h16.4v13.2H3.8Z" stroke-linejoin="round" />
      <path d="M3.8 15.2l4.6-4.2 4 3.4 3-2.6 4.8 4.2" stroke-linejoin="round" />
      <circle cx="8.6" cy="9" r="1.3" />
    </svg>

    <svg
      v-else-if="id === 'phone'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    </svg>

    <svg
      v-else-if="id === 'sms'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4.2 5h15.6v9.6H9.4L4.2 18.8Z" />
      <path d="M8.4 9.8h.01M12 9.8h.01M15.6 9.8h.01" stroke-width="2.4" />
    </svg>

    <svg
      v-else-if="id === 'shop'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4.6 8.4h14.8l-1.3 11.2H5.9Z" />
      <path d="M8.9 8.4V6.6a3.1 3.1 0 0 1 6.2 0v1.8" />
      <path d="M9.2 12.4h5.6" opacity=".7" />
    </svg>

    <svg
      v-else-if="id === 'music'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M9.2 17.6V6.4l9.1-2v11.2" />
      <path d="M9.2 9.5l9.1-2" />
      <circle cx="6.9" cy="18" r="2.3" />
      <circle cx="16" cy="16" r="2.3" />
    </svg>

    <svg
      v-else-if="id === 'video'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2.6" />
      <path d="m10 9.4 4.8 2.6-4.8 2.6Z" fill="currentColor" stroke="none" />
    </svg>

    <svg
      v-else-if="id === 'levels'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linejoin="round"
    >
      <!-- 关卡：三级台阶 + 顶端小旗（「闯关」的通用图形，不涉及任何真实品牌） -->
      <path d="M3.6 19.4h4.2v-4.2H3.6z" />
      <path d="M9.9 19.4h4.2V10.4H9.9z" />
      <path d="M16.2 19.4h4.2V6.6h-4.2z" />
      <path d="M16.2 6.6 20.4 4.4v4.4z" fill="currentColor" stroke="none" />
    </svg>

    <svg
      v-else-if="id === 'notifications'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
    >
      <path d="M6.4 16.4V10.6a5.6 5.6 0 0 1 11.2 0v5.8Z" stroke-linejoin="round" />
      <path d="M4.8 16.4h14.4" stroke-linecap="round" />
      <path d="M10.2 19.2a1.9 1.9 0 0 0 3.6 0" stroke-linecap="round" />
    </svg>

    <svg
      v-else
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <!-- 设置：三条滑杆 + 旋钮，比齿轮在 14px 小尺寸下更容易辨认 -->
      <path d="M4 7h3M11 7h9M4 12h1M9 12h11M4 17h9M17 17h3" />
      <circle cx="9" cy="7" r="2" />
      <circle cx="7" cy="12" r="2" />
      <circle cx="15" cy="17" r="2" />
    </svg>
  </span>
</template>

<style scoped>
/*
 * 图标底板：每个应用一块哑光色方，外加米白图形；不使用高光渐变。
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

/* 关卡入口：用紫罗兰色与六个应用区分开（它不是一个「应用」） */
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
