<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import ChatAvatar from '@/components/ChatAvatar.vue'
import CodeGate from '@/components/CodeGate.vue'
import MessageBubble from '@/components/MessageBubble.vue'
import { playSound } from '@/app/sound'
import { markRevealed, revealedCountFor } from '@/app/chatReveal'
import { classGroupNews } from '@/app/classNews'
import { avatarFor } from '@/data/levels/shared'
import { pendingRequestOf } from '@/app/navigation'
import type { ChatMessage, CodeGate as CodeGateSpec, PlayableLevel } from '@/game/level'
import type { GameState, OptionId } from '@/game/types'

/**
 * S2/S3/S5/S6 青讯（消息应用）。
 *
 * 两级结构，模仿真手机的消息应用：
 * - 会话列表：私聊与群聊混排，群聊显示成员数、用拼图头像，未读有数字角标；
 * - 会话详情：群聊在他人气泡上方显示发言人昵称，私聊不显示。
 *
 * **本组件不含任何具体关卡的剧情判断**：哪些会话可见、哪个会话显示选项、
 * 哪个节点追加哪些卡片、资料弹层内容，全部来自 `level.chat`（关卡规格）。
 * 剧情推进只通过 emit('choose', optionId)；金额一分也不在这里改。
 */
const props = defineProps<{
  state: GameState
  level: PlayableLevel
  /** 当前会话；null 表示在会话列表。 */
  session: string | null
  /** 是否显示资料弹层。 */
  profileOpen: boolean
  /** 当前节点的模拟验证码环节；null 表示这一步不需要验证码。 */
  codeGate: CodeGateSpec | null
  /** 已经被判错了几次（>0 时界面会显示对方那句"再看一下短信"）。 */
  codeAttempts: number
  /**
   * 短信正文的就地兜底显示（仅在「顶部弹出通知」被关闭时非空）。
   * 没有它的话，关掉通知开关会让验证码这一步永远走不下去。
   */
  codeSms: string
}>()

const emit = defineEmits<{
  (e: 'choose', optionId: OptionId): void
  (e: 'open-session', id: string): void
  (e: 'open-profile'): void
  (e: 'close-profile'): void
  (e: 'open-detail'): void
  (e: 'back'): void
  (e: 'open-wallet'): void
  /** 玩家提交了一次模拟验证码。 */
  (e: 'submit-code', code: string): void
  /** 玩家要求重新发一条短信（换一个新验证码）。 */
  (e: 'resend-code'): void
}>()

const spec = computed(() => props.level.chat)

/** 当前会话定义（在列表时为 null）。 */
const active = computed(() => spec.value.sessions.find((s) => s.id === props.session) ?? null)

const isGroupChat = computed(() => active.value?.kind === 'group')
/** 平台展示数字只属于关卡声明的那个会话，不跟着状态跑到所有聊天里。 */
const showPlatform = computed(
  () => props.state.platformDisplayed > 0 && !!spec.value.platformSession && active.value?.id === spec.value.platformSession,
)

/**
 * 某会话在当前剧情节点下的消息 = 基础消息 + 该节点追加的卡片。
 * 追加顺序即 `extraMessages` 里声明的顺序。
 *
 * 班级通知群还会追加一组**随机**的反诈通知（`newsSession` + `app/classNews.ts`）：
 * 抽签结果按关卡缓存在模块里，所以切到别的应用再回来仍是同一批 ——
 * 一进一出就换一批的话，「群消息」立刻露馅。
 */
function messagesOf(id: string): ChatMessage[] {
  const base = spec.value.sessions.find((s) => s.id === id)?.messages ?? []
  const extra = spec.value.extraMessages?.[props.state.node] ?? []
  const list = [...base]
  for (const item of extra) {
    if (item.session === id) list.push(...item.messages)
  }
  if (spec.value.newsSession === id) {
    list.push(...classGroupNews(props.level.meta.id))
  }
  return list
}

const messages = computed<ChatMessage[]>(() =>
  props.session ? messagesOf(props.session) : [],
)

/**
 * 会话列表要显示的会话。
 * `hiddenAt` 声明「哪些会话在哪些节点还看不到」——例如第一关的兼职群，
 * 只有玩家真的点了「进群看看」之后才出现，否则会提前泄露群里的话术。
 */
const sessions = computed(() =>
  spec.value.sessions
    .filter((s) => !(spec.value.hiddenAt?.[s.id] ?? []).includes(props.state.node))
    .map((s) => ({
      ...s,
      preview: previewOf(s.id),
      unread: spec.value.unread?.[props.state.node] === s.id,
    })),
)

