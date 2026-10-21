<script setup lang="ts">
/**
 * 首屏的「作品封面/导览」。
 *
 * 它只在玩家第一次进入作品时出现，进入后由 LevelDesk 写入 localStorage。
 * 目的不是加免责声明，而是让第一次打开链接的人先知道：这是什么作品、
 * 大约多长、点哪里开始——同时仍然把场景留在同一张书桌上。
 */
import { playSound } from '@/app/sound'

const emit = defineEmits<{ (e: 'close'): void }>()

function start(): void {
  playSound('tap')
  emit('close')
}
</script>

<template>
  <section class="work-intro" role="dialog" aria-modal="true" aria-labelledby="work-intro-title">
    <article class="work-intro__card">
      <h2 id="work-intro-title" class="work-intro__title">反诈局中局</h2>
      <p class="work-intro__subtitle">你的手机</p>

      <p class="work-intro__premise">
        三部手机，三个常见的校园骗局。点开任意一部，从一条消息开始。
      </p>

      <p class="work-intro__guide">
        点手机选一关，上滑解锁。拿不准的时候，钱包和反诈手册都在桌面上。
      </p>

      <p class="work-intro__meta">约 8 分钟</p>

      <button type="button" class="btn btn--primary work-intro__start" autofocus @click="start">
        进入作品
      </button>
    </article>
  </section>
</template>

<style scoped>
.work-intro {
  position: absolute;
  inset: 0;
  z-index: 9;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: rgb(3 8 5 / 58%);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}

.work-intro__card {
  width: 100%;
  max-width: 330px;
  padding: 26px 22px 22px;
  border: 1px solid var(--c-line);
  border-radius: var(--radius-lg);
  background: var(--c-surface);
  color: var(--c-text);
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 20%),
    0 22px 60px rgb(0 0 0 / 36%);
}

.work-intro__title {
  margin-top: 8px;
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 700;
  line-height: 1.18;
  letter-spacing: 0.08em;
}

.work-intro__subtitle {
  margin-top: -2px;
  font-family: var(--font-display);
  font-size: 20px;
  letter-spacing: 0.18em;
  color: var(--c-primary);
}

.work-intro__premise {
  margin-top: 16px;
  font-size: var(--font-sm);
  line-height: 1.7;
  color: var(--c-text-soft);
}

.work-intro__guide {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--c-line);
  font-size: 12px;
  line-height: 1.7;
  color: var(--c-text-soft);
}

.work-intro__meta {
  margin-top: 12px;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--c-text-tertiary);
}

.work-intro__start {
  width: 100%;
  margin-top: 16px;
}

@media (prefers-reduced-motion: no-preference) {
  .work-intro__card {
    animation: work-intro-in 300ms var(--dur-slow) both;
  }
}

@keyframes work-intro-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.985);
  }
}

@media (prefers-reduced-motion: reduce) {
  .work-intro__card {
    animation: none;
  }
}
</style>
