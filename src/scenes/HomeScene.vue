<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { BRAND, INITIAL_BALANCE } from '@/data/level01'
import { resumeLabel } from '@/game/engine'
import { hasOutcome, isPendingPayment, pendingAmount } from '@/app/navigation'
import { useBeijingClock } from '@/app/clock'
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
  (e: 'open-app', app: 'photos' | 'notifications'): void
  (e: 'open-settings'): void
  (e: 'resume'): void
  (e: 'restart'): void
}>()

/**
 * 图标分两处摆放（模仿真实手机的程序坞）：
 * Dock 放剧情推进最常用的三个，网格区放其余。
 * `id` 集合必须仍然覆盖全部六个应用（测试与剧情入口都依赖这一点）。
 */
const dockApps = [
  { id: 'chat', label: BRAND.chat, hint: '打开消息应用' },
  { id: 'wallet', label: BRAND.wallet, hint: '查看余额' },
  { id: 'manual', label: BRAND.manual, hint: '打开国家反诈中心' },
] as const

const gridApps = [
  { id: 'photos', label: '相册', hint: '打开相册' },
  { id: 'notifications', label: '通知', hint: '打开通知' },
  { id: 'settings', label: '设置', hint: '打开设置' },
] as const

const allApps = [...dockApps, ...gridApps] as const

/** 图标点击：桌面/钱包/手册有专属事件，其余走通用入口。 */
function onAppClick(id: (typeof allApps)[number]['id']): void {
  if (id === 'chat') emit('open-chat')
  else if (id === 'wallet') emit('open-wallet')
  else if (id === 'manual') emit('open-manual')
  else if (id === 'settings') emit('open-settings')
  else emit('open-app', id)
}

/** 桌面「继续当前事项」文案；仅导航，不自动选择剧情。 */
const resumeText = computed(() => resumeLabel(props.state.node))

/**
 * 桌面时钟组件用的北京时间（与状态栏同一套时区规则）。
 * 只读展示，不参与任何剧情与金额计算。
 */
const { time: clockTime, date: clockDate } = useBeijingClock()

const showResume = computed(() => props.state.node !== 'intro')

const pending = computed(() => pendingAmount(props.state.node))

const outcome = computed(() => hasOutcome(props.state.node))

/**
 * 图标角标：**统一使用数字徽标**（不再混用纯圆点）。
 *
 * 时序规则：角标表示「有东西在等你处理」，因此必须等通知**真正弹出过**
 * 之后才显示，否则会出现「横幅还没弹、角标先亮了」的倒置。
 * 由 `noticeShown` 从通知队列状态推导。
 */
const chatBadge = computed(() => {
  if (props.showInviteNotice && props.noticeShown) return '1'
  if (isPendingPayment(props.state.node) || outcome.value) return '!'
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
    <!-- 壁纸：多层渐变光斑 + 暗角，纯 CSS，无图片资源 -->
    <div class="home__wall" aria-hidden="true"></div>

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
            生活费 {{ INITIAL_BALANCE }} · 已垫付 {{ state.paidTotal }} 元
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
  color: var(--c-text-invert);
  background: linear-gradient(165deg, var(--c-desktop-1), var(--c-desktop-2));
}

/*
 * 壁纸：夜空 + 光斑 + 星点 + 山峦剪影，纯 CSS。
 * 真实手机壁纸有明显的光影层次，而不是均匀渐变；
 * 留白区域也要有内容，否则空桌面会显得像没加载完。
 *
 * 注意：山峦位置在 84%~92%，必须落在可视区内（放到 100% 以上会被裁掉看不见）。
 */
.home__wall {
  position: absolute;
  inset: 0;
  background:
    /* 星点（细小白点，低透明度） */
      radial-gradient(circle 1.4px at 18% 22%, rgb(255 255 255 / 62%) 0 1.4px, transparent 1.5px),
    radial-gradient(circle 1px at 33% 40%, rgb(255 255 255 / 45%) 0 1px, transparent 1.1px),
    radial-gradient(circle 1.2px at 61% 26%, rgb(255 255 255 / 52%) 0 1.2px, transparent 1.3px),
    radial-gradient(circle 1px at 74% 48%, rgb(255 255 255 / 40%) 0 1px, transparent 1.1px),
    radial-gradient(circle 1.3px at 88% 33%, rgb(255 255 255 / 48%) 0 1.3px, transparent 1.4px),
    radial-gradient(circle 1px at 46% 60%, rgb(255 255 255 / 34%) 0 1px, transparent 1.1px),
    radial-gradient(circle 1.1px at 8% 52%, rgb(255 255 255 / 36%) 0 1.1px, transparent 1.2px),
    /* 光斑 */
      radial-gradient(circle at 78% 6%, rgb(70 140 230 / 34%), transparent 42%),
    radial-gradient(circle at 10% 20%, rgb(120 90 220 / 22%), transparent 40%),
    radial-gradient(circle at 92% 44%, rgb(52 120 200 / 16%), transparent 38%),
    /* 山峦剪影：两段错落的椭圆，落在可视区下半部 */
      radial-gradient(ellipse 120% 22% at 24% 90%, rgb(15 42 78 / 88%), transparent 74%),
    radial-gradient(ellipse 132% 19% at 88% 95%, rgb(9 28 56 / 94%), transparent 76%),
    linear-gradient(165deg, var(--c-desktop-1), var(--c-desktop-2));
  pointer-events: none;
}

/* 地平线附近的暖光：让山峦剪影有层次，不是一块死黑 */
.home__wall::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 66% 12% at 70% 84%, rgb(96 150 226 / 26%), transparent 70%);
  pointer-events: none;
}

