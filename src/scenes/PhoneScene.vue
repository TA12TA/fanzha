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
        <button type="button" class="call__end" aria-label="挂断" @click="hangUp">
          <span aria-hidden="true">✆</span>
        </button>
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
  gap: var(--space-5);
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

.call__end {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  border: 0;
  border-radius: 50%;
  background: #d84b3f;
  color: #fff;
  font-size: 25px;
  transform: rotate(135deg);
}

@media (prefers-reduced-motion: reduce) {
  .call {
    animation: none;
  }
}
</style>
