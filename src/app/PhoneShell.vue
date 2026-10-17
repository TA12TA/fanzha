<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AntiFraudDialog from '@/components/AntiFraudDialog.vue'
import BottomNav from '@/components/BottomNav.vue'
import NotificationBanner from '@/components/NotificationBanner.vue'
import OverlaySheet from '@/components/OverlaySheet.vue'
import PhoneStatusBar from '@/components/PhoneStatusBar.vue'
import RecentsSheet from '@/components/RecentsSheet.vue'
import ChatScene from '@/scenes/ChatScene.vue'
import EndingScene from '@/scenes/EndingScene.vue'
import HomeScene from '@/scenes/HomeScene.vue'
import IntroScene from '@/scenes/IntroScene.vue'
import ManualScene from '@/scenes/ManualScene.vue'
import MusicScene from '@/scenes/MusicScene.vue'
import PlainAppScene from '@/scenes/PlainAppScene.vue'
import ReviewScene from '@/scenes/ReviewScene.vue'
import SettingsScene from '@/scenes/SettingsScene.vue'
import ShopScene from '@/scenes/ShopScene.vue'
import VideoScene from '@/scenes/VideoScene.vue'
import WalletScene from '@/scenes/WalletScene.vue'
import {
  chatViewForNode,
  debriefOptionOf,
  hasUnreadMessage,
  preferredChatView,
  sceneForNode,
  startOptionOf,
  type AppId,
  type ChatView,
  type PlainAppId,
} from '@/app/navigation'
import { useNotifications } from '@/app/notifications'
import { useSettings } from '@/app/settings'
import { resetChatReveal } from '@/app/chatReveal'
import { resetClassGroupNews } from '@/app/classNews'
import { codeMatches, generateCode, renderSms } from '@/app/smsCode'
import { playSound, setSoundEnabled } from '@/app/sound'
import { useGame } from '@/app/useGame'
import { REMINDER_HEADLINE, REMINDER_TITLE, reminderFor } from '@/data/antifraud'
import { BRAND } from '@/data/levels/shared'
import { codeGateFor, wantsReminderPopup } from '@/game/level'
import type { PlayableLevel } from '@/game/level'
import type { OptionId } from '@/game/types'

/**
 * 一部正在运行的虚构手机（**对应一个关卡**）。
 *
 * 职责边界：
 * - 剧情与金额：只通过 `game.dispatch(optionId)` 变更（引擎统一处理）。
 * - UI 导航：本组件维护「当前看哪一层」，切换视图不影响剧情。
 * - 关卡数据：本组件不含任何具体关卡的节点名或话术，全部来自 `props.level`。
 *
 * 关卡大厅在外层（`AppShell.vue`）：切关时本组件会被整体重挂载，
 * 因此通知队列、最近任务、当前视图都会自然回到该关的初始状态，
 * 而剧情进度早已由 `dispatch` 落盘，不会丢。
 */
const props = defineProps<{
  /** 当前关卡（可玩）。 */
  level: PlayableLevel
  /**
   * 壁纸主题（白天/夜间）。
   *
   * 由根壳解析后传进来，而不是在这里再调一次 `useTheme()`：
   * - 首屏是大厅，主题属性必须由根壳负责设置（否则大厅读不到主题）；
   * - `useTheme()` 卸载时会摘掉 `<html>` 上的属性，重复持有会在
   *   「从手机退回大厅」时把根壳需要的属性一并摘掉。
   */
  theme: 'day' | 'night'
}>()

const emit = defineEmits<{
  /** 请求打开关卡大厅（只切界面，不改进度）。 */
  (e: 'open-levels'): void
  /** 请求清空全部关卡进度（外层负责清档并刷新大厅）。 */
  (e: 'clear-all'): void
}>()

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
  | 'shop'
  | 'music'
  | 'video'

const game = useGame(props.level.meta.id)
const { state } = game
const { settings } = useSettings()
const notices = useNotifications()

/** 音效总开关跟随设置。 */
watch(
  () => settings.value.sound,
  (on) => setSoundEnabled(on),
  { immediate: true },
)

