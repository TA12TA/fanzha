<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { VIDEOS, type VideoItem } from '@/data/video'
import { playSound } from '@/app/sound'

/**
 * 虚构短视频应用「青影」。
 *
 * 模仿常见的竖屏短视频：一屏一条，上下滑动切换；右侧点赞/评论/收藏/分享，
 * 底部作者、文案与音乐条。首条是本地打包的真实反诈短剧，其余条目用本地封面图；
 * 视频、点赞、评论和分享都在本机内完成，不跳转外部平台。
 */
const emit = defineEmits<{ (e: 'back'): void }>()

const tab = ref<'following' | 'recommend'>('recommend')
const feedRef = ref<HTMLElement | null>(null)
const activeVideo = ref<HTMLVideoElement | null>(null)
const activeIndex = ref(0)
const playing = ref(true)

/**
 * 只有进入青影后才开始缓存；缓存放在 CacheStorage 中，关闭页面后仍保留。
 * 首条缓存完成后进入 feed，后续视频在后台顺序预缓存。
 */
const VIDEO_CACHE = 'qingying-videos-v1'
const cachedSources = ref<Record<string, string>>({})
const loading = ref(true)
const loadingProgress = ref(0)
const cacheDone = ref(0)
const cacheTotal = ref(0)
const muted = ref(false)
const progress = ref(0)
const followed = ref<string[]>([])
const liked = ref<string[]>([])
const saved = ref<string[]>([])
const userComments = ref<Record<string, string[]>>({})
const draft = ref('')
const commentsOpen = ref(false)
const shareOpen = ref(false)
const toast = ref('')

const feed = computed(() =>
  tab.value === 'recommend'
    ? VIDEOS
    : VIDEOS.filter((video) => followed.value.includes(video.creator)),
)
const active = computed<VideoItem | null>(() => feed.value[activeIndex.value] ?? feed.value[0] ?? null)

let timer: ReturnType<typeof setInterval> | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null

watch(tab, async () => {
  activeVideo.value?.pause()
  activeIndex.value = 0
  progress.value = 0
  playing.value = true
  await nextTick()
  if (feedRef.value) feedRef.value.scrollTop = 0
})

function onScroll(): void {
  const element = feedRef.value
  if (!element || !element.clientHeight) return
  const index = Math.round(element.scrollTop / element.clientHeight)
  if (index !== activeIndex.value) {
    activeVideo.value?.pause()
    activeIndex.value = index
    progress.value = 0
    playing.value = true
  }
}

function togglePlay(): void {
  playSound('tap')
  const video = activeVideo.value
  if (active.value?.video && video) {
    if (video.paused) {
      void video.play().then(() => {
        playing.value = true
      }).catch(() => {
        playing.value = false
      })
    } else {
      video.pause()
      playing.value = false
    }
    return
  }
  playing.value = !playing.value
}

function tick(): void {
  // 真实视频由 timeupdate 驱动；图片封面才使用模拟进度。
  if (active.value?.video) return
  if (!playing.value) return
  progress.value = Math.min(100, progress.value + 0.6)
  if (progress.value >= 100) progress.value = 0
}

function setActiveVideo(el: Element | null): void {
  activeVideo.value = el instanceof HTMLVideoElement ? el : null
}

function onVideoLoaded(): void {
  const video = activeVideo.value
  if (!video) return
  video.muted = muted.value
  if (!playing.value) return
  void video.play().then(() => {
    playing.value = true
  }).catch(() => {
    // 浏览器拦截有声自动播放时，回到可点的暂停/播放态。
    playing.value = false
  })
}

function onVideoTimeUpdate(): void {
  const video = activeVideo.value
  if (!video || !video.duration) return
  progress.value = (video.currentTime / video.duration) * 100
}

function onVideoEnded(): void {
  playing.value = false
  progress.value = 100
}

function videoSource(video: VideoItem): string {
  return cachedSources.value[video.id] ?? video.video ?? ''
}

function setCachedSource(id: string, blob: Blob): void {
  if (cachedSources.value[id]) return
  cachedSources.value = { ...cachedSources.value, [id]: URL.createObjectURL(blob) }
}

