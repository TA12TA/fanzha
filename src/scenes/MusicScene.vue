<script setup lang="ts">
import { computed } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import { MUSIC_CREDIT, MUSIC_PLAYLISTS, MUSIC_TRACKS, type MusicTrack } from '@/data/music'
import { playSound } from '@/app/sound'
import {
  currentTrack,
  cycleRepeat,
  musicState,
  nextTrack,
  previousTrack,
  seekTo,
  selectPlaylist as startPlaylist,
  selectTrack as startTrack,
  toggleMute,
  togglePlay,
  toggleShuffle,
} from '@/app/musicPlayer'

/**
 * 虚构音乐应用「青听音乐」。
 *
 * 音频元素常驻在 PhoneShell，切到别的应用也会继续播放；
 * 本页只显示状态、提供队列与播放控制。
 */
const emit = defineEmits<{ (e: 'back'): void }>()

const tracks = MUSIC_TRACKS
const playlists = MUSIC_PLAYLISTS

const current = currentTrack
const playing = computed(() => musicState.playing)
const position = computed(() => musicState.position)
const duration = computed(() => musicState.duration || current.value.duration)
const repeatLabel = computed(() =>
  musicState.repeat === 'one' ? '单曲循环' : musicState.repeat === 'all' ? '列表循环' : '不循环',
)

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const min = Math.floor(safe / 60)
  const sec = safe % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

function selectTrack(track: MusicTrack): void {
  playSound('tap')
  startTrack(track.id)
}

function selectPlaylist(trackIds: string[]): void {
  playSound('tap')
  startPlaylist(trackIds)
}

function onTogglePlay(): void {
  playSound('tap')
  togglePlay()
}

function onNext(): void {
  playSound('tap')
  nextTrack()
}

function onPrevious(): void {
  playSound('tap')
  previousTrack()
}

function onSeek(event: Event): void {
  seekTo(Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <section class="music" aria-label="青听音乐">
    <AppHeader title="青听音乐" show-back @back="emit('back')" />

    <div class="music__body">
      <section class="hero" :style="{ '--track-color': current.colors[0] }">
        <div class="hero__copy">
          <h2 class="hero__title">{{ current.title }}</h2>
          <p class="hero__sub">{{ current.artist }} · {{ current.album }}</p>
          <button type="button" class="hero__play" @click="onTogglePlay">
            <svg v-if="playing" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
              <rect x="7" y="5" width="3.5" height="14" rx="1" />
              <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l10-6.5Z" />
            </svg>
            {{ playing ? '暂停' : '播放' }}
          </button>
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
              <span class="playlist__title">{{ playlist.title }}</span>
              <span class="playlist__sub">{{ playlist.subtitle }}</span>
              <span class="playlist__play" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                  <path d="M8 5.5v13l10-6.5Z" />
                </svg>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <p class="music__credit">{{ MUSIC_CREDIT }}</p>
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
          <button type="button" class="player__btn" aria-label="上一首" @click="onPrevious">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6 5v14" />
              <path d="M18 6.5 9.5 12 18 17.5Z" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <button type="button" class="player__btn player__btn--main" :aria-label="playing ? '暂停' : '播放'" @click="onTogglePlay">
            <svg v-if="playing" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
              <rect x="7" y="5" width="3.5" height="14" rx="1" />
              <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l10-6.5Z" />
            </svg>
          </button>
          <button type="button" class="player__btn" aria-label="下一首" @click="onNext">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 5v14" />
              <path d="M6 6.5 14.5 12 6 17.5Z" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </div>
      </div>
      <input
        class="player__range"
        type="range"
        min="0"
        :max="duration"
        :value="position"
        aria-label="播放进度"
        @input="onSeek"
      />
      <div class="player__times">
        <span>{{ formatTime(position) }}</span>
        <span>{{ formatTime(duration) }}</span>
      </div>
      <div class="player__modes">
        <button
          type="button"
          class="player__mode"
          :class="{ 'player__mode--on': musicState.shuffle }"
          :aria-pressed="musicState.shuffle"
          aria-label="随机播放"
          @click="toggleShuffle"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 7h3.5c4.5 0 6.5 10 11 10H21" />
            <path d="M18 4.5 21 7l-3 2.5" />
            <path d="M3 17h3.5c1.7 0 3-1.4 4.2-3.1" />
            <path d="M13.3 10.1C14.5 8.4 15.8 7 17.5 7H21" />
            <path d="M18 4.5 21 7l-3 2.5" />
          </svg>
        </button>
        <button
          type="button"
          class="player__mode"
          :class="{ 'player__mode--on': musicState.repeat !== 'off' }"
          :aria-pressed="musicState.repeat !== 'off'"
          :aria-label="`循环模式：${repeatLabel}`"
          @click="cycleRepeat"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M17 3.5 20.5 7 17 10.5" />
            <path d="M3.5 12V9.5A2.5 2.5 0 0 1 6 7h14" />
            <path d="M7 20.5 3.5 17 7 13.5" />
            <path d="M20.5 12v2.5a2.5 2.5 0 0 1-2.5 2.5H4" />
          </svg>
          <span v-if="musicState.repeat === 'one'" class="player__mode-badge" aria-hidden="true">1</span>
        </button>
        <button
          type="button"
          class="player__mode"
          :class="{ 'player__mode--on': musicState.muted }"
          :aria-pressed="musicState.muted"
          :aria-label="musicState.muted ? '取消静音' : '静音'"
          @click="toggleMute"
        >
          <svg v-if="musicState.muted" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 9.5v5h3l5 4v-13l-5 4Z" />
            <path d="m17 9 4 6M21 9l-4 6" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 9.5v5h3l5 4v-13l-5 4Z" />
            <path d="M16 9.5c1 .8 1.5 1.8 1.5 2.5S17 13.7 16 14.5" />
          </svg>
        </button>
        <span v-if="musicState.loading" class="player__status" role="status">正在加载</span>
        <span v-else-if="musicState.error" class="player__status player__status--error" role="status">
          {{ musicState.error }}
        </span>
        <span v-else class="player__status">{{ repeatLabel }}</span>
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
  padding: var(--space-3) var(--space-4) 174px;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.music__credit {
  margin: 0;
  padding: var(--space-1) 0 var(--space-2);
  color: var(--c-text-tertiary);
  font-size: 10px;
  letter-spacing: 0.02em;
  text-align: center;
}

.music__body > * {
  flex: none;
}

.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-4) var(--space-4);
  border-left: 3px solid var(--track-color, var(--c-primary));
  border-bottom: 1px solid var(--c-line);
  color: var(--c-text);
}

.hero__copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
}

.hero__title {
  max-width: 100%;
  margin-top: 4px;
  font-family: var(--font-sans);
  font-size: 30px;
  font-weight: 600;
  line-height: 1.22;
  letter-spacing: -0.02em;
}

.hero__sub {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

.hero__play {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  margin-top: var(--space-3);
  padding: 0 var(--space-3);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--c-text);
  font-size: var(--font-xs);
  font-weight: 600;
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

.player__modes {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}

.player__mode {
  position: relative;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgb(246 248 255 / 56%);
}

.player__mode--on {
  color: #d9f7f0;
  background: rgb(255 255 255 / 8%);
}

.player__mode-badge {
  position: absolute;
  right: 2px;
  bottom: 1px;
  font-size: 8px;
  font-weight: 800;
  line-height: 1;
}

.player__status {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgb(246 248 255 / 46%);
  font-size: 10px;
}

.player__status--error {
  color: #ffb4a8;
}

@media (prefers-reduced-motion: reduce) {
  .track__bars i {
    animation: none;
  }
}
</style>