/** 会话列表里的一行摘要。 */
function previewOf(id: string): string {
  const list = messagesOf(id)
  const last = list[list.length - 1]
  if (!last) return ''
  if (last.variant === 'transfer') return `[转账] ${last.transferNote ?? ''}`
  if (last.variant === 'order') return `[订单] ${last.orderTitle ?? ''}`
  if (last.variant === 'refund') return `[退款进度] ¥${last.refundAmount ?? ''}`
  if (last.variant === 'notice') return `[通知] ${last.noticeTitle ?? ''}`
  return last.text
}

/**
 * 逐条呈现：已显示条数。
 *
 * 只在**第一次**看某个会话时逐条出现；重看时已看过的部分直接显示，
 * 只有剧情推进后新来的消息才继续逐条出现。
 * 进度记在 `app/chatReveal.ts`（模块级，按关卡 + 会话区分），
 * 因为这个组件在离开消息应用时会被卸载。
 * 减弱动效时一律直接全部显示。
 */
const visibleCount = ref(0)
const reduceMotion = ref(false)
let timers: ReturnType<typeof setTimeout>[] = []

/** 进度记忆的键：关卡 + 会话，避免两关同名会话互相污染。 */
const revealKey = computed(() => `${props.level.meta.id}:${props.session ?? ''}`)

function clearTimers(): void {
  timers.forEach((t) => clearTimeout(t))
  timers = []
}

function showAll(): void {
  // 「显示全部」是玩家操作，给一声反馈。
  playSound('tap')
  clearTimers()
  visibleCount.value = messages.value.length
  if (props.session) markRevealed(revealKey.value, visibleCount.value)
}

function animate(): void {
  clearTimers()
  const id = props.session
  const total = messages.value.length
  // 会话列表不需要动效
  if (!id) {
    visibleCount.value = total
    return
  }

  const seen = Math.min(revealedCountFor(revealKey.value), total)
  if (reduceMotion.value || seen >= total) {
    visibleCount.value = total
    markRevealed(revealKey.value, total)
    return
  }

  // 已看过的部分立刻出现；剩下的（新来的）逐条出现。
  visibleCount.value = Math.max(seen, Math.min(1, total))
  let step = 0
  for (let i = visibleCount.value; i < total; i += 1) {
    step += 1
    timers.push(
      setTimeout(
        () => {
          visibleCount.value = Math.max(visibleCount.value, i + 1)
          // 看到哪记到哪：中途离开再回来，只补没看到的那几条
          markRevealed(revealKey.value, visibleCount.value)
        },
        260 * step,
      ),
    )
  }
  if (step === 0) markRevealed(revealKey.value, total)
}

onMounted(() => {
  reduceMotion.value =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  animate()
})

// 节点或会话变化（切换会话、剧情推进带来新卡片）时重新计算该显示到第几条，
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
 * 当前会话底部的剧情选项。
 *
 * 全部来自关卡声明：`optionSession` 决定「这个节点的选项显示在哪个会话」，
 * `hiddenOptions` 里的选项由专门入口触发（资料 / 订单详情），不占底部按钮。
 */
const options = computed<{ id: OptionId; label: string; kind: 'primary' | 'secondary' }[]>(() => {
  const owner = spec.value.optionSession[props.state.node]
  if (!owner || owner !== props.session) return []
  const hidden = spec.value.hiddenOptions ?? []
  /*
   * 验证码环节：那个「继续按他说的做」不再渲染成按钮 ——
   * 玩家必须真的把验证码填回去，否则这一步就只是"点一下继续"，
   * 教学上完全失去意义。其余选项（比如「停下来，自己查订单」）照旧保留。
   */
  const viaGate = props.codeGate?.onCorrect ?? null
  return (props.level.nodeOptions[props.state.node] ?? [])
    .filter((id) => !hidden.includes(id))
    .filter((id) => id !== viaGate)
    .map((id) => ({
      id,
      label: props.level.options[id]?.label ?? id,
      kind: spec.value.safeOptions.includes(id) ? 'primary' : 'secondary',
    }))
})

/**
 * 当前是否在「要填验证码」的那一步。
 * 与选项同一套归属判断：只有拥有该节点选项的那个会话才显示输入区。
 */
const gateActive = computed(() => {
  if (!props.codeGate) return false
  return spec.value.optionSession[props.state.node] === props.session
})

