<script setup lang="ts">
import { computed } from 'vue'
import { BRAND, INITIAL_BALANCE } from '@/data/level01'
import { resumeLabel } from '@/game/engine'
import { hasOutcome, isPendingPayment, pendingAmount } from '@/app/navigation'
import type { GameState } from '@/game/types'

/**
 * S1 桌面 / 通知（UI 容器状态，不是剧情节点）。
 * 桌面只负责导航：点击图标或通知切换视图，不提交任何剧情选项、不改变金额。
 */
const props = defineProps<{
  state: GameState
  /** 邀请通知是否可见（剧情到达 invite 且尚未处理）。 */
  showInviteNotice: boolean
  /** 只读通知面板是否展开。 */
  noticeOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'open-chat'): void
  (e: 'open-wallet'): void
  (e: 'open-manual'): void
  (e: 'open-app', app: 'photos' | 'notifications' | 'settings'): void
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
</script>

<template>
  <section class="home" aria-label="手机桌面">
    <div class="home__wall" aria-hidden="true"></div>

    <div class="home__scroll">
      <p class="home__greeting">青屏 OS</p>

      <!-- 邀请通知：可忽略，不阻止使用其他应用 -->
      <button
        v-if="showInviteNotice"
        type="button"
        class="notice"
        @click="emit('open-chat')"
      >
        <span class="notice__head">
          <span class="notice__app">{{ BRAND.chat }}</span>
          <span class="notice__time">刚刚</span>
        </span>
        <span class="notice__title">一位学姐邀请你加入兼职群</span>
        <span class="notice__body">「课余任务，报酬当天结算」——点击查看邀请</span>
      </button>

      <ul class="apps">
        <li v-for="app in apps" :key="app.id">
          <button
            type="button"
            class="app"
            :aria-label="app.hint"
            @click="
              app.id === 'chat'
                ? emit('open-chat')
                : app.id === 'wallet'
                  ? emit('open-wallet')
                  : app.id === 'manual'
                    ? emit('open-manual')
                    : emit('open-app', app.id)
            "
          >
            <span class="app__glyph" aria-hidden="true">{{ app.glyph }}</span>
            <span class="app__label">{{ app.label }}</span>
            <span v-if="app.id === 'chat' && chatBadge" class="app__badge">{{ chatBadge }}</span>
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

    <!-- 只读通知面板 -->
    <div v-if="noticeOpen" class="noticepanel" role="region" aria-label="通知面板">
      <p class="noticepanel__title">通知</p>
      <ul>
        <li v-if="showInviteNotice">一位学姐邀请你加入兼职群</li>
        <li>识骗手册有更新。</li>
      </ul>
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

.home__greeting {
  font-size: var(--font-xs);
  color: #9fb2c9;
}

.notice {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: var(--space-3);
  border: 1px solid rgb(255 255 255 / 22%);
  border-radius: var(--radius-md);
  background: rgb(255 255 255 / 96%);
  color: var(--c-text);
  text-align: left;
  box-shadow: var(--shadow-card);
  animation: notice-in var(--dur-slow) ease;
}

.notice__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

.notice__app {
  font-weight: 700;
}

.notice__title {
  font-size: var(--font-base);
  font-weight: 700;
}

.notice__body {
  font-size: var(--font-sm);
  color: var(--c-text-soft);
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

.noticepanel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  padding: var(--space-3);
  background: rgb(8 14 24 / 96%);
  border-bottom: 1px solid rgb(255 255 255 / 14%);
  font-size: var(--font-sm);
}

.noticepanel__title {
  margin-bottom: var(--space-2);
  font-size: var(--font-xs);
  color: var(--c-sim-text);
}

.noticepanel ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding-left: 1.1em;
  color: #d3dfee;
}

@keyframes notice-in {
  from {
    transform: translateY(-10px);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notice {
    animation: none;
  }
}
</style>
