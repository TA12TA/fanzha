<script setup lang="ts">
/** S0 开场 / 锁屏：全屏背景、作品标题与开始按钮。 */
const emit = defineEmits<{ (e: 'start'): void }>()
</script>

<template>
  <section class="intro" aria-labelledby="intro-title">
    <div class="intro__wall" aria-hidden="true"></div>

    <div class="intro__body">
      <p class="intro__clock">9:41</p>
      <h1 id="intro-title" class="intro__title">反诈局中局：你的手机</h1>
      <p class="intro__subtitle">大学生反诈互动 · 第一关「刷单返利」</p>
      <p class="intro__hint">
        接下来你手上是一部虚构的手机，里面的群、人、钱都是编的。约 3 分钟。
      </p>

      <button type="button" class="btn btn--primary intro__start" @click="emit('start')">
        开始体验
      </button>

      <p class="intro__foot">
        游戏里给你 800 元虚拟生活费。本作只做反诈教育，不接支付、不收任何个人信息。
      </p>
    </div>
  </section>
</template>

<style scoped>
.intro {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-5);
  padding-bottom: calc(var(--space-6) + var(--safe-bottom));
  color: var(--c-text-invert);
  background: linear-gradient(170deg, var(--c-desktop-1), var(--c-desktop-2));
  overflow-y: auto;
}

.intro__wall {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 22% 18%, rgb(64 132 224 / 34%), transparent 46%),
    radial-gradient(circle at 82% 74%, rgb(20 160 140 / 26%), transparent 44%);
  pointer-events: none;
}

.intro__body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.intro__clock {
  font-size: 46px;
  font-weight: 300;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
}

.intro__title {
  font-size: var(--font-xl);
  font-weight: 800;
  line-height: 1.3;
}

.intro__subtitle {
  font-size: var(--font-base);
  color: #b9c9de;
}

.intro__hint {
  font-size: var(--font-sm);
  line-height: 1.6;
  color: #9fb2c9;
}

.intro__start {
  width: 100%;
  min-height: 52px;
  margin-top: var(--space-2);
  font-size: var(--font-md);
}

.intro__foot {
  font-size: var(--font-xs);
  line-height: 1.6;
  color: #8ba0b8;
}
</style>
