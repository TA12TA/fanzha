<script setup lang="ts">
import type { ScenicKind } from '@/data/photos'

/**
 * 自绘风景照片（纯 SVG，无外部资源）。
 *
 * 相册不能是空的，但也不能塞真实照片：真实照片有版权问题、体积大、
 * 还得联网。这里用矢量画 6 幅风景，缩略图与全屏查看器共用同一个组件，
 * 尺寸自适应、放大不糊。
 *
 * 每幅画的渐变 id 用 kind 前缀，保证互相不冲突。
 */
defineProps<{ kind: ScenicKind }>()
</script>

<template>
  <!--
    preserveAspectRatio=slice：让画面填满容器并裁掉多余部分，
    缩略图（正方形）与查看器（4:3）都能用同一份画。
  -->
  <svg
    class="scenic"
    viewBox="0 0 160 120"
    preserveAspectRatio="xMidYMid slice"
    role="presentation"
    focusable="false"
  >
    <!-- ============ 晚霞湖面 ============ -->
    <template v-if="kind === 'lake-sunset'">
      <defs>
        <linearGradient id="lake-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#5b3f7d" />
          <stop offset="0.45" stop-color="#d9705f" />
          <stop offset="1" stop-color="#f7b06a" />
        </linearGradient>
        <linearGradient id="lake-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e79a63" />
          <stop offset="1" stop-color="#2c3f63" />
        </linearGradient>
      </defs>
      <rect width="160" height="80" fill="url(#lake-sky)" />
      <circle cx="112" cy="52" r="13" fill="#ffe7ad" />
      <circle cx="112" cy="52" r="21" fill="#ffe7ad" opacity="0.22" />
      <path d="M0 74 L28 60 L52 74 L84 56 L112 74 L136 64 L160 76 L160 82 L0 82 Z" fill="#39264a" opacity="0.9" />
      <rect y="80" width="160" height="40" fill="url(#lake-water)" />
      <g fill="#ffe7ad" opacity="0.5">
        <rect x="100" y="86" width="24" height="2" rx="1" />
        <rect x="94" y="92" width="34" height="2" rx="1" />
        <rect x="104" y="98" width="20" height="2" rx="1" />
        <rect x="88" y="104" width="42" height="2" rx="1" />
      </g>
    </template>

    <!-- ============ 雪山 ============ -->
    <template v-else-if="kind === 'snow-peak'">
      <defs>
        <linearGradient id="snow-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#9fc4e6" />
          <stop offset="1" stop-color="#e8f3fc" />
        </linearGradient>
      </defs>
      <rect width="160" height="120" fill="url(#snow-sky)" />
      <circle cx="132" cy="24" r="10" fill="#ffffff" opacity="0.75" />
      <path d="M-6 96 L40 34 L86 96 Z" fill="#fbfdff" />
      <path d="M40 34 L58 58 L22 58 Z" fill="#d8e7f4" />
      <path d="M52 100 L104 28 L156 100 Z" fill="#ffffff" />
      <path d="M104 28 L124 58 L84 58 Z" fill="#cfe1f1" />
      <rect y="96" width="160" height="24" fill="#f2f8fe" />
      <path d="M0 96 Q40 88 80 96 Q120 104 160 96 L160 120 L0 120 Z" fill="#e2eef9" />
    </template>

    <!-- ============ 海边日落 ============ -->
    <template v-else-if="kind === 'beach-sunset'">
      <defs>
        <linearGradient id="beach-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#6d6fb0" />
          <stop offset="0.6" stop-color="#f0a06b" />
          <stop offset="1" stop-color="#ffd79a" />
        </linearGradient>
        <linearGradient id="beach-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3f6f9e" />
          <stop offset="1" stop-color="#1f4468" />
        </linearGradient>
      </defs>
      <rect width="160" height="72" fill="url(#beach-sky)" />
      <circle cx="52" cy="56" r="15" fill="#fff0c2" />
      <rect y="72" width="160" height="26" fill="url(#beach-sea)" />
      <g fill="#ffe9bb" opacity="0.45">
        <rect x="40" y="78" width="26" height="2" rx="1" />
        <rect x="34" y="85" width="38" height="2" rx="1" />
        <rect x="46" y="92" width="20" height="2" rx="1" />
      </g>
      <path d="M0 96 Q60 90 160 96 L160 120 L0 120 Z" fill="#efd8b4" />
      <path d="M0 96 Q60 90 160 96 L160 101 Q60 95 0 101 Z" fill="#e2c79d" />
    </template>

    <!-- ============ 城市夜景 ============ -->
    <template v-else-if="kind === 'city-night'">
      <defs>
        <linearGradient id="city-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0a1430" />
          <stop offset="1" stop-color="#2a3d6b" />
        </linearGradient>
      </defs>
      <rect width="160" height="120" fill="url(#city-sky)" />
      <circle cx="130" cy="26" r="10" fill="#f4f1e2" opacity="0.9" />
      <g fill="#ffffff" opacity="0.6">
        <circle cx="30" cy="20" r="1.1" />
        <circle cx="62" cy="14" r="1" />
        <circle cx="96" cy="30" r="1.1" />
        <circle cx="18" cy="44" r="0.9" />
        <circle cx="112" cy="52" r="0.9" />
      </g>
      <g fill="#070f22">
        <rect x="0" y="72" width="26" height="48" />
        <rect x="28" y="58" width="20" height="62" />
        <rect x="50" y="80" width="30" height="40" />
        <rect x="82" y="64" width="22" height="56" />
        <rect x="106" y="86" width="26" height="34" />
        <rect x="134" y="70" width="26" height="50" />
      </g>
      <g fill="#ffd977">
        <rect x="33" y="64" width="4" height="5" />
        <rect x="41" y="64" width="4" height="5" />
        <rect x="33" y="74" width="4" height="5" />
        <rect x="41" y="84" width="4" height="5" />
        <rect x="87" y="70" width="4" height="5" />
        <rect x="95" y="80" width="4" height="5" />
        <rect x="87" y="92" width="4" height="5" />
        <rect x="56" y="86" width="4" height="5" />
        <rect x="66" y="96" width="4" height="5" />
        <rect x="112" y="92" width="4" height="5" />
        <rect x="140" y="76" width="4" height="5" />
        <rect x="150" y="88" width="4" height="5" />
      </g>
    </template>

    <!-- ============ 校园银杏道 ============ -->
    <template v-else-if="kind === 'ginkgo-road'">
      <defs>
        <linearGradient id="ginkgo-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#bcd6ea" />
          <stop offset="1" stop-color="#e6eef5" />
        </linearGradient>
      </defs>
      <rect width="160" height="120" fill="url(#ginkgo-sky)" />
      <g fill="#f0bd3c">
        <circle cx="26" cy="26" r="22" />
        <circle cx="58" cy="16" r="20" />
        <circle cx="92" cy="20" r="24" />
        <circle cx="126" cy="24" r="21" />
        <circle cx="144" cy="42" r="16" />
        <circle cx="14" cy="46" r="16" />
      </g>
      <g fill="#dba62c" opacity="0.7">
        <circle cx="44" cy="34" r="14" />
        <circle cx="108" cy="36" r="15" />
      </g>
      <g fill="#6b4a2f">
        <rect x="20" y="60" width="7" height="60" rx="2" />
        <rect x="132" y="58" width="7" height="62" rx="2" />
      </g>
      <path d="M60 120 L74 62 L86 62 L100 120 Z" fill="#e3d7c2" />
      <path d="M74 62 L86 62 L100 120 L88 120 Z" fill="#d5c6ad" />
      <g fill="#e8a83a" opacity="0.55">
        <rect x="52" y="86" width="6" height="3" rx="1.5" />
        <rect x="104" y="98" width="6" height="3" rx="1.5" />
        <rect x="46" y="106" width="5" height="3" rx="1.5" />
      </g>
    </template>

    <!-- ============ 星空 ============ -->
    <template v-else>
      <defs>
        <linearGradient id="star-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#050b1a" />
          <stop offset="1" stop-color="#1b2f52" />
        </linearGradient>
      </defs>
      <rect width="160" height="120" fill="url(#star-sky)" />
      <ellipse cx="80" cy="46" rx="78" ry="20" fill="#8fa9d8" opacity="0.16" />
      <g fill="#ffffff">
        <circle cx="18" cy="18" r="1.3" opacity="0.95" />
        <circle cx="42" cy="30" r="1" opacity="0.7" />
        <circle cx="66" cy="12" r="1.1" opacity="0.85" />
        <circle cx="88" cy="26" r="1.4" opacity="0.95" />
        <circle cx="112" cy="16" r="1" opacity="0.65" />
        <circle cx="138" cy="32" r="1.2" opacity="0.9" />
        <circle cx="28" cy="48" r="1" opacity="0.6" />
        <circle cx="58" cy="58" r="1.2" opacity="0.8" />
        <circle cx="104" cy="52" r="1" opacity="0.7" />
        <circle cx="130" cy="62" r="1.1" opacity="0.75" />
        <circle cx="12" cy="70" r="1" opacity="0.5" />
        <circle cx="76" cy="76" r="0.9" opacity="0.45" />
        <circle cx="148" cy="78" r="1" opacity="0.5" />
        <circle cx="46" cy="84" r="0.9" opacity="0.4" />
      </g>
      <path d="M0 92 L34 76 L64 92 L96 72 L128 92 L160 80 L160 120 L0 120 Z" fill="#060d1d" />
    </template>
  </svg>
</template>

<style scoped>
.scenic {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
