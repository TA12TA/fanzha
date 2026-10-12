<script setup lang="ts">
import type { ChatMessage } from '@/data/level01'

/**
 * 单条聊天气泡。所有文案以文本插值渲染，不使用 v-html。
 * `claim` 变体表示「群成员自称到账」的示意卡片，`risk` 为风险提示卡。
 */
defineProps<{ message: ChatMessage }>()
</script>

<template>
  <div
    class="msg"
    :class="[`msg--${message.from}`, message.variant ? `msg--${message.variant}` : '']"
  >
    <p v-if="message.name" class="msg__name">{{ message.name }}</p>
    <p class="msg__text">{{ message.text }}</p>
    <p v-if="message.variant === 'claim'" class="msg__note">
      以上为群成员自称，非可核实凭证
    </p>
    <p v-else-if="message.variant === 'risk'" class="msg__note">剧情模拟 · 反诈提示</p>
    <p v-else-if="message.variant === 'failed'" class="msg__note">剧情模拟 · 非真实账户</p>
  </div>
</template>

<style scoped>
.msg {
  max-width: 84%;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
  animation: msg-in var(--dur-base) ease;
}

.msg--me {
  align-self: flex-end;
  background: var(--c-primary-soft);
}

.msg--system {
  align-self: center;
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
