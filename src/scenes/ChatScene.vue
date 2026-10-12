<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import MessageBubble from '@/components/MessageBubble.vue'
import SimulationBadge from '@/components/SimulationBadge.vue'
import {
  BRAND,
  FREEZE_MESSAGES,
  GROUP_MESSAGES,
  INVITE_MESSAGES,
  PLATFORM_REBATE_DISPLAY,
  REBATE_MESSAGES,
  type ChatMessage,
} from '@/data/level01'
import type { GameState, OptionId } from '@/game/types'

/**
 * S2/S3/S5/S6 消息应用：邀请、群聊、返利、提现异常。
 * 剧情推进只通过 emit('choose', optionId)；本组件不修改任何金额。
 */
const props = defineProps<{
  state: GameState
  /** 当前会话：邀请或群聊（由导航层决定，组件不自行推导）。 */
  session: 'invite' | 'group'
  /** 是否显示资料弹层。 */
  profileOpen: boolean
  /** 资料是否已查看过（影响入口文案）。 */
  profileViewed: boolean
}>()

const emit = defineEmits<{
  (e: 'choose', optionId: OptionId): void
  (e: 'open-profile'): void
  (e: 'close-profile'): void
  (e: 'back'): void
  (e: 'open-wallet'): void
}>()

const view = computed(() => props.session)

const title = computed(() => (view.value === 'invite' ? BRAND.senior : BRAND.group))

/** 当前会话的全部消息（含剧情推进后追加的卡片）。 */
const messages = computed<ChatMessage[]>(() => {
  if (view.value === 'invite') return INVITE_MESSAGES
  const list = [...GROUP_MESSAGES]
  if (props.state.node === 'rebate' || props.state.node === 'freeze') {
    list.push(...REBATE_MESSAGES)
  }
  if (props.state.node === 'freeze') {
    list.push(...FREEZE_MESSAGES)
  }
  return list
})

/** 逐条呈现：已显示条数。减弱动效时直接全部显示。 */
const visibleCount = ref(messages.value.length)
const reduceMotion = ref(false)
let timers: ReturnType<typeof setTimeout>[] = []

function clearTimers(): void {
  timers.forEach((t) => clearTimeout(t))
  timers = []
}

function showAll(): void {
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

// 节点变化（新卡片到来）时重新逐条呈现，并在卸载/切换时清理定时器。
watch(
  () => props.state.node,
  () => animate(),
)

onBeforeUnmount(clearTimers)

const shownMessages = computed(() => messages.value.slice(0, visibleCount.value))
const allShown = computed(() => visibleCount.value >= messages.value.length)

/** 群聊底部的剧情选项（仅当前节点可用）。 */
const options = computed<{ id: OptionId; label: string; kind: 'primary' | 'secondary' }[]>(() => {
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
  if (props.state.node === 'transfer-100') return 100
  if (props.state.node === 'transfer-300') return 300
  return null
})
</script>

<template>
  <section class="chat" aria-label="青讯消息应用">
    <AppHeader
      :title="title"
      :subtitle="view === 'invite' ? '陌生人消息 · 剧情模拟' : '群聊 · 剧情模拟'"
      show-back
      @back="emit('back')"
    />

    <div class="chat__body">
      <SimulationBadge
        v-if="view === 'invite'"
        text="剧情模拟 · 虚构邀请，请勿按此内容操作现实中的账户"
      />

      <div v-if="view === 'group'" class="chat__toolbar">
        <button type="button" class="chat__profilebtn" @click="emit('open-profile')">
          {{ profileViewed ? '再看对方资料' : '查看群主资料' }}
        </button>
        <button v-if="!allShown" type="button" class="chat__skip" @click="showAll">
          跳过动画，显示全部
        </button>
      </div>

      <ol class="chat__list">
        <li v-for="message in shownMessages" :key="message.id">
          <MessageBubble :message="message" />
        </li>
      </ol>

      <p v-if="!allShown" class="chat__typing" aria-live="polite">消息正在出现…</p>
    </div>

    <!-- 待确认付款：只提供跳转入口，确认/取消必须在钱包内显式操作 -->
    <div v-if="pending" class="chat__pending">
      <p class="chat__pendingtext">
        有一笔待确认的模拟垫付 {{ pending }} 元。离开此页不会扣款，也不会取消。
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
      <p class="chat__platformlabel">平台内显示（未兑现，不可提现）</p>
      <p class="chat__platformamount">{{ PLATFORM_REBATE_DISPLAY }} <span>元</span></p>
      <p class="chat__platformnote">
        这是页面上的数字，不是你的模拟余额。你的{{ BRAND.wallet }}余额仍为
        {{ state.balance }} 元。
      </p>
    </div>

    <!-- 资料弹层 -->
    <div v-if="profileOpen" class="profilesheet" role="dialog" aria-modal="true" aria-label="对方资料">
      <div class="profilesheet__panel">
        <header class="profilesheet__head">
          <h2 class="profilesheet__title">对方资料</h2>
          <button type="button" class="profilesheet__close" aria-label="关闭资料" @click="emit('close-profile')">
            ✕
          </button>
        </header>
        <div class="profilesheet__body">
          <p class="profilesheet__name">{{ BRAND.senior }}</p>
          <p class="profilesheet__account">账号 qx_****2048</p>
          <dl class="profilesheet__fields">
            <div>
              <dt>注册时间</dt>
              <dd>最近 7 天内</dd>
            </div>
            <div>
              <dt>资料完整度</dt>
              <dd>不完整：无学校、无实名信息</dd>
            </div>
            <div>
              <dt>可核验线索</dt>
              <dd>无。无法通过独立渠道确认其身份</dd>
            </div>
          </dl>
          <p class="profilesheet__notice">
            头像与自称身份都不等于可信身份。涉及转账时，必须通过独立渠道（学校官方通知、当面或电话向本人）核实。
          </p>
        </div>
        <footer class="profilesheet__foot">
          <button type="button" class="btn btn--primary" @click="emit('close-profile')">
            返回群聊
          </button>
        </footer>
      </div>
    </div>
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

.chat__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
  min-height: 0;
  padding: var(--space-3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.chat__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: space-between;
}

.chat__profilebtn,
.chat__skip {
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-sm);
  background: var(--c-surface);
  color: var(--c-primary);
  font-size: var(--font-sm);
  font-weight: 600;
}

.chat__skip {
  color: var(--c-text-soft);
  font-weight: 500;
}

.chat__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.chat__typing {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
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
