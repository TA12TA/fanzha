<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import { MUSIC_PLAYLISTS, MUSIC_TRACKS, type MusicTrack } from '@/data/music'
import { playSound } from '@/app/sound'

/**
 * 虚构音乐应用「青听音乐」。
 *
 * 曲库、歌手与歌单全部虚构，不加载任何真实音频或外部资源。
 * 播放器在界面内推进进度，切歌、暂停、拖动进度条都有即时反馈。
 */
const emit = defineEmits<{ (e: 'back'): void }>()

const tracks = MUSIC_TRACKS
const playlists = MUSIC_PLAYLISTS

const currentId = ref(tracks[0]?.id ?? '')
const playing = ref(false)
const position = ref(0)

const current = computed(() => tracks.find((track) => track.id === currentId.value) ?? tracks[0])

let timer: ReturnType<typeof setInterval> | null = null

function indexOf(id: string): number {
  return tracks.findIndex((track) => track.id === id)
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const min = Math.floor(safe / 60)
  const sec = safe % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

function selectTrack(track: MusicTrack): void {
  playSound('tap')
  currentId.value = track.id
  position.value = 0
  playing.value = true
}

function selectPlaylist(trackIds: string[]): void {
  const first = tracks.find((track) => track.id === trackIds[0])
  if (first) selectTrack(first)
}

function togglePlay(): void {
  playSound('tap')
  if (!playing.value && position.value >= current.value.duration) position.value = 0
  playing.value = !playing.value
}

function nextTrack(autoPlay = false): void {
  const next = tracks[(indexOf(currentId.value) + 1) % tracks.length]
  if (!next) return
  currentId.value = next.id
  position.value = 0
  playing.value = autoPlay || playing.value
  if (!autoPlay) playSound('tap')
}

function previousTrack(): void {
  if (position.value > 4) {
    position.value = 0
    return
  }
  const previous = tracks[(indexOf(currentId.value) - 1 + tracks.length) % tracks.length]
  if (!previous) return
  playSound('tap')
  currentId.value = previous.id
  position.value = 0
}

function seek(event: Event): void {
  const input = event.target as HTMLInputElement
  position.value = Number(input.value)
}

function tick(): void {
  if (!playing.value) return
  position.value += 1
  if (position.value >= current.value.duration) nextTrack(true)
}

onMounted(() => {
  timer = setInterval(tick, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  timer = null
})
</script>

<template>
  <section class="music" aria-label="青听音乐">
    <AppHeader title="青听音乐" subtitle="把耳机戴上，世界安静一点" show-back @back="emit('back')" />

    <div class="music__body">
      <section
        class="hero"
        :style="{ background: `linear-gradient(135deg, ${current.colors[0]}, ${current.colors[1]})` }"
      >
        <div class="hero__copy">
          <span class="hero__eyebrow">每日推荐</span>
          <h2 class="hero__title">{{ current.title }}</h2>
          <p class="hero__sub">{{ current.artist }} · {{ current.album }}</p>
          <button type="button" class="hero__play" @click="togglePlay">
            <span aria-hidden="true">{{ playing ? '❚❚' : '▶' }}</span>
            {{ playing ? '暂停' : '播放' }}
          </button>
        </div>
        <div class="hero__disc" aria-hidden="true">
          <span class="hero__note">♪</span>
        </div>
      </section>

      <section class="music__section">
        <div class="sectionhead">
          <h2>最近播放</h2>
          <span>{{ tracks.length }} 首</span>
        </div>
        <ul class="tracks">
          <li v-for="(track, index) in tracks" :key="track.id">
            <button
              type="button"
              class="track"
              :class="{ 'track--on': track.id === current.id }"
              :aria-label="`播放 ${track.title}，${track.artist}`"
              @click="selectTrack(track)"
            >
              <span class="track__index">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="track__main">
                <span class="track__title">{{ track.title }}</span>
                <span class="track__sub">{{ track.artist }} · {{ track.mood }}</span>
              </span>
              <span class="track__time">{{ formatTime(track.duration) }}</span>
              <span v-if="track.id === current.id" class="track__bars" aria-hidden="true">
                <i></i><i></i><i></i>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <section class="music__section">
        <div class="sectionhead">
          <h2>推荐歌单</h2>
          <span>为你挑的</span>
        </div>
        <ul class="playlists">
          <li v-for="playlist in playlists" :key="playlist.id">
            <button
              type="button"
              class="playlist"
              :style="{ background: `linear-gradient(145deg, ${playlist.colors[0]}, ${playlist.colors[1]})` }"
              :aria-label="`播放歌单：${playlist.title}`"
              @click="selectPlaylist(playlist.trackIds)"
            >
              <span class="playlist__eyebrow">歌单</span>
              <span class="playlist__title">{{ playlist.title }}</span>
              <span class="playlist__sub">{{ playlist.subtitle }}</span>
              <span class="playlist__play" aria-hidden="true">▶</span>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <div class="player" aria-label="播放器">
      <div class="player__row">
        <div class="player__art" :style="{ background: `linear-gradient(145deg, ${current.colors[0]}, ${current.colors[1]})` }">
          <span aria-hidden="true">♪</span>
        </div>
        <div class="player__meta">
          <span class="player__title">{{ current.title }}</span>
          <span class="player__sub">{{ current.artist }}</span>
        </div>
        <div class="player__controls">
          <button type="button" class="player__btn" aria-label="上一首" @click="previousTrack">⏮</button>
          <button type="button" class="player__btn player__btn--main" :aria-label="playing ? '暂停' : '播放'" @click="togglePlay">
            {{ playing ? '❚❚' : '▶' }}
          </button>
          <button type="button" class="player__btn" aria-label="下一首" @click="nextTrack(false)">⏭</button>
        </div>
      </div>
      <input
        class="player__range"
        type="range"
        min="0"
        :max="current.duration"
        :value="position"
        aria-label="播放进度"
        @input="seek"
      />
      <div class="player__times">
        <span>{{ formatTime(position) }}</span>
        <span>{{ formatTime(current.duration) }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.music {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background:
    radial-gradient(80% 32% at 8% 0%, rgb(47 107 88 / 15%), transparent 68%),
    var(--c-surface-2);
}

.music__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1;
  min-height: 0;
  padding: var(--space-3) var(--space-4) 132px;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.music__body > * {
  flex: none;
}

.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 168px;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  color: #fff;
  box-shadow: 0 12px 26px rgb(37 68 54 / 24%);
}

.hero__copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
}

.hero__eyebrow {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgb(255 255 255 / 18%);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.hero__title {
  max-width: 100%;
  margin-top: 4px;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.28;
  letter-spacing: 0.03em;
}

.hero__sub {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-xs);
  color: rgb(255 255 255 / 78%);
}

.hero__play {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  margin-top: var(--space-2);
  padding: 0 var(--space-3);
  border: 0;
  border-radius: 999px;
  background: #f8f1e4;
  color: var(--c-primary);
  font-size: var(--font-xs);
  font-weight: 800;
}

.hero__disc {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  width: 86px;
  height: 86px;
  border-radius: 50%;
  background:
    repeating-radial-gradient(circle at 50% 50%, rgb(255 255 255 / 12%) 0 5px, transparent 5px 11px),
    rgb(15 18 34 / 34%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 20%);
}

.hero__note {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgb(255 255 255 / 86%);
  color: var(--c-primary);
  font-size: 17px;
}

.music__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sectionhead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.sectionhead h2 {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.sectionhead span {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

.tracks {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--c-line);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.track {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 56px;
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-bottom: 1px solid var(--c-line);
  background: transparent;
  color: inherit;
  text-align: left;
}

.tracks li:last-child .track {
  border-bottom: 0;
}

.track--on {
  background: var(--c-primary-soft);
}

.track__index {
  width: 22px;
  flex: none;
  color: var(--c-text-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.track--on .track__index {
  color: var(--c-primary);
}

.track__main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.track__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-sm);
  font-weight: 700;
}

.track__sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--c-text-soft);
}

.track__time {
  flex: none;
  color: var(--c-text-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.track__bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
  flex: none;
}

.track__bars i {
  width: 2px;
  border-radius: 2px;
  background: var(--c-primary);
  animation: bars 0.9s ease-in-out infinite alternate;
}

.track__bars i:nth-child(1) {
  height: 7px;
}

.track__bars i:nth-child(2) {
  height: 13px;
  animation-delay: 0.2s;
}

.track__bars i:nth-child(3) {
  height: 9px;
  animation-delay: 0.4s;
}

@keyframes bars {
  to {
    transform: scaleY(0.45);
  }
}

.playlists {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.playlist {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  min-height: 116px;
  padding: var(--space-3);
  border: 0;
  border-radius: var(--radius-md);
  color: #fff;
  text-align: left;
  overflow: hidden;
}

.playlist__eyebrow {
  font-size: 10px;
  font-weight: 700;
  color: rgb(255 255 255 / 70%);
  letter-spacing: 0.08em;
}

.playlist__title {
  margin-top: auto;
  font-size: var(--font-sm);
  font-weight: 800;
  line-height: 1.3;
}

.playlist__sub {
  font-size: 10px;
  color: rgb(255 255 255 / 72%);
}

.playlist__play {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgb(255 255 255 / 20%);
  font-size: 10px;
}

/* ============ 底部播放器 ============ */

.player {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  padding: var(--space-3) var(--space-4) var(--space-3);
  border-top: 1px solid rgb(255 255 255 / 10%);
  background: rgb(10 20 16 / 96%);
  color: #f7f0e2;
  box-shadow: 0 -8px 24px rgb(8 10 22 / 28%);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.player__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.player__art {
  display: grid;
  place-items: center;
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  font-size: 17px;
}

.player__meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.player__title,
.player__sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player__title {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.player__sub {
  font-size: 11px;
  color: rgb(246 248 255 / 62%);
}

.player__controls {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

.player__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #f7f0e2;
  font-size: 13px;
}

.player__btn--main {
  background: rgb(247 240 226 / 14%);
  font-size: 14px;
}

.player__range {
  display: block;
  width: 100%;
  height: 20px;
  margin: 2px 0 0;
  accent-color: #c8a064;
}

.player__times {
  display: flex;
  justify-content: space-between;
  margin-top: -3px;
  color: rgb(246 248 255 / 54%);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .track__bars i {
    animation: none;
  }
}
</style>
