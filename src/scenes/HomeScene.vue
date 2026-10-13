<script setup lang="ts">
import { computed } from 'vue'
import { BRAND, INITIAL_BALANCE } from '@/data/level01'
import { resumeLabel } from '@/game/engine'
import { hasOutcome, isPendingPayment, pendingAmount } from '@/app/navigation'
import antifraudLogo from '@/assets/antifraud-logo.png'
import type { GameState } from '@/game/types'

/**
 * S1 桌面（UI 容器状态，不是剧情节点）。
 * 桌面只负责导航：点击图标切换视图，不提交任何剧情选项、不改变金额。
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

const apps = [
  { id: 'chat', label: BRAND.chat, hint: '打开消息应用' },
  { id: 'wallet', label: BRAND.wallet, hint: '查看余额' },
  { id: 'manual', label: BRAND.manual, hint: '打开国家反诈中心' },
  { id: 'photos', label: '相册', hint: '打开相册' },
  { id: 'notifications', label: '通知', hint: '打开通知' },
  { id: 'settings', label: '设置', hint: '打开设置' },
] as const

/** 图标点击：桌面/钱包/手册有专属事件，其余走通用入口。 */
function onAppClick(id: (typeof apps)[number]['id']): void {
  if (id === 'chat') emit('open-chat')
  else if (id === 'wallet') emit('open-wallet')
  else if (id === 'manual') emit('open-manual')
  else if (id === 'settings') emit('open-settings')
  else emit('open-app', id)
}

/** 桌面「继续当前事项」文案；仅导航，不自动选择剧情。 */
const resumeText = computed(() => resumeLabel(props.state.node))

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
</script>

<template>
  <section class="home" aria-label="手机桌面">
    <div class="home__wall" aria-hidden="true"></div>

    <div class="home__scroll">
      <ul class="apps">
        <li v-for="app in apps" :key="app.id">
          <button
            type="button"
            class="app"
            :aria-label="app.hint"
            @click="onAppClick(app.id)"
          >
            <span
              class="app__glyph"
              :class="app.id === 'manual' ? 'app__glyph--brand' : `app__glyph--${app.id}`"
              aria-hidden="true"
            >
              <!-- 反诈应用用官方 logo 图片，其余为自绘 SVG -->
              <img
                v-if="app.id === 'manual'"
                :src="antifraudLogo"
                alt=""
                width="38"
                height="38"
                class="app__logo"
              />
              <!-- 其余应用图标：自绘 SVG，不使用任何官方徽标 -->
              <svg
                v-else-if="app.id === 'chat'"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
              >
                <path d="M3.6 6.2h16.8v10.4H8.8l-4 3.4v-3.4H3.6Z" stroke-linejoin="round" />
              </svg>
              <svg
                v-else-if="app.id === 'wallet'"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
              >
                <path d="M3.5 7.2h17v11H3.5Z" stroke-linejoin="round" />
                <path d="M3.5 7.2 15.5 3.8v3.4" stroke-linejoin="round" />
                <circle cx="16.8" cy="12.7" r="1.2" fill="currentColor" stroke="none" />
              </svg>
              <svg
                v-else-if="app.id === 'photos'"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
              >
                <path d="M3.8 5.4h16.4v13.2H3.8Z" stroke-linejoin="round" />
                <path d="M3.8 15.2l4.6-4.2 4 3.4 3-2.6 4.8 4.2" stroke-linejoin="round" />
                <circle cx="8.6" cy="9" r="1.3" />
              </svg>
              <svg
                v-else-if="app.id === 'notifications'"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
              >
                <path d="M6.4 16.4V10.6a5.6 5.6 0 0 1 11.2 0v5.8Z" stroke-linejoin="round" />
                <path d="M4.8 16.4h14.4" stroke-linecap="round" />
                <path d="M10.2 19.2a1.9 1.9 0 0 0 3.6 0" stroke-linecap="round" />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
              >
                <circle cx="12" cy="12" r="3.1" />
                <path
                  d="M12 2.9v2.6M12 18.5v2.6M21.1 12h-2.6M5.5 12H2.9M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            <span class="app__label">{{ app.label }}</span>
            <!-- 角标统一为数字徽标样式，不再混用纯圆点 -->
            <span
              v-if="app.id === 'chat' && chatBadge"
              class="app__badge"
              :aria-label="`有 ${chatBadge} 条待处理`"
            >
              {{ chatBadge }}
            </span>
            <span
              v-else-if="app.id === 'notifications' && noticeBadge"
              class="app__badge"
              :aria-label="`有 ${noticeBadge} 条通知`"
            >
              {{ noticeBadge }}
            </span>
          </button>
        </li>
      </ul>

      <!-- 恢复当前事项入口：只导航，不推进剧情 -->
      <button v-if="showResume" type="button" class="resume" @click="emit('resume')">
        <span class="resume__label">继续当前事项</span>
        <span class="resume__text">{{ resumeText }}</span>
        <span v-if="pending" class="resume__amount">还有一笔 {{ pending }} 元待确认</span>
      </button>

      <div class="walletcard">
        <p class="walletcard__label">{{ BRAND.wallet }}</p>
        <p class="walletcard__amount">{{ state.balance }} <span>元</span></p>
        <p class="walletcard__note">
          生活费 {{ INITIAL_BALANCE }} 元，已垫付 {{ state.paidTotal }} 元
        </p>
      </div>

      <button type="button" class="home__restart" @click="emit('restart')">
        重新开始本局
      </button>
    </div>
  </section>