const view = ref<ViewId>(state.value.node === props.level.startNode ? 'intro' : 'home')
const profileOpen = ref(false)
const confirmRestart = ref(false)
const confirmClearAll = ref(false)
/** 最近任务面板是否展开（Android 三大金刚键的第三个键）。 */
const recentsOpen = ref(false)
/**
 * 最近打开过的应用（最新在前，去重，最多 4 个）。
 * 纯 UI 状态：只记录「开过哪些应用」，不涉及剧情与金额。
 */
const recentApps = ref<AppId[]>([])
/** 提交后立即禁用按钮，避免连点导致二次扣款。 */
const submitting = ref(false)

/**
 * 换页动画类型。
 * - `unlock`：锁屏 → 桌面，桌面像被「揭开」一样进来；
 * - `app`：应用之间切换，新界面轻微滑入。
 * 只影响视觉：动画是 CSS 挂载动画，元素立即出现在 DOM 里，
 * 不会延迟玩家操作（`prefers-reduced-motion` 下由 token 归零）。
 */
const transitionKind = ref<'unlock' | 'app'>('app')

/**
 * 相册的挂载钥匙：每次从桌面重新打开相册时 +1，
 * 让相册重新挂载、回到网格第一屏，而不是停在上次翻到的那张照片。
 */
const photosKey = ref(0)

/** 商城的初始页：从订单入口进入时直接落到「订单」。 */
const shopTab = ref<'home' | 'orders'>('home')

/** 九个真正的应用（结局/复盘/桌面/锁屏不算应用）。 */
const APP_IDS: AppId[] = [
  'chat',
  'wallet',
  'manual',
  'photos',
  'notifications',
  'settings',
  'shop',
  'music',
  'video',
]

/** 把当前视图收敛成「应用 id」；不是应用时返回 null。 */
function asAppId(value: ViewId): AppId | null {
  return APP_IDS.includes(value as AppId) ? (value as AppId) : null
}

watch(view, (next, prev) => {
  // 换页动画：从锁屏进桌面用解锁动画，其余用应用切换动画。
  transitionKind.value = prev === 'intro' && next === 'home' ? 'unlock' : 'app'

  const app = asAppId(next)
  if (!app) return
  recentApps.value = [app, ...recentApps.value.filter((a) => a !== app)].slice(0, 4)
})

/** 打开最近任务面板。 */
function openRecents(): void {
  playSound('tap')
  recentsOpen.value = true
}

/** 关闭最近任务面板。 */
function closeRecents(): void {
  playSound('tap')
  recentsOpen.value = false
}

/** 从最近任务切到某个应用（只切视图，不影响剧情）。 */
function openFromRecents(app: AppId): void {
  playSound('tap')
  recentsOpen.value = false
  view.value = app
}

/** 当前展示的通知与等待条数。 */
const currentNotice = computed(() => notices.current.value)
const waitingCount = computed(() => notices.waitingCount.value)
/** 退场动画状态（由通知队列管理）。 */
const noticeLeaving = computed(() => notices.leaving.value)

/**
 * 当前展示的「国家反诈中心」弹窗正文（null = 不显示）。
 *
 * 只有关卡数据 `popupReminders` 里列出的节点才会用弹窗，其余节点仍是横幅。
 * 弹窗是模态的、必须点一下才能继续 —— 所以绝不能每个节点都弹，
 * 否则玩家会开始无脑点「知道了」，等于没弹。
 */
const antifraudDialog = ref<{ body: string } | null>(null)

/** 关闭弹窗：玩家已读完。 */
function closeAntifraudDialog(): void {
  antifraudDialog.value = null
}

/**
 * 推送反诈预警。
 *
 * 两种呈现，由关卡数据决定：
 * - 普通节点 → 顶部横幅，轻提示、不打断操作；
 * - `popupReminders` 里列出的关键节点 → **国家反诈中心弹窗**，
 *   必须点一下才能继续。这类节点是「真的可能正在被骗」的分水岭。
 *
 * 无论哪种都记进通知中心，方便回看；是否弹出仍受「顶部弹出通知」开关控制。
 */
function pushAntifraud(node = state.value.node): void {
  const body = reminderFor(props.level.meta.id, node)
  if (!body) return
  const item = { kind: 'antifraud' as const, title: REMINDER_TITLE, body }

  if (wantsReminderPopup(props.level, node)) {
    // 只记录 + 弹窗，不进横幅队列 —— 同一条内容不该在两个地方各说一遍。
    notices.record(item)
    if (settings.value.banner) antifraudDialog.value = { body }
    return
  }

  if (!settings.value.banner) {
    // 关闭弹出时只记录，不进入展示队列，避免不可见的通知占用队列与定时器。
    notices.record(item)
    return
  }
  notices.push(item)
}

