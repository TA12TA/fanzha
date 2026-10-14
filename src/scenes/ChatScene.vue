<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import ChatAvatar from '@/components/ChatAvatar.vue'
import MessageBubble from '@/components/MessageBubble.vue'
import { playSound } from '@/app/sound'
import {
  FREEZE_MESSAGES,
  GROUP_MESSAGES,
  PLATFORM_REBATE_DISPLAY,
  PROFILE_INFO,
  PROFILE_INFO_OWNER,
  REBATE_MESSAGES,
  SESSIONS,
  avatarFor,
  type ChatMessage,
  type ChatSessionId,
} from '@/data/level01'
import type { GameState, OptionId } from '@/game/types'

/**
 * S2/S3/S5/S6 青讯（消息应用）。
 *
 * 两级结构，模仿真手机的消息应用：
 * - 会话列表：私聊与群聊混排，群聊显示成员数、用拼图头像，未读有数字角标；
 * - 会话详情：群聊在他人气泡上方显示发言人昵称，私聊不显示。
 *
 * 生活费 800 元的来源在「妈妈」会话里以转账卡片呈现，让账本数字有叙事依据。
 *
 * 剧情推进只通过 emit('choose', optionId)；本组件不修改任何金额，
 * 也不自行决定「当前该看哪个会话」——那是 AppShell（导航层）的职责。
 */
const props = defineProps<{
  state: GameState
  /** 当前会话；null 表示在会话列表。 */
  session: ChatSessionId | null
  /** 是否显示资料弹层。 */
  profileOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'choose', optionId: OptionId): void
  (e: 'open-session', id: ChatSessionId): void
  (e: 'open-profile'): void
  (e: 'close-profile'): void
  (e: 'back'): void
  (e: 'open-wallet'): void
}>()

/** 当前会话定义（在列表时为 null）。 */
const active = computed(() => SESSIONS.find((s) => s.id === props.session) ?? null)

const isGroupChat = computed(() => active.value?.kind === 'group')

/** 会话消息：群聊会话按剧情节点追加返利 / 提现异常卡片。 */
function messagesOf(id: ChatSessionId): ChatMessage[] {
  if (id !== 'taskgroup') return SESSIONS.find((s) => s.id === id)?.messages ?? []
  const list = [...GROUP_MESSAGES]
  if (props.state.node === 'rebate' || props.state.node === 'freeze') list.push(...REBATE_MESSAGES)
  if (props.state.node === 'freeze') list.push(...FREEZE_MESSAGES)
  return list
}

const messages = computed<ChatMessage[]>(() =>
  props.session ? messagesOf(props.session) : [],
)

/**
 * 会话列表要显示的会话。
 * 兼职群只有在玩家真的「进群看看」之后才出现在列表里 ——
 * 进群是剧情里的一个明确选择（`entered-group`），没进之前不该能看到群里的话术。
 */
const NOT_JOINED_YET = ['intro', 'invite']
const sessions = computed(() =>
  SESSIONS.filter(
    (s) => s.id !== 'taskgroup' || !NOT_JOINED_YET.includes(props.state.node),
  ).map((s) => ({
    ...s,
    /** 列表里显示的最后一条消息摘要。 */
    preview: previewOf(s.id),
    /** 未读：只有未处理的学姐邀请算未读。 */
    unread: s.id === 'senior' && props.state.node === 'invite',
  })),
)

/** 会话列表里的一行摘要。 */
function previewOf(id: ChatSessionId): string {
  const list = messagesOf(id)
  const last = list[list.length - 1]
  if (!last) return ''
  if (last.variant === 'transfer') return `[转账] ${last.transferNote ?? ''}`
  return last.text
}

/** 逐条呈现：已显示条数。减弱动效时直接全部显示。 */
const visibleCount = ref(0)
const reduceMotion = ref(false)
let timers: ReturnType<typeof setTimeout>[] = []

function clearTimers(): void {
  timers.forEach((t) => clearTimeout(t))
  timers = []
}

function showAll(): void {
  // 「显示全部」是玩家操作，给一声反馈。
  playSound('tap')
  clearTimers()
  visibleCount.value = messages.value.length
}

function animate(): void {
  clearTimers()
  const total = messages.value.length
  if (reduceMotion.value) {
    visibleCount.value = total
    return
  }
  visibleCount.value = Math.min(1, total)
  for (let i = 1; i < total; i += 1) {
    timers.push(
      setTimeout(() => {
        visibleCount.value = Math.max(visibleCount.value, i + 1)
      }, 260 * i),
    )
  }
}

onMounted(() => {
  reduceMotion.value =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  animate()
})

// 节点或会话变化（新卡片到来、切换会话）时重新逐条呈现，
// 并在卸载/切换时清理定时器，避免旧消息延迟覆盖新界面。
watch(
  () => [props.state.node, props.session],
  () => animate(),
)

