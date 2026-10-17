<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import { PHOTOS } from '@/data/photos'

/**
 * 相册：本机照片（真实照片，打包为本地资源）。
 *
 * 之前相册是空的（写着「这局用不到它」），空着的相册会让整部手机显得假；
 * 现在放 6 张真实风景照，点开可全屏查看并左右翻页，和真机相册一样。
 *
 * 图片来自公开图库并下载到 `src/assets/photos/`，运行时不联网。
 */
const emit = defineEmits<{ (e: 'back'): void }>()

/** 打开的照片序号；null 表示在网格视图。 */
const openIndex = ref<number | null>(null)

const current = computed(() => (openIndex.value === null ? null : PHOTOS[openIndex.value]))

/** 按日期分组（真机相册就是这样分段的）。 */
const groups = computed(() => {
  const map = new Map<string, typeof PHOTOS>()
  for (const photo of PHOTOS) {
    const list = map.get(photo.date) ?? []
    list.push(photo)
    map.set(photo.date, list)
  }
  return [...map.entries()].map(([date, photos]) => ({ date, photos }))
})

function open(index: number): void {
  openIndex.value = index
}

function close(): void {
  openIndex.value = null
}

/** 左右翻页（到边界就停住，不做循环，避免误解为无限相册）。 */
function step(delta: number): void {
  if (openIndex.value === null) return
  const next = openIndex.value + delta
  if (next < 0 || next >= PHOTOS.length) return
  openIndex.value = next
}

/** Esc 关闭查看器。 */
function onKeydown(event: KeyboardEvent): void {
  if (openIndex.value === null) return
  if (event.key === 'Escape') close()
  else if (event.key === 'ArrowLeft') step(-1)
  else if (event.key === 'ArrowRight') step(1)
}

onMounted(() => {
  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  globalThis.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <section class="album" aria-label="相册">
    <AppHeader title="相册" :subtitle="`${PHOTOS.length} 张照片`" show-back @back="emit('back')" />

    <div class="album__body">
      <section v-for="group in groups" :key="group.date" class="album__group">
        <h2 class="album__date">{{ group.date }}</h2>
        <ul class="album__grid">
          <li v-for="photo in group.photos" :key="photo.id">
            <button
              type="button"
              class="thumb"
              :aria-label="`查看照片：${photo.title}`"
              @click="open(PHOTOS.indexOf(photo))"
            >
              <img :src="photo.src" :alt="photo.title" class="thumb__img" loading="lazy" />
            </button>
          </li>
        </ul>
      </section>
    </div>

    <!-- 全屏查看器 -->
    <div v-if="current" class="viewer" role="dialog" aria-modal="true" :aria-label="current.title">
      <header class="viewer__head">
        <span class="viewer__title">{{ current.title }}</span>
        <button type="button" class="viewer__close" aria-label="关闭照片" @click="close">✕</button>
      </header>

      <div class="viewer__stage">
        <img :src="current.src" :alt="current.title" class="viewer__img" />
      </div>

      <footer class="viewer__foot">
        <button
          type="button"
          class="viewer__nav"
          aria-label="上一张"
          :disabled="openIndex === 0"
          @click="step(-1)"
        >
          上一张
        </button>
        <span class="viewer__index">第 {{ (openIndex ?? 0) + 1 }} / {{ PHOTOS.length }} 张</span>
        <button
          type="button"
          class="viewer__nav"
          aria-label="下一张"
          :disabled="openIndex === PHOTOS.length - 1"
          @click="step(1)"
        >
          下一张
        </button>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.album {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--c-surface);
}

.album__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
  padding: var(--space-3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.album__date {
  margin-bottom: var(--space-2);
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--c-text-soft);
}

.album__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.thumb {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  padding: 0;
  border: 0;
  border-radius: 2px;
  overflow: hidden;
  background: var(--c-surface-2);
}

.thumb:active {
  opacity: 0.8;
}

.thumb__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ============ 全屏查看器 ============ */

.viewer {
  position: absolute;
  inset: 0;
  z-index: 45;
  display: flex;
  flex-direction: column;
  background: #0b0f16;
  color: #f2f5f9;
}

.viewer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex: none;
  min-height: var(--tap-min);
  padding: var(--space-1) var(--space-2);
}

.viewer__title {
  font-size: var(--font-base);
  font-weight: 600;
}

.viewer__close {
  width: var(--tap-min);
  height: var(--tap-min);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: #f2f5f9;
  font-size: var(--font-md);
}

.viewer__stage {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #000;
}

.viewer__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.viewer__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex: none;
  padding: var(--space-2) var(--space-3);
  padding-bottom: calc(var(--space-2) + var(--safe-bottom));
}

.viewer__nav {
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border: 1px solid rgb(255 255 255 / 26%);
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font-size: var(--font-sm);
}

.viewer__nav:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.viewer__index {
  font-size: var(--font-xs);
  color: rgb(242 245 249 / 76%);
  font-variant-numeric: tabular-nums;
}
</style>
