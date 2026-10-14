<script setup lang="ts">
import type { ChatMessage } from '@/data/level01'

/**
 * 单条聊天气泡。所有文案以文本插值渲染，不使用 v-html。
 *
 * 变体：
 * - `claim`   群成员自称到账（示意卡片）
 * - `risk`    风险提示卡（系统）
 * - `failed`  提现失败（系统）
 * - `transfer` 转账卡片（妈妈转来的生活费，让 800 元有明确来源）
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

    <template v-else>
      <!--
        气泡只负责内容；「谁说的」由外层消息行决定
        （群聊在气泡上方显示昵称，私聊不显示），避免私聊里重复出现名字。
      -->
      <p class="msg__text">{{ message.text }}</p>
      <p v-if="annotate && message.variant === 'claim'" class="msg__note">他自己说的</p>
      <p v-else-if="message.variant === 'failed'" class="msg__note">模拟账户</p>
    </template>
  </div>
</template>

<style scoped>
.msg {
  max-width: 100%;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
  animation: msg-in var(--dur-base) ease;
}

.msg--me {
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
  background: #fdeceb;
  border: 1px solid #e6a99f;
  color: #7c2418;
}

/*
 * 转账卡片：真实消息应用里的转账是一张独立卡片，
 * 有金额、备注和状态，不是普通气泡。
 */
.msg--transfer {
  min-width: 180px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: linear-gradient(150deg, #f7b955, #ef9d2b);
  color: #fff;
  box-shadow: 0 3px 10px rgb(160 100 20 / 26%);
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
  border-top: 1px solid rgb(255 255 255 / 34%);
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
  color: #7c2418;
}

.msg__note {
  margin-top: var(--space-1);
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

@keyframes msg-in {
  from {
    transform: translateY(6px);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .msg {
    animation: none;
  }
}
</style>