onBeforeUnmount(clearTimers)

const shownMessages = computed(() => messages.value.slice(0, visibleCount.value))
const allShown = computed(() => visibleCount.value >= messages.value.length)

/**
 * 只给第一条「自称到账」的消息加「他自己说的」标注。
 * 连续几条都标一遍会变成满屏重复提示，反而没人看。
 */
const firstClaimId = computed(
  () => messages.value.find((m) => m.variant === 'claim')?.id ?? null,
)

/**
 * 一个会话是否显示发言人昵称。
 * 真机消息应用里只有群聊才在气泡上方标出「谁说的」，私聊不需要。
 */
function showSenderName(message: ChatMessage): boolean {
  return isGroupChat.value && message.from === 'them' && !!message.name
}

/** 发言人头像。 */
function senderAvatar(message: ChatMessage) {
  if (message.from === 'me') return avatarFor('我')
  return avatarFor(message.name ?? active.value?.name ?? '?')
}

/**
 * 剧情选项归属的会话：邀请属于学姐私聊，群聊相关属于兼职群。
 * 只有在对应会话里才显示选项，避免在别的会话里误点。
 */
const optionSession = computed<ChatSessionId | null>(() => {
  switch (props.state.node) {
    case 'invite':
      return 'senior'
    case 'group':
    case 'rebate':
    case 'freeze':
      return 'taskgroup'
    default:
      return null
  }
})

/** 当前会话底部的剧情选项（仅当前节点、且属于本会话时可用）。 */
const options = computed<{ id: OptionId; label: string; kind: 'primary' | 'secondary' }[]>(() => {
  if (optionSession.value === null || optionSession.value !== props.session) return []
  switch (props.state.node) {
    case 'invite':
      return [
        { id: 'enter-group', label: '进群看看', kind: 'primary' },
        { id: 'reject-invite', label: '拒绝并举报', kind: 'secondary' },
      ]
    case 'group':
      return [
        { id: 'accept-task', label: '接下任务', kind: 'primary' },
        { id: 'report-group', label: '退出并举报', kind: 'secondary' },
      ]
    case 'rebate':
      return [
        { id: 'continue-task', label: '继续查看任务', kind: 'primary' },
        { id: 'stop-after-100', label: '到此为止', kind: 'secondary' },
      ]
    case 'freeze':
      return [
        { id: 'accept-extra', label: '查看追加垫付', kind: 'primary' },
        { id: 'stop-at-freeze', label: '停止操作并保留证据', kind: 'secondary' },
      ]
    default:
      return []
  }
})

/** 待确认付款节点：消息应用给出跳转钱包的入口（不自动付款）。 */
const pending = computed(() => {
  if (props.session !== 'taskgroup') return null
  if (props.state.node === 'transfer-100') return 100
  if (props.state.node === 'transfer-300') return 300
  return null
})

/** 资料弹层内容：群聊看群主，私聊看对方。 */
const profile = computed(() => (isGroupChat.value ? PROFILE_INFO_OWNER : PROFILE_INFO))

const profileLabel = computed(() => (isGroupChat.value ? '群主资料' : '对方资料'))

/** 是否显示「看资料」入口（只在这两个与剧情有关的会话里给）。 */
const canViewProfile = computed(
  () => props.session === 'taskgroup' || props.session === 'senior',
)
</script>

