<script setup lang="ts">
import type { VideoArt } from '@/data/video'

/**
 * 虚构视频封面的线稿。纯 SVG、不使用真实影像或第三方素材。
 * 封面底板颜色由外层渐变负责。
 */
defineProps<{ art: VideoArt }>()
</script>

<template>
  <svg
    viewBox="0 0 160 100"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <template v-if="art === 'city'">
      <circle cx="125" cy="22" r="8" />
      <path d="M8 82h144M18 82V47h16v35M40 82V34h20v48M66 82V54h14v28M86 82V42h22v40M114 82V58h16v24" />
      <path d="M46 44h8M46 54h8M46 64h8M92 52h10M92 62h10" />
      <path d="M8 90h144" opacity=".5" />
    </template>

    <template v-else-if="art === 'sea'">
      <circle cx="112" cy="28" r="14" />
      <path d="M8 64c18-8 34 8 52 0s34 8 52 0 26 2 40-2" />
      <path d="M8 76c18-8 34 8 52 0s34 8 52 0 26 2 40-2" opacity=".65" />
      <path d="M8 88h144" opacity=".4" />
      <path d="M50 38c6-6 12-6 18 0" opacity=".7" />
    </template>

    <template v-else-if="art === 'food'">
      <path d="M30 52h64c0 22-14 30-32 30S30 74 30 52Z" />
      <path d="M26 52h72M44 40c-3-6 4-8 1-14M64 40c-3-6 4-8 1-14M84 40c-3-6 4-8 1-14" />
      <path d="M110 30l16 50M120 26l8 54" />
      <path d="M114 84h26" />
    </template>

    <template v-else-if="art === 'music'">
      <path d="M58 74V30l42-10v44" />
      <path d="M58 42l42-10" />
      <ellipse cx="48" cy="76" rx="10" ry="7" />
      <ellipse cx="90" cy="66" rx="10" ry="7" />
      <path d="M116 42v-16M124 50V26M132 46V34" opacity=".65" />
    </template>

    <template v-else-if="art === 'road'">
      <path d="M8 84 50 30l22 26 20-20 26 48" />
      <path d="M62 84c6-16 18-20 24-34 4-10 14-12 22-8" opacity=".8" />
      <path d="M8 92h144" opacity=".35" />
      <path d="M44 34l6-8 6 8" opacity=".6" />
    </template>

    <template v-else>
      <path d="M30 82V44l28-14 28 14v38" />
      <path d="M40 82V54h12v28M64 54h12v28M84 82V58h10v24" />
      <path d="M28 44 58 30l30 14" />
      <path d="M116 82V62m0-10a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z" />
      <path d="M20 82h120" opacity=".5" />
    </template>
  </svg>
</template>

<style scoped>
svg {
  width: 100%;
  height: 100%;
}
</style>
