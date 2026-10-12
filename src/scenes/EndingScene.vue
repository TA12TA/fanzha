<script setup lang="ts">
import { computed } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import SimulationBadge from '@/components/SimulationBadge.vue'
import { ENDING_INFO, INITIAL_BALANCE } from '@/data/level01'
import type { GameState } from '@/game/types'

/**
 * S8 手机内结局：仍在手机壳内，以系统结果卡呈现。
 * `end-stop` 区分「转账前取消」（损失 0）与「首次垫付后止损」（损失 100）。
 */
const props = defineProps<{ state: GameState }>()

const emit = defineEmits<{
  (e: 'choose', optionId: 'review'): void
  (e: 'back'): void
}>()

const info = computed(() => {
  const key = props.state.ending ?? 'end-stop'
  return ENDING_INFO[key]
})

const stoppedBeforePaying = computed(() => props.state.paidTotal === 0)

const lossText = computed(() =>
  stoppedBeforePaying.value
    ? '模拟损失 0 元（在付款前停止）'
    : `累计模拟损失 ${props.state.paidTotal} 元`,
)
</script>

<template>
  <section class="ending" aria-label="本局结果">
    <AppHeader title="本局结果" subtitle="剧情模拟 · 手机内结果卡" show-back @back="emit('back')" />

    <div class="ending__body">
      <SimulationBadge text="结果仅为游戏模拟，不涉及真实资金" />

      <article class="resultcard" aria-live="polite">
        <p class="resultcard__kind">{{ info.title }}</p>
        <p class="resultcard__reason">{{ info.reason }}</p>

        <dl class="resultcard__stats">
          <div>
            <dt>模拟余额</dt>
            <dd>{{ state.balance }} 元</dd>
          </div>
          <div>
            <dt>累计模拟损失</dt>
            <dd :class="{ 'resultcard__zero': stoppedBeforePaying }">
              {{ state.paidTotal }} 元
            </dd>
          </div>
          <div>
            <dt>已确认模拟垫付</dt>
            <dd>{{ state.paidCount }} 笔</dd>
          </div>
        </dl>

        <p class="resultcard__loss">{{ lossText }}</p>
        <p class="resultcard__note">
          初始模拟生活费 {{ INITIAL_BALANCE }} 元。以上数值仅用于本局游戏，现实中不承诺追回任何损失。
        </p>
      </article>

      <button type="button" class="btn btn--primary ending__review" @click="emit('choose', 'review')">
        查看我的反诈复盘
      </button>
      <p class="ending__hint">
        也可以先回桌面或用识骗手册浏览其他内容，结果与复盘入口会一直保留。
      </p>
    </div>
  </section>
</template>

<style scoped>
.ending {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--c-manual-bg);
}

.ending__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
  padding: var(--space-3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.resultcard {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
}

.resultcard__kind {
  font-size: var(--font-lg);
  font-weight: 800;
}

.resultcard__reason {
  font-size: var(--font-sm);
  line-height: 1.6;
  color: var(--c-text-soft);
}

.resultcard__stats {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: var(--space-1) 0;
}

.resultcard__stats div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.resultcard__stats dt {
  font-size: var(--font-sm);
  color: var(--c-text-soft);
}

.resultcard__stats dd {
  margin: 0;
  font-size: var(--font-md);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.resultcard__zero {
  color: var(--c-accent);
}

.resultcard__loss {
  font-size: var(--font-sm);
  font-weight: 600;
}

.resultcard__note {
  font-size: var(--font-xs);
  line-height: 1.55;
  color: var(--c-text-soft);
}

.ending__review {
  min-height: 50px;
}

.ending__hint {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}
</style>
