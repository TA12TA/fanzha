<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import VideoArt from '@/components/VideoArt.vue'
import { VIDEO_CATEGORIES, VIDEOS, type VideoItem } from '@/data/video'
import { playSound } from '@/app/sound'

/**
 * 虚构视频应用「青影」。
 *
 * 内容、作者、播放量与封面全部虚构，不加载真实视频或外链。
 * 点击视频进入应用内的播放页，播放/暂停、进度、收藏都有真实反馈。
 */
const emit = defineEmits<{ (e: 'back'): void }>()

const videos = VIDEOS
const categories = VIDEO_CATEGORIES

const category = ref('推荐')
const active = ref<VideoItem | null>(null)
const playing = ref(false)
const position = ref(0)
const liked = ref<string[]>([])

const filtered = computed(() =>
  category.value === '推荐' ? videos : videos.filter((video) => video.category === category.value),
)
const featured = computed(() => filtered.value[0] ?? null)
const rest = computed(() => filtered.value.slice(1))

let timer: ReturnType<typeof setInterval> | null = null

function totalSeconds(video: VideoItem): number {
  const [min, sec] = video.duration.split(':').map(Number)
  return (min || 0) * 60 + (sec || 0)
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

function openVideo(video: VideoItem): void {
  playSound('tap')
  active.value = video
  position.value = 0
  playing.value = true
}

function closeVideo(): void {
  playSound('tap')
  active.value = null
  playing.value = false
}

function togglePlay(): void {
  if (!active.value) return
  playSound('tap')
  if (!playing.value && position.value >= totalSeconds(active.value)) position.value = 0
  playing.value = !playing.value
}

function seek(event: Event): void {
  const input = event.target as HTMLInputElement
  position.value = Number(input.value)
}

function toggleLike(id: string): void {
  playSound('tap')
  liked.value = liked.value.includes(id)
    ? liked.value.filter((item) => item !== id)
    : [...liked.value, id]
}

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape' && active.value) closeVideo()
}

function tick(): void {
  if (!active.value || !playing.value) return
  position.value += 1
  if (position.value >= totalSeconds(active.value)) {
    position.value = 0
    playing.value = false
  }
}

onMounted(() => {
  timer = setInterval(tick, 1000)
  globalThis.addEventListener('keydown', closeOnEscape)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  timer = null
  globalThis.removeEventListener('keydown', closeOnEscape)
})
</script>

