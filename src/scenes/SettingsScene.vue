<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
import { playSound } from '@/app/sound'
import { useSettings } from '@/app/settings'

/**
 * 设置：真实可用的开关（音效、顶部提醒）。
 * 与只读的相册/通知不同，这里的开关会写入本地设置并立即生效。
 */
const emit = defineEmits<{ (e: 'back'): void }>()

const { settings, setSound, setBanner } = useSettings()

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
</script>

<template>
  <section class="settings" aria-label="设置">
    <AppHeader title="设置" show-back @back="emit('back')" />

    <div class="settings__body">
      <section class="group" aria-label="声音">
        <h2 class="group__title">声音</h2>
        <div class="row">
          <span class="row__text">
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
      </section>

      <section class="group" aria-label="提醒">
        <h2 class="group__title">提醒</h2>
        <div class="row">
          <span class="row__text">
            <span class="row__label">顶部弹出提醒</span>
            <span class="row__hint">关闭后不再弹出，仍会收进通知</span>
          </span>
          <button
            type="button"
            class="switch"
            role="switch"
            :aria-checked="settings.banner ? 'true' : 'false'"
            aria-label="顶部弹出提醒"
            :class="{ 'switch--on': settings.banner }"
            @click="toggleBanner"
          >
            <span class="switch__knob" aria-hidden="true"></span>
            <span class="sr-only">{{ settings.banner ? '已开启' : '已关闭' }}</span>
          </button>
        </div>
      </section>

      <section class="group" aria-label="隐私">
        <h2 class="group__title">关于本机</h2>
        <ul class="plain">
          <li>不需要账号，也不要你填姓名、手机号、银行卡或验证码。</li>
          <li>进度和设置只存在这台设备的浏览器里，不会传出去。</li>
          <li>所有金额与转账都是剧情演示，不涉及真实资金。</li>
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

.group__title {
  margin-bottom: var(--space-2);
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--c-text-soft);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: var(--tap-min);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
}

.row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.row__label {
  font-size: var(--font-base);
  font-weight: 600;
}

.row__hint {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
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
