<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BottomNav from '@/components/BottomNav.vue'
import NotificationBanner from '@/components/NotificationBanner.vue'
import OverlaySheet from '@/components/OverlaySheet.vue'
import PhoneStatusBar from '@/components/PhoneStatusBar.vue'
import ChatScene from '@/scenes/ChatScene.vue'
import EndingScene from '@/scenes/EndingScene.vue'
import HomeScene from '@/scenes/HomeScene.vue'
import IntroScene from '@/scenes/IntroScene.vue'
import ManualScene from '@/scenes/ManualScene.vue'
import PlainAppScene from '@/scenes/PlainAppScene.vue'
import ReviewScene from '@/scenes/ReviewScene.vue'
import SettingsScene from '@/scenes/SettingsScene.vue'
import WalletScene from '@/scenes/WalletScene.vue'
import { hasOutcome, pendingAmount, preferredChatView } from '@/app/navigation'
import { useNotifications } from '@/app/notifications'
import { useSettings } from '@/app/settings'
import { playSound, setSoundEnabled } from '@/app/sound'
import { useGame } from '@/app/useGame'
import { REMINDER_TITLE, reminderFor } from '@/data/antifraud'
import { BRAND } from '@/data/level01'
import type { OptionId } from '@/game/types'

/**
 * 全屏手机容器。
 *
 * 职责边界：
 * - 剧情与金额：只通过 `game.dispatch(optionId)` 变更（引擎统一处理）。
 * - UI 导航：本组件维护「当前看哪一层」，切换视图不影响剧情。
 */

/** 当前显示的层。 */
type ViewId =
  | 'intro'
  | 'home'
  | 'chat'
  | 'wallet'
  | 'manual'
  | 'result'
  | 'review'
  | 'photos'
  | 'notifications'
  | 'settings'

const game = useGame()
const { state } = game
const { settings } = useSettings()
const notices = useNotifications()

/** 音效总开关跟随设置。 */
watch(
  () => settings.value.sound,
  (on) => setSoundEnabled(on),
  { immediate: true },
)

const view = ref<ViewId>(state.value.node === 'intro' ? 'intro' : 'home')
const profileOpen = ref(false)
const confirmRestart = ref(false)
/** 提交后立即禁用按钮，避免连点导致二次扣款。 */
const submitting = ref(false)

/** 当前展示的通知与等待条数。 */
const currentNotice = computed(() => notices.current.value)
const waitingCount = computed(() => notices.waitingCount.value)
/** 退场动画状态（由通知队列管理）。 */
const noticeLeaving = computed(() => notices.leaving.value)

/**
 * 推送反诈预警。
 * 是否弹出横幅由设置控制；无论是否弹出，都会进入通知中心。
 */
function pushAntifraud(node = state.value.node): void {
  const body = reminderFor(node)
  if (!body) return
  const item = { kind: 'antifraud' as const, title: REMINDER_TITLE, body }
  if (!settings.value.banner) {
    // 关闭弹出时只记录，不进入展示队列，避免不可见的通知占用队列与定时器。
    notices.record(item)
    return
  }
  notices.push(item)
}

/**
 * 推送消息类通知（学姐邀请、群消息等），与预警分开。
 * 排在队列末尾，等当前通知播完后自动接上。
 */
function pushMessage(title: string, body: string): void {
  if (!settings.value.banner) {
    notices.record({ kind: 'message', title, body })
    return
  }
  notices.push({ kind: 'message', title, body })
}

/**
 * 通知**真正显示**时播放对应提示音。
 * 因此排在后面的通知轮到它时也会响，而不是入队时就响。
 */
watch(
  () => currentNotice.value?.id,
  (id, prevId) => {
    if (id === undefined || id === prevId) return
    const item = currentNotice.value
    if (!item) return
    playSound(item.kind === 'antifraud' ? 'alert' : 'receive')
  },
)

/** 关闭当前通知（队列内部先停倒计时再动画出队，不会跳过下一条）。 */
function dismissNotice(): void {
  notices.dismissCurrent()
}

/** 设置里关掉顶部横幅时，立即收起当前通知。 */
watch(
  () => settings.value.banner,
  (on) => {
    if (!on) notices.dropCurrent()
  },
)

