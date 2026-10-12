<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
import SimulationBadge from '@/components/SimulationBadge.vue'

/**
 * 只读内容应用：相册 / 通知 / 设置。
 * 全部为剧情安全的虚构信息，不接入任何真实系统能力。
 */
defineProps<{ app: 'photos' | 'notifications' | 'settings' }>()

const emit = defineEmits<{ (e: 'back'): void }>()

const titles = {
  photos: '相册',
  notifications: '通知中心',
  settings: '设置',
} as const
</script>

<template>
  <section class="plain" :aria-label="titles[app]">
    <AppHeader :title="titles[app]" subtitle="只读 · 剧情模拟" show-back @back="emit('back')" />

    <div class="plain__body">
      <SimulationBadge text="本应用为虚构只读内容，无真实数据" />

      <template v-if="app === 'photos'">
        <p class="plain__text">相册里只有一张虚构截图占位卡，没有可对外传播的诈骗素材。</p>
        <div class="photo" role="img" aria-label="虚构截图占位卡">
          <p class="photo__title">截图占位（虚构）</p>
          <p class="photo__text">内容已被刻意省略，避免复制任何可复用的诈骗话术素材。</p>
        </div>
      </template>

      <template v-else-if="app === 'notifications'">
        <ul class="plain__list">
          <li>青屏 OS：本机为剧情模拟环境，所有金额与交易均为虚构。</li>
          <li>青讯：你有一条陌生人兼职邀请（若尚未处理）。</li>
          <li>识骗手册：通用防诈提醒已更新。</li>
        </ul>
      </template>

      <template v-else>
        <ul class="plain__list">
          <li>账号：未登录，本游戏不需要账号。</li>
          <li>个人信息：不采集姓名、手机号、银行卡或验证码。</li>
          <li>数据：仅在本机浏览器保存游戏进度，不上传。</li>
          <li>声音：默认关闭，且不作为必要交互。</li>
        </ul>
      </template>
    </div>
  </section>
</template>

<style scoped>
.plain {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--c-surface-2);
}

.plain__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
  padding: var(--space-3);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.plain__text {
  font-size: var(--font-sm);
  color: var(--c-text-soft);
}

.plain__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding-left: 1.1em;
  font-size: var(--font-sm);
  line-height: 1.6;
}

.photo {
  padding: var(--space-4);
  border: 1px dashed var(--c-line);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  text-align: center;
}

.photo__title {
  font-size: var(--font-base);
  font-weight: 700;
}

.photo__text {
  margin-top: var(--space-1);
  font-size: var(--font-sm);
  color: var(--c-text-soft);
}
</style>
