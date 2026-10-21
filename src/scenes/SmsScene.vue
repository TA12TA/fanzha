<script setup lang="ts">
import { computed, ref } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import { SMS_THREADS, type SmsMessage } from '@/data/sms'
import { playSound } from '@/app/sound'

/**
 * 虚构短信应用。
 *
 * 收件箱 + 会话 + 本机回复（仅保存在内存）。第二关的模拟验证码会出现在
 * 「安心钱包」这条短信里；玩家可以在自己的短信应用里查看它，而不是只能
 * 从聊天里的转述看到。不读取真实短信、不申请短信权限、不发送任何内容。
 */
const props = withDefaults(
  defineProps<{
    /** 当前剧情验证码对应的短信正文；没有验证码环节时为空。 */
    codeSms?: string
    /** 已读会话；由手机壳持有，离开短信应用再回来时不会重新变红。 */
    readIds?: string[]
    /** 每局随机种子：开局/重开时换顺序，重新进入应用时保持不变。 */
    seed?: number
  }>(),
  { codeSms: '', readIds: () => [], seed: 1 },
)

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'mark-read', id: string): void
}>()

const selectedId = ref<string | null>(null)
const draft = ref('')
const read = computed(() => props.readIds)
const extras = ref<Record<string, SmsMessage[]>>({})