async function cacheVideo(video: VideoItem, index: number): Promise<void> {
  if (!video.video) return
  try {
    const cache = await caches.open(VIDEO_CACHE)
    const hit = await cache.match(video.video)
    if (hit) {
      setCachedSource(video.id, await hit.blob())
      cacheDone.value = Math.max(cacheDone.value, index + 1)
      return
    }

    const response = await fetch(video.video)
    if (!response.ok || !response.body) throw new Error('video fetch failed')
    const total = Number(response.headers.get('content-length') || 0)
    const reader = response.body.getReader()
    const chunks: BlobPart[] = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      chunks.push(value)
      received += value.byteLength
      if (total > 0) loadingProgress.value = Math.min(99, Math.round((received / total) * 100))
    }
    loadingProgress.value = 100
    const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'video/mp4' })
    await cache.put(
      video.video,
      new Response(blob, { headers: { 'Content-Type': blob.type || 'video/mp4' } }),
    )
    setCachedSource(video.id, blob)
    cacheDone.value = Math.max(cacheDone.value, index + 1)
  } catch {
    // 缓存失败不影响在线播放；下次进入青影再试。
  }
}

async function prepareVideoCache(): Promise<void> {
  const videos = VIDEOS.filter((video) => video.video)
  cacheTotal.value = videos.length
  if (typeof caches === 'undefined' || !globalThis.caches) {
    loading.value = false
    return
  }
  if (videos[0]) await cacheVideo(videos[0], 0)
  loading.value = false
  for (let index = 1; index < videos.length; index += 1) {
    await cacheVideo(videos[index], index)
  }
}

function formatCount(value: number): string {
  return value >= 10000 ? `${(value / 10000).toFixed(1)} 万` : String(value)
}

/** 把展示用时长（MM:SS / H:MM:SS）换算成秒，供进度条与时间码使用。 */
function durationSeconds(value: string): number {
  const parts = value.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return 0
  return parts.reduce((total, part) => total * 60 + part, 0)
}

function formatTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function currentTimeOf(video: VideoItem): string {
  const total = durationSeconds(video.duration)
  return formatTime((progress.value / 100) * total)
}

function seek(event: Event): void {
  const value = (event.target as HTMLInputElement).valueAsNumber
  if (!Number.isFinite(value)) return
  const next = Math.min(100, Math.max(0, value))
  progress.value = next
  const video = activeVideo.value
  if (video?.duration) video.currentTime = (next / 100) * video.duration
}

function toggleMuted(): void {
  playSound('tap')
  muted.value = !muted.value
  if (activeVideo.value) activeVideo.value.muted = muted.value
}

function likeCount(video: VideoItem): number {
  return video.likes + (liked.value.includes(video.id) ? 1 : 0)
}

function toggleLike(video: VideoItem): void {
  playSound('tap')
  liked.value = liked.value.includes(video.id)
    ? liked.value.filter((id) => id !== video.id)
    : [...liked.value, video.id]
}

function toggleSave(video: VideoItem): void {
  playSound('tap')
  saved.value = saved.value.includes(video.id)
    ? saved.value.filter((id) => id !== video.id)
    : [...saved.value, video.id]
}

function toggleFollow(creator: string): void {
  playSound('tap')
  followed.value = followed.value.includes(creator)
    ? followed.value.filter((name) => name !== creator)
    : [...followed.value, creator]
}

function commentsOf(video: VideoItem): string[] {
  return [...video.comments, ...(userComments.value[video.id] ?? [])]
}

function commentCount(video: VideoItem): number {
  const base = video.commentTotal ?? video.comments.length
  return base + (userComments.value[video.id]?.length ?? 0)
}

function openComments(): void {
  playSound('tap')
  commentsOpen.value = true
}

function addComment(): void {
  const text = draft.value.trim()
  if (!active.value || !text) return
  playSound('tap')
  const id = active.value.id
  userComments.value = {
    ...userComments.value,
    [id]: [...(userComments.value[id] ?? []), text],
  }
  draft.value = ''
}

function openShare(): void {
  playSound('tap')
  shareOpen.value = true
}

function shareTo(name: string): void {
  playSound('tap')
  shareOpen.value = false
  toast.value = `已分享给${name}`
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 1800)
}

function closeOverlays(): void {
  commentsOpen.value = false
  shareOpen.value = false
}

onMounted(() => {
  timer = setInterval(tick, 1000)
  void prepareVideoCache()
})

onBeforeUnmount(() => {
  activeVideo.value?.pause()
  for (const url of Object.values(cachedSources.value)) URL.revokeObjectURL(url)
  if (timer) clearInterval(timer)
  timer = null
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = null
})
</script>

