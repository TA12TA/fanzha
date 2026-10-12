<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BottomNav from '@/components/BottomNav.vue'
import OverlaySheet from '@/components/OverlaySheet.vue'
import PhoneStatusBar from '@/components/PhoneStatusBar.vue'
import ChatScene from '@/scenes/ChatScene.vue'
import EndingScene from '@/scenes/EndingScene.vue'
import HomeScene from '@/scenes/HomeScene.vue'
import IntroScene from '@/scenes/IntroScene.vue'
import ManualScene from '@/scenes/ManualScene.vue'
import PlainAppScene from '@/scenes/PlainAppScene.vue'
import ReviewScene from '@/scenes/ReviewScene.vue'
import WalletScene from '@/scenes/WalletScene.vue'
import { hasOutcome, pendingAmount, preferredChatView } from '@/app/navigation'
import { useGame } from '@/app/useGame'
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

const view = ref<ViewId>(state.value.node === 'intro' ? 'intro' : 'home')
const profileOpen = ref(false)
const noticeOpen = ref(false)
const confirmRestart = ref(false)
/** 提交后立即禁用按钮，避免连点导致二次扣款。 */
const submitting = ref(false)

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
  const accepted = game.dispatch(optionId)
  if (accepted) {
    profileOpen.value = false
    // 开场「开始体验」：先让玩家看到桌面与邀请通知，不直接跳进会话。
    if (optionId === 'start') {
      view.value = 'home'
    } else {
      syncViewToNode()
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
  view.value = 'home'
}

/** 打开资料弹层：同时记录一次线索（引擎处理，余额不变、只记一次）。 */
function openProfile(): void {
  profileOpen.value = true
  game.dispatch('view-profile')
}

function requestRestart(): void {
  confirmRestart.value = true
}

function doRestart(): void {
  game.restart()
  confirmRestart.value = false
  profileOpen.value = false
  noticeOpen.value = false
  view.value = 'intro'
}

/** 手册里的「查看本局结果与复盘」：导航到结局卡。 */
function openOutcome(): void {
  view.value = state.value.node === 'debrief' ? 'review' : 'result'
}

/** 只读应用。 */
function openPlain(target: 'photos' | 'notifications' | 'settings'): void {
  view.value = target
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
})
</script>

<template>
  <div class="phone">
    <div class="phone__frame" role="application" aria-label="虚构手机界面">
      <PhoneStatusBar
        v-if="!isIntro"
        clickable
        :expanded="noticeOpen"
        @toggle-notice="noticeOpen = !noticeOpen"
      />

      <main ref="mainRef" class="phone__viewport" tabindex="-1">
        <IntroScene v-if="view === 'intro'" @start="submit('start')" />

        <HomeScene
          v-else-if="view === 'home'"
          :state="state"
          :show-invite-notice="showInviteNotice"
          :notice-open="noticeOpen"
          @open-chat="view = 'chat'"
          @open-wallet="view = 'wallet'"
          @open-manual="openManual"
          @open-app="openPlain"
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
          @open-wallet="view = 'wallet'"
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

        <PlainAppScene
          v-else-if="view === 'photos' || view === 'notifications' || view === 'settings'"
          :app="view"
          @back="goBack"
        />
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
        title="重新开始本局？"
        size="dialog"
        @close="confirmRestart = false"
      >
        <p class="confirm__text">
          将清空本局进度、模拟余额与复盘记录，并回到开场。此操作不可撤销。
        </p>
        <template #footer>
          <button type="button" class="btn btn--danger" @click="doRestart">确认重新开始</button>
          <button type="button" class="btn btn--secondary" @click="confirmRestart = false">
            继续当前进度
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
