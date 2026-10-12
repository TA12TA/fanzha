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
import { useSettings } from '@/app/settings'
import { playSound, setSoundEnabled } from '@/app/sound'
import { useGame } from '@/app/useGame'
import { REMINDER_TITLE, reminderFor } from '@/data/antifraud'
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

/** 音效总开关跟随设置。 */
watch(
  () => settings.value.sound,
  (on) => setSoundEnabled(on),
  { immediate: true },
)

const view = ref<ViewId>(state.value.node === 'intro' ? 'intro' : 'home')
const profileOpen = ref(false)
const noticeOpen = ref(false)
const confirmRestart = ref(false)
/** 提交后立即禁用按钮，避免连点导致二次扣款。 */
const submitting = ref(false)

/** 顶部反诈提醒横幅状态。 */
const banner = ref<{ body: string; leaving: boolean } | null>(null)
let bannerTimer: ReturnType<typeof setTimeout> | null = null
let bannerLeaveTimer: ReturnType<typeof setTimeout> | null = null

/** 已收到的提醒（供通知中心查看）。 */
const reminders = ref<{ id: number; title: string; body: string }[]>([])
let reminderSeq = 0

function clearBannerTimers(): void {
  if (bannerTimer) clearTimeout(bannerTimer)
  if (bannerLeaveTimer) clearTimeout(bannerLeaveTimer)
  bannerTimer = null
  bannerLeaveTimer = null
}

/** 关闭横幅（带退场动画）。 */
function dismissBanner(): void {
  clearBannerTimers()
  if (!banner.value) return
  banner.value.leaving = true
  bannerLeaveTimer = setTimeout(() => {
    banner.value = null
  }, 220)
}

/** 玩家在设置里关掉顶部提醒时，立即收起当前正显示的横幅。 */
watch(
  () => settings.value.banner,
  (on) => {
    if (!on) dismissBanner()
  },
)

/** 展示某个节点的反诈提醒。 */
function showReminder(node = state.value.node): void {
  const body = reminderFor(node)
  if (!body) return
  // 每次进入节点都收进通知中心，便于回看。
  reminderSeq += 1
  reminders.value = [{ id: reminderSeq, title: REMINDER_TITLE, body }, ...reminders.value].slice(0, 20)

  if (!settings.value.banner) return

  clearBannerTimers()
  banner.value = { body, leaving: false }
  playSound('alert')
  // 停留一段时间后自动收起；玩家也可手动关闭。
  bannerTimer = setTimeout(dismissBanner, 7000)
}

const pending = computed(() => pendingAmount(state.value.node))
const isIntro = computed(() => view.value === 'intro')
const atHome = computed(() => view.value === 'home')
const canGoBack = computed(() => view.value !== 'home' && view.value !== 'intro')

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
      showReminder(state.value.node)
    } else {
      syncViewToNode()
      showReminder(state.value.node)
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
  noticeOpen.value = false
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
  if (noticeOpen.value) {
    noticeOpen.value = false
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
  noticeOpen.value = false
  banner.value = null
  reminders.value = []
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
  view.value = target
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

/** 点击顶部提醒横幅：进入通知中心查看完整内容。 */
function openBanner(): void {
  dismissBanner()
  playSound('tap')
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
  } else if (noticeOpen.value) {
    noticeOpen.value = false
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
  clearBannerTimers()
})
</script>

<template>
  <div class="phone">
    <div class="phone__frame" role="application" aria-label="手机界面">
      <PhoneStatusBar
        v-if="!isIntro"
        clickable
        :expanded="noticeOpen"
        @toggle-notice="noticeOpen = !noticeOpen"
      />

      <!-- 顶部反诈提醒横幅：与手机内其他界面同一画风 -->
      <NotificationBanner
        v-if="banner && !isIntro"
        :title="REMINDER_TITLE"
        :body="banner.body"
        :leaving="banner.leaving"
        @open="openBanner"
        @dismiss="dismissBanner"
      />

      <main ref="mainRef" class="phone__viewport" tabindex="-1">
        <IntroScene v-if="view === 'intro'" @start="submit('start')" />

        <HomeScene
          v-else-if="view === 'home'"
          :state="state"
          :show-invite-notice="showInviteNotice"
          :notice-open="noticeOpen"
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

        <!-- 通知中心：包含反诈提醒历史 -->
        <section v-else-if="view === 'notifications'" class="center" aria-label="通知中心">
          <header class="center__head">
            <button type="button" class="center__back" aria-label="返回上一层" @click="goBack">←</button>
            <span class="center__title">通知</span>
          </header>
          <div class="center__body">
            <p v-if="reminders.length === 0" class="center__empty">暂时没有通知。</p>
            <ul v-else class="center__list">
              <li v-for="item in reminders" :key="item.id" class="center__item">
                <p class="center__itemtitle">{{ item.title }}</p>
                <p class="center__itembody">{{ item.body }}</p>
              </li>
            </ul>
            <button
              v-if="reminders.length"
              type="button"
              class="btn btn--secondary center__clear"
              @click="reminders = []"
            >
              清空通知
            </button>
          </div>
        </section>

        <PlainAppScene v-else-if="view === 'photos'" :app="view" @back="goBack" />
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

.center__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.center__item {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
}

.center__itemtitle {
  margin-bottom: 2px;
  font-size: var(--font-sm);
  font-weight: 700;
}

.center__itembody {
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
