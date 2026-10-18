<script setup lang="ts">
import { computed } from 'vue'
import type { AvatarTone } from '@/game/level'

/**
 * 聊天头像（自绘）。
 *
 * 两种形态，对应真手机消息应用的做法：
 * - 私聊 / 群里的某个人：一个「字 + 色调」的方块；
 * - 群聊会话：2×2 拼图（四张小头像），一眼能和私聊区分开。
 *
 * 不使用任何真实照片或平台头像，全部是本地颜色 + 文字。
 */
const props = withDefaults(
  defineProps<{
    /** 单头像文字（取名字里的一个字）。 */
    text?: string
    /** 单头像色调。 */
    tone?: AvatarTone
    /** 群聊拼图：给出 2~4 个成员的字（用不同色调）。 */
    groupTexts?: string[]
    /** 边长（px）。 */
    size?: number
  }>(),
  { size: 44, text: '?', tone: 'slate' },
)

const isGroup = computed(() => (props.groupTexts?.length ?? 0) > 0)

/** 拼图用的固定色调顺序，保证同一个群每次渲染颜色一致。 */
const COLLAGE_TONES: AvatarTone[] = ['green', 'blue', 'amber', 'violet']

const cells = computed(() =>
  (props.groupTexts ?? []).slice(0, 4).map((text, i) => ({
    text: text.slice(0, 1),
    tone: COLLAGE_TONES[i % COLLAGE_TONES.length] as AvatarTone,
  })),
)

const style = computed(() => ({ '--avatar-size': `${props.size}px` }))
</script>

<template>
  <span class="avatar" :class="{ 'avatar--group': isGroup }" :style="style" aria-hidden="true">
    <template v-if="isGroup">
      <span
        v-for="(cell, i) in cells"
        :key="i"
        class="avatar__cell"
        :class="`avatar__tone--${cell.tone}`"
      >
        {{ cell.text }}
      </span>
    </template>
    <span v-else class="avatar__cell avatar__cell--single" :class="`avatar__tone--${tone}`">
      {{ text }}
    </span>
  </span>
</template>

<style scoped>
.avatar {
  display: inline-block;
  flex: none;
  width: var(--avatar-size, 44px);
  height: var(--avatar-size, 44px);
  border-radius: calc(var(--avatar-size, 44px) * 0.24);
  overflow: hidden;
}

/* 群聊：2×2 拼图 */
.avatar--group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 1px;
  background: var(--c-surface-2);
}

.avatar__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(var(--avatar-size, 44px) * 0.4);
  font-weight: 600;
  color: #fff;
  user-select: none;
}

.avatar__cell--single {
  width: 100%;
  height: 100%;
}

.avatar__tone--blue {
  background: linear-gradient(150deg, #3f6f82, #2c5364);
}

.avatar__tone--green {
  background: linear-gradient(150deg, #3f7f6b, #285446);
}

.avatar__tone--amber {
  background: linear-gradient(150deg, #a57b43, #7d5731);
}

.avatar__tone--violet {
  background: linear-gradient(150deg, #6a516f, #48384d);
}

.avatar__tone--slate {
  background: linear-gradient(150deg, #5e675f, #424a44);
}

.avatar__tone--rose {
  background: linear-gradient(150deg, #9e5b55, #733d39);
}
</style>