/** 切换视图时丢弃仍在展示的通知，避免过期横幅压住新页面内容。 */
watch(view, (next) => {
  if (next === 'notifications' || next === 'settings' || next === 'review') {
    notices.dropCurrent()
  }
})

const pending = computed(() => pendingAmount(state.value.node))
const isIntro = computed(() => view.value === 'intro')
const atHome = computed(() => view.value === 'home')
const canGoBack = computed(() => view.value !== 'home' && view.value !== 'intro')

/**
 * 是否应展示横幅。
 * - 进入系统后的第一条通知会先等一段延迟（让玩家看清桌面），
 *   由 `notices.visible` 控制，延迟结束前不渲染。
 * - 设置里的「顶部弹出通知」是总开关：关闭后两类通知都不再弹横幅，
 *   但通知仍会记入通知中心（推送时已按该开关决定是否入队）。
 */
const showBanner = computed(() => {
  const item = currentNotice.value
  if (!item || isIntro.value) return false
  if (!notices.visible.value) return false
  return settings.value.banner
})

/** 通知中心：按类型分组（各自最新在前）。 */
const antifraudNotices = computed(() =>
  notices.history.value.filter((n) => n.kind === 'antifraud'),
)
const messageNotices = computed(() => notices.history.value.filter((n) => n.kind === 'message'))

/** 桌面邀请通知：仅在 invite 节点可见（点开只切视图，不提交选项）。 */
const showInviteNotice = computed(() => state.value.node === 'invite')

/** 消息应用当前会话：邀请未处理时优先展示邀请。 */
const chatSession = computed<'invite' | 'group'>(() =>
  preferredChatView(state.value.node) === 'invite' ? 'invite' : 'group',
)

/** 聚焦管理：切换视图后把焦点移到主内容区，便于键盘用户。 */
const mainRef = ref<HTMLElement | null>(null)
watch(view, async () => {
  await nextTick()
  mainRef.value?.focus()
})

/** 提交剧情选项：成功后按新节点切换视图；失败不改变任何状态。 */
function submit(optionId: OptionId): void {
  if (submitting.value) return
  submitting.value = true

  // 与剧情语义匹配的操作音。解锁音由锁屏自己播放，这里不重复。
  if (optionId === 'confirm-100' || optionId === 'confirm-300') playSound('confirm')
  else if (optionId.startsWith('cancel-') || optionId === 'stop-after-100' || optionId === 'stop-at-freeze' || optionId === 'reject-invite' || optionId === 'report-group') playSound('cancel')
  else if (optionId !== 'start') playSound('tap')

  const accepted = game.dispatch(optionId)
  if (accepted) {
    profileOpen.value = false
    // 开场解锁：先让玩家看到桌面与邀请通知，不直接跳进会话。
    if (optionId === 'start') {
      view.value = 'home'
      // 先弹反诈预警，学姐邀请排在它之后自动接上（不打断、不覆盖）。
      pushAntifraud(state.value.node)
      pushMessage(BRAND.chat, '一位学姐邀请你加入兼职群')
    } else {
      syncViewToNode()
      pushAntifraud(state.value.node)
    }
  }
  // 同一帧内的重复点击由 submitting 拦截；进入微任务队列后立即解锁，
  // 避免吞掉玩家的下一次正常点击。真正的防重复扣款在引擎层（一次性选项校验）。
  void nextTick(() => {
    submitting.value = false
  })
}

/**
 * 剧情推进后，把玩家带到该看的地方（仅导航，不改变剧情）。
 * 以**新节点**为准，而不是以点击了哪个选项为准，避免视图与剧情脱节。
 */
function syncViewToNode(): void {
  const node = state.value.node
  switch (node) {
    case 'intro':
      view.value = 'intro'
      break
    case 'transfer-100':
    case 'transfer-300':
      // 待确认的模拟垫付：直接进入钱包，由玩家显式确认或取消。
      view.value = 'wallet'
      break
    case 'invite':
    case 'group':
    case 'rebate':
    case 'freeze':
      view.value = 'chat'
      break
    case 'end-clear':
    case 'end-stop':
    case 'end-loss':
      view.value = 'result'
      break
    case 'debrief':
      view.value = 'review'
      break
    default:
      view.value = 'home'
      break
  }
}

