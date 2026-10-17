<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { BRAND } from '@/data/levels/shared'
import { resumeLabel } from '@/game/engine'
import { hasOutcome, isPendingPayment, pendingAmount } from '@/app/navigation'
import { useBeijingClock } from '@/app/clock'
import type { PlainAppId } from '@/app/navigation'
import type { PlayableLevel } from '@/game/level'
import type { GameState } from '@/game/types'

/**
 * S1 桌面（UI 容器状态，不是剧情节点）。
 * 桌面只负责导航：点击图标切换视图，不提交任何剧情选项、不改变金额。
 *
 * 视觉模仿真实手机桌面（2026-10 重构）：
 * - 图标不套卡片，直接浮在壁纸上（58px 图标 + 下方小字标签）；
 * - 底部有磨砂玻璃程序坞（Dock），放剧情最常用的三个应用；
 * - 钱包与「继续当前事项」以磨砂 Widget 呈现，而不是平铺的方框。
 *
 * 邀请提示不再做成桌面卡片：改为顶部通知 + 通知中心留存 +
 * 「青讯」图标角标 + 「继续当前事项」入口，避免同一件事在桌面上重复占位。
 */
const props = defineProps<{
  state: GameState
  /** 当前关卡（文案与余额口径都从它读取）。 */
  level: PlayableLevel
  /** 是否有一条待处理的邀请（用于图标角标与入口文案）。 */
  showInviteNotice: boolean
  /** 是否有未读通知（用于图标角标）。 */
  hasUnread?: boolean
  /** 未读通知条数（用于角标数字）。 */
  unreadCount?: number
  /**
   * 通知是否已经真正弹出过。
   * 角标必须等横幅先出现，避免「横幅还在延迟、角标先亮」的时序倒置。
   */
  noticeShown?: boolean
}>()

const emit = defineEmits<{
  (e: 'open-chat'): void
  (e: 'open-wallet'): void
  (e: 'open-manual'): void
  (e: 'open-app', app: PlainAppId): void
  (e: 'open-settings'): void
  (e: 'resume'): void
  (e: 'restart'): void
}>()

/**
 * 图标分两处摆放（模仿真实手机的程序坞）：
 * Dock 放剧情推进最常用的三个，网格区放其余。
 * 关卡进行中没有「关卡」入口：大厅只在首屏与结局/复盘页出现。
 */
const dockApps = [
  { id: 'chat', label: BRAND.chat, hint: '打开消息应用' },
  { id: 'wallet', label: BRAND.wallet, hint: '查看余额' },
  { id: 'manual', label: BRAND.manual, hint: '打开国家反诈中心' },
] as const

/*
 * 关卡大厅只在首屏与结局/复盘页出现；关卡进行中不再提供「关卡」入口，
 * 避免玩到一半误触切关。
 */
const gridApps = [
  { id: 'shop', label: BRAND.shop, hint: '打开青集商城' },
  { id: 'music', label: BRAND.music, hint: '打开青听音乐' },
  { id: 'video', label: BRAND.video, hint: '打开青影' },
  { id: 'photos', label: '相册', hint: '打开相册' },
  { id: 'notifications', label: '通知', hint: '打开通知' },
  { id: 'settings', label: '设置', hint: '打开设置' },
] as const

const allApps = [...dockApps, ...gridApps] as const

/** 图标点击：有专属事件的应用走专属事件，其余走通用入口。 */
function onAppClick(id: (typeof allApps)[number]['id']): void {
  if (id === 'chat') emit('open-chat')
  else if (id === 'wallet') emit('open-wallet')
  else if (id === 'manual') emit('open-manual')
  else if (id === 'settings') emit('open-settings')
  else emit('open-app', id as PlainAppId)
}

/** 桌面「继续当前事项」文案；仅导航，不自动选择剧情。 */
const resumeText = computed(() => resumeLabel(props.level, props.state.node))

/**
 * 桌面时钟组件用的北京时间（与状态栏同一套时区规则）。
 * 只读展示，不参与任何剧情与金额计算。
 */
