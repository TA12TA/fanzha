<script setup lang="ts">
import type { ChatMessage } from '@/game/level'

/**
 * 单条聊天气泡。所有文案以文本插值渲染，不使用 v-html。
 *
 * 变体：
 * - `claim`    对方自称收益/到账（示意卡片）
 * - `risk`     风险提示卡（系统）
 * - `failed`   提现失败（系统）
 * - `transfer` 转账卡片（妈妈转来的生活费，让 800 元有明确来源）
 * - `order`    订单卡（第二关：购物订单，纯文字）
 * - `refund`   退款进度卡（第二关：平台内**未兑现**的数字）
 *
 * 订单卡与退款卡都是**纯文字 + 金额 + 状态**，不绘制任何平台 logo、
 * 不产出可以被单独传播的「诈骗素材截图」。
 */
defineProps<{
  message: ChatMessage
  /**
   * 是否显示「他自己说的」这类小标注。
   * 由会话决定只标一次（第一条自称到账的消息），
   * 否则连续几条自称到账的气泡会各带一句重复说明 —— 满屏重复提示等于没提示。
   */
  annotate?: boolean
}>()
</script>

<template>
  <div
    class="msg"
    :class="[`msg--${message.from}`, message.variant ? `msg--${message.variant}` : '']"
  >
    <!-- 转账卡片：模仿真实消息应用的转账气泡 -->
    <template v-if="message.variant === 'transfer'">
      <p class="transfer__amount">¥{{ message.amount }}</p>
      <p class="transfer__note">{{ message.transferNote }}</p>
      <p class="transfer__status">
        {{ message.transferStatus === 'received' ? '已收款' : '待确认收款' }}
      </p>
    </template>

    <!-- 订单卡：购物订单（纯文字，不画平台 logo） -->
    <template v-else-if="message.variant === 'order'">
      <div class="order__row">
        <img
          v-if="message.orderImage"
          class="order__image"
          :src="message.orderImage"
          :alt="message.orderTitle ?? '订单商品'"
          loading="lazy"
        />
        <div class="order__body">
          <p class="card__label">订单</p>
          <p class="card__title">{{ message.orderTitle }}</p>
          <p class="card__amount">¥{{ message.orderAmount }}</p>
          <p class="card__status">{{ message.orderStatus }}</p>
        </div>
      </div>
    </template>

    <!-- 退款进度卡：平台内未兑现的数字，样式上明确区别于钱包余额 -->
    <template v-else-if="message.variant === 'refund'">
      <p class="card__label">退款进度</p>
      <p class="card__amount">¥{{ message.refundAmount }}</p>
      <p class="card__status">{{ message.refundStatus }}</p>
      <p class="refund__note">平台内显示 · 未到账</p>
    </template>

    <!-- 对方发来的“通知”卡：只渲染文字字段，不复制任何官方标识或真实文书 -->
    <template v-else-if="message.variant === 'notice'">
      <p class="card__label">对方发来的文件</p>
      <p class="card__title">{{ message.noticeTitle }}</p>
      <dl v-if="message.noticeFields?.length" class="notice__fields">
        <div v-for="field in message.noticeFields" :key="field.label">
          <dt>{{ field.label }}</dt>
          <dd>{{ field.value }}</dd>
        </div>
      </dl>
      <p v-if="message.noticeNote" class="card__status">{{ message.noticeNote }}</p>
    </template>

    <template v-else>
      <!--
        气泡只负责内容；「谁说的」由外层消息行决定
        （群聊在气泡上方显示昵称，私聊不显示），避免私聊里重复出现名字。
      -->
      <p class="msg__text">{{ message.text }}</p>
      <p v-if="annotate && message.variant === 'claim'" class="msg__note">他自己说的</p>
      <p v-else-if="message.variant === 'failed'" class="msg__note">交易失败</p>
    </template>
  </div>
</template>

<style scoped>
.msg {
  max-width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid rgb(29 42 37 / 8%);
  border-radius: 4px 14px 14px 14px;
  background: var(--c-surface);
  box-shadow: 0 1px 1px rgb(29 42 37 / 6%);
}

