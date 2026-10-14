<script setup lang="ts">
/**
 * 底部系统导航栏（Android 三大金刚键）：返回 / 主页 / 最近任务。
 *
 * 为什么不再是「桌面/返回/反诈」：桌面程序坞里已经有「国家反诈中心」，
 * 底部再来一个等于同一个应用出现两个图标；换成真机的三大金刚键后
 * 既去掉重复，也更像一台真机。
 *
 * 三键始终可点（真机主页键不会变灰）；在桌面按主页/返回为空操作，
 * 不会把玩家带出游戏。真正的「回上一层」判定在 AppShell 里。
 *
 * 注意：`aria-label` 的措辞被自动化验证用来定位按钮
 * （`回到桌面` / `返回上一层`），改动前请同步检查测试与 verify 脚本。
 */
defineProps<{
  /** 浅色应用内使用浅色导航栏；桌面与锁屏使用深色。 */
  tone?: 'dark' | 'light'
}>()

const emit = defineEmits<{
  (e: 'home'): void
  (e: 'back'): void
  (e: 'recents'): void
}>()
</script>

<template>
  <nav class="nav" :class="`nav--${tone ?? 'dark'}`" aria-label="手机导航键">
    <!-- 返回 -->
    <button type="button" class="nav__btn" aria-label="返回上一层" @click="emit('back')">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M15.5 4.5 8 12l7.5 7.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.9"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <!-- 主页 -->
    <button type="button" class="nav__btn" aria-label="回到桌面" @click="emit('home')">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <circle cx="12" cy="12" r="7.6" fill="none" stroke="currentColor" stroke-width="1.9" />
      </svg>
    </button>

    <!-- 最近任务 -->
    <button type="button" class="nav__btn" aria-label="最近任务" @click="emit('recents')">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect
          x="4.6"
          y="4.6"
          width="14.8"
          height="14.8"
          rx="2.4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.9"
        />
      </svg>
    </button>
  </nav>
</template>

<style scoped>
.nav {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  flex: none;
  padding-bottom: var(--safe-bottom);
  border-top: 1px solid transparent;
  transition: background-color var(--dur-fast) ease;
}

.nav--dark {
  background: rgb(12 20 32 / 78%);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top-color: rgb(255 255 255 / 10%);
  color: var(--c-text-invert);
}

.nav--light {
  background: rgb(247 247 249 / 92%);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top-color: var(--c-line);
  color: #333a46;
}

.nav__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  /* 44px 以上热区，键盘可达 */
  min-height: var(--tap-min);
  border: 0;
  background: transparent;
  color: inherit;
}

.nav__btn:active {
  opacity: 0.6;
}

@media (prefers-reduced-motion: reduce) {
  .nav {
    transition: none;
  }
}
</style>
