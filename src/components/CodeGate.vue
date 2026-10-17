<script setup lang="ts">
import { computed, ref } from 'vue'
import { CODE_LENGTH, isCodeComplete, sanitizeCodeInput } from '@/app/smsCode'

/**
 * 模拟验证码输入区（聊天页底部，取代「继续按他说的做」那个按钮）。
 *
 * 这一块的视觉刻意做成「聊天里的一块输入区」，而不是一个表单：
 * 对方刚说完"念给我就行"，下面紧接着一个输入框，是最接近真实的形态。
 *
 * 设计要点：
 * - **只收数字**：输入时实时清洗（粘贴带空格也能收），`inputmode="numeric"`；
 * - 输错不是报错弹窗，而是**对方再说一句话**（气泡样式），语气平和；
 *   这是本作刻意保留的：骗子在这一步通常很有耐心，恐吓是后面的事；
 * - 提供「重新发一条」：真实短信会过期，玩家也可能已经把那条通知划掉了。
 *   重发会换一个新码 —— 每次都不一样。
 */
const props = defineProps<{
  /** 对方的催促原话（关卡数据）。 */
  prompt?: string
  /** 输错时对方回的那句话（关卡数据）。 */
  retryLine: string
  /** 已经被判错了几次（>0 才显示对方那句回话）。 */
  attempts: number
  /** 短信正文的就地兜底显示（横幅被关掉时才有值）。 */
  sms?: string
  /** 是否正在提交（防连点）。 */
  submitting?: boolean
}>()

const emit = defineEmits<{
  (e: 'submit', code: string): void
  (e: 'resend'): void
}>()

const raw = ref('')

/** 输入框里永远是清洗过的数字串。 */
const value = computed(() => sanitizeCodeInput(raw.value))

const complete = computed(() => isCodeComplete(raw.value))

/** 缺几位 —— 只作提示，不拦输入。 */
const missing = computed(() => CODE_LENGTH - value.value.length)

function onInput(event: Event): void {
  const el = event.target as HTMLInputElement
  raw.value = sanitizeCodeInput(el.value)
  // 受控回写：清洗后（比如粘贴了「123 456」）要让输入框回到清洗结果
  if (el.value !== raw.value) el.value = raw.value
}

function submit(): void {
  if (!complete.value || props.submitting) return
  emit('submit', value.value)
}

function resend(): void {
  if (props.submitting) return
  raw.value = ''
  emit('resend')
}
</script>

<template>
  <section class="gate" aria-label="输入验证码">
    <p v-if="prompt" class="gate__prompt">{{ prompt }}</p>

    <!-- 输错时对方说的话：用气泡样式，读起来是"他还在说话"，不是系统报错 -->
    <p v-if="attempts > 0" class="gate__retry" role="status">{{ retryLine }}</p>

    <!--
      短信正文的就地兜底：只有「顶部弹出通知」被关掉时才有值。
      没有它，关掉开关就等于把验证码彻底藏起来，这一步永远过不去。
    -->
    <p v-if="sms" class="gate__sms">{{ sms }}</p>

    <label class="gate__field">
      <span class="sr-only">验证码</span>
      <input
        class="gate__input"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        :maxlength="CODE_LENGTH"
        :value="value"
        placeholder="输入 6 位验证码"
        @input="onInput"
        @keydown.enter.prevent="submit"
      />
    </label>

    <div class="gate__actions">
      <button
        type="button"
        class="btn btn--primary gate__submit"
        :disabled="!complete || submitting"
        @click="submit"
      >
        发给他
      </button>
      <button type="button" class="btn btn--secondary gate__resend" @click="resend">
        重新发一条
      </button>
    </div>

    <p class="gate__hint">
      <template v-if="!complete">还差 {{ missing }} 位</template>
      <template v-else>发出去之前，先想想这条验证码是给谁用的。</template>
    </p>
  </section>
</template>

<style scoped>
.gate {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: none;
  padding: var(--space-3);
  border-top: 1px solid var(--c-line);
  background: var(--c-surface);
  box-shadow: 0 -8px 20px rgb(16 30 54 / 7%);
}

.gate__prompt {
  font-size: var(--font-sm);
  color: var(--c-text-soft);
}

/*
 * 对方的回话做成气泡：与聊天里的他人气泡同一套圆角与浅底，
 * 这样它读起来是「他还在说话」，而不是一条红色的系统报错。
 */
.gate__retry {
  align-self: flex-start;
  max-width: 100%;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--c-surface-2);
  color: var(--c-text);
  font-size: var(--font-sm);
  line-height: 1.55;
}

/* 短信兜底显示：做成"手机顶部的短信"那种窄条，与对方的气泡区分开 */
.gate__sms {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-sm);
  background: var(--c-surface-2);
  color: var(--c-text);
  font-size: var(--font-xs);
  line-height: 1.55;
  font-variant-numeric: tabular-nums;
}

.gate__field {
  display: block;
}

.gate__input {
  width: 100%;
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-md);
  background: var(--c-surface-2);
  color: var(--c-text);
  /* 等宽数字 + 字距：6 个数字一眼数得清 */
  font-size: var(--font-lg);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.28em;
  text-align: center;
}

.gate__input:focus-visible {
  outline: 2px solid var(--c-primary);
  outline-offset: 2px;
}

.gate__actions {
  display: flex;
  gap: var(--space-2);
}

.gate__submit {
  flex: 1.4;
}

.gate__resend {
  flex: 1;
  font-size: var(--font-sm);
}

.gate__hint {
  font-size: var(--font-xs);
  color: var(--c-text-tertiary);
}
</style>