<template>
  <section class="video" aria-label="青影">
    <!-- 顶部：返回 + 关注/推荐 -->
    <header class="feedhead">
      <button type="button" class="feedhead__back" aria-label="返回上一层" @click="emit('back')">←</button>
      <nav class="feedhead__tabs" aria-label="短视频频道">
        <button
          type="button"
          class="feedhead__tab"
          :class="{ 'feedhead__tab--on': tab === 'following' }"
          @click="tab = 'following'"
        >
          关注
        </button>
        <button
          type="button"
          class="feedhead__tab"
          :class="{ 'feedhead__tab--on': tab === 'recommend' }"
          @click="tab = 'recommend'"
        >
          推荐
        </button>
      </nav>
      <span class="feedhead__spacer" aria-hidden="true"></span>
    </header>

    <div v-if="loading" class="video__loading" role="status" aria-live="polite">
      <button type="button" class="video__loadingback" aria-label="返回上一层" @click="emit('back')">←</button>
      <div class="video__loadingicon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="m10 9 5 3-5 3Z" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <p class="video__loadingtitle">正在准备视频</p>
      <p class="video__loadingsub">第一次打开会慢一点，之后会快一些。</p>
      <div class="video__loadingbar" aria-hidden="true">
        <span :style="{ width: `${loadingProgress}%` }"></span>
      </div>
      <p class="video__loadingmeta">
        {{ loadingProgress }}% · 已缓存 {{ cacheDone }}/{{ cacheTotal }}
      </p>
    </div>

    <!-- 一屏一条，上下滑动 -->
    <div ref="feedRef" class="feed" aria-label="短视频推荐" @scroll.passive="onScroll">
      <article
        v-for="(video, index) in feed"
        :key="video.id"
        class="clip"
        :aria-label="video.title"
        @click="togglePlay"
      >
        <video
          v-if="video.video && index === activeIndex"
          :ref="(el) => setActiveVideo(el as Element | null)"
          class="clip__video"
          :src="videoSource(video)"
          :poster="video.image"
          :muted="muted"
          playsinline
          preload="metadata"
          :aria-label="video.title"
          @loadedmetadata="onVideoLoaded"
          @timeupdate="onVideoTimeUpdate"
          @ended="onVideoEnded"
          @click.stop="togglePlay"
        ></video>
        <img v-else class="clip__image" :src="video.image" :alt="video.title" />
        <div
          class="clip__veil"
          :style="{ background: `linear-gradient(180deg, transparent 36%, ${video.colors[1]} 100%)` }"
          aria-hidden="true"
        ></div>

        <button
          v-if="index === activeIndex && !playing"
          type="button"
          class="clip__play"
          aria-label="播放"
          @click.stop="togglePlay"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13l10-6.5Z" />
          </svg>
        </button>

        <aside class="rail" @click.stop>
          <a
            v-if="video.douyinProfile"
            class="rail__avatar rail__avatar--link"
            :href="video.douyinProfile"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`打开${video.creator}抖音主页`"
            @click.stop
          >
            {{ video.creator.slice(0, 1) }}
            <span class="rail__follow">↗</span>
          </a>
          <button
            v-else
            type="button"
            class="rail__avatar"
            :aria-label="followed.includes(video.creator) ? `取消关注${video.creator}` : `关注${video.creator}`"
            @click="toggleFollow(video.creator)"
          >
            {{ video.creator.slice(0, 1) }}
            <span class="rail__follow">{{ followed.includes(video.creator) ? '✓' : '+' }}</span>
          </button>

          <button
            type="button"
            class="rail__btn"
            :class="{ 'rail__btn--on': liked.includes(video.id) }"
            :aria-label="liked.includes(video.id) ? '取消点赞' : '点赞'"
            @click="toggleLike(video)"
          >
            <svg class="rail__icon" viewBox="0 0 24 24" width="28" height="28" :fill="liked.includes(video.id) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20.2 4.7 13a4.8 4.8 0 0 1 6.8-6.8l.5.5.5-.5a4.8 4.8 0 0 1 6.8 6.8Z" />
            </svg>
            <small>{{ formatCount(likeCount(video)) }}</small>
          </button>

          <button type="button" class="rail__btn" aria-label="评论" @click="openComments">
            <svg class="rail__icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 5h14v10H9l-4 4V5Z" />
              <path d="M8 9h8M8 12h5" stroke-linecap="round" />
            </svg>
            <small>{{ commentCount(video) }}</small>
          </button>

          <button
            type="button"
            class="rail__btn"
            :class="{ 'rail__btn--on': saved.includes(video.id) }"
            :aria-label="saved.includes(video.id) ? '取消收藏' : '收藏视频'"
            @click="toggleSave(video)"
          >
            <svg class="rail__icon" viewBox="0 0 24 24" width="28" height="28" :fill="saved.includes(video.id) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
              <path d="M6 4.5h12v16l-6-4-6 4Z" />
            </svg>
            <small>{{ saved.includes(video.id) ? '已收藏' : '收藏' }}</small>
          </button>

          <button type="button" class="rail__btn" aria-label="分享" @click="openShare">
            <svg class="rail__icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 15V4" />
              <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
              <path d="M5 13v6h14v-6" />
            </svg>
            <small>分享</small>
          </button>
        </aside>

        <div class="clip__meta">
          <p class="clip__author">@{{ video.creator }}</p>
          <p class="clip__title">
            {{ video.title }}
            <span>#{{ video.category }} #校园生活</span>
          </p>
          <p class="clip__blurb">{{ video.blurb }}</p>
          <p class="clip__music"><span aria-hidden="true">♪</span> {{ video.music }}</p>
        </div>

        <!--
          控制条与内容解耦：后续把封面图换成真实 <video> 时，
          只需把 playing / progress / muted 同步到 video 元素即可。
        -->
        <div v-if="index === activeIndex" class="clip__transport" @click.stop>
          <button
            type="button"
            class="clip__transportbtn"
            :aria-label="playing ? '暂停' : '播放'"
            @click="togglePlay"
          >
            <svg v-if="playing" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <rect x="7" y="5" width="3.5" height="14" rx="1" />
              <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l10-6.5Z" />
            </svg>
          </button>
          <input
            class="clip__seek"
            type="range"
            min="0"
            max="100"
            step="0.1"
            :value="progress"
            aria-label="播放进度"
            @input="seek"
          />
          <span class="clip__time">{{ currentTimeOf(video) }} / {{ video.duration }}</span>
          <button
            type="button"
            class="clip__transportbtn"
            :aria-label="muted ? '取消静音' : '静音'"
            @click="toggleMuted"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 9h3l4-3v12l-4-3H4Z" />
              <template v-if="!muted">
                <path d="M15 9.5a4 4 0 0 1 0 5" />
                <path d="M17.5 7a7 7 0 0 1 0 10" />
              </template>
              <path v-else d="m16 9 4 6m0-6-4 6" />
            </svg>
          </button>
        </div>
      </article>
    </div>

    <div v-if="!feed.length" class="video__empty">
      <p>还没有关注的创作者。</p>
      <button type="button" class="video__emptybtn" @click="tab = 'recommend'">去推荐看看</button>
    </div>

    <!-- 评论面板 -->
    <div v-if="commentsOpen && active" class="sheet" role="dialog" aria-modal="true" aria-label="评论">
      <header class="sheet__head">
        <span>评论 {{ commentCount(active) }}</span>
        <button type="button" class="sheet__close" aria-label="关闭评论" @click="commentsOpen = false">✕</button>
      </header>
      <ul class="comments">
        <li v-for="(comment, index) in commentsOf(active)" :key="index" class="comment">
          <span class="comment__avatar" aria-hidden="true">{{ index % 2 ? '青' : '同' }}</span>
          <span class="comment__text">{{ comment }}</span>
        </li>
      </ul>
      <p v-if="active.commentTotal && active.commentTotal > commentsOf(active).length" class="comments__note">
        仅展示部分公开评论，共 {{ active.commentTotal }} 条
      </p>
      <form class="commentform" @submit.prevent="addComment">
        <input v-model="draft" type="text" placeholder="说点什么" aria-label="写评论" autocomplete="off" />
        <button type="submit" :disabled="!draft.trim()">发送</button>
      </form>
    </div>

    <!-- 分享面板：只在本机展示，不跳外部应用 -->
    <div v-if="shareOpen && active" class="sheet" role="dialog" aria-modal="true" aria-label="分享">
      <header class="sheet__head">
        <span>分享给</span>
        <button type="button" class="sheet__close" aria-label="关闭分享" @click="shareOpen = false">✕</button>
      </header>
      <div class="sharelist">
        <button v-for="name in ['妈妈', '班级通知群', '室友小陈']" :key="name" type="button" @click="shareTo(name)">
          <span class="sharelist__avatar" aria-hidden="true">{{ name.slice(0, 1) }}</span>
          {{ name }}
        </button>
      </div>
    </div>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
    <button v-if="commentsOpen || shareOpen" type="button" class="sheet__mask" aria-label="关闭" @click="closeOverlays"></button>
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
  background: #060b08;
  color: #f7f0e2;
}

