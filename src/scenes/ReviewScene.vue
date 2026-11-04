<script setup lang="ts">
import { computed, ref } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import { BRAND } from '@/data/levels/shared'
import { buildDebrief } from '@/game/debrief'
import { playSound } from '@/app/sound'
import type { PlayableLevel } from '@/game/level'
import type { DebriefRule } from '@/game/types'
import type { GameState } from '@/game/types'

/**
 * S9 手机内反诈复盘：以识骗手册的标记会话形式，按玩家实际经历逐段展示。
 * 只引用亲历环节；结尾给出可执行建议，不承诺追回。
 *
 * 复盘内容全部来自当前关卡，本组件不含任何具体骗局的话术。
 */
const props = defineProps<{
  state: GameState
  level: PlayableLevel
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'request-restart'): void
  (e: 'open-levels'): void
}>()

const debrief = computed(() => buildDebrief(props.state))

/** 风险标签 → 对应的复盘条目；标签由关卡数据提供，不在组件里写死。 */
interface TagEntry {
  id: string
  label: string
  rules: DebriefRule[]
}

const activeTag = ref<string | null>(null)

const tagEntries = computed<TagEntry[]>(() =>
  props.state.riskTags
    .map((tag) => ({
      id: tag,
      label: props.level.riskTagLabels[tag],
      rules: props.level.debriefRules.filter((rule) => rule.triggers.includes(tag)),
    }))
    .filter((entry) => Boolean(entry.label)),
)

const activeEntry = computed(
  () => tagEntries.value.find((entry) => entry.id === activeTag.value) ?? null,
)

const visibleItems = computed(() => {
  if (!activeEntry.value) return debrief.value.items
  const ids = new Set(activeEntry.value.rules.map((rule) => rule.id))
  return debrief.value.items.filter((item) => ids.has(item.id))
})

/** 最关键的失误放在最前面；其余环节按原顺序展开。 */
const keyItem = computed(() => visibleItems.value[0] ?? null)
const restItems = computed(() => visibleItems.value.slice(1))

/** 已转出金额占初始余额的比例，用于“钱的去向”横条。 */
const lossPercent = computed(() => {
  const initial = props.level.initialBalance
  if (!initial) return 0
  return Math.min(100, Math.max(0, (props.state.paidTotal / initial) * 100))
})

/**
 * 只把真正扣过钱的操作做成步骤，避免把“看资料/回消息”也算成损失。
 * 文案从关卡选项里取，组件不写死具体关卡的话术。
 */
const moneySteps = computed(() =>
  props.state.history
    .filter((entry) => entry.moneyChanged)
    .map((entry) => {
      const option = props.level.options[entry.optionId]
      const effect = option?.effect
      const amount = Math.abs(effect?.paidDelta ?? effect?.balanceDelta ?? 0)
      return {
        id: `${entry.from}:${entry.optionId}`,
        label: option?.label ?? '一次操作',
        amount,
      }
    })
    .filter((step) => step.amount > 0),
)

function selectTag(tag: string): void {
  playSound('tap')
  activeTag.value = activeTag.value === tag ? null : tag
}
</script>