function openManual(): void {
  playSound('tap')
  // 已生成复盘时，手册直接展示本局复盘（S9）。
  view.value = state.value.node === 'debrief' ? 'review' : 'manual'
}

/** 桌面「继续当前事项」：按节点导航，不自动选择剧情。 */
function resume(): void {
  const node = state.value.node
  if (node === 'intro') {
    view.value = 'home'
    return
  }
  if (node === 'transfer-100' || node === 'transfer-300') {
    view.value = 'wallet'
    return
  }
  if (node === 'invite' || node === 'group' || node === 'rebate' || node === 'freeze') {
    view.value = 'chat'
    return
  }
  if (node === 'debrief') {
    view.value = 'review'
    return
  }
  if (hasOutcome(node)) {
    view.value = 'result'
    return
  }
  view.value = 'home'
}

function goHome(): void {
  playSound('tap')
  view.value = 'home'
  profileOpen.value = false
}

function goBack(): void {
  if (confirmRestart.value) {
    confirmRestart.value = false
    return
  }
  if (profileOpen.value) {
    profileOpen.value = false
    return
  }
  playSound('tap')
  view.value = 'home'
}

/** 打开资料弹层：同时记录一次线索（引擎处理，余额不变、只记一次）。 */
function openProfile(): void {
  playSound('tap')
  profileOpen.value = true
  game.dispatch('view-profile')
}

function requestRestart(): void {
  playSound('tap')
  confirmRestart.value = true
}

function doRestart(): void {
  game.restart()
  confirmRestart.value = false
  profileOpen.value = false
  notices.clear()
  noticesReadAt.value = 0
  view.value = 'intro'
}

/** 手册里的「查看本局结果与复盘」：导航到结局卡。 */
function openOutcome(): void {
  playSound('tap')
  view.value = state.value.node === 'debrief' ? 'review' : 'result'
}

/** 只读应用（相册 / 通知中心）。 */
function openPlain(target: 'photos' | 'notifications'): void {
  playSound('tap')
  if (target === 'notifications') {
    markNoticesRead()
  }
  view.value = target
}

/** 打开通知中心（状态栏与桌面图标共用同一入口，避免两个「通知」界面）。 */
function openNotificationCenter(): void {
  playSound('tap')
  markNoticesRead()
  view.value = 'notifications'
}

/** 点击消息类通知：进入对应会话（当前消息都来自青讯）。 */
function openNoticeTarget(): void {
  playSound('tap')
  view.value = 'chat'
}

/**
 * 桌面角标的「未读」判定。
 *
 * 关键时序：必须等通知**真正弹出过**（`notices.hasShownAny`）之后才允许亮角标，
 * 否则会出现「横幅还在延迟、角标已经亮了」的倒置观感。
 * 进入通知中心即视为已读。
 */
/** 已读水位：进入通知中心时记录当时的通知条数。 */
const noticesReadAt = ref(0)
const unreadCount = computed(() => {
  if (!notices.hasShownAny.value) return 0
  return Math.max(0, notices.history.value.length - noticesReadAt.value)
})
const hasUnreadNotices = computed(() => unreadCount.value > 0)

function markNoticesRead(): void {
  noticesReadAt.value = notices.history.value.length
}

/** 打开设置。 */
function openSettings(): void {
  playSound('tap')
  view.value = 'settings'
}

/** 打开消息应用（按当前节点定位会话）。 */
function openChat(): void {
  playSound('tap')
  view.value = 'chat'
}

/** 打开钱包。 */
function openWallet(): void {
  playSound('tap')
  view.value = 'wallet'
}

/** 点击顶部通知横幅：进入通知中心查看完整内容。 */
function openBanner(): void {
  const item = currentNotice.value
  dismissNotice()
  playSound('tap')
  // 消息类通知点开直接进对应应用；预警类进通知中心看全文。
  if (item?.kind === 'message') {
    view.value = 'chat'
    return
  }
  view.value = 'notifications'
}