/**
 * 推送消息类通知，与预警分开。
 * 排在队列末尾，等当前通知播完后自动接上。
 */
function pushMessage(title: string, body: string): void {
  if (!settings.value.banner) {
    notices.record({ kind: 'message', title, body })
    return
  }
  notices.push({ kind: 'message', title, body })
}

/* ============================================================
 * 模拟验证码
 * ============================================================
 * 骗局里最要命的一步是「把短信验证码念给我」。只让玩家读一句
 * "验证码不能给" 是学不会的，所以这一步真的做出来：
 * 短信以通知的形式弹出（本地随机生成，不读真实短信、不上传），
 * 玩家必须把它填回去；填错了对方会再发一条新的。
 */

/** 当前节点是否需要玩家填验证码（来自关卡数据 `codeGate`）。 */
const activeCodeGate = computed(() => codeGateFor(props.level, state.value.node))

/** 当前有效的那条验证码。 */
const currentCode = ref('')

/** 最近一条短信的正文（横幅关闭时改为就地显示，见下面的说明）。 */
const codeSmsText = ref('')

/** 已经被判错的次数：>0 时聊天里会出现对方那句「再看一下短信」。 */
const codeAttempts = ref(0)

/**
 * 发出（或重发）一条模拟短信 —— 每次都是**新的**验证码。
 *
 * 三个必须这么做的地方：
 * 1. **先清掉当前展示队列再弹**：验证码是这一步能否继续的前提，如果排在一条
 *    6 秒的反诈横幅后面，玩家会以为"我没收到短信"而卡在这里。被清掉的预警
 *    早已进过通知中心，仍可回看。
 * 2. **不受「顶部弹出通知」开关影响**（组件层面也会兜底，见 `codeSmsText`）：
 *    关掉那个开关只是不想被打扰；这里不给看就没法继续玩了。
 * 3. 正文同时存一份到 `codeSmsText`：万一横幅被系统/开关挡住，
 *    输入区上方会就地显示这条短信，保证游戏永远走得下去。
 */
function issueCode(): void {
  const gate = activeCodeGate.value
  if (!gate) return
  currentCode.value = generateCode()
  codeSmsText.value = renderSms(gate.smsTemplate, currentCode.value)
  notices.dropCurrent()
  notices.push({ kind: 'message', title: gate.sender, body: codeSmsText.value })
}

/**
 * 进入（或刷新后落到）需要验证码的节点时发第一条短信。
 * `immediate` 是给「存档已经在这个节点」的情况准备的：不带它的话，
 * 刷新后玩家会看到一个输入框，却从没收到过短信。
 */
watch(
  () => state.value.node,
  () => {
    codeAttempts.value = 0
    currentCode.value = ''
    codeSmsText.value = ''
    if (activeCodeGate.value) issueCode()
  },
  { immediate: true },
)

/** 玩家提交验证码。 */
function submitCode(raw: string): void {
  const gate = activeCodeGate.value
  if (!gate || submitting.value) return

  if (codeMatches(raw, currentCode.value)) {
    // 填对了 = 把码给了对方。仍然走正常的选项转移，引擎与账本完全不知情。
    submit(gate.onCorrect)
    return
  }

  /*
   * 填错：对方**再说一句**，然后发一条新的。
   * 语气必须平和 —— 现实中的骗子在这一步很有"耐心"（恐吓是后面要钱时才用的），
   * 这里如果骂人或催命，反而不像真的。
   */
  codeAttempts.value += 1
  playSound('cancel')
  issueCode()
}

