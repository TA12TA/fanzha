<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
import { playSound } from '@/app/sound'
import { useSettings, THEME_MODES, type ThemeMode } from '@/app/settings'
import { getLevel } from '@/data/levels'
import type { LevelId } from '@/game/types'

/**
 * 设置：真实可用的开关（音效、顶部提醒、壁纸主题）+ 关卡与本局操作。
 *
 * 列表统一使用全项目共用的 `.rows` / `.row` 样式，
 * 不再让每个页面各写一套行样式（真机上同一个系统里的列表长得一样）。
 */
const props = defineProps<{
  /** 当前在玩的关卡（用于显示关名与「重新开始本关」）。 */
  levelId: LevelId
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'request-restart'): void
  (e: 'open-levels'): void
  (e: 'request-clear-all'): void
}>()

const { settings, setSound, setBanner, setTheme } = useSettings()

/** 当前关卡的显示名（找不到时退回 id，不显示空白）。 */
const currentLevelTitle = getLevel(props.levelId)?.meta.title ?? props.levelId

/** 主题三档的中文名（分段控件用）。 */
const THEME_LABELS: Record<ThemeMode, string> = {
  auto: '自动',
  day: '白天',
  night: '夜间',
}

function toggleSound(): void {
  const next = !settings.value.sound
  setSound(next)
  // 打开时给一次即时反馈，让玩家确认声音确实生效。
  if (next) playSound('toggle')
}

function toggleBanner(): void {
  setBanner(!settings.value.banner)
  playSound('toggle')
}

/** 切换壁纸主题：点了立刻生效（写到 html[data-theme]）。 */
function chooseTheme(mode: ThemeMode): void {
  if (settings.value.theme === mode) return
  setTheme(mode)
  playSound('toggle')
}

/** 重新开始本关：这里只发请求，二次确认与清档由 AppShell 统一处理。 */
function requestRestart(): void {
  playSound('tap')
  emit('request-restart')
}

/** 打开关卡大厅（不改变任何进度）。 */
function openLevels(): void {
  playSound('tap')
  emit('open-levels')
}

/** 清空全部关卡进度：同样先走二次确认。 */
function requestClearAll(): void {
  playSound('tap')
  emit('request-clear-all')
}
</script>