const { time: clockTime, date: clockDate } = useBeijingClock()

const showResume = computed(() => props.state.node !== props.level.startNode)

const pending = computed(() => pendingAmount(props.level, props.state.node))

const outcome = computed(() => hasOutcome(props.level, props.state.node))

/**
 * 图标角标：**统一使用数字徽标**（不再混用纯圆点）。
 *
 * 时序规则：角标表示「有东西在等你处理」，因此必须等通知**真正弹出过**
 * 之后才显示，否则会出现「横幅还没弹、角标先亮了」的倒置。
 * 由 `noticeShown` 从通知队列状态推导。
 */
const chatBadge = computed(() => {
  if (props.showInviteNotice && props.noticeShown) return '1'
  if (isPendingPayment(props.level, props.state.node) || outcome.value) return '!'
  return ''
})

/** 通知图标角标：有未读通知时显示条数（与青讯同一套样式）。 */
const noticeBadge = computed(() => {
  if (props.hasUnread !== true || props.noticeShown !== true) return ''
  const n = props.unreadCount ?? 0
  return n > 9 ? '9+' : String(Math.max(1, n))
})

/** 应用角标取值（Dock 与网格区共用同一函数，保证样式与逻辑一致）。 */
function badgeOf(id: string): string {
  if (id === 'chat') return chatBadge.value
  if (id === 'notifications') return noticeBadge.value
  return ''
}

function badgeAria(id: string, badge: string): string {
  return id === 'notifications' ? `有 ${badge} 条通知` : `有 ${badge} 条待处理`
}
</script>

<template>
  <section class="home" aria-label="手机桌面">
    <!-- 壁纸：与锁屏共用同一份（styles/wallpaper.css），白天/夜间两套自动切换 -->
    <div class="wall" aria-hidden="true">
      <div class="wall__sky"></div>
      <div class="wall__hills"></div>
      <div class="wall__glow"></div>
    </div>

    <div class="home__scroll">
      <!-- Widget 控件区：左侧时钟、右侧钱包（真实手机的两列组件排布） -->
      <div class="widgets">
        <div class="widget widget--clock">
          <p class="clock__time">{{ clockTime }}</p>
          <p class="clock__date">{{ clockDate }}</p>
        </div>

        <div class="widget widget--wallet">
          <p class="walletcard__label">{{ BRAND.wallet }}</p>
          <p class="walletcard__amount">{{ state.balance }} <span>元</span></p>
          <p class="walletcard__note">
            {{ level.copy.balanceLabel }} {{ level.initialBalance }} 元<span v-if="state.paidTotal > 0"> · {{ level.copy.spentLabel }} {{ state.paidTotal }} 元</span>
          </p>
        </div>
      </div>

      <button v-if="showResume" type="button" class="widget resume" @click="emit('resume')">
        <span class="resume__label">继续当前事项</span>
        <span class="resume__text">{{ resumeText }}</span>
        <span v-if="pending" class="resume__amount">还有一笔 {{ pending }} 元待确认</span>
      </button>

      <!-- 应用网格（相册 / 通知 / 设置） -->
      <ul class="apps">
        <li v-for="app in gridApps" :key="app.id">
          <button
            type="button"
            class="app"
            :aria-label="app.hint"
            @click="onAppClick(app.id)"
          >
            <AppIcon :id="app.id" :size="58" />
            <span class="app__label">{{ app.label }}</span>
            <span
              v-if="badgeOf(app.id)"
              class="app__badge"
              :aria-label="badgeAria(app.id, badgeOf(app.id))"
            >
              {{ badgeOf(app.id) }}
            </span>
          </button>
        </li>
      </ul>

      <!-- 重新开始：低存在感的幽灵按钮（挪到底部，不抢戏） -->
      <div class="home__foot">
        <button type="button" class="home__restart" @click="emit('restart')">
          重新开始本局
        </button>
      </div>
    </div>

    <!-- 程序坞：磨砂玻璃，固定在滚动区之外（模仿真实手机 Dock） -->
    <nav class="dock" aria-label="常用应用">
      <ul class="dock__list">
        <li v-for="app in dockApps" :key="app.id">
          <button
            type="button"
            class="app dock__app"
            :aria-label="app.hint"
            @click="onAppClick(app.id)"
          >
            <AppIcon :id="app.id" :size="58" />
            <span class="app__label">{{ app.label }}</span>
            <span
              v-if="badgeOf(app.id)"
              class="app__badge"
              :aria-label="badgeAria(app.id, badgeOf(app.id))"
            >
              {{ badgeOf(app.id) }}
            </span>
          </button>
        </li>
      </ul>
    </nav>
  </section>