/* 顶部悬浮栏 */
.feedhead {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 52px;
  padding: var(--space-1) var(--space-3);
  background: linear-gradient(180deg, rgb(0 0 0 / 52%), transparent);
}

.feedhead__back,
.feedhead__spacer {
  flex: none;
  width: var(--tap-min);
  height: var(--tap-min);
}

.feedhead__back {
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #fff;
  font-size: 22px;
}

.feedhead__tabs {
  display: flex;
  justify-content: center;
  gap: var(--space-5);
  flex: 1;
}

.feedhead__tab {
  position: relative;
  min-height: 40px;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: rgb(245 248 255 / 64%);
  font-size: var(--font-sm);
  font-weight: 700;
}

.feedhead__tab--on {
  color: #fff;
}

.feedhead__tab--on::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 18px;
  height: 2px;
  border-radius: 2px;
  background: #fff;
  transform: translateX(-50%);
}

/* 竖向全屏 feed */
.feed {
  height: 100%;
  overflow-y: auto;
  scroll-snap-type: y mandatory;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.feed::-webkit-scrollbar {
  display: none;
}

.clip {
  position: relative;
  height: 100%;
  overflow: hidden;
  scroll-snap-align: start;
  background: #060b08;
}

.clip__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(0.9) brightness(0.82);
}

