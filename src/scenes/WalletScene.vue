<script setup lang="ts">
import { computed } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import SimulationBadge from '@/components/SimulationBadge.vue'
import { BRAND, INITIAL_BALANCE } from '@/data/level01'
import type { GameState, OptionId } from '@/game/types'

/**
 * S4/S7 安心钱包：同一组件按待确认金额参数化。
 *
 * 金额扣减只来自剧情引擎：本组件仅 emit 选项 ID，绝不自行改余额。
 * 非待确认节点只展示余额与记录，不能绕过群聊发起付款。
 */
const props = defineProps<{
  state: GameState
  /** 待确认的模拟垫付金额；null 表示当前没有待处理请求。 */
  pendingAmount: number | null
  /** 提交后立即禁用按钮，防止连点二次扣款。 */
  submitting: boolean
}>()

const emit = defineEmits<{
  (e: 'choose', optionId: OptionId): void
  (e: 'back'): void
}>()

const confirmId = computed<OptionId | null>(() => {
  if (props.pendingAmount === 100) return 'confirm-100'
  if (props.pendingAmount === 300) return 'confirm-300'
  return null
})

const cancelId = computed<OptionId | null>(() => {
  if (props.pendingAmount === 100) return 'cancel-100'
  if (props.pendingAmount === 300) return 'cancel-300'
  return null
})

/** 模拟收支记录：完全由状态推导，不单独存储。 */
const records = computed(() => {
  const list: { label: string; amount: number }[] = [
    { label: '游戏模拟生活费（初始）', amount: INITIAL_BALANCE },
  ]
  if (props.state.paidTotal >= 100) list.push({ label: '模拟垫付（首次任务）', amount: -100 })
  if (props.state.paidTotal >= 400) list.push({ label: '模拟垫付（追加「解冻」）', amount: -300 })
  return list
})
</script>

<template>
  <section class="wallet" aria-label="安心钱包">
    <AppHeader :title="BRAND.wallet" subtitle="模拟账户 · 无真实资金" show-back @back="emit('back')" />

    <div class="wallet__body">
      <SimulationBadge text="游戏模拟余额 · 不会扣除现实资金" />

      <div class="balance">
        <p class="balance__label">可支配模拟余额</p>
        <p class="balance__amount" aria-live="polite">
          {{ state.balance }} <span>元</span>
        </p>
        <p class="balance__note">
          已确认模拟垫付合计 {{ state.paidTotal }} 元（{{ state.paidCount }} 笔）
        </p>
      </div>

      <div v-if="state.platformDisplayed > 0" class="platform">
        <p class="platform__label">平台内显示（未兑现）</p>
        <p class="platform__amount">{{ state.platformDisplayed }} <span>元</span></p>
        <p class="platform__note">
          该数字不可提现，也不计入上面的可支配模拟余额。提现失败时它不会变成可用余额。
        </p>
      </div>

      <section v-if="pendingAmount !== null" class="request" aria-label="待确认的模拟垫付">
        <p class="request__title">待确认的模拟垫付</p>
        <p class="request__amount">{{ pendingAmount }} <span>元</span></p>
        <p class="request__hint">
          这是剧情要求的固定金额。离开此页只是暂停，不会扣款，也不会取消。
        </p>
        <SimulationBadge strong text="这是一笔游戏模拟垫付，不会扣现实资金" />
        <div class="request__actions">
          <button
            v-if="confirmId"
            type="button"
            class="btn btn--primary request__confirm"
            :disabled="submitting"
            @click="emit('choose', confirmId)"
          >
            确认模拟垫付 {{ pendingAmount }} 元
          </button>
          <button
            v-if="cancelId"
            type="button"
            class="btn btn--secondary"
            :disabled="submitting"
            @click="emit('choose', cancelId)"
          >
            取消，停止参与
          </button>
        </div>
        <p class="request__note">不需要输入银行卡号、验证码或支付密码。</p>
      </section>

      <section v-else class="norequest" aria-label="当前没有待处理请求">
        <p class="norequest__title">当前没有待处理的模拟付款</p>
        <p class="norequest__text">
          剧情尚未提出付款请求，或该请求已处理。此页面只展示模拟余额与记录。
        </p>
      </section>

      <section class="records" aria-label="模拟收支记录">
        <h2 class="records__title">模拟收支记录</h2>
        <ul class="records__list">
          <li v-for="record in records" :key="record.label">
            <span>{{ record.label }}</span>
            <span :class="{ 'records__minus': record.amount < 0 }">
              {{ record.amount > 0 ? '+' : '' }}{{ record.amount }} 元
            </span>
          </li>
        </ul>
        <p class="records__note">所有记录均为游戏模拟，与真实账户无关。</p>
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
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
  padding: var(--space-3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.balance {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: linear-gradient(150deg, #1d4f8f, #163d70);
  color: #fff;
  box-shadow: var(--shadow-card);
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
  gap: var(--space-2);
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
