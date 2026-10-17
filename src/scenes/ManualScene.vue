<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
import { BRAND, MANUAL_GENERAL } from '@/data/levels/shared'
import { hasOutcome } from '@/app/navigation'
import antifraudLogo from '@/assets/antifraud-logo.png'
import type { PlayableLevel } from '@/game/level'
import type { GameState } from '@/game/types'

/**
 * 国家反诈中心（应用）：未结束时展示不剧透的通用提醒；
 * 结局/复盘产生后提供「看本局结果」入口。
 *
 * 「识骗手册」已并入本应用，作为应用内的栏目名，不再单独占一个桌面图标。
 *
 * 通用条目与具体骗局无关（放在 shared）；这里额外钉一句**本关的正确做法**，
 * 让手册在玩的这一关里有针对性，而不是一份和本局无关的说明书。
 */
const props = defineProps<{
  state: GameState
  level: PlayableLevel
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'open-outcome'): void
}>()
</script>

<template>
  <section class="manual" :aria-label="BRAND.manual">
    <AppHeader :title="BRAND.manual" :subtitle="BRAND.manualSection" show-back @back="emit('back')" />

    <div class="manual__body">
      <!-- 应用标识：使用官方 logo 图片 -->
      <div class="appbrand">
        <span class="appbrand__icon" aria-hidden="true">
          <img :src="antifraudLogo" alt="" width="44" height="44" class="appbrand__logo" />
        </span>
        <span class="appbrand__text">
          <span class="appbrand__name">{{ BRAND.manual }}</span>
          <span class="appbrand__desc">预警提示与防骗知识</span>
        </span>
      </div>

      <!-- 本关一句话正确做法：与关卡大厅卡片、复盘页共用同一句 -->
      <article class="goal">
        <p class="goal__label">{{ level.meta.ordinal }}「{{ level.meta.title }}」</p>
        <p class="goal__text">{{ level.meta.goal }}</p>
      </article>

      <h2 class="manual__title">{{ MANUAL_GENERAL.title }}</h2>

      <ul class="manual__list">
        <li v-for="item in MANUAL_GENERAL.items" :key="item.title" class="card">
          <h3 class="manual__itemtitle">{{ item.title }}</h3>
          <p class="manual__itemtext">{{ item.body }}</p>
        </li>
      </ul>

      <!--
        这里**故意不放页脚免责声明**（用户要求去掉「以上是通用提醒…」那句话，
        以及类似的"不构成法律建议"式套话）。边界由文案本身承担，
        「剧情演示 · 不涉及真实资金」那套模拟标记另有组件持续显示。
      -->

      <!-- 已产生结局时，应用提供再次进入本局结果与复盘的入口 -->
      <button
        v-if="hasOutcome(props.level, props.state.node)"
        type="button"
        class="btn btn--primary manual__outcome"
        @click="emit('open-outcome')"
      >
        看本局结果
      </button>
    </div>
  </section>
</template>

<style scoped>
.manual {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--c-manual-bg);
}

.manual__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
  padding: var(--space-3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* 应用标识条 */
.appbrand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, #1b4f8f, #163d70);
  color: #fff;
  box-shadow: var(--shadow-card);
}

.appbrand__icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgb(255 255 255 / 16%);
  overflow: hidden;
}

.appbrand__logo {
  display: block;
  width: 44px;
  height: 44px;
}

.appbrand__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.appbrand__name {
  font-size: var(--font-md);
  font-weight: 700;
}

.appbrand__desc {
  font-size: var(--font-xs);
  color: #bcd2ec;
}

/* 本关正确做法 */
.goal {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
}

.goal__label {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

.goal__text {
  font-size: var(--font-base);
  font-weight: 700;
  line-height: 1.5;
}

.manual__title {
  font-size: var(--font-md);
  font-weight: 700;
}

.manual__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.manual__itemtitle {
  margin-bottom: 2px;
  font-size: var(--font-base);
  font-weight: 700;
}

.manual__itemtext {
  font-size: var(--font-sm);
  line-height: 1.6;
  color: var(--c-text-soft);
}

.manual__outcome {
  min-height: 50px;
}
</style>