/* 真实视频保持完整画面：横屏素材在竖屏 feed 里留黑边，不裁切内容。 */
.clip__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.clip__veil {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.clip__play {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 6;
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border: 1px solid rgb(255 255 255 / 42%);
  border-radius: 50%;
  background: rgb(4 8 14 / 42%);
  color: #fff;
  transform: translate(-50%, -50%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.clip__play svg {
  display: block;
  width: 26px;
  height: 26px;
}

/* 右侧操作栏 */
.rail {
  position: absolute;
  right: var(--space-2);
  bottom: 176px;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.rail__avatar {
  position: relative;
  text-decoration: none;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #3f6f5c;
  color: #fff;
  font-size: var(--font-sm);
  font-weight: 700;
}

.rail__follow {
  position: absolute;
  left: 50%;
  bottom: -7px;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--c-danger);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  transform: translateX(-50%);
}

.rail__btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 42px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 24px;
  line-height: 1.1;
  text-shadow: 0 1px 4px rgb(0 0 0 / 50%);
}

.rail__icon {
  display: block;
  width: 28px;
  height: 28px;
}

.rail__btn small {
  font-size: 10px;
  font-weight: 600;
}

.rail__btn--on > :first-child {
  color: #e3a477;
}

/* 左下文案 */
.clip__meta {
  position: absolute;
  left: var(--space-4);
  right: 76px;
  bottom: 68px;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-shadow: 0 1px 5px rgb(0 0 0 / 62%);
}

.clip__author {
  font-size: var(--font-sm);
  font-weight: 800;
}

.clip__title {
  font-size: var(--font-sm);
  font-weight: 600;
  line-height: 1.5;
}

.clip__title span {
  font-weight: 400;
  color: rgb(247 240 226 / 76%);
}

.clip__blurb {
  font-size: var(--font-xs);
  line-height: 1.5;
  color: rgb(247 240 226 / 76%);
}

.clip__music {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: rgb(247 240 226 / 82%);
}

/* 底部播放控制条：播放/暂停、可拖动进度、时间、静音 */
.clip__transport {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 56px;
  padding: 4px var(--space-3) calc(var(--space-2) + var(--safe-bottom));
  background: linear-gradient(180deg, transparent, rgb(0 0 0 / 72%));
  color: #fff;
}

.clip__transportbtn {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgb(255 255 255 / 12%);
  color: inherit;
}

.clip__transportbtn:active {
  background: rgb(255 255 255 / 24%);
}

.clip__transportbtn svg {
  display: block;
  width: 20px;
  height: 20px;
}

.clip__seek {
  flex: 1;
  min-width: 0;
  height: 24px;
  margin: 0;
  accent-color: #f7f0e2;
  cursor: pointer;
}

.clip__time {
  flex: none;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: rgb(255 255 255 / 86%);
}

.video__loading {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: calc(var(--space-6) + var(--safe-top)) var(--space-5) calc(var(--space-6) + var(--safe-bottom));
  background:
    radial-gradient(70% 48% at 50% 38%, rgb(46 91 71 / 34%), transparent 72%),
    linear-gradient(155deg, #14251e, #07100c);
  color: #f7f0e2;
  text-align: center;
}

.video__loadingback {
  position: absolute;
  top: calc(var(--space-4) + var(--safe-top));
  left: var(--space-3);
  width: var(--tap-min);
  height: var(--tap-min);
  border: 0;
  border-radius: 50%;
  background: rgb(255 255 255 / 8%);
  color: inherit;
  font-size: 20px;
}

.video__loadingicon {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 22px;
  background: rgb(255 255 255 / 7%);
  color: #c8a064;
}

.video__loadingtitle {
  font-size: var(--font-lg);
  font-weight: 700;
}

.video__loadingsub {
  margin-top: calc(var(--space-1) * -1);
  font-size: var(--font-xs);
  color: rgb(247 240 226 / 58%);
}

.video__loadingbar {
  width: min(260px, 72%);
  margin-top: var(--space-3);
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(255 255 255 / 18%);
}

.video__loadingbar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #f7f0e2;
  transition: width 180ms linear;
}

.video__loadingmeta {
  font-size: var(--font-xs);
  color: rgb(247 240 226 / 62%);
}

.video__empty {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  background: #060b08;
  color: rgb(247 240 226 / 70%);
  font-size: var(--font-sm);
}

.video__emptybtn {
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: 1px solid rgb(255 255 255 / 26%);
  border-radius: 999px;
  background: rgb(255 255 255 / 8%);
  color: #fff;
  font-size: var(--font-sm);
}

/* 评论 / 分享面板 */
.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 12;
  display: flex;
  flex-direction: column;
  max-height: 62%;
  padding: var(--space-3) var(--space-4) calc(var(--space-4) + var(--safe-bottom));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: #0d1713;
  color: #f7f0e2;
  box-shadow: 0 -8px 28px rgb(0 0 0 / 40%);
  animation: sheet-in var(--dur-base) ease both;
}

@keyframes sheet-in {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex: none;
  padding-bottom: var(--space-2);
  border-bottom: 1px solid rgb(255 255 255 / 10%);
  font-size: var(--font-sm);
  font-weight: 700;
}

.sheet__close {
  width: var(--tap-min);
  height: var(--tap-min);
  border: 0;
  background: transparent;
  color: inherit;
  font-size: var(--font-md);
}

.comments {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-3) 0;
  overflow-y: auto;
  list-style: none;
}