/**
 * 浏览器返回键：压入一条游戏内历史记录，使返回键执行「回桌面」而不是直接离开页面。
 * 返回只改变视图，不撤销剧情、不重复提交选项、不产生扣款。
 */
let historyGuardActive = false

function onPopState(): void {
  if (confirmRestart.value) {
    confirmRestart.value = false
  } else if (profileOpen.value) {
    profileOpen.value = false
  } else if (view.value !== 'home' && view.value !== 'intro') {
    view.value = 'home'
  }
  // 始终保持一条游戏内历史，避免返回键把玩家带出游戏。
  globalThis.history.pushState({ phone: true }, '')
}

onMounted(() => {
  globalThis.history.pushState({ phone: true }, '')
  historyGuardActive = true
  globalThis.addEventListener('popstate', onPopState)
})

onBeforeUnmount(() => {
  globalThis.removeEventListener('popstate', onPopState)
  if (historyGuardActive) historyGuardActive = false
  notices.dispose()
})
</script>

<template>
  <div class="phone">
    <div class="phone__frame" role="application" aria-label="手机界面">
      <PhoneStatusBar
        v-if="!isIntro"
        clickable
        :expanded="view === 'notifications'"
        @toggle-notice="openNotificationCenter"
      />

      <!-- 顶部通知横幅：预警与消息两类视觉区分 -->
      <NotificationBanner
        v-if="showBanner && currentNotice"
        :kind="currentNotice.kind"
        :title="currentNotice.title"
        :body="currentNotice.body"
        :leaving="noticeLeaving"
        :queued="waitingCount"
        @open="openBanner"
        @dismiss="dismissNotice"
      />

      <main ref="mainRef" class="phone__viewport" tabindex="-1">
        <IntroScene v-if="view === 'intro'" @start="submit('start')" />

        <HomeScene
          v-else-if="view === 'home'"
          :state="state"
          :show-invite-notice="showInviteNotice"
          :has-unread="hasUnreadNotices"
          :unread-count="unreadCount"
          :notice-shown="notices.hasShownAny.value"
          @open-chat="openChat"
          @open-wallet="openWallet"
          @open-manual="openManual"
          @open-app="openPlain"
          @open-settings="openSettings"
          @resume="resume"
          @restart="requestRestart"
        />

        <ChatScene
          v-else-if="view === 'chat'"
          :state="state"
          :session="chatSession"
          :profile-open="profileOpen"
          :profile-viewed="state.viewedProfile"
          @choose="submit"
          @open-profile="openProfile"
          @close-profile="profileOpen = false"
          @back="goBack"
          @open-wallet="openWallet"
        />

        <WalletScene
          v-else-if="view === 'wallet'"
          :state="state"
          :pending-amount="pending"
          :submitting="submitting"
          @choose="submit"
          @back="goBack"
        />

        <EndingScene
          v-else-if="view === 'result'"
          :state="state"
          @choose="submit"
          @back="goBack"
        />

        <ReviewScene
          v-else-if="view === 'review'"
          :state="state"
          @back="goBack"
          @request-restart="requestRestart"
        />

        <ManualScene
          v-else-if="view === 'manual'"
          :state="state"
          @back="goBack"
          @open-outcome="openOutcome"
        />

        <SettingsScene v-else-if="view === 'settings'" @back="goBack" />

        <!-- 通知中心：预警与消息分组展示 -->
        <section v-else-if="view === 'notifications'" class="center" aria-label="通知中心">
          <header class="center__head">
            <button type="button" class="center__back" aria-label="返回上一层" @click="goBack">←</button>
            <span class="center__title">通知</span>
          </header>
          <div class="center__body">
            <p v-if="notices.history.value.length === 0" class="center__empty">暂时没有通知。</p>

            <template v-else>
              <template v-if="antifraudNotices.length">
                <h2 class="center__group">国家反诈中心</h2>
                <ul class="center__list">
                  <li v-for="item in antifraudNotices" :key="item.id">
                    <div class="center__item center__item--antifraud">
                      <span class="center__itemtitle">{{ item.title }}</span>
                      <span class="center__itembody">{{ item.body }}</span>
                    </div>
                  </li>
                </ul>
              </template>

              <template v-if="messageNotices.length">
                <h2 class="center__group">消息</h2>
                <ul class="center__list">
                  <li v-for="item in messageNotices" :key="item.id">
                    <!-- 消息类通知可点：直接进入对应会话 -->
                    <button
                      type="button"
                      class="center__item center__item--message center__item--action"
                      @click="openNoticeTarget"
                    >
                      <span class="center__itemtitle">{{ item.title }}</span>
                      <span class="center__itembody">{{ item.body }}</span>
                      <span class="center__itemhint">点击查看</span>
                    </button>
                  </li>
                </ul>
              </template>

              <button
                type="button"
                class="btn btn--secondary center__clear"
                @click="notices.clear()"
              >
                清空通知
              </button>
            </template>
          </div>
        </section>

        <PlainAppScene v-else-if="view === 'photos'" @back="goBack" />
      </main>

      <BottomNav
        v-if="!isIntro"
        :at-home="atHome"
        :can-go-back="canGoBack"
        @home="goHome"
        @back="goBack"
        @manual="openManual"
      />

      <!-- 重开二次确认 -->
      <OverlaySheet
        v-if="confirmRestart"
        title="重来一次？"
        size="dialog"
        @close="confirmRestart = false"
      >
        <p class="confirm__text">
          进度、余额和这局的记录都会清掉，回到开场。清掉就找不回来了。
        </p>
        <template #footer>
          <button type="button" class="btn btn--danger" @click="doRestart">清掉，重来</button>
          <button type="button" class="btn btn--secondary" @click="confirmRestart = false">
            算了，接着玩
          </button>
        </template>
      </OverlaySheet>
    </div>
  </div>