<template>
  <section class="video" aria-label="青影">
    <header class="video__head">
      <button type="button" class="video__back" aria-label="返回上一层" @click="emit('back')">←</button>
      <div class="video__brand">
        <h1>青影</h1>
        <p>看见更大的世界</p>
      </div>
      <span class="video__dots" aria-hidden="true">•••</span>
    </header>

    <div class="video__body">
      <div class="video__chips" role="tablist" aria-label="视频分类">
        <button
          v-for="item in categories"
          :key="item"
          type="button"
          role="tab"
          class="vchip"
          :class="{ 'vchip--on': category === item }"
          :aria-selected="category === item"
          @click="category = item"
        >
          {{ item }}
        </button>
      </div>

      <button v-if="featured" type="button" class="featured" @click="openVideo(featured)">
        <span
          class="featured__cover"
          :style="{ background: `linear-gradient(145deg, ${featured.colors[0]}, ${featured.colors[1]})` }"
        >
          <VideoArt :art="featured.art" />
          <span class="featured__play" aria-hidden="true">▶</span>
          <span class="featured__duration">{{ featured.duration }}</span>
        </span>
        <span class="featured__info">
          <span class="featured__eyebrow">今日精选</span>
          <span class="featured__title">{{ featured.title }}</span>
          <span class="featured__meta">{{ featured.creator }} · {{ featured.views }}</span>
        </span>
      </button>

      <div class="sectionhead">
        <h2>{{ category === '推荐' ? '接着看' : `${category}视频` }}</h2>
        <span>{{ filtered.length }} 条</span>
      </div>

      <ul v-if="rest.length" class="video__grid">
        <li v-for="video in rest" :key="video.id">
          <button type="button" class="vcard" :aria-label="`播放视频：${video.title}`" @click="openVideo(video)">
            <span
              class="vcard__cover"
              :style="{ background: `linear-gradient(145deg, ${video.colors[0]}, ${video.colors[1]})` }"
            >
              <VideoArt :art="video.art" />
              <span class="vcard__play" aria-hidden="true">▶</span>
              <span class="vcard__duration">{{ video.duration }}</span>
            </span>
            <span class="vcard__title">{{ video.title }}</span>
            <span class="vcard__meta">{{ video.creator }}</span>
            <span class="vcard__views">{{ video.views }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="video__empty">这个分类暂时只有一条内容。</p>
    </div>

    <!-- 应用内播放页 -->
    <div v-if="active" class="player" role="dialog" aria-modal="true" :aria-label="active.title">
      <header class="player__head">
        <button type="button" class="player__back" aria-label="关闭播放页" @click="closeVideo">←</button>
        <span class="player__headtitle">{{ active.title }}</span>
        <button
          type="button"
          class="player__like"
          :aria-label="liked.includes(active.id) ? '取消收藏' : '收藏视频'"
          @click="toggleLike(active.id)"
        >
          {{ liked.includes(active.id) ? '♥' : '♡' }}
        </button>
      </header>

      <div class="player__stage">
        <div
          class="player__cover"
          :style="{ background: `linear-gradient(145deg, ${active.colors[0]}, ${active.colors[1]})` }"
        >
          <VideoArt :art="active.art" />
          <button
            type="button"
            class="player__bigplay"
            :aria-label="playing ? '暂停' : '播放'"
            @click="togglePlay"
          >
            {{ playing ? '❚❚' : '▶' }}
          </button>
        </div>
      </div>

      <div class="player__info">
        <h2>{{ active.title }}</h2>
        <p class="player__byline">{{ active.creator }} · {{ active.views }}</p>
        <p class="player__blurb">{{ active.blurb }}</p>

        <div class="player__progress">
          <input
            type="range"
            min="0"
            :max="totalSeconds(active)"
            :value="position"
            aria-label="播放进度"
            @input="seek"
          />
          <div class="player__times">
            <span>{{ formatTime(position) }}</span>
            <span>{{ active.duration }}</span>
          </div>
        </div>

        <div class="player__actions">
          <button type="button" class="btn btn--secondary" @click="togglePlay">
            {{ playing ? '暂停' : '播放' }}
          </button>
          <button
            type="button"
            class="btn btn--secondary"
            @click="toggleLike(active.id)"
          >
            {{ liked.includes(active.id) ? '已收藏' : '收藏' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.video {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #10141d;
  color: #f2f6fc;
}

.video__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  min-height: 56px;
  padding: var(--space-1) var(--space-3);
  border-bottom: 1px solid rgb(255 255 255 / 8%);
}

.video__back,
.player__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--tap-min);
  height: var(--tap-min);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: #f2f6fc;
  font-size: 20px;
}

.video__brand {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.video__brand h1 {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.video__brand p {
  font-size: 10px;
  color: rgb(242 246 252 / 56%);
  letter-spacing: 0.06em;
}

.video__dots {
  flex: none;
  width: var(--tap-min);
  text-align: center;
  color: rgb(242 246 252 / 46%);
  letter-spacing: 2px;
}

.video__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
  padding: var(--space-3) var(--space-4) var(--space-5);
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.video__chips {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  scrollbar-width: none;
}

.video__chips::-webkit-scrollbar {
  display: none;
}

.vchip {
  flex: none;
  min-height: 32px;
  padding: 0 var(--space-3);
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 999px;
  background: rgb(255 255 255 / 6%);
  color: rgb(242 246 252 / 64%);
  font-size: var(--font-xs);
  font-weight: 600;
}

.vchip--on {
  border-color: transparent;
  background: #f2f6fc;
  color: #17202e;
}

.featured {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 5%);
  color: inherit;
  text-align: left;
}

.featured__cover {
  position: relative;
  display: block;
  aspect-ratio: 16 / 9;
  color: rgb(255 255 255 / 72%);
}

.featured__cover :deep(svg) {
  padding: 10% 12%;
}

.featured__play {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border: 1px solid rgb(255 255 255 / 42%);
  border-radius: 50%;
  background: rgb(10 14 22 / 42%);
  color: #fff;
  font-size: 16px;
  transform: translate(-50%, -50%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.featured__duration,
.vcard__duration {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgb(8 12 20 / 72%);
  color: #fff;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.featured__info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: var(--space-3);
}

.featured__eyebrow {
  align-self: flex-start;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgb(255 255 255 / 12%);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.featured__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-md);
  font-weight: 800;
}

.featured__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: rgb(242 246 252 / 54%);
}

.sectionhead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.sectionhead h2 {
  font-size: var(--font-md);
  font-weight: 800;
}

.sectionhead span {
  font-size: var(--font-xs);
  color: rgb(242 246 252 / 48%);
}

.video__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.vcard {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 4%);
  color: inherit;
  text-align: left;
}

