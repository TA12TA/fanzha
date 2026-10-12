<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'

/**
 * 只读内容应用：相册 / 通知。
 * 全部为剧情安全的虚构信息，不接入任何真实系统能力。
 */
defineProps<{ app: 'photos' | 'notifications' }>()

const emit = defineEmits<{ (e: 'back'): void }>()

const titles = {
  photos: '相册',
  notifications: '通知',
} as const
</script>

<template>
  <section class="plain" :aria-label="titles[app]">
    <AppHeader :title="titles[app]" show-back @back="emit('back')" />

    <div class="plain__body">
      <template v-if="app === 'photos'">
        <div class="photo" role="img" aria-label="空相册">
          <p class="photo__title">没有照片</p>
          <p class="photo__text">相册是空的。这局用不到它。</p>
        </div>
      </template>

      <template v-else>
        <ul class="plain__list">
          <li>青讯：有一条陌生人的兼职邀请。</li>
          <li>识骗手册：有新的提醒。</li>
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