<template>
  <section class="review" aria-label="反诈复盘">
    <AppHeader :title="`${BRAND.manual} · 复盘`" show-back @back="emit('back')" />

    <div class="review__body">
      <!-- 结果：先给结论，再给数字 -->
      <article class="summary" :class="state.paidTotal > 0 ? 'summary--loss' : 'summary--safe'">
        <p class="summary__label">这局结果</p>
        <p class="summary__ending">{{ debrief.endingLabel }}</p>
        <p class="summary__text">{{ debrief.summary }}</p>
        <dl class="summary__numbers">
          <div>
            <dt>已转出</dt>
            <dd>{{ state.paidTotal }} 元</dd>
          </div>
          <div>
            <dt>剩余</dt>
            <dd>{{ state.balance }} 元</dd>
          </div>
        </dl>
      </article>

      <!-- 钱的去向：一条横条 + 每一笔扣款 -->
      <section class="flow" aria-label="钱的去向">
        <div class="flow__head">
          <h2>钱的去向</h2>
          <span>初始 {{ level.initialBalance }} 元</span>
        </div>
        <div class="flow__bar" aria-hidden="true">
          <span class="flow__spent" :style="{ width: `${lossPercent}%` }"></span>
        </div>
        <div class="flow__legend">
          <span class="flow__loss">已转出 {{ state.paidTotal }} 元</span>
          <span class="flow__remain">剩余 {{ state.balance }} 元</span>
        </div>
        <ol v-if="moneySteps.length" class="flow__steps">
          <li v-for="(step, index) in moneySteps" :key="step.id">
            <span class="flow__stepnum">{{ index + 1 }}</span>
            <span class="flow__steplabel">{{ step.label }}</span>
            <span class="flow__stepamount">−{{ step.amount }} 元</span>
          </li>
        </ol>
        <p v-else class="flow__none">这局没有转出钱。</p>
      </section>

      <section v-if="tagEntries.length" class="tags" aria-label="本局经历">
        <h2 class="tags__title">你这局遇到的</h2>
        <ul class="tags__list">
          <li v-for="entry in tagEntries" :key="entry.id">
            <button
              type="button"
              class="tag tags__button"
              :class="{ 'tags__button--on': activeTag === entry.id }"
              :aria-pressed="activeTag === entry.id ? 'true' : 'false'"
              aria-controls="review-items"
              @click="selectTag(entry.id)"
            >
              {{ entry.label }}
            </button>
          </li>
        </ul>
      </section>

      <section id="review-items" class="items" aria-label="按经历复盘">
        <h2 class="items__title">
          {{ activeEntry ? '对应的诈骗类型' : '这次发生了什么' }}
        </h2>

        <template v-if="visibleItems.length">
          <article v-if="keyItem" class="key">
            <p class="key__label">关键一步</p>
            <h3 class="key__title">{{ keyItem.title }}</h3>
            <p class="key__observation">{{ keyItem.observation }}</p>
            <p class="key__risk"><span class="items__key">问题在哪：</span>{{ keyItem.risk }}</p>
            <p class="key__advice"><span class="items__key">该怎么做：</span>{{ keyItem.advice }}</p>
          </article>

          <ol v-if="restItems.length" class="items__list">
            <li v-for="item in restItems" :key="item.id" class="items__item">
              <h3 class="items__itemtitle">{{ item.title }}</h3>
              <p class="items__observation">{{ item.observation }}</p>
              <p class="items__risk"><span class="items__key">问题在哪：</span>{{ item.risk }}</p>
              <p class="items__advice"><span class="items__key">该怎么做：</span>{{ item.advice }}</p>
            </li>
          </ol>
        </template>
        <p v-else class="items__empty">这一类经历暂时没有单独的复盘条目。</p>
      </section>

      <section class="actions" aria-label="行动建议">
        <h2 class="actions__title">接下来可以这样做</h2>
        <ol class="actions__list">
          <li v-for="action in debrief.actions" :key="action">{{ action }}</li>
        </ol>
        <p class="actions__note">
          报警不保证把钱追回来，但停下来、留证据、早求助，能少亏一些。
        </p>
      </section>

      <p class="review__goal">{{ level.meta.goal }}</p>

      <button type="button" class="btn btn--primary review__restart" @click="emit('request-restart')">
        再玩一次
      </button>

      <button type="button" class="btn btn--secondary review__levels" @click="emit('open-levels')">
        返回关卡大厅
      </button>
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
  gap: var(--space-4);
  flex: 1;
  min-height: 0;
  padding: var(--space-4) var(--space-3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* ============ 结果 ============ */

.summary {
  padding: var(--space-2) 0 var(--space-3) var(--space-3);
  border-left: 3px solid var(--c-line);
}

.summary--loss {
  border-left-color: var(--c-danger);
}

.summary--safe {
  border-left-color: var(--c-primary);
}

.summary__label {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

.summary__ending {
  margin-top: 2px;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.summary__text {
  margin-top: var(--space-1);
  font-size: var(--font-sm);
  line-height: 1.6;
  color: var(--c-text-soft);
}

.summary__numbers {
  display: flex;
  gap: var(--space-6);
  margin: var(--space-3) 0 0;
}

.summary__numbers div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary__numbers dt {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

.summary__numbers dd {
  margin: 0;
  font-size: var(--font-lg);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.summary--loss .summary__numbers div:first-child dd {
  color: var(--c-danger);
}

.summary--safe .summary__numbers div:first-child dd {
  color: var(--c-primary);
}

/* ============ 钱的去向 ============ */

.flow {
  padding: var(--space-1) 0 var(--space-3);
  border-bottom: 1px solid var(--c-line);
}

.flow__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.flow__head h2 {
  font-size: var(--font-base);
  font-weight: 700;
}

.flow__head span {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

.flow__bar {
  height: 10px;
  margin: var(--space-3) 0 var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--c-primary-soft);
  overflow: hidden;
}

.flow__spent {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--c-danger);
  transition: width var(--dur-base) ease;
}

.flow__legend {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--font-xs);
}

.flow__loss {
  color: var(--c-danger);
  font-weight: 600;
}

.flow__remain {
  color: var(--c-primary);
  font-weight: 600;
}

.flow__steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: var(--space-3) 0 0;
  padding: 0;
  list-style: none;
}

.flow__steps li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-xs);
}