.vcard__cover {
  position: relative;
  display: block;
  aspect-ratio: 16 / 11;
  color: rgb(255 255 255 / 64%);
}

.vcard__cover :deep(svg) {
  padding: 10%;
}

.vcard__play {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgb(255 255 255 / 36%);
  border-radius: 50%;
  background: rgb(8 12 20 / 38%);
  color: #fff;
  font-size: 10px;
  transform: translate(-50%, -50%);
}

.vcard__title,
.vcard__meta,
.vcard__views {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 8px;
}

.vcard__title {
  padding-top: 7px;
  font-size: var(--font-xs);
  font-weight: 700;
  line-height: 1.4;
}

.vcard__meta,
.vcard__views {
  font-size: 10px;
  color: rgb(242 246 252 / 48%);
}

.vcard__views {
  padding-bottom: 8px;
}

.video__empty {
  padding: var(--space-6) var(--space-4);
  text-align: center;
  font-size: var(--font-sm);
  color: rgb(242 246 252 / 48%);
}

/* ============ 播放页 ============ */

.player {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  background: #0b0f17;
  animation: player-in var(--dur-base) ease both;
}

@keyframes player-in {
  from {
    transform: translateY(12px);
    opacity: 0;
  }
}

.player__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  min-height: 52px;
  padding: var(--space-1) var(--space-3);
}

.player__headtitle {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-sm);
  font-weight: 700;
}

.player__like {
  flex: none;
  width: var(--tap-min);
  height: var(--tap-min);
  border: 0;
  background: transparent;
  color: #ff8ea6;
  font-size: 23px;
}

.player__stage {
  flex: none;
  padding: 0 var(--space-3);
}

.player__cover {
  position: relative;
  display: block;
  aspect-ratio: 16 / 9;
  border-radius: var(--radius-md);
  color: rgb(255 255 255 / 72%);
  overflow: hidden;
}

.player__cover :deep(svg) {
  padding: 9% 12%;
}

.player__bigplay {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border: 1px solid rgb(255 255 255 / 45%);
  border-radius: 50%;
  background: rgb(8 12 20 / 42%);
  color: #fff;
  font-size: 17px;
  transform: translate(-50%, -50%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.player__info {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
  min-height: 0;
  padding: var(--space-3) var(--space-4) var(--space-5);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.player__info h2 {
  font-size: var(--font-md);
  font-weight: 800;
  line-height: 1.4;
}

.player__byline {
  font-size: 11px;
  color: rgb(242 246 252 / 52%);
}

.player__blurb {
  font-size: var(--font-xs);
  color: rgb(242 246 252 / 66%);
  line-height: 1.6;
}

.player__progress {
  margin-top: var(--space-2);
}

.player__progress input {
  display: block;
  width: 100%;
  height: 24px;
  margin: 0;
  accent-color: #f2f6fc;
}

.player__times {
  display: flex;
  justify-content: space-between;
  margin-top: -4px;
  color: rgb(242 246 252 / 48%);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.player__actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.player__actions .btn {
  flex: 1;
  border-color: rgb(255 255 255 / 12%);
  background: rgb(255 255 255 / 7%);
  color: #f2f6fc;
}

@media (prefers-reduced-motion: reduce) {
  .player {
    animation: none;
  }
}
</style>