</template>

<style scoped>
.home {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  /* 压在壁纸上的内容统一用这套「on-wall」变量：白天壁纸浅、文字转深 */
  color: var(--c-on-wall);
  background: var(--c-desktop-2);
}

/*
 * 壁纸样式已移到共用的 styles/wallpaper.css：
 * 锁屏与桌面用同一份壁纸，解锁时背景不会跳；
 * 白天/夜间两套由 <html data-theme> 切换。
 * 这里只补一层暗角，让浅色应用页之外仍像一块屏幕。
 */
.home::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 40%, transparent 58%, var(--wall-vignette));
  pointer-events: none;
}

.home__scroll {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1;
  min-height: 0;
  padding: var(--space-4) var(--space-4) var(--space-3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.home__scroll > * {
  flex: none;
}

/* ============ Widget 控件区 ============ */

/* 两列组件排布：左时钟、右钱包（真实手机桌面的常见布局） */
.widgets {
  display: grid;
  grid-template-columns: 1.06fr 1fr;
  /* 组件之间的缝隙比图标之间略大，两块磨砂玻璃才不会粘在一起 */
  gap: var(--space-3);
}

.widget {
  border: 1px solid var(--c-wall-border);
  border-radius: var(--radius-lg);
  /* 磨砂玻璃：真实手机的 Widget 都是半透明磨砂底 */
  background: var(--c-wall-surface);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.widget--clock {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: var(--space-3);
}

.clock__time {
  font-size: 34px;
  font-weight: 300;
  line-height: 1.05;
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
}

/* 日期是时钟组件的次要信息：比时间浅一档，字距略放开更透气 */
.clock__date {
  font-size: var(--font-xs);
  font-weight: 400;
  letter-spacing: 0.04em;
  color: var(--c-on-wall-soft);
}

.widget--wallet {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-1);
  padding: var(--space-3);
}

.walletcard__label {
  font-size: var(--font-xs);
  font-weight: 500;
  color: var(--c-on-wall-soft);
}

.walletcard__amount {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.walletcard__amount span {
  font-size: var(--font-xs);
  font-weight: 500;
}

/* 备注是辅助说明：最浅一档 */
.walletcard__note {
  font-size: var(--font-xs);
  font-weight: 400;
  color: var(--c-on-wall-dim);
}

.resume {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: var(--space-3) var(--space-4);
  color: inherit;
  text-align: left;
  border-color: var(--c-wall-chip-border);
  background: var(--c-wall-chip);
}

.resume__label {
  font-size: var(--font-xs);
  font-weight: 500;
  color: var(--c-on-wall-soft);
}

.resume__text {
  font-size: var(--font-base);
  font-weight: 700;
}

.resume__amount {
  font-size: var(--font-xs);
  font-weight: 500;
  /* 待付金额用强调色：夜间暖黄、白天深琥珀，浅色壁纸上也读得出 */
  color: var(--c-on-wall-accent);
}

/* ============ 应用网格（无卡片，裸浮壁纸上） ============ */

.apps {
  display: grid;
  /* 去掉「关卡」入口后只剩三个：三等分比四列留一个空位更稳 */
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4) var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

/*
 * 图标本体：不套卡片、无边框、无底色。
 * 真实手机桌面图标就是「彩色图标 + 下方小字」，没有任何容器框。
 */
.app {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font-size: var(--font-xs);
}

/*
 * 图标底板样式已移到共用组件 `components/AppIcon.vue`：
 * 桌面网格、程序坞、最近任务面板、通知中心共用同一份图标，
 * 避免同批图标在多个地方各画一遍导致风格漂移。
 * 组件根元素仍带 `app__glyph` / `app__glyph--{id}` 类名，
 * 因此基于类名的自动化断言继续有效。
 */

/*
 * 标签：真手机图标文字都带细微投影，避免被壁纸亮部吃掉。
 * 白天壁纸是浅色，投影改成白色描边式的浅影，否则会糊成一团灰。
 */
.app__label {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.25;
  text-align: center;
  text-shadow: 0 1px 3px rgb(4 10 20 / 80%);
}

[data-theme='day'] .app__label {
  text-shadow: 0 1px 2px rgb(255 255 255 / 85%);
}

/* 全项目唯一的角标样式：数字徽标（不再有第二种圆点样式） */
.app__badge {
  position: absolute;
  top: -4px;
  right: 10px;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  border: 1.5px solid rgb(13 22 38 / 90%);
  border-radius: 999px;
  background: #e0483a;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 17px;
  text-align: center;
  box-shadow: 0 2px 6px rgb(4 10 20 / 40%);
}

/* ============ 底部：重新开始（低存在感） ============ */

/*
 * 2026-10-17：改成**幽灵胶囊按钮**。
 *
 * 改之前它是一行裸文字直接压在壁纸上，既不像桌面图标也不像按钮，
 * 是整屏最违和的一处（截图核对时一眼就看到）。现在给它一个半透明的胶囊底
 * 与描边：仍然是桌面上的最低优先级操作（颜色比图标标签还浅一档），
 * 但看得出「这是一个可以点的东西」。
 *
 * 文案与元素类型不变 —— 多处测试按文本点击它。
 */
.home__foot {
  display: flex;
  justify-content: center;
  padding: var(--space-3) 0 var(--space-2);
}

.home__restart {
  min-height: var(--tap-min);
  padding: 0 var(--space-5);
  border: 1px solid var(--c-wall-border);
  border-radius: 999px;
  background: var(--c-wall-surface);
  color: var(--c-on-wall-dim);
  font-size: var(--font-sm);
  font-weight: 500;
  letter-spacing: 0.02em;
  transition:
    background-color var(--dur-fast) ease,
    transform var(--dur-fast) ease;
}

.home__restart:active {
  transform: scale(0.985);
  background: var(--c-wall-dock);
}

/* ============ 程序坞（Dock） ============ */

/*
 * 磨砂玻璃 Dock：真实手机桌面的标配。
 * 放在滚动区之外（.home 是纵向 flex，dock 是最后一个子项，不随内容滚动）。
 *
 * `::before` 是 Dock 上方的一层渐隐遮罩：不这么做的话 Dock 像直接"贴"在壁纸上，
 * 图标与壁纸之间没有过渡。遮罩用纯伪元素，不动 DOM（图标数量与结构有断言守着）。
 */
.dock {
  position: relative;
  flex: none;
  margin: 0 var(--space-3) calc(var(--space-3) + var(--safe-bottom, 0px));
  padding: var(--space-2) var(--space-2) calc(var(--space-2));
  border: 1px solid var(--c-wall-dock-border);
  border-radius: 28px;
  background: var(--c-wall-dock);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow: var(--shadow-dock);
}

.dock::before {
  content: '';
  position: absolute;
  left: -1px;
  right: -1px;
  bottom: calc(100% - 1px);
  height: 56px;
  background: linear-gradient(
    180deg,
    transparent,
    var(--wall-vignette)
  );
  pointer-events: none;
}

.dock__list {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.dock__app {
  width: auto;
}

.dock__app .app__label {
  /* 真手机 Dock 内图标不显示文字（iOS），这里保留小字以维持可读性 */
  font-size: 10px;
  /* 跟随壁纸主题：夜间用浅色字，白天壁纸浅 → 转深色字，否则看不见 */
  color: var(--c-on-wall-soft);
}
</style>