.home__wall::after {
  content: '';
  position: absolute;
  inset: 0;
  /* 轻微暗角：四周略暗，视觉上更像屏幕而非网页 */
  background: radial-gradient(ellipse at 50% 40%, transparent 58%, rgb(4 10 20 / 42%));
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

/* ============ Widget 控件区 ============ */

/* 两列组件排布：左时钟、右钱包（真实手机桌面的常见布局） */
.widgets {
  display: grid;
  grid-template-columns: 1.06fr 1fr;
  gap: var(--space-2);
}

.widget {
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: var(--radius-lg);
  /* 磨砂玻璃：真实手机的 Widget 都是半透明磨砂底 */
  background: rgb(255 255 255 / 10%);
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

.clock__date {
  font-size: var(--font-xs);
  color: #b9c9de;
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
  color: #b9c9de;
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

.walletcard__note {
  font-size: var(--font-xs);
  color: #9fb2c9;
}

.resume {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: var(--space-3) var(--space-4);
  color: inherit;
  text-align: left;
  border-color: rgb(56 128 235 / 55%);
  background: rgb(31 111 235 / 24%);
}

.resume__label {
  font-size: var(--font-xs);
  color: #bcd2ec;
}

.resume__text {
  font-size: var(--font-base);
  font-weight: 700;
}

.resume__amount {
  font-size: var(--font-xs);
  color: #ffd9a8;
}

/* ============ 应用网格（无卡片，裸浮壁纸上） ============ */

.apps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
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

/* 标签：真手机图标文字都带细微投影，避免被壁纸亮部吃掉 */
.app__label {
  font-size: 11px;
  line-height: 1.25;
  text-align: center;
  text-shadow: 0 1px 3px rgb(4 10 20 / 80%);
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

.home__foot {
  display: flex;
  justify-content: center;
  padding: var(--space-2) 0;
}

.home__restart {
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border: none;
  background: transparent;
  color: rgb(205 220 238 / 66%);
  font-size: var(--font-sm);
}

/* ============ 程序坞（Dock） ============ */

/*
 * 磨砂玻璃 Dock：真实手机桌面的标配。
 * 放在滚动区之外（.home 是纵向 flex，dock 是最后一个子项，不随内容滚动）。
 */
.dock {
  position: relative;
  flex: none;
  margin: 0 var(--space-3) calc(var(--space-3) + var(--safe-bottom, 0px));
  padding: var(--space-2) var(--space-2) calc(var(--space-2));
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 28px;
  background: rgb(255 255 255 / 12%);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow: 0 8px 28px rgb(4 10 20 / 34%);
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
  color: rgb(230 240 252 / 88%);
}
</style>
