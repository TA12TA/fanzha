<script setup lang="ts">
import { computed } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import SimulationBadge from '@/components/SimulationBadge.vue'
import { BRAND } from '@/data/level01'
import { buildDebrief, riskLabelsOf } from '@/game/debrief'
import type { GameState } from '@/game/types'

/**
 * S9 手机内反诈复盘：以识骗手册的标记会话形式，按玩家实际经历逐段展示。
 * 只引用亲历环节；结尾给出可执行建议，不承诺追回。
 */
const props = defineProps<{ state: GameState }>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'request-restart'): void
}>()

const debrief = computed(() => buildDebrief(props.state))
const labels = computed(() => riskLabelsOf(props.state))
</script>

<template>
  <section class="review" aria-label="反诈复盘">
    <AppHeader
      :title="`${BRAND.manual} · 本局复盘`"
      subtitle="按你实际经历的环节生成"
      show-back
      @back="emit('back')"
    />

    <div class="review__body">
      <SimulationBadge text="复盘内容为反诈教育提示 · 不承诺追回损失" />

      <article class="summary">
        <p class="summary__label">本局结果</p>
        <p class="summary__ending">{{ debrief.endingLabel }}</p>
        <p class="summary__text">{{ debrief.summary }}</p>
      </article>

      <section v-if="labels.length" class="tags" aria-label="本局经历标注">
        <h2 class="tags__title">本局经历标注</h2>
        <ul class="tags__list">
          <li v-for="label in labels" :key="label" class="tag tags__item">{{ label }}</li>
        </ul>
      </section>

      <section class="items" aria-label="按经历复盘">
        <h2 class="items__title">你遇到的环节与风险</h2>
        <ol class="items__list">
          <li v-for="item in debrief.items" :key="item.id" class="card items__item">
            <h3 class="items__itemtitle">{{ item.title }}</h3>
            <p class="items__observation">{{ item.observation }}</p>
            <p class="items__risk"><span class="items__key">风险：</span>{{ item.risk }}</p>
            <p class="items__advice"><span class="items__key">正确做法：</span>{{ item.advice }}</p>
          </li>
        </ol>
      </section>

      <section class="actions" aria-label="行动建议">
        <h2 class="actions__title">记住这几步</h2>
        <ol class="actions__list">
          <li v-for="action in debrief.actions" :key="action">{{ action }}</li>
        </ol>
        <p class="actions__note">
          报警不保证追回损失，但停止付款、保存证据并及时求助，能避免损失继续扩大。
        </p>
      </section>

      <button type="button" class="btn btn--primary review__restart" @click="emit('request-restart')">
        再玩一次
      </button>
      <p class="review__hint">重开前会先弹出确认，避免误触清空本局记录。</p>
    </div>
  </section>
</template>

<style scoped>
.review {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--c-manual-bg);
}

.review__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
  padding: var(--space-3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: linear-gradient(150deg, #17513f, #10402f);
  color: #fff;
  box-shadow: var(--shadow-card);
}

.summary__label {
  font-size: var(--font-xs);
  color: #a9dcc7;
}

.summary__ending {
  font-size: var(--font-lg);
  font-weight: 800;
}

.summary__text {
  font-size: var(--font-sm);
  line-height: 1.6;
  color: #d6efe3;
}

.tags__title,
.items__title,
.actions__title {
  margin-bottom: var(--space-2);
  font-size: var(--font-base);
  font-weight: 700;
}

.tags__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tags__item {
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  color: var(--c-text-soft);
}

.items__list,
.actions__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.items__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.items__itemtitle {
  font-size: var(--font-base);
  font-weight: 700;
}

.items__observation,
.items__risk,
.items__advice {
  font-size: var(--font-sm);
  line-height: 1.6;
}

.items__observation {
  color: var(--c-text-soft);
}

.items__key {
  font-weight: 700;
  color: var(--c-text);
}

.actions__list {
  counter-reset: step;
  gap: var(--space-2);
}

.actions__list li {
  position: relative;
  padding-left: 26px;
  font-size: var(--font-sm);
  line-height: 1.6;
}

.actions__list li::before {
  counter-increment: step;
  content: counter(step);
  position: absolute;
  left: 0;
  top: 1px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--c-accent);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

.actions__note {
  margin-top: var(--space-2);
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

.review__restart {
  min-height: 50px;
}

.review__hint {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}
</style>