.msg--me {
  border-radius: 14px 4px 14px 14px;
  background: var(--c-primary-soft);
}

.msg--system {
  max-width: 94%;
  background: var(--c-warn-bg);
  border: 1px solid var(--c-warn-line);
}

.msg--claim {
  background: var(--c-surface-2);
  border: 1px dashed var(--c-line);
}

.msg--failed {
  background: var(--c-danger-soft);
  border: 1px solid var(--c-danger-line);
  color: var(--c-danger-text);
}

/*
 * 转账卡片：真实消息应用里的转账是一张独立卡片，
 * 有金额、备注和状态，不是普通气泡。
 */
.msg--transfer {
  min-width: 180px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--c-warn-line);
  background: linear-gradient(150deg, var(--c-transfer-a), var(--c-transfer-b));
  color: var(--c-transfer-text);
  box-shadow: 0 3px 10px rgb(80 55 20 / 18%);
}

/*
 * 订单卡与退款进度卡：真机消息应用里的「业务卡片」是一张独立卡片，
 * 有标题、金额和状态，不是普通气泡。
 * 退款卡刻意用虚线边框 + 暖色，与钱包余额（实底深蓝）拉开距离 ——
 * 让玩家一眼看出「这是平台里显示的数字」，而不是自己账上的钱。
 */
.msg--order {
  min-width: 210px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  box-shadow: var(--shadow-card);
}

.order__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.order__image {
  flex: none;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--c-surface-2);
}

.order__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.msg--refund,
.msg--notice {
  min-width: 190px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--c-warn-bg);
  border: 1px dashed var(--c-warn-line);
}

.msg--notice .card__label,
.msg--notice .card__status {
  color: var(--c-warn-text);
}

.notice__fields {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: var(--space-2) 0 0;
}

.notice__fields div {
  display: flex;
  gap: var(--space-2);
  font-size: var(--font-xs);
  line-height: 1.45;
}

.notice__fields dt {
  flex: none;
  width: 5.2em;
  color: var(--c-warn-text);
  opacity: 0.78;
}

.notice__fields dd {
  margin: 0;
  color: var(--c-text);
}

.card__label {
  font-size: var(--font-xs);
  font-weight: 700;
  color: var(--c-text-soft);
}

.msg--refund .card__label,
.msg--refund .card__status,
.msg--refund .refund__note {
  color: var(--c-warn-text);
}

.card__title {
  margin-top: 2px;
  font-size: var(--font-base);
  font-weight: 600;
  line-height: 1.4;
}

.card__amount {
  margin-top: var(--space-1);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.msg--refund .card__amount {
  color: var(--c-warn-text);
}

.card__status {
  margin-top: var(--space-2);
  padding-top: var(--space-1);
  border-top: 1px solid var(--c-line);
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

.msg--refund .card__status {
  border-top-color: var(--c-warn-line);
}

/* 「未到账」是这张卡最要紧的一句话，单独一行加重 */
.refund__note {
  margin-top: var(--space-1);
  font-size: var(--font-xs);
  font-weight: 700;
}

.transfer__amount {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.transfer__note {
  margin-top: 2px;
  font-size: var(--font-xs);
  opacity: 0.92;
}

.transfer__status {
  margin-top: var(--space-2);
  padding-top: var(--space-1);
  border-top: 1px solid rgb(43 33 19 / 18%);
  font-size: var(--font-xs);
}

.msg__name {
  margin-bottom: 2px;
  font-size: var(--font-xs);
  font-weight: 700;
  color: var(--c-text-soft);
}

.msg__text {
  font-size: var(--font-base);
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.msg--system .msg__text,
.msg--failed .msg__text {
  color: var(--c-warn-text);
}

.msg--failed .msg__text {
  color: #74291e;
}

.msg__note {
  margin-top: var(--space-1);
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

@media (prefers-reduced-motion: reduce) {
  .msg {
    animation: none;
  }
}
</style>
