<script setup lang="ts">
import { computed } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import type { PlayableLevel } from '@/game/level'
import type { GameState } from '@/game/types'

/**
 * S8 手机内结局：仍在手机壳内，以系统结果卡呈现。
 *
 * 结局文案、初始余额都从当前关卡读取；「及时止损」区分
 * 「转账前取消」（损失 0）与「付过一笔后止损」。
 */
const props = defineProps<{
  state: GameState
  level: PlayableLevel
}>()

const emit = defineEmits<{
  (e: 'choose', optionId: 'review'): void
  (e: 'back'): void
  /** 直接回到关卡大厅（一级菜单）重新选关。 */
  (e: 'open-levels'): void
}>()

const info = computed(() => {
  const fallback = Object.keys(props.level.endings)[0] ?? ''
  const key = props.state.ending ?? fallback
  return props.level.endings[key] ?? { title: '本局结果', reason: '' }
})

const stoppedBeforePaying = computed(() => props.state.paidTotal === 0)

const lossText = computed(() =>
  stoppedBeforePaying.value
    ? '一分没花，你在付款前退出了'
    : `一共出去 ${props.state.paidTotal} 元`,
)
</script>

<template>
  <section class="ending" aria-label="本局结果">
    <AppHeader title="本局结果" show-back @back="emit('back')" />

    <div class="ending__body">
      <article class="resultcard" aria-live="polite">
        <p class="resultcard__kind">{{ info.title }}</p>
        <p class="resultcard__reason">{{ info.reason }}</p>

        <dl class="resultcard__stats">
          <div>
            <dt>余额</dt>
            <dd>{{ state.balance }} 元</dd>
          </div>
          <div>
            <dt>一共出去</dt>
            <dd :class="{ 'resultcard__zero': stoppedBeforePaying }">
              {{ state.paidTotal }} 元
            </dd>
          </div>
          <div>
            <dt>付了几笔</dt>
            <dd>{{ state.paidCount }} 笔</dd>
          </div>
        </dl>

        <p class="resultcard__loss">{{ lossText }}</p>
        <p class="resultcard__note">
          开始时有 {{ level.initialBalance }} 元。这只是游戏里的账，现实中钱转出去不保证能追回来。
        </p>
      </article>

      <button type="button" class="btn btn--primary ending__review" @click="emit('choose', 'review')">
        看复盘
      </button>

      <!--
        结束后直接回一级菜单（关卡大厅）重新选关。
        此前要回大厅得先点「看复盘」再点「返回关卡大厅」，两跳；
        用户在结局页想「换个关玩」时这两跳没有意义。
      -->
      <button type="button" class="btn btn--secondary" @click="emit('open-levels')">
        返回关卡大厅
      </button>
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
