<script setup lang="ts">
import { computed } from 'vue'
import { BRAND, INITIAL_BALANCE } from '@/data/level01'
import { resumeLabel } from '@/game/engine'
import { hasOutcome, isPendingPayment, pendingAmount } from '@/app/navigation'
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
  { id: 'chat', label: BRAND.chat, glyph: '✉', hint: '打开消息应用' },
  { id: 'wallet', label: BRAND.wallet, glyph: '◈', hint: '查看余额' },
  { id: 'manual', label: BRAND.manual, glyph: '▤', hint: '反诈手册与复盘' },
  { id: 'photos', label: '相册', glyph: '▣', hint: '打开相册' },
  { id: 'notifications', label: '通知', glyph: '☰', hint: '打开通知' },
  { id: 'settings', label: '设置', glyph: '⚙', hint: '打开设置' },
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

const chatBadge = computed(() => {
  if (props.showInviteNotice) return '1'
  if (isPendingPayment(props.state.node) || outcome.value) return '!'
  return ''
})

/** 通知图标角标：有未读通知时显示圆点。 */
const showNoticeDot = computed(() => props.hasUnread === true)
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
            <span class="app__glyph" aria-hidden="true">{{ app.glyph }}</span>
            <span class="app__label">{{ app.label }}</span>
            <span v-if="app.id === 'chat' && chatBadge" class="app__badge">{{ chatBadge }}</span>
            <span
              v-else-if="app.id === 'notifications' && showNoticeDot"
              class="app__badge app__badge--dot"
              aria-hidden="true"
            ></span>
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
  font-size: 24px;
  line-height: 1;
}

.app__label {
  font-size: var(--font-xs);
  text-align: center;
}

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

/* 未读圆点：不带数字 */
.app__badge--dot {
  min-width: 0;
  width: 10px;
  height: 10px;
  top: 8px;
  right: 10px;
  padding: 0;
  border: 2px solid rgb(255 255 255 / 88%);
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
