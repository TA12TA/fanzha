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
 * 根元素沿用 `app__glyph` / `app__glyph--{id}` 类名：
 * 自动化验证（verify-edge）会读这两个类名下的计算尺寸与圆角。
 * 「国家反诈中心」使用官方 logo 图片，其余为自绘 SVG，不套底板。
 */
const props = withDefaults(
  defineProps<{
    id: AppId
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
    >
      <path d="M3.5 7.2h17v11H3.5Z" stroke-linejoin="round" />
      <path d="M3.5 7.2 15.5 3.8v3.4" stroke-linejoin="round" />
      <circle cx="16.8" cy="12.7" r="1.2" fill="currentColor" stroke="none" />
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
      <!-- 齿轮：中心圆 + 8 个齿 -->
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 2.6l1.4 2.2a7.6 7.6 0 0 1 2.1.9l2.5-.7 1.7 3-1.7 1.9c.1.4.1.8.1 1.2s0 .8-.1 1.2l1.7 1.9-1.7 3-2.5-.7a7.6 7.6 0 0 1-2.1.9L12 21.4l-1.4-2.2a7.6 7.6 0 0 1-2.1-.9l-2.5.7-1.7-3 1.7-1.9A7.9 7.9 0 0 1 6 12c0-.4 0-.8.1-1.2L4.4 8.9l1.7-3 2.5.7a7.6 7.6 0 0 1 2.1-.9Z"
      />
    </svg>
  </span>
</template>

<style scoped>
/*
 * 图标底板：每个应用一块彩色渐变方，外加白色图形。
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
  color: #ffffff;
  background: linear-gradient(150deg, #5a7ea8, #3d5a7d);
  box-shadow: 0 4px 12px rgb(4 10 20 / 30%);
}

.app__glyph svg {
  width: var(--glyph-inner, 34px);
  height: var(--glyph-inner, 34px);
}

.app__glyph--chat {
  background: linear-gradient(150deg, #3f9bf5, #1f6fd0);
}

.app__glyph--wallet {
  background: linear-gradient(150deg, #35b98a, #178a63);
}

.app__glyph--photos {
  background: linear-gradient(150deg, #f0885a, #d15f36);
}

.app__glyph--notifications {
  background: linear-gradient(150deg, #f0b73f, #d18f1c);
}

.app__glyph--settings {
  background: linear-gradient(150deg, #8a93a6, #5f6a7e);
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