.comment {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.comment__avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgb(255 255 255 / 14%);
  font-size: 11px;
}

.comment__text {
  font-size: var(--font-xs);
  line-height: 1.6;
  color: rgb(245 248 255 / 84%);
}

.comments__note {
  flex: none;
  margin: 0 0 var(--space-2);
  font-size: 11px;
  color: rgb(245 248 255 / 54%);
}

.commentform {
  display: flex;
  gap: var(--space-2);
  flex: none;
}

.commentform input {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 999px;
  outline: none;
  background: rgb(255 255 255 / 8%);
  color: #fff;
  font: inherit;
  font-size: 16px;
}

.commentform button {
  flex: none;
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: 999px;
  background: #f5f8ff;
  color: #111821;
  font-size: var(--font-sm);
  font-weight: 700;
}

.commentform button:disabled {
  opacity: 0.4;
}

.sharelist {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  padding: var(--space-4) 0;
}

.sharelist button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  min-height: 76px;
  padding: var(--space-2);
  border: 0;
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 7%);
  color: inherit;
  font-size: var(--font-xs);
}

.sharelist__avatar {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgb(255 255 255 / 16%);
  font-size: var(--font-sm);
  font-weight: 700;
}

.sheet__mask {
  position: absolute;
  inset: 0;
  z-index: 11;
  border: 0;
  background: rgb(0 0 0 / 36%);
}

.toast {
  position: absolute;
  left: 50%;
  bottom: 96px;
  z-index: 14;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgb(0 0 0 / 72%);
  color: #fff;
  font-size: var(--font-xs);
  transform: translateX(-50%);
}

@media (prefers-reduced-motion: reduce) {
  .sheet {
    animation: none;
  }

}
</style>
