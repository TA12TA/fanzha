<script setup lang="ts">
import { computed, ref } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import { KEYPAD_KEYS, RECENT_CALLS, type CallRecord } from '@/data/phone'
import { playSound } from '@/app/sound'

/**
 * 虚构电话应用。
 *
 * 只有拨号盘、最近通话和本机通话界面：不申请通话权限、不发起真实呼叫，
 * 号码全部是游戏内的虚构短号。和真实手机一样，看起来能用、点了有反馈。
 */
const emit = defineEmits<{ (e: 'back'): void }>()

const number = ref('')
const call = ref<CallRecord | null>(null)
const speaker = ref(false)

const matchedName = computed(() => {
  const hit = RECENT_CALLS.find((item) => item.number === number.value)
  return hit?.name ?? ''
})

function append(digit: string): void {
  if (number.value.length >= 14) return
  playSound('tap')
  number.value += digit
}

function backspace(): void {
  playSound('tap')
  number.value = number.value.slice(0, -1)
}

function dial(): void {
  if (!number.value) return
  playSound('tap')
  speaker.value = false
  call.value = {
    id: 'dial',
    name: matchedName.value || '未知号码',
    number: number.value,
    time: '刚刚',
    direction: 'out',
  }
}

function callRecent(record: CallRecord): void {
  playSound('tap')
  number.value = record.number
  speaker.value = false
  call.value = { ...record, time: '刚刚', direction: 'out' }
}

function hangUp(): void {
  playSound('cancel')
  call.value = null
  speaker.value = false
}

function toggleSpeaker(): void {
  playSound('tap')
  speaker.value = !speaker.value
}
</script>

<template>
  <section class="phone" aria-label="电话">
    <AppHeader title="电话" subtitle="拨号与最近通话" show-back @back="emit('back')" />

    <div class="phone__body">
      <div class="dial">
        <span class="dial__hint">{{ matchedName || '输入号码' }}</span>
        <span class="dial__number">{{ number || '——' }}</span>
        <button v-if="number" type="button" class="dial__back" aria-label="删除一位" @click="backspace">
          ⌫
        </button>
      </div>

      <div class="keypad" aria-label="拨号键盘">
        <button
          v-for="key in KEYPAD_KEYS"
          :key="key.digit"
          type="button"
          class="key"
          :aria-label="`输入 ${key.digit}`"
          @click="append(key.digit)"
        >
          <span class="key__digit">{{ key.digit }}</span>
          <span v-if="key.letters" class="key__letters">{{ key.letters }}</span>
        </button>
      </div>

      <button type="button" class="dialbtn" :disabled="!number" aria-label="拨号" @click="dial">
        <span aria-hidden="true">✆</span>
      </button>

      <section class="recents" aria-label="最近通话">
        <h2 class="recents__title">最近通话</h2>
        <ul class="recents__list">
          <li v-for="record in RECENT_CALLS" :key="record.id">
            <button type="button" class="recent" :aria-label="`呼叫${record.name}`" @click="callRecent(record)">
              <span class="recent__avatar" :class="`recent__avatar--${record.direction}`" aria-hidden="true">
                {{ record.name.slice(0, 1) }}
              </span>
              <span class="recent__main">
                <span class="recent__name">{{ record.name }}</span>
                <span class="recent__meta">{{ record.time }} · {{ record.number }}</span>
              </span>
              <span class="recent__icon" aria-hidden="true">✆</span>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <div v-if="call" class="call" role="dialog" aria-modal="true" :aria-label="`呼叫${call.name}`">
      <div class="call__avatar" aria-hidden="true">{{ call.name.slice(0, 1) }}</div>
      <p class="call__status">正在呼叫</p>
      <h2 class="call__name">{{ call.name }}</h2>
      <p class="call__number">{{ call.number }}</p>

      <div class="call__actions">
        <button type="button" class="call__mini" :class="{ 'call__mini--on': speaker }" @click="toggleSpeaker">
          <span aria-hidden="true">◖</span>
          {{ speaker ? '免提已开' : '免提' }}
        </button>
        <span class="call__endwrap">
          <button type="button" class="call__end" aria-label="挂断" @click="hangUp">
            <svg
              viewBox="0 0 24 24"
              width="30"
              height="30"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .27-.11.52-.29.7l-2.48 2.48a.956.956 0 0 1-.7.29c-.28 0-.53-.11-.71-.29-.79-.73-1.68-1.36-2.66-1.85a.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9Z" />
            </svg>
          </button>
          <span class="call__endlabel" aria-hidden="true">挂断</span>
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.phone {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--c-surface-2);
}