<template>
  <section class="settings" aria-label="设置">
    <AppHeader title="设置" show-back @back="emit('back')" />

    <div class="settings__body">
      <section aria-label="声音">
        <h2 class="groupcard__title">声音</h2>
        <ul class="rows">
          <li>
            <div class="row">
              <span class="row__main">
                <span class="row__label">音效</span>
                <span class="row__hint">点击、消息、提醒的提示音</span>
              </span>
              <button
                type="button"
                class="switch"
                role="switch"
                :aria-checked="settings.sound ? 'true' : 'false'"
                aria-label="音效"
                :class="{ 'switch--on': settings.sound }"
                @click="toggleSound"
              >
                <span class="switch__knob" aria-hidden="true"></span>
                <span class="sr-only">{{ settings.sound ? '已开启' : '已关闭' }}</span>
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section aria-label="提醒">
        <h2 class="groupcard__title">提醒</h2>
        <ul class="rows">
          <li>
            <div class="row">
              <span class="row__main">
                <span class="row__label">顶部弹出通知</span>
                <span class="row__hint">关闭后不再弹出横幅，通知仍会收进通知中心</span>
              </span>
              <button
                type="button"
                class="switch"
                role="switch"
                :aria-checked="settings.banner ? 'true' : 'false'"
                aria-label="顶部弹出通知"
                :class="{ 'switch--on': settings.banner }"
                @click="toggleBanner"
              >
                <span class="switch__knob" aria-hidden="true"></span>
                <span class="sr-only">{{ settings.banner ? '已开启' : '已关闭' }}</span>
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section aria-label="外观">
        <h2 class="groupcard__title">外观</h2>
        <ul class="rows">
          <li>
            <div class="row">
              <span class="row__main">
                <span class="row__label">壁纸</span>
              </span>
              <span class="seg" role="group" aria-label="壁纸主题">
                <button
                  v-for="mode in THEME_MODES"
                  :key="mode"
                  type="button"
                  class="seg__btn"
                  :class="{ 'seg__btn--on': settings.theme === mode }"
                  :aria-pressed="settings.theme === mode ? 'true' : 'false'"
                  :aria-label="`壁纸：${THEME_LABELS[mode]}`"
                  @click="chooseTheme(mode)"
                >
                  {{ THEME_LABELS[mode] }}
                </button>
              </span>
            </div>
          </li>
        </ul>
        <!--
          说明放在卡片下方占满整行。
          两个考虑：一是分段控件自带高亮，再写一行「当前：自动」是重复信息（已删）；
          二是放在行内会被右侧控件挤成两三行，反而不好读。
        -->
        <p class="settings__note">自动按北京时间切换：7:00–19:00 为白天，其余为夜间</p>
      </section>

      <section aria-label="关卡">
        <h2 class="groupcard__title">关卡</h2>
        <ul class="rows">
          <li>
            <button type="button" class="row row--action" @click="openLevels">
              <span class="row__main">
                <span class="row__label">关卡大厅</span>
                <span class="row__hint">换一关挑战；每关的进度各自保留</span>
              </span>
              <span class="row__value">{{ currentLevelTitle }}</span>
              <span class="row__chev" aria-hidden="true"></span>
            </button>
          </li>
          <li>
            <button type="button" class="row row--action" @click="requestRestart">
              <span class="row__main">
                <span class="row__label row__label--danger">重新开始本局</span>
                <span class="row__hint">只清掉「{{ currentLevelTitle }}」的进度和余额（会先问一句）</span>
              </span>
              <span class="row__chev" aria-hidden="true"></span>
            </button>
          </li>
          <li>
            <button type="button" class="row row--action" @click="requestClearAll">
              <span class="row__main">
                <span class="row__label row__label--danger">清空全部关卡进度</span>
                <span class="row__hint">所有关卡都回到没玩过的状态（会先问一句）</span>
              </span>
              <span class="row__chev" aria-hidden="true"></span>
            </button>
          </li>
        </ul>
      </section>

      <section aria-label="关于本机">
        <h2 class="groupcard__title">关于本机</h2>
        <ul class="plain">
          <!--
            按用户要求去掉「所有金额与转账都是剧情演示，不涉及真实资金」这类
            模拟声明：整个网站本身就是模拟叙事，不需要再挂一块"这是假的"的牌子。
            「验证码」也从下面这句里拿掉 —— 现在第二关真的会有一次把短信验证码
            发给对方的环节，这里再说"不要你填验证码"会自相矛盾。
          -->
          <li>不需要账号，也不要你填真实姓名、手机号或银行卡。</li>
          <li>进度和设置只存在这台设备的浏览器里，不会传出去。</li>
        </ul>
      </section>
    </div>
  </section>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--c-surface-2);
}

.settings__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1;
  min-height: 0;
  padding: var(--space-3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* 可点击的整行（右侧带箭头） */
.row--action:active {
  background: var(--c-surface-2);
}

.row__label--danger {
  color: var(--c-danger);
}

.settings__note {
  margin-top: var(--space-2);
  padding: 0 var(--space-1);
  font-size: var(--font-xs);
  font-weight: 400;
  color: var(--c-text-tertiary);
}

/* 主题分段控件：三档，当前档位高亮（真机的「浅色/深色/自动」就是这个样子） */
.seg {
  display: inline-flex;
  flex: none;
  padding: 2px;
  border-radius: var(--radius-sm);
  background: var(--c-surface-2);
}

.seg__btn {
  min-width: 46px;
  min-height: 30px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--c-text-secondary);
  font-size: var(--font-xs);
  font-weight: 500;
}

.seg__btn--on {
  background: var(--c-surface);
  color: var(--c-text);
  font-weight: 600;
  box-shadow: var(--shadow-card);
}

/* 开关：44px 热区，键盘可达 */
.switch {
  position: relative;
  flex: none;
  width: 52px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #c9d2de;
  transition: background-color var(--dur-fast) ease;
}

.switch--on {
  background: var(--c-accent);
}

.switch__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgb(10 20 36 / 28%);
  transition: transform var(--dur-fast) ease;
}

.switch--on .switch__knob {
  transform: translateX(20px);
}

.plain {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3) var(--space-3) var(--space-3) 1.8em;
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
  font-size: var(--font-sm);
  line-height: 1.6;
  color: var(--c-text-soft);
}

@media (prefers-reduced-motion: reduce) {
  .switch,
  .switch__knob {
    transition: none;
  }
}
</style>