/** 待确认付款节点：消息应用给出跳转钱包的入口（不自动付款）。 */
const pending = computed(() => {
  const request = pendingRequestOf(props.level, props.state.node)
  if (!request || !props.session) return null
  // 只在剧情相关的会话里提示，避免在班级群里突然出现付款提示。
  const owner = spec.value.optionSession[props.state.node] ?? spec.value.preferredSession[props.state.node]
  if (owner && owner !== props.session) return null
  return request.amount
})

/** 资料弹层内容（默认按会话取，群成员可按姓名切换）。 */
const profileName = ref<string | null>(null)
const sessionProfile = computed(() => (props.session ? spec.value.profiles[props.session] : undefined))
const profile = computed(() => {
  if (profileName.value) {
    const member = spec.value.memberProfiles?.[profileName.value]
    if (member) return member
  }
  return sessionProfile.value
})

const headerProfileLabel = computed(() => (isGroupChat.value ? '群主资料' : '对方资料'))
const profileLabel = computed(() => {
  if (!isGroupChat.value) return '对方资料'
  if (profileName.value && profileName.value !== sessionProfile.value?.nickname) {
    return `${profileName.value} 的资料`
  }
  return '群主资料'
})

/** 该会话是否提供「看资料」入口。 */
const canViewProfile = computed(() =>
  props.session ? spec.value.profile.some((p) => p.session === props.session) : false,
)

/**
 * 某条消息的头像是否可以点开资料。
 * 私聊里对方的头像都能点；群聊里群主和配置了 memberProfiles 的成员可点。
 */
function canOpenProfileFor(message: ChatMessage): boolean {
  if (message.from !== 'them' || !canViewProfile.value || !profile.value) return false
  if (!isGroupChat.value) return true
  return message.name === sessionProfile.value?.nickname || !!spec.value.memberProfiles?.[message.name ?? '']
}

/** 头像按钮的无障碍名称，群成员要能区分是谁的资料。 */
function profileLabelFor(message: ChatMessage): string {
  if (!isGroupChat.value) return '对方资料'
  if (message.name === sessionProfile.value?.nickname) return '群主资料'
  return message.name ? `${message.name} 的资料` : '成员资料'
}

/** 点开某条消息对应的资料卡；群主回落到会话资料。 */
function openProfileFromAvatar(message: ChatMessage): void {
  profileName.value = message.name && spec.value.memberProfiles?.[message.name] ? message.name : null
  emit('open-profile')
}

/** 标题栏「···」固定打开群主/对方资料。 */
function openSessionProfile(): void {
  profileName.value = null
  emit('open-profile')
}

function closeProfile(): void {
  profileName.value = null
  emit('close-profile')
}

watch(
  () => props.session,
  () => {
    profileName.value = null
  },
)

/** 该会话在当前节点是否可打开详情弹层（订单等）。 */
const detail = computed(() => {
  const sheet = spec.value.detailSheet
  if (!sheet || !props.session) return null
  if (!sheet.nodes.includes(props.state.node)) return null
  // 详情弹层属于哪个会话：由触发它的选项归属决定（没有归属时任何会话都能开）。
  const owner = sheet.option ? spec.value.optionSession[props.state.node] : undefined
  if (owner && owner !== props.session) return null
  return sheet
})
</script>