.phone__body {
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

.phone__body > * {
  flex: none;
}

.dial {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 82px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
}

.dial__hint {
  min-height: 17px;
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

.dial__number {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 25px;
  font-weight: 600;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.dial__back {
  position: absolute;
  right: var(--space-2);
  bottom: var(--space-2);
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: var(--c-surface-2);
  color: var(--c-text-soft);
  font-size: 17px;
}

.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.key {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--c-surface);
  color: var(--c-text);
  box-shadow: 0 1px 3px rgb(16 30 54 / 8%);
}

.key:active {
  background: var(--c-primary-soft);
}

.key__digit {
  font-size: 22px;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
}

.key__letters {
  margin-top: 1px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--c-text-soft);
}

.dialbtn {
  align-self: center;
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border: 0;
  border-radius: 50%;
  background: var(--c-accent);
  color: #fff;
  font-size: 24px;
  box-shadow: 0 6px 14px rgb(15 157 122 / 24%);
}

.dialbtn:disabled {
  opacity: 0.4;
  box-shadow: none;
}

.recents {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.recents__title {
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--c-text-soft);
}

.recents__list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
}

.recent {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 58px;
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-bottom: 1px solid var(--c-line);
  background: transparent;
  color: inherit;
  text-align: left;
}

.recents__list li:last-child .recent {
  border-bottom: 0;
}

.recent__avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--c-primary-soft);
  color: var(--c-primary);
  font-size: var(--font-sm);
  font-weight: 700;
}

.recent__avatar--missed {
  background: #fde8e4;
  color: var(--c-danger);
}

.recent__avatar--out {
  background: #e7f6ef;
  color: var(--c-accent);
}

.recent__main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.recent__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-sm);
  font-weight: 600;
}

.recent__meta {
  font-size: 11px;
  color: var(--c-text-soft);
}

.recent__icon {
  flex: none;
  color: var(--c-accent);
  font-size: 17px;
}

/* ============ 通话界面 ============ */

.call {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-6) var(--space-4) var(--space-5);
  background: #10231f;
  color: #f4fbf8;
  animation: call-in var(--dur-base) ease both;
}

@keyframes call-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

.call__avatar {
  display: grid;
  place-items: center;
  width: 82px;
  height: 82px;
  margin-top: var(--space-6);
  border-radius: 50%;
  background: rgb(255 255 255 / 12%);
  font-size: 30px;
  font-weight: 700;
}

.call__status {
  margin-top: var(--space-4);
  font-size: var(--font-xs);
  color: rgb(244 251 248 / 58%);
}

.call__name {
  margin-top: var(--space-1);
  font-size: var(--font-xl);
  font-weight: 700;
}

.call__number {
  margin-top: var(--space-1);
  font-size: var(--font-sm);
  color: rgb(244 251 248 / 58%);
  letter-spacing: 0.08em;
}

.call__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-5);
  width: 100%;
  margin-top: auto;
}

.call__mini {
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 999px;
  background: rgb(255 255 255 / 8%);
  color: inherit;
  font-size: var(--font-xs);
}

.call__mini--on {
  background: rgb(255 255 255 / 22%);
}

.call__endwrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.call__end {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border: 0;
  border-radius: 50%;
  background: #d84b3f;
  color: #fff;
  box-shadow:
    0 8px 20px rgb(0 0 0 / 28%),
    inset 0 1px 0 rgb(255 255 255 / 22%);
  transition: transform var(--dur-fast) ease, background-color var(--dur-fast) ease;
}

.call__end:active {
  transform: scale(0.95);
  background: #c63d32;
}

.call__end svg {
  display: block;
  width: 30px;
  height: 30px;
}

.call__endlabel {
  font-size: var(--font-xs);
  color: rgb(244 251 248 / 72%);
}

@media (prefers-reduced-motion: reduce) {
  .call {
    animation: none;
  }
}
</style>
