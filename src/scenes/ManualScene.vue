<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
import SimulationBadge from '@/components/SimulationBadge.vue'
import { BRAND, MANUAL_GENERAL } from '@/data/level01'
import { hasOutcome } from '@/app/navigation'
import type { GameState } from '@/game/types'

/**
 * 识骗手册：未结束时展示不剧透的通用提醒；
 * 结局/复盘产生后提供「查看本局结果与复盘」入口。
 */
const props = defineProps<{ state: GameState }>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'open-outcome'): void
}>()
</script>

<template>
  <section class="manual" aria-label="识骗手册">
    <AppHeader :title="BRAND.manual" subtitle="通用防诈提醒 · 剧情模拟" show-back @back="emit('back')" />

    <div class="manual__body">
      <SimulationBadge text="本手册为反诈教育内容 · 不承诺追回损失" />

      <h2 class="manual__title">{{ MANUAL_GENERAL.title }}</h2>

      <ul class="manual__list">
        <li v-for="item in MANUAL_GENERAL.items" :key="item.title" class="card">
          <h3 class="manual__itemtitle">{{ item.title }}</h3>
          <p class="manual__itemtext">{{ item.body }}</p>
        </li>
      </ul>

      <p class="manual__disclaimer">{{ MANUAL_GENERAL.disclaimer }}</p>

      <!-- 已产生结局时，手册提供再次进入本局结果与复盘的入口 -->
      <button
        v-if="hasOutcome(props.state.node)"
        type="button"
        class="btn btn--primary manual__outcome"
        @click="emit('open-outcome')"
      >
        查看本局结果与复盘
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
