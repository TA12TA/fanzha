<script setup lang="ts">
import { computed } from 'vue'
import { currentTrack, musicState, stopMusic, togglePlay } from '@/app/musicPlayer'
import { playSound } from '@/app/sound'

/**
 * 跨应用迷你播放器。
 *
 * 音乐在切到别的应用后继续播，这条常驻栏负责让玩家随时暂停或回到音乐页；
 * 它不改变剧情状态，也不占用手势热区之外的区域。
 */
const emit = defineEmits<{ (e: 'open'): void }>()

const progress = computed(() => {
  const duration = musicState.duration
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.min(100, Math.max(0, (musicState.position / duration) * 100))
})

function openPlayer(): void {
  playSound('tap')
  emit('open')
}

function onToggle(): void {
  playSound('tap')
  togglePlay()
}

function close(): void {
  playSound('cancel')
  stopMusic()
}
</script>

<template>
  <div class="mini" aria-label="正在播放">
    <span class="mini__progress" :style="{ width: `${progress}%` }" aria-hidden="true"></span>
    <button type="button" class="mini__main" @click="openPlayer">
      <span
        class="mini__art"
        :style="{ background: `linear-gradient(145deg, ${currentTrack.colors[0]}, ${currentTrack.colors[1]})` }"
        aria-hidden="true"
      >♪</span>
      <span class="mini__text">
        <span class="mini__title">{{ currentTrack.title }}</span>
        <span class="mini__sub">{{ currentTrack.artist }}</span>
      </span>
    </button>
    <button
      type="button"
      class="mini__btn"
      :aria-label="musicState.playing ? '暂停' : '播放'"
      @click="onToggle"
    >
      <svg v-if="musicState.playing" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
        <rect x="7" y="5" width="3.5" height="14" rx="1" />
        <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
      </svg>
      <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
        <path d="M8 5.5v13l10-6.5Z" />
      </svg>
    </button>
    <button type="button" class="mini__btn mini__btn--close" aria-label="关闭播放器" @click="close">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <path d="m7 7 10 10M17 7 7 17" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.mini {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex: none;
  min-height: 52px;
  padding: 0 var(--space-2) 0 var(--space-3);
  overflow: hidden;
  border-top: 1px solid rgb(255 255 255 / 10%);
  background: rgb(10 20 16 / 96%);
  color: #f7f0e2;
}

.mini__progress {
  position: absolute;
  top: 0;
  left: 0;
  height: 2px;
  background: #77d8c4;
  transition: width 200ms linear;
}

.mini__main {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
  min-height: 48px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.mini__art {
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  font-size: 15px;
}

.mini__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.mini__title,
.mini__sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini__title {
  font-size: var(--font-sm);
  font-weight: 600;
}

.mini__sub {
  font-size: 10px;
  color: rgb(247 240 226 / 56%);
}

.mini__btn {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
}

.mini__btn--close {
  width: 30px;
  height: 30px;
  color: rgb(247 240 226 / 50%);
}
</style>
