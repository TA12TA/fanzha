<script setup lang="ts">
import type { ShopArt } from '@/data/shop'

/**
 * 虚构商城的商品线稿。纯 SVG、不使用真实商品图或品牌素材。
 * 颜色由外层商品的渐变决定，这里只画白色线条。
 */
defineProps<{ art: ShopArt }>()
</script>

<template>
  <svg
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="art === 'shoe'">
      <path d="M8 42c10 0 12 5 20 5h24c3.5 0 6-2.4 6-5.6 0-3-2.4-5.4-5.4-5.4H39l-7-9-7 2 2.5 9H8Z" />
      <path d="M9 47h48" />
      <path d="M31 33l5 3M27 38l6 3" />
    </template>

    <template v-else-if="art === 'headphones'">
      <path d="M14 34v-4a18 18 0 0 1 36 0v4" />
      <rect x="10" y="32" width="9" height="16" rx="4" />
      <rect x="45" y="32" width="9" height="16" rx="4" />
      <path d="M19 39h3M42 39h3" />
    </template>

    <template v-else-if="art === 'cup'">
      <path d="M20 22h24l-2 28H22Z" />
      <path d="M18 18h28v6H18Z" />
      <path d="M27 12c-2-3 2-4 0-7M36 12c-2-3 2-4 0-7" />
      <path d="M23 33h18" />
    </template>

    <template v-else-if="art === 'bag'">
      <path d="M16 24h32l3 30H13Z" />
      <path d="M23 24v-5a9 9 0 0 1 18 0v5" />
      <path d="M24 38h16v10H24Z" />
      <path d="M24 38h16" />
    </template>

    <template v-else-if="art === 'lamp'">
      <path d="M18 52h28M32 52V30" />
      <path d="M20 30h24l-5-14H25Z" />
      <path d="M32 10v-4M16 16l-3-2M48 16l3-2M14 30H8M50 30h6" />
    </template>

    <template v-else>
      <path d="M25 20h14l2 30H23Z" />
      <path d="M27 14h10v6H27Z" />
      <path d="M23 36h18M24 42h5M24 46h5" />
    </template>
  </svg>
</template>

<style scoped>
svg {
  width: 100%;
  height: 100%;
}
</style>