<template>
  <section class="chat" aria-label="青讯消息应用">
    <!-- ================= 会话列表 ================= -->
    <template v-if="!active">
      <AppHeader title="青讯" show-back back-label="退出青讯" @back="emit('back')" />
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
          <!-- 详情入口（订单等）：真实按钮，键盘可达 -->
          <button
            v-if="detail"
            type="button"
            class="appbar__action chat__detail"
            @click="emit('open-detail')"
          >
            {{ detail.title }}
          </button>
          <button
            v-else-if="canViewProfile"
            type="button"
            class="appbar__action chat__more"
            :aria-label="headerProfileLabel"
            @click="openSessionProfile"
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
              <button
                v-if="message.from === 'them' && canOpenProfileFor(message)"
                type="button"
                class="row__avatar"
                :aria-label="profileLabelFor(message)"
                @click="openProfileFromAvatar(message)"
              >
                <ChatAvatar
                  :size="36"
                  :text="senderAvatar(message).text"
                  :tone="senderAvatar(message).tone"
                />
              </button>
              <ChatAvatar
                v-else-if="message.from === 'them'"
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
          {{ level.copy.pendingHint.replace('{n}', String(pending)) }}
        </p>
        <button type="button" class="btn btn--primary" @click="emit('open-wallet')">
          去安心钱包处理
        </button>
      </div>

      <!--
        模拟验证码输入区：取代「继续按他说的做」那个按钮。
        放在剧情选项**之前**，因为对方刚说完「念给我就行」，
        输入框紧跟着出现才像真在聊天。
      -->
      <CodeGate
        v-if="gateActive && codeGate"
        :prompt="codeGate.prompt"
        :retry-line="codeGate.retryLine"
        :attempts="codeAttempts"
        :sms="codeSms"
        @submit="(code: string) => emit('submit-code', code)"
        @resend="emit('resend-code')"
      />

      <!-- 剧情选项：全部为真实 button，键盘可操作 -->
      <div
        v-if="options.length"
        class="chat__actions"
        role="group"
        aria-labelledby="chat-choice-label"
      >
        <p id="chat-choice-label" class="chat__actions-label">你想怎么回？</p>
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

      <!-- 平台展示数字：与钱包余额明确区分 -->
      <div v-if="showPlatform" class="chat__platform">
        <p class="chat__platformlabel">{{ level.copy.platformLabel }}</p>
        <p class="chat__platformamount">{{ state.platformDisplayed }} <span>元</span></p>
        <p class="chat__platformnote">{{ level.copy.platformChatNote(state.balance) }}</p>
      </div>

      <!-- 资料弹层 -->
      <div
        v-if="profileOpen && profile"
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
              @click="closeProfile"
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
            <p v-if="profile.notice" class="profilesheet__notice">{{ profile.notice }}</p>
          </div>
          <footer class="profilesheet__foot">
            <button type="button" class="btn btn--primary" @click="closeProfile">
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
  background: var(--c-danger);
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
  /*
   * 2026-10-17 画面打磨：底部 16px 渐隐。
   *
   * 消息滚到底之前，列表下边缘是一条硬切的线，看起来像内容被裁掉了。
   * 用 mask 让它渐隐（沿用滚动容器的底边，不随内容滚动），就能读出
   * 「下面还有」这层意思。只能这么写：滚动容器里放 `::after` 会跟着内容一起
   * 滚走，反而只在末尾才出现。
   *
   * 代价：内容很短、不需要滚动时，最后一条气泡的底部 16px 会略淡。
   * 选 16px 就是为了把这个副作用压到几乎看不出来。
   */
  -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 16px), transparent 100%);
  mask-image: linear-gradient(180deg, #000 calc(100% - 16px), transparent 100%);
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
  background: transparent;
  border-color: transparent;
  color: var(--c-text-soft);
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
  width: auto;
  max-width: 92%;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
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

/* 可点开的对方头像：只增加可点区域，不改变头像尺寸和间距 */
.row__avatar {
  display: block;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  line-height: 0;
  cursor: pointer;
}

.row__avatar:focus-visible {
  outline: 2px solid var(--c-primary);
  outline-offset: 2px;
}

.row__name {
  margin-bottom: 3px;
  font-size: var(--font-xs);
  font-weight: 500;
  color: var(--c-text-secondary);
}

/*
 * 底部动作区（待确认提示 / 剧情选项）。
 * 2026-10-17：加一层极淡的向上投影，让它明确「压在消息区之上」，
 * 而不是消息区突然断掉、下面又冒出一条白底按钮带。
 */
.chat__pending,
.chat__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: none;
  padding: var(--space-3);
  border-top: 1px solid var(--c-line);
  background: var(--c-surface);
  box-shadow: 0 -1px 0 rgb(29 42 37 / 8%);
}

.chat__pendingtext {
  font-size: var(--font-sm);
  color: var(--c-text-soft);
}

.chat__actions-label {
  font-size: var(--font-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
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
  background: rgb(3 8 5 / 52%);
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

.profilesheet__fields,
.ordersheet__fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: var(--space-1) 0;
}

.profilesheet__fields div,
.ordersheet__fields div {
  display: flex;
  gap: var(--space-2);
  font-size: var(--font-sm);
}

.profilesheet__fields dt,
.ordersheet__fields dt {
  flex: none;
  width: 6.4em;
  color: var(--c-text-soft);
}

.profilesheet__fields dd,
.ordersheet__fields dd {
  margin: 0;
  color: var(--c-text);
}

.profilesheet__notice,
.ordersheet__notice {
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
