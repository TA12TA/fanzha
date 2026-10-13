<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
import { BRAND, MANUAL_GENERAL } from '@/data/level01'
import { hasOutcome } from '@/app/navigation'
import antifraudLogo from '@/assets/antifraud-logo.png'
import type { GameState } from '@/game/types'

/**
 * 国家反诈中心（应用）：未结束时展示不剧透的通用提醒；
 * 结局/复盘产生后提供「看本局结果」入口。
 *
 * 「识骗手册」已并入本应用，作为应用内的栏目名，不再单独占一个桌面图标。
 */
const props = defineProps<{ state: GameState }>()

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

      <h2 class="manual__title">{{ MANUAL_GENERAL.title }}</h2>

      <ul class="manual__list">
        <li v-for="item in MANUAL_GENERAL.items" :key="item.title" class="card">
          <h3 class="manual__itemtitle">{{ item.title }}</h3>
          <p class="manual__itemtext">{{ item.body }}</p>
        </li>
      </ul>

      <p class="manual__disclaimer">{{ MANUAL_GENERAL.disclaimer }}</p>

      <!-- 已产生结局时，应用提供再次进入本局结果与复盘的入口 -->
      <button
        v-if="hasOutcome(props.state.node)"
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

.manual__disclaimer {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

.manual__outcome {
  min-height: 50px;
}
</style>
