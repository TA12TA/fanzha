<script setup lang="ts">
import { computed } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import SimulationBadge from '@/components/SimulationBadge.vue'
import { BRAND } from '@/data/levels/shared'
import { pendingRequestOf } from '@/app/navigation'
import type { PlayableLevel } from '@/game/level'
import type { GameState, OptionId } from '@/game/types'

/**
 * S4/S7 安心钱包：同一组件按当前节点的待确认请求参数化。
 *
 * 金额扣减只来自剧情引擎：本组件仅 emit 选项 ID，绝不自行改余额。
 * 非待确认节点只展示余额与记录，不能绕过剧情发起付款。
 *
 * 金额、按钮文案、收支记录、平台数字说明全部由关卡提供，
 * 因此新增关卡不用改本组件。
 */
const props = defineProps<{
  state: GameState
  level: PlayableLevel
  /** 提交后立即禁用按钮，防止连点二次扣款。 */
  submitting: boolean
}>()

const emit = defineEmits<{
  (e: 'choose', optionId: OptionId): void
  (e: 'back'): void
}>()

/** 当前节点的待确认请求（金额 + 确认/取消选项），没有则为 null。 */
const request = computed(() => pendingRequestOf(props.level, props.state.node))

/** 确认/取消按钮文案直接取选项的 label，保证与引擎声明永远一致。 */
const confirmLabel = computed(() =>
  request.value ? props.level.options[request.value.confirm]?.label : undefined,
)
const cancelLabel = computed(() =>
  request.value ? props.level.options[request.value.cancel]?.label : undefined,
)

/** 模拟收支记录：完全由关卡 + 状态推导，不单独存储。 */
const records = computed(() => props.level.walletRecords(props.state))
</script>

<template>
  <section class="wallet" aria-label="安心钱包">
    <AppHeader :title="BRAND.wallet" show-back @back="emit('back')" />

    <div class="wallet__body">
      <div class="balance">
        <p class="balance__label">可用余额</p>
        <p class="balance__amount" aria-live="polite">
          {{ state.balance }} <span>元</span>
        </p>
        <p class="balance__note">
          {{ level.copy.spentLabel }} {{ state.paidTotal }} 元，共 {{ state.paidCount }} 笔
        </p>
      </div>

      <div v-if="state.platformDisplayed > 0" class="platform">
        <p class="platform__label">{{ level.copy.platformLabel }}</p>
        <p class="platform__amount">{{ state.platformDisplayed }} <span>元</span></p>
        <p class="platform__note">{{ level.copy.platformWalletNote }}</p>
      </div>

      <section v-if="request" class="request" aria-label="待确认的付款">
        <p class="request__title">{{ request.title }}</p>
        <p class="request__amount">{{ request.amount }} <span>元</span></p>
        <p class="request__hint">离开只是先放着，不会扣款或取消。</p>
        <SimulationBadge strong text="游戏内模拟，不会动你的真钱" />
        <div class="request__actions">
          <button
            type="button"
            class="btn btn--primary request__confirm"
            :disabled="submitting"
            @click="emit('choose', request.confirm)"
          >
            {{ confirmLabel }}
          </button>
          <button
            type="button"
            class="btn btn--secondary"
            :disabled="submitting"
            @click="emit('choose', request.cancel)"
          >
            {{ cancelLabel }}
          </button>
        </div>
        <p class="request__note">不用输卡号、验证码或密码。</p>
      </section>

      <section v-else class="norequest" aria-label="当前没有待处理请求">
        <p class="norequest__title">没有待处理的钱</p>
        <p class="norequest__text">这里只显示余额和记录。</p>
      </section>

      <section class="records" aria-label="收支记录">
        <h2 class="records__title">记录</h2>
        <ul class="records__list">
          <li v-for="record in records" :key="record.label">
            <span>{{ record.label }}</span>
            <span :class="{ 'records__minus': record.amount < 0 }">
              {{ record.amount > 0 ? '+' : '' }}{{ record.amount }} 元
            </span>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>

<style scoped>
.wallet {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--c-wallet-bg);
}

.wallet__body {
  display: flex;
  flex-direction: column;
  /* 三块卡（余额 / 待确认 / 记录）之间留出等距节奏，避免挤成一摞 */
  gap: var(--space-4);
  flex: 1;
  min-height: 0;
  padding: var(--space-4) var(--space-3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.balance {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: linear-gradient(150deg, #21589c, #163d70 78%);
  color: #fff;
  box-shadow:
    /* 顶部一道极淡内高光：深色卡片没有它就像一块平色块 */
    inset 0 1px 0 rgb(255 255 255 / 14%),
    var(--shadow-card);
}

.balance__label {
  font-size: var(--font-xs);
  color: #bcd2ec;
}

.balance__amount {
  font-size: 34px;
  font-weight: 700;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.balance__amount span {
  font-size: var(--font-base);
  font-weight: 500;
}

.balance__note {
  font-size: var(--font-xs);
  color: #bcd2ec;
}

.platform {
  padding: var(--space-3);
  border: 1px dashed var(--c-warn-line);
  border-radius: var(--radius-md);
  background: var(--c-warn-bg);
  color: var(--c-warn-text);
}

.platform__label {
  font-size: var(--font-xs);
  font-weight: 700;
}

.platform__amount {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.platform__amount span {
  font-size: var(--font-xs);
  font-weight: 500;
}

.platform__note {
  font-size: var(--font-xs);
  line-height: 1.55;
}

.request {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
}

.request__title {
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--c-text-soft);
}

.request__amount {
  font-size: 30px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.request__amount span {
  font-size: var(--font-base);
  font-weight: 500;
}

.request__hint,
.request__note {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
  line-height: 1.55;
}

.request__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.request__confirm {
  min-height: 50px;
}

.norequest {
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
}

.norequest__title {
  font-size: var(--font-base);
  font-weight: 700;
}

.norequest__text {
  font-size: var(--font-sm);
  color: var(--c-text-soft);
}

.records {
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
}

.records__title {
  margin-bottom: var(--space-2);
  font-size: var(--font-base);
  font-weight: 700;
}

.records__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--font-sm);
}

.records__list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.records__minus {
  color: var(--c-danger);
  font-weight: 600;
}

.records__note {
  margin-top: var(--space-2);
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}
</style>