/** 「重新发一条」：换一个新验证码（真实短信会过期，玩家也可能把通知划掉了）。 */
function resendCode(): void {
  if (!activeCodeGate.value) return
  playSound('tap')
  issueCode()
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

/**
 * 玩家手动点横幅的「×」。
 * 必须与自动到时关闭区分开：自动关闭是通知自己的倒计时，不该再补一声；
 * 手动关闭是玩家操作，要给一声反馈。
 */
function closeBanner(): void {
  playSound('tap')
  dismissNotice()
}

/** 清空通知中心历史。 */
function clearNotices(): void {
  playSound('tap')
  notices.clear()
}

/** 关闭「重来一次？」确认框：取消，保留进度。 */
function cancelRestart(): void {
  playSound('tap')
  confirmRestart.value = false
}

/** 关闭「清空全部关卡进度」确认框。 */
function cancelClearAll(): void {
  playSound('tap')
  confirmClearAll.value = false
}

/** 关闭资料弹层。 */
function closeProfile(): void {
  playSound('tap')
  profileOpen.value = false
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

const isIntro = computed(() => view.value === 'intro')
/**
 * 手机外框（状态栏 + 导航栏）的深浅。
 *
 * 桌面与锁屏压在壁纸上，所以要看壁纸主题：夜间壁纸深 → 深色条；
 * 白天壁纸浅 → 浅色条（否则一条黑边压在浅色壁纸上很假）。
 * 应用内部页面本来就是浅色底，一律用浅色条。
 */
const chromeTone = computed<'dark' | 'light'>(() => {
  const onWallpaper = view.value === 'home' || view.value === 'intro'
  if (!onWallpaper) return 'light'
  return props.theme === 'day' ? 'light' : 'dark'
})
/** 当前已打开的应用（用于最近任务里标出「正在使用」）；结局/复盘/桌面不是应用。 */
const currentAppId = computed<AppId | null>(() => asAppId(view.value))

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

/** 桌面「有人在等你回消息」的提示：由关卡声明哪个节点有未读。 */
const showInviteNotice = computed(() => hasUnreadMessage(props.level, state.value.node))

/**
 * 消息应用当前会话；null 表示在会话列表。
 *
 * 默认直接落到剧情相关的会话（邀请未处理时看学姐，进群后看兼职群），
 * 这样从桌面点「青讯」就能接着推进；按「返回」才逐层退到会话列表。
 */
const chatView = ref<ChatView>(preferredChatView(props.level, state.value.node))

/** 剧情推进后，会话定位跟随节点（与视图同步由 syncViewToNode 负责）。 */
watch(
  () => state.value.node,
  (node) => {
    chatView.value = preferredChatView(props.level, node)
  },
)

/** 打开消息应用里的某个会话（只切 UI，不影响剧情）。 */
function openSession(id: string): void {
  playSound('tap')
  chatView.value = id
}

/** 消息应用内的返回：会话 → 会话列表 → 桌面。 */
function backFromChat(): void {
  playSound('tap')
  if (chatView.value !== 'list') {
    chatView.value = 'list'
    return
  }
  view.value = 'home'
}

/** 聚焦管理：切换视图后把焦点移到主内容区，便于键盘用户。 */
const mainRef = ref<HTMLElement | null>(null)
watch(view, async () => {
  await nextTick()
  mainRef.value?.focus()
})

/** 需要「取消/拒绝」音效的选项类型（按 id 前缀与语义判断，不写死具体关卡）。 */
function isCancelLike(optionId: OptionId): boolean {
  return (
    optionId.startsWith('cancel-') ||
    optionId.startsWith('l2-cancel-') ||
    optionId.includes('refuse') ||
    optionId.startsWith('stop-') ||
    optionId.startsWith('l2-stop') ||
    optionId === 'reject-invite' ||
    optionId === 'report-group'
  )
}

/** 需要「确认付款」音效的选项：带负向金额变化的一次性选项。 */
function isConfirmPayment(optionId: OptionId): boolean {
  const effect = props.level.options[optionId]?.effect
  return Boolean(effect?.once && typeof effect.balanceDelta === 'number' && effect.balanceDelta < 0)
}

/** 提交剧情选项：成功后按新节点切换视图；失败不改变任何状态。 */
function submit(optionId: OptionId): void {
  if (submitting.value) return
  submitting.value = true

  // 与剧情语义匹配的操作音。解锁音由锁屏自己播放，这里不重复。
  if (isConfirmPayment(optionId)) playSound('confirm')
  else if (isCancelLike(optionId)) playSound('cancel')
  else if (optionId !== startOptionOf(props.level)) playSound('tap')

  const accepted = game.dispatch(optionId)
  if (accepted) {
    profileOpen.value = false
    // 开场解锁：先让玩家看到桌面与开场通知，不直接跳进会话。
    if (optionId === startOptionOf(props.level)) {
      view.value = 'home'
      // 先弹反诈预警，消息通知排在它之后自动接上（不打断、不覆盖）。
      pushAntifraud(state.value.node)
      const notice = props.level.meta.startNotice
      if (notice) pushMessage(BRAND.chat, notice)
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
  const target = sceneForNode(props.level, state.value.node)
  if (target === 'chat') chatView.value = chatViewForNode(props.level, state.value.node)
  view.value = target
}

function openManual(): void {
  playSound('tap')
  // 已生成复盘时，手册直接展示本局复盘。
  view.value = state.value.node === props.level.debriefNode ? 'review' : 'manual'
}

/** 桌面「继续当前事项」：按节点导航，不自动选择剧情。 */
function resume(): void {
  playSound('tap')
  syncViewToNode()
}

function goHome(): void {
  playSound('tap')
  view.value = 'home'
  profileOpen.value = false
  recentsOpen.value = false
}

/**
 * 返回上一层。
 * 优先级：最近任务面板 → 确认弹层 → 资料/详情弹层 → 上一个视图。
 * 在桌面按返回为空操作，不会把玩家带出游戏（真机返回键在主页才会退出，
 * 这里不退出，避免玩家误触丢进度）。
 */
function goBack(): void {
  if (recentsOpen.value) {
    closeRecents()
    return
  }
  if (confirmRestart.value) {
    cancelRestart()
    return
  }
  if (confirmClearAll.value) {
    cancelClearAll()
    return
  }
  if (profileOpen.value) {
    closeProfile()
    return
  }
  if (view.value === 'home' || view.value === 'intro') return
  // 消息应用内逐层退：会话 → 会话列表 → 桌面。
  if (view.value === 'chat') {
    backFromChat()
    return
  }
  playSound('tap')
  view.value = 'home'
}

/** 打开资料弹层：同时按关卡声明记录一次线索（余额不变、只记一次）。 */
function openProfile(): void {
  playSound('tap')
  profileOpen.value = true
  const entry = props.level.chat.profile.find((p) => p.session === chatView.value)
  if (entry?.option) game.dispatch(entry.option)
}

/**
 * 聊天里的「订单详情」：不在聊天里弹一张转述卡，而是切到购物 App 的订单页。
 * 这是本作的教学重点之一 —— 订单问题要回到自己的购物 App 核实，
 * 不要听信聊天里的「客服」。只记录一次线索，不影响余额。
 */
function openDetail(): void {
  playSound('tap')
  const option = props.level.chat.detailSheet?.option
  if (option) game.dispatch(option)
  shopTab.value = 'orders'
  view.value = 'shop'
}

function requestRestart(): void {
  playSound('tap')
  confirmRestart.value = true
}

function doRestart(): void {
  playSound('cancel')
  game.restart()
  // 新的一局应当重新逐条播放每个会话，清掉这一关「看过哪些消息」的记忆
  resetChatReveal(props.level.meta.id)
  /*
   * 班级通知群的随机反诈通知也重新抽一批。
   * 不清的话，「再玩一次」看到的还是上一局那几条，随机就白做了。
   */
  resetClassGroupNews()
  confirmRestart.value = false
  profileOpen.value = false
  notices.clear()
  noticesReadAt.value = 0
  view.value = 'intro'
}

function requestClearAll(): void {
  playSound('tap')
  confirmClearAll.value = true
}

/** 清空全部关卡进度：清档与刷新大厅都由外层负责，这里只发请求。 */
function doClearAll(): void {
  playSound('cancel')
  confirmClearAll.value = false
  emit('clear-all')
}

/** 手册里的「查看本局结果与复盘」：导航到结局卡。 */
function openOutcome(): void {
  playSound('tap')
  view.value = state.value.node === props.level.debriefNode ? 'review' : 'result'
}

/** 只读/轻交互应用（相册、通知、商城、音乐、视频）。 */
function openPlain(target: PlainAppId): void {
  if (target === 'photos') {
    // 相册走自己的入口：每次都从网格开始
    openPhotos()
    return
  }
  playSound('tap')
  if (target === 'notifications') markNoticesRead()
  if (target === 'shop') shopTab.value = 'home'
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

/** 打开消息应用（按当前节点定位到相关会话，而不是先看会话列表）。 */
function openChat(): void {
  playSound('tap')
  chatView.value = chatViewForNode(props.level, state.value.node)
  view.value = 'chat'
}

/** 打开相册：每次都从网格开始（真机相册不会记住上次翻到哪张）。 */
function openPhotos(): void {
  playSound('tap')
  photosKey.value += 1
  view.value = 'photos'
}

/** 打开钱包。 */
function openWallet(): void {
  playSound('tap')
  view.value = 'wallet'
}

/** 打开关卡大厅（只切界面，不改进度）。 */
function openLevels(): void {
  playSound('tap')
  emit('open-levels')
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

/** 结局页的「看复盘」：选项 id 由关卡决定，不写死。 */
const reviewOption = computed(() => debriefOptionOf(props.level, state.value.node))

/**
 * 浏览器返回键：压入一条游戏内历史记录，使返回键执行「回桌面」而不是直接离开页面。
 * 返回只改变视图，不撤销剧情、不重复提交选项、不产生扣款。
 */
let historyGuardActive = false

function onPopState(): void {
  if (confirmRestart.value) {
    confirmRestart.value = false
  } else if (confirmClearAll.value) {
    confirmClearAll.value = false
  } else if (profileOpen.value) {
    profileOpen.value = false
  } else if (view.value !== 'home' && view.value !== 'intro') {
    view.value = 'home'
  }
  // 始终保持一条游戏内历史，避免返回键把玩家带出游戏。
  globalThis.history.pushState({ phone: true }, '')
}

/**
 * 误刷新保护：关卡已经开始且尚未结束时，关闭/刷新页面会触发浏览器的
 * 离开确认。移动端另外用 CSS 的 `overscroll-behavior` 关掉下拉刷新。
 *
 * 真正的进度保证仍来自「每次 dispatch 立即写存档」，这里只是减少误触。
 */
function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (state.value.node === props.level.startNode || state.value.ending) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  globalThis.history.pushState({ phone: true }, '')
  historyGuardActive = true
  globalThis.addEventListener('popstate', onPopState)
  globalThis.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  globalThis.removeEventListener('popstate', onPopState)
  globalThis.removeEventListener('beforeunload', onBeforeUnload)
  if (historyGuardActive) historyGuardActive = false
  notices.dispose()
})
</script>

<template>
  <div class="phone__frame" role="application" aria-label="手机界面">
    <PhoneStatusBar
      v-if="!isIntro"
      clickable
      :tone="chromeTone"
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
      @dismiss="closeBanner"
    />

    <!--
      「国家反诈中心」弹窗：只在关键节点弹（关卡数据 popupReminders）。
      模态、必须点一下才能继续 —— 这一步是「真的可能正在被骗」的分水岭。
    -->
    <AntiFraudDialog
      v-if="antifraudDialog"
      :title="REMINDER_TITLE"
      :headline="REMINDER_HEADLINE"
      :body="antifraudDialog.body"
      @close="closeAntifraudDialog"
    />

    <main ref="mainRef" class="phone__viewport" tabindex="-1">
      <!--
        换页容器：`:key="view"` 让切换视图时重新挂载并播放进入动画。
        用纯 CSS 挂载动画而不是 <Transition mode="out-in">，
        因为 out-in 会等旧界面退场结束才挂载新界面，
        既会拖慢操作，也会让自动化断言读到旧 DOM。
      -->
      <div :key="view" class="viewport__page" :class="`viewport__page--${transitionKind}`">
        <IntroScene
          v-if="view === 'intro'"
          :level="level"
          @start="submit(startOptionOf(level) ?? '')"
        />

        <HomeScene
          v-else-if="view === 'home'"
          :state="state"
          :level="level"
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
          :level="level"
          :session="chatView === 'list' ? null : chatView"
          :profile-open="profileOpen"
          :code-gate="activeCodeGate"
          :code-attempts="codeAttempts"
          :code-sms="settings.banner ? '' : codeSmsText"
          @choose="submit"
          @submit-code="submitCode"
          @resend-code="resendCode"
          @open-session="openSession"
          @open-profile="openProfile"
          @close-profile="closeProfile"
          @open-detail="openDetail"
          @back="backFromChat"
          @open-wallet="openWallet"
        />

        <WalletScene
          v-else-if="view === 'wallet'"
          :state="state"
          :level="level"
          :submitting="submitting"
          @choose="submit"
          @back="goBack"
        />

        <EndingScene
          v-else-if="view === 'result'"
          :state="state"
          :level="level"
          @choose="reviewOption ? submit(reviewOption) : undefined"
          @back="goBack"
          @open-levels="openLevels"
        />

        <ReviewScene
          v-else-if="view === 'review'"
          :state="state"
          :level="level"
          @back="goBack"
          @request-restart="requestRestart"
          @open-levels="openLevels"
        />

        <ManualScene
          v-else-if="view === 'manual'"
          :state="state"
          :level="level"
          @back="goBack"
          @open-outcome="openOutcome"
        />

        <SettingsScene
          v-else-if="view === 'settings'"
          :level-id="level.meta.id"
          @back="goBack"
          @request-restart="requestRestart"
          @request-clear-all="requestClearAll"
        />

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
                      <span class="row__chev" aria-hidden="true"></span>
                    </button>
                  </li>
                </ul>
              </template>

              <button
                type="button"
                class="btn btn--secondary center__clear"
                @click="clearNotices"
              >
                清空通知
              </button>
            </template>
          </div>
        </section>

        <ShopScene v-else-if="view === 'shop'" :initial-tab="shopTab" @back="goBack" />
        <MusicScene v-else-if="view === 'music'" @back="goBack" />
        <VideoScene v-else-if="view === 'video'" @back="goBack" />
        <PlainAppScene v-else-if="view === 'photos'" :key="photosKey" @back="goBack" />
      </div>
    </main>

    <BottomNav
      v-if="!isIntro"
      :tone="chromeTone"
      @home="goHome"
      @back="goBack"
      @recents="openRecents"
    />

    <!-- 最近任务（多任务键）：真实可用的最近应用面板 -->
    <RecentsSheet
      v-if="recentsOpen"
      :apps="recentApps"
      :current="currentAppId"
      @open="openFromRecents"
      @close="closeRecents"
    />

    <!-- 重开二次确认 -->
    <OverlaySheet
      v-if="confirmRestart"
      title="重来一次？"
      size="dialog"
      @close="cancelRestart"
    >
      <p class="confirm__text">
        「{{ level.meta.title }}」的进度、余额和这局的记录都会清掉，回到开场。清掉就找不回来了。
      </p>
      <template #footer>
        <button type="button" class="btn btn--danger" @click="doRestart">清掉，重来</button>
        <button type="button" class="btn btn--secondary" @click="cancelRestart">
          算了，接着玩
        </button>
      </template>
    </OverlaySheet>

    <!-- 清空全部关卡进度：二次确认 -->
    <OverlaySheet
      v-if="confirmClearAll"
      title="清空全部关卡？"
      size="dialog"
      @close="cancelClearAll"
    >
      <p class="confirm__text">
        所有关卡的进度和余额都会清掉，全部回到没玩过的状态。清掉就找不回来了。
      </p>
      <template #footer>
        <button type="button" class="btn btn--danger" @click="doClearAll">全部清掉</button>
        <button type="button" class="btn btn--secondary" @click="cancelClearAll">
          算了，留着
        </button>
      </template>
    </OverlaySheet>
  </div>
</template>

<style scoped>
/*
 * 手机外框（宽度、圆角、高度、安全区）由根壳 `AppShell.vue` 统一提供：
 * 大厅与手机两种形态共用同一套尺寸规则，避免两处各写一份后逐渐漂移。
 * 这里只负责手机**内部**的布局。
 */
.phone__viewport {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  outline: none;
}

/*
 * 换页容器：视图切换时重新挂载并播放进入动画。
 * 动画只用 CSS，元素立即出现在 DOM 里 —— 动效不阻断操作。
 */
.viewport__page {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* 应用之间切换：轻微滑入 */
.viewport__page--app {
  animation: page-app-in var(--dur-base) ease-out;
}

/* 锁屏 → 桌面：桌面像被揭开一样放大淡入 */
.viewport__page--unlock {
  animation: page-unlock-in var(--dur-slow) ease-out;
}

@keyframes page-app-in {
  from {
    opacity: 0;
    transform: translateX(10px);
  }
}

@keyframes page-unlock-in {
  from {
    opacity: 0;
    transform: scale(1.035) translateY(2%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .viewport__page--app,
  .viewport__page--unlock {
    animation: none;
  }
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
</style>