<template>
  <section class="chat" aria-label="青讯消息应用">
    <!-- ================= 会话列表 ================= -->
    <template v-if="!active">
      <AppHeader title="青讯" />
      <ul class="sessions">
        <li v-for="s in sessions" :key="s.id">
          <button
            type="button"
            class="session"
            :aria-label="`${s.kind === 'group' ? '群聊' : '私聊'}：${s.name}`"
            @click="emit('open-session', s.id)"
          >
            <ChatAvatar
              :size="46"
              :group-texts="s.kind === 'group' ? ['群', 'A', 'B', 'C'] : undefined"
              :text="avatarFor(s.name).text"
              :tone="avatarFor(s.name).tone"
            />
            <span class="session__main">
              <span class="session__name">
                {{ s.name }}
                <span v-if="s.kind === 'group'" class="session__count">（{{ s.memberCount }}）</span>
              </span>
              <span class="session__preview">{{ s.preview }}</span>
            </span>
            <span class="session__side">
              <span class="session__time">{{ s.lastTime }}</span>
              <span v-if="s.unread" class="session__badge" aria-label="有未读消息">1</span>
            </span>
          </button>
        </li>
      </ul>
    </template>

    <!-- ================= 会话详情 ================= -->
    <template v-else>
      <AppHeader
        :title="active.name"
        :subtitle="isGroupChat ? `${active.memberCount} 人` : undefined"
        show-back
        @back="emit('back')"
      >
        <template #action>
          <button
            v-if="canViewProfile"
            type="button"
            class="appbar__action chat__more"
            :aria-label="profileLabel"
            @click="emit('open-profile')"
          >
            <span aria-hidden="true">···</span>
          </button>
          <span v-else class="appbar__spacer" aria-hidden="true"></span>
        </template>
      </AppHeader>

      <div class="chat__body">
        <ol class="chat__list">
          <li
            v-for="message in shownMessages"
            :key="message.id"
            class="row"
            :class="`row--${message.from}`"
          >
            <!-- 系统提示（风险卡、提现失败）居中显示，不带头像 -->
            <MessageBubble v-if="message.from === 'system'" :message="message" />

            <template v-else>
              <ChatAvatar
                v-if="message.from === 'them'"
                :size="36"
                :text="senderAvatar(message).text"
                :tone="senderAvatar(message).tone"
              />
              <span class="row__main">
                <span v-if="showSenderName(message)" class="row__name">{{ message.name }}</span>
                <MessageBubble :message="message" :annotate="message.id === firstClaimId" />
              </span>
              <ChatAvatar
                v-if="message.from === 'me'"
                :size="36"
                :text="senderAvatar(message).text"
                :tone="senderAvatar(message).tone"
              />
            </template>
          </li>
        </ol>

        <!--
          「显示全部」是跳过消息动画的入口（动效不能成为必要交互）。
          放在消息列表末尾而不是顶部：真机的消息列表就是从头往下读，
          顶部突然插一个按钮会把第一条消息挤下去；放在末尾正好是
          「后面还有」的位置，读到哪点到哪。
        -->
        <div v-if="!allShown" class="chat__skiprow">
          <button type="button" class="chat__skip" @click="showAll">显示全部</button>
        </div>

        <!-- 逐条呈现时的无障碍播报：视觉上不再显示「消息正在出现…」这类元叙述 -->
        <p v-if="!allShown" class="sr-only" aria-live="polite">消息正在出现</p>
      </div>

      <!-- 待确认付款：只提供跳转入口，确认/取消必须在钱包内显式操作 -->
      <div v-if="pending" class="chat__pending">
        <p class="chat__pendingtext">
          有一笔 {{ pending }} 元等着你处理。走开不算付，也不算取消。
        </p>
        <button type="button" class="btn btn--primary" @click="emit('open-wallet')">
          去安心钱包处理
        </button>
      </div>

      <!-- 剧情选项：全部为真实 button，键盘可操作 -->
      <div v-if="options.length" class="chat__actions">
        <button
          v-for="option in options"
          :key="option.id"
          type="button"
          class="btn"
          :class="option.kind === 'primary' ? 'btn--primary' : 'btn--secondary'"
          @click="emit('choose', option.id)"
        >
          {{ option.label }}
        </button>
      </div>

      <!-- 平台展示返利：与钱包余额明确区分 -->
      <div v-if="state.platformDisplayed > 0" class="chat__platform">
        <p class="chat__platformlabel">平台内显示</p>
        <p class="chat__platformamount">{{ PLATFORM_REBATE_DISPLAY }} <span>元</span></p>
        <p class="chat__platformnote">
          页面上的数字，提不出来。钱包还是 {{ state.balance }} 元。
        </p>
      </div>

      <!-- 资料弹层 -->
      <div
        v-if="profileOpen"
        class="profilesheet"
        role="dialog"
        aria-modal="true"
        :aria-label="profileLabel"
      >
        <div class="profilesheet__panel">
          <header class="profilesheet__head">
            <h2 class="profilesheet__title">{{ profileLabel }}</h2>
            <button
              type="button"
              class="profilesheet__close"
              aria-label="关闭资料"
              @click="emit('close-profile')"
            >
              ✕
            </button>
          </header>
          <div class="profilesheet__body">
            <p class="profilesheet__name">{{ profile.nickname }}</p>
            <p class="profilesheet__account">账号 {{ profile.account }}</p>
            <dl class="profilesheet__fields">
              <div v-for="field in profile.fields" :key="field.label">
                <dt>{{ field.label }}</dt>
                <dd>{{ field.value }}</dd>
              </div>
            </dl>
            <p class="profilesheet__notice">{{ profile.notice }}</p>
          </div>
          <footer class="profilesheet__foot">
            <button type="button" class="btn btn--primary" @click="emit('close-profile')">
              {{ isGroupChat ? '返回群聊' : '返回聊天' }}
            </button>
          </footer>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.chat {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--c-chat-bg);
}

/* ============ 会话列表 ============ */

.sessions {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--c-surface);
}