function shuffleThreads<T>(items: readonly T[], seed: number): T[] {
  const list = [...items]
  let state = seed >>> 0 || 0x9e3779b9
  for (let i = list.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const j = state % (i + 1)
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

const threads = computed(() => {
  const base = shuffleThreads(SMS_THREADS, props.seed)
  const rank = new Map(base.map((thread, index) => [thread.id, index]))
  const list = base.map((thread) => {
    const dynamic = thread.id === 'wallet' && props.codeSms
    const extra = extras.value[thread.id] ?? []
    const last =
      extra[extra.length - 1]?.text ?? thread.messages[thread.messages.length - 1]?.text ?? ''
    return {
      ...thread,
      time: dynamic ? '刚刚' : thread.time,
      unread: dynamic
        ? read.value.includes('wallet-code')
          ? 0
          : Math.max(1, thread.unread)
        : read.value.includes(thread.id)
          ? 0
          : thread.unread,
      preview: dynamic ? props.codeSms : last,
    }
  })
  // 未读永远在上；同组内保持本局的随机顺序。
  return list.sort((a, b) => {
    if (a.unread !== b.unread) return b.unread - a.unread
    return (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
  })
})

const selected = computed(() => threads.value.find((thread) => thread.id === selectedId.value) ?? null)

function messagesOf(id: string): SmsMessage[] {
  const base = SMS_THREADS.find((thread) => thread.id === id)?.messages ?? []
  const list = [...base]
  if (id === 'wallet' && props.codeSms) {
    list.push({ id: 'wallet-code', from: 'them', text: props.codeSms, time: '刚刚' })
  }
  return [...list, ...(extras.value[id] ?? [])]
}

function openThread(id: string): void {
  playSound('tap')
  selectedId.value = id
  if (!read.value.includes(id)) emit('mark-read', id)
  // 验证码到达后要单独记“这条新短信已读”，否则之前读过钱包会让新码没有红标。
  if (id === 'wallet' && props.codeSms && !read.value.includes('wallet-code')) {
    emit('mark-read', 'wallet-code')
  }
}

function back(): void {
  if (handleBack()) return
  emit('back')
}

/** 给父级手势返回用：先退出会话，再退出应用。 */
function handleBack(): boolean {
  if (!selectedId.value) return false
  playSound('tap')
  selectedId.value = null
  return true
}

defineExpose({ handleBack })

function send(): void {
  const text = draft.value.trim()
  if (!selectedId.value || !text) return
  playSound('tap')
  const id = selectedId.value
  extras.value = {
    ...extras.value,
    [id]: [
      ...(extras.value[id] ?? []),
      { id: `me-${Date.now()}`, from: 'me', text, time: '刚刚' },
    ],
  }
  draft.value = ''
}
</script>

<template>
  <section class="sms" aria-label="短信">
    <AppHeader
      :title="selected ? selected.name : '短信'"
      :subtitle="selected ? '短信会话' : '收件箱'"
      show-back
      @back="back"
    />

    <!-- 收件箱 -->
    <div v-if="!selected" class="sms__list">
      <ul class="threads">
        <li v-for="thread in threads" :key="thread.id">
          <button
            type="button"
            class="thread"
            :aria-label="`打开${thread.name}的短信`"
            @click="openThread(thread.id)"
          >
            <span class="thread__avatar" :class="`thread__avatar--${thread.tone}`" aria-hidden="true">
              {{ thread.initial }}
            </span>
            <span class="thread__main">
              <span class="thread__top">
                <span class="thread__name">{{ thread.name }}</span>
                <span class="thread__time">{{ thread.time }}</span>
              </span>
              <span class="thread__preview">{{ thread.preview }}</span>
            </span>
            <span v-if="thread.unread" class="thread__badge" :aria-label="`${thread.unread} 条未读`">
              {{ thread.unread }}
            </span>
          </button>
        </li>
      </ul>
    </div>

    <!-- 会话 -->
    <div v-else class="sms__thread">
      <ol class="bubbles">
        <li
          v-for="message in messagesOf(selected.id)"
          :key="message.id"
          class="bubble-row"
          :class="{ 'bubble-row--me': message.from === 'me' }"
        >
          <span class="bubble" :class="{ 'bubble--me': message.from === 'me' }">{{ message.text }}</span>
          <span class="bubble__time">{{ message.time }}</span>
        </li>
      </ol>

      <form class="composer" @submit.prevent="send">
        <input
          v-model="draft"
          type="text"
          class="composer__input"
          placeholder="回复短信"
          aria-label="回复短信"
          autocomplete="off"
        />
        <button type="submit" class="composer__send" :disabled="!draft.trim()">发送</button>
      </form>
    </div>
  </section>
</template>

<style scoped>
.sms {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--c-surface-2);
}

.sms__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
  padding: var(--space-3) var(--space-4) var(--space-5);
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.threads {
  flex: none;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
}

.thread {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 68px;
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-bottom: 1px solid var(--c-line);
  background: transparent;
  color: inherit;
  text-align: left;
}

.threads li:last-child .thread {
  border-bottom: 0;
}

.thread:active {
  background: var(--c-surface-2);
}

.thread__avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  color: #fff;
  font-size: var(--font-sm);
  font-weight: 700;
}

.thread__avatar--blue {
  background: linear-gradient(150deg, #3f9bf5, #1f6fd0);
}

.thread__avatar--green {
  background: linear-gradient(150deg, #35b98a, #178a63);
}

.thread__avatar--amber {
  background: linear-gradient(150deg, #e6a64a, #b8781d);
}

.thread__avatar--rose {
  background: linear-gradient(150deg, #e0717d, #b14357);
}

.thread__avatar--violet {
  background: linear-gradient(150deg, #a77bf3, #6d45c9);
}

.thread__avatar--slate {
  background: linear-gradient(150deg, #8a93a6, #5f6a7e);
}

.thread__main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.thread__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.thread__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-sm);
  font-weight: 700;
}

.thread__time {
  flex: none;
  font-size: 10px;
  color: var(--c-text-tertiary);
}

.thread__preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

.thread__badge {
  display: grid;
  place-items: center;
  flex: none;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--c-danger);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

/* ============ 会话 ============ */

.sms__thread {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.bubbles {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: var(--space-4);
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
}

.bubble-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  max-width: 84%;
}

.bubble-row--me {
  align-items: flex-end;
  align-self: flex-end;
}

.bubble {
  padding: 9px 12px;
  border-radius: 4px 14px 14px;
  background: var(--c-surface);
  color: var(--c-text);
  font-size: var(--font-sm);
  line-height: 1.6;
  box-shadow: 0 1px 2px rgb(16 30 54 / 8%);
}

.bubble--me {
  border-radius: 14px 4px 14px 14px;
  background: var(--c-primary);
  color: #fff;
}

.bubble__time {
  font-size: 10px;
  color: var(--c-text-tertiary);
}

.composer {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--c-line);
  background: var(--c-surface);
}

.composer__input {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 1px solid var(--c-line);
  border-radius: 999px;
  outline: none;
  background: var(--c-surface-2);
  color: var(--c-text);
  font: inherit;
  font-size: 16px;
}

.composer__input:focus {
  border-color: var(--c-primary);
}

.composer__send {
  flex: none;
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: 999px;
  background: var(--c-primary);
  color: #fff;
  font-size: var(--font-sm);
  font-weight: 700;
}

.composer__send:disabled {
  opacity: 0.45;
}
</style>