</template>

<style scoped>
.phone {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--c-bg-outer);
}

.phone__frame {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--phone-max-width);
  height: 100vh;
  height: 100dvh;
  padding-top: var(--safe-top);
  overflow: hidden;
  background: var(--c-desktop-2);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 6%);
}

.phone__viewport {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  outline: none;
}

.confirm__text {
  font-size: var(--font-sm);
  line-height: 1.6;
  color: var(--c-text-soft);
}

/* 通知中心 */
.center {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--c-surface-2);
}

.center__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  min-height: 46px;
  padding: var(--space-1) var(--space-2);
  background: var(--c-surface);
  border-bottom: 1px solid var(--c-line);
}

.center__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tap-min);
  height: var(--tap-min);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--c-primary);
  font-size: var(--font-base);
}

.center__title {
  font-size: var(--font-md);
  font-weight: 700;
}

.center__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
  min-height: 0;
  padding: var(--space-3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.center__empty {
  font-size: var(--font-sm);
  color: var(--c-text-soft);
}

.center__group {
  margin: var(--space-2) 0 var(--space-1);
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--c-text-soft);
}

.center__group:first-child {
  margin-top: 0;
}

.center__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.center__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: var(--space-3);
  padding-left: calc(var(--space-3) + 3px);
  border: 1px solid var(--c-line);
  border-left-width: 3px;
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
  text-align: left;
}

/* 与顶部横幅同一套规则：底色一致，仅左侧强调色区分类型 */
.center__item--antifraud {
  border-left-color: #4084e0;
}

.center__item--message {
  border-left-color: var(--c-accent);
}

/* 可点击的消息通知 */
.center__item--action {
  cursor: pointer;
}

.center__item--action:active {
  background: var(--c-surface-2);
}

.center__itemhint {
  margin-top: var(--space-1);
  font-size: var(--font-xs);
  color: var(--c-primary);
  font-weight: 600;
}

.center__itemtitle {
  display: block;
  margin-bottom: 2px;
  font-size: var(--font-sm);
  font-weight: 700;
}

.center__itembody {
  display: block;
  font-size: var(--font-sm);
  line-height: 1.6;
  color: var(--c-text-soft);
}

.center__clear {
  align-self: flex-start;
}

/* 桌面预览时居中展示手机尺寸画面；移动端铺满可见区域 */
@media (min-width: 480px) {
  .phone__frame {
    height: min(100dvh, 900px);
    border-radius: 18px;
  }
}

@media (max-height: 420px) {
  .phone__frame {
    height: 100dvh;
  }
}
</style>