.flow__stepnum {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--c-danger-soft);
  color: var(--c-danger-text);
  font-size: 10px;
  font-weight: 700;
}

.flow__steplabel {
  flex: 1;
  min-width: 0;
  color: var(--c-text-soft);
}

.flow__stepamount {
  flex: none;
  color: var(--c-danger);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.flow__none {
  margin-top: var(--space-3);
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

/* ============ 标签筛选 ============ */

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

.tags__button {
  min-height: 32px;
  padding: 3px 10px;
  border: 1px solid var(--c-line);
  border-radius: var(--radius-pill);
  background: var(--c-surface);
  color: var(--c-text-soft);
  cursor: pointer;
  font: inherit;
}

.tags__button--on {
  border-color: var(--c-primary);
  background: var(--c-primary);
  color: var(--c-text-invert);
}

/* ============ 关键一步 + 其他环节 ============ */

.key {
  padding: var(--space-3);
  border-left: 3px solid var(--c-danger);
  border-radius: 0 var(--radius-control) var(--radius-control) 0;
  background: var(--c-danger-soft);
}

.key__label {
  font-size: var(--font-xs);
  font-weight: 700;
  color: var(--c-danger-text);
}

.key__title {
  margin-top: 2px;
  font-size: var(--font-md);
  font-weight: 700;
}

.key__observation,
.key__risk,
.key__advice {
  margin-top: var(--space-1);
  font-size: var(--font-sm);
  line-height: 1.6;
  color: var(--c-text-soft);
}

.key__risk {
  color: var(--c-danger-text);
}

.key__advice {
  color: var(--c-text);
}

.items__list,
.actions__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.items__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: var(--space-3);
  border-top: 1px solid var(--c-line);
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

.items__empty {
  font-size: var(--font-sm);
  color: var(--c-text-soft);
}

/* ============ 行动建议 ============ */

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

/* 一句话正确做法：复盘最后再钉一遍，与大厅卡片上的表述一致 */
.review__goal {
  padding: var(--space-3);
  border-radius: var(--radius-control);
  background: var(--c-primary-soft);
  color: var(--c-text);
  font-size: var(--font-sm);
  font-weight: 600;
  line-height: 1.6;
}

.review__restart,
.review__levels {
  min-height: 50px;
}
</style>