.session {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3);
  border: 0;
  border-bottom: 1px solid var(--c-line);
  background: transparent;
  text-align: left;
}

.session:active {
  background: var(--c-surface-2);
}

.session__main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.session__name {
  font-size: var(--font-base);
  font-weight: 600;
  color: var(--c-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session__count {
  font-weight: 400;
  color: var(--c-text-tertiary);
}

/* 列表摘要：辅助信息，最浅一档 */
.session__preview {
  font-size: var(--font-sm);
  color: var(--c-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session__side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-1);
  flex: none;
}

.session__time {
  font-size: var(--font-xs);
  color: var(--c-text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* 未读角标：与桌面图标角标同一种数字样式 */
.session__badge {
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  border-radius: 999px;
  background: #e0483a;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 19px;
  text-align: center;
}

/* ============ 会话详情 ============ */

.chat__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
  padding: var(--space-3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* 跳过动画的入口：跟在消息末尾，低调不抢戏 */
.chat__skiprow {
  display: flex;
  justify-content: center;
  padding-top: var(--space-1);
}

.chat__skip {
  min-height: 32px;
  padding: 0 var(--space-3);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-sm);
  background: var(--c-surface);
  color: var(--c-text-tertiary);
  font-size: var(--font-xs);
}

.chat__more {
  font-size: var(--font-md);
  letter-spacing: 2px;
}

.chat__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

/*
 * 一条消息：头像 + 气泡（群聊在气泡上方带发言人昵称）。
 *
 * 两个容易出错的点，都在这轮修过：
 * 1. 必须 `align-items: flex-start`：默认的 stretch 会把头像拉成和气泡
 *    一样高，看起来像一个色块贴在气泡旁边（真机头像是固定 36px 方块）；
 * 2. 「我」的消息用 `row-reverse`，头像落在右侧；配合上面的 flex-start，
 *    头像顶端与气泡顶端对齐 —— 这正是真机消息列表的位置关系。
 */
.row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  max-width: 92%;
}

.row--them {
  align-self: flex-start;
}

.row--me {
  align-self: flex-end;
  flex-direction: row-reverse;
}

/* 系统提示居中 */
.row--system {
  align-self: center;
  max-width: 94%;
}

.row__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.row__name {
  margin-bottom: 3px;
  font-size: var(--font-xs);
  font-weight: 500;
  color: var(--c-text-secondary);
}

.chat__pending,
.chat__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: none;
  padding: var(--space-3);
  border-top: 1px solid var(--c-line);
  background: var(--c-surface);
}

.chat__pendingtext {
  font-size: var(--font-sm);
  color: var(--c-text-soft);
}

.chat__platform {
  flex: none;
  padding: var(--space-2) var(--space-3);
  background: var(--c-warn-bg);
  border-top: 1px solid var(--c-warn-line);
}

.chat__platformlabel {
  font-size: var(--font-xs);
  font-weight: 700;
  color: var(--c-warn-text);
}

.chat__platformamount {
  font-size: 22px;
  font-weight: 700;
  color: var(--c-warn-text);
  font-variant-numeric: tabular-nums;
}

.chat__platformamount span {
  font-size: var(--font-xs);
  font-weight: 500;
}

.chat__platformnote {
  font-size: var(--font-xs);
  color: var(--c-warn-text);
}

.profilesheet {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  background: rgb(8 14 24 / 48%);
}

.profilesheet__panel {
  width: 100%;
  max-height: 84%;
  display: flex;
  flex-direction: column;
  background: var(--c-surface);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow-sheet);
}

.profilesheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--c-line);
}

.profilesheet__title {
  font-size: var(--font-md);
  font-weight: 700;
}

.profilesheet__close {
  width: var(--tap-min);
  height: var(--tap-min);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--c-text-soft);
}

.profilesheet__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  overflow-y: auto;
}

.profilesheet__name {
  font-size: var(--font-md);
  font-weight: 700;
}

.profilesheet__account {
  font-size: var(--font-sm);
  color: var(--c-text-soft);
}

.profilesheet__fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: var(--space-1) 0;
}

.profilesheet__fields div {
  display: flex;
  gap: var(--space-2);
  font-size: var(--font-sm);
}

.profilesheet__fields dt {
  flex: none;
  width: 5.6em;
  color: var(--c-text-soft);
}

.profilesheet__fields dd {
  margin: 0;
  color: var(--c-text);
}

.profilesheet__notice {
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--c-warn-bg);
  color: var(--c-warn-text);
  font-size: var(--font-sm);
  line-height: 1.6;
}

.profilesheet__foot {
  padding: var(--space-3) var(--space-4);
  padding-bottom: calc(var(--space-3) + var(--safe-bottom));
  border-top: 1px solid var(--c-line);
}
</style>