</template>

<style scoped>
.home {
  position: relative;
  flex: 1;
  min-height: 0;
  color: var(--c-text-invert);
  background: linear-gradient(165deg, var(--c-desktop-1), var(--c-desktop-2));
}

.home__wall {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 78% 12%, rgb(70 140 230 / 30%), transparent 42%),
    radial-gradient(circle at 14% 82%, rgb(18 150 132 / 24%), transparent 40%);
  pointer-events: none;
}

.home__scroll {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
  padding: var(--space-4) var(--space-4) var(--space-5);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.apps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.app {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  width: 100%;
  min-height: 84px;
  padding: var(--space-3) var(--space-1);
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 9%);
  color: inherit;
  font-size: var(--font-xs);
}

.app__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  color: #ffffff;
  /* 默认底板：与官方 logo 一致的做法——每个图标都有自己的彩色底板 */
  background: linear-gradient(150deg, #5a7ea8, #3d5a7d);
  box-shadow: 0 2px 8px rgb(4 10 20 / 26%);
}

/*
 * 各应用的彩色底板：统一为「彩色渐变底 + 白色图标」，
 * 与「国家反诈中心」的官方 logo（彩色实心图标）保持同一种呈现方式。
 * 反诈中心用官方图片，不套底板。
 */
.app__glyph--chat {
  background: linear-gradient(150deg, #3f9bf5, #1f6fd0);
}

.app__glyph--wallet {
  background: linear-gradient(150deg, #35b98a, #178a63);
}

.app__glyph--photos {
  background: linear-gradient(150deg, #f0885a, #d15f36);
}

.app__glyph--notifications {
  background: linear-gradient(150deg, #f0b73f, #d18f1c);
}

.app__glyph--settings {
  background: linear-gradient(150deg, #8a93a6, #5f6a7e);
}

/*
 * 反诈应用图标：使用官方 logo 图片。
 * 来源：Apple App Store 官方接口（开发者署名 criminal investigation department
 * ministry of public security，即公安部刑事侦查局）。图片已缩放到 256×256 PNG。
 * 官方 logo 自带蓝色底与金色盾牌，因此不再叠加底板。
 */
.app__glyph--brand {
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.app__logo {
  display: block;
  width: 38px;
  height: 38px;
  border-radius: 10px;
}

.app__label {
  font-size: var(--font-xs);
  text-align: center;
}

/* 全项目唯一的角标样式：数字徽标（不再有第二种圆点样式） */
.app__badge {
  position: absolute;
  top: 6px;
  right: 8px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  background: #e0483a;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

.resume {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: var(--space-3);
  border: 1px solid rgb(255 255 255 / 26%);
  border-radius: var(--radius-md);
  background: rgb(31 111 235 / 26%);
  color: inherit;
  text-align: left;
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

.walletcard {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 8%);
}

.walletcard__label {
  font-size: var(--font-xs);
  color: #b9c9de;
}

.walletcard__amount {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.walletcard__amount span {
  font-size: var(--font-base);
  font-weight: 500;
}

.walletcard__note {
  margin-bottom: var(--space-1);
  font-size: var(--font-xs);
  color: #9fb2c9;
}

.home__restart {
  align-self: flex-start;
  min-height: var(--tap-min);
  padding: 0 var(--space-2);
  border: 1px solid rgb(255 255 255 / 24%);
  border-radius: var(--radius-sm);
  background: transparent;
  color: #cddcee;
  font-size: var(--font-sm);
}
</style>
