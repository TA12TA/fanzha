/**
 * 会话「逐条出现」的进度记忆。
 *
 * 为什么需要放在组件外面：
 * 离开消息应用时 ChatScene 会被整体卸载（AppShell 里是一串 v-if），组件内的 ref
 * 跟着一起丢掉。于是第二次点进同一个会话，动画又会从第一条开始逐条播一遍 ——
 * 玩家的感受是「这条消息我都读过了，怎么又一条一条蹦」。
 *
 * 所以进度按会话 id 记在模块级：
 * - 已看过的部分直接出现；
 * - 只有**新来的**消息才逐条呈现（剧情推进后群里多出来的返利/提现异常卡片仍然有动画）。
 *
 * **键里必须带关卡 id**：多关卡之后，两关可能有同名会话（例如都有 `mom`），
 * 只用 sessionId 当键会让第二关的「妈妈会话」继承第一关的已读进度 ——
 * 表现为「刚进第二关，妈妈的消息就全都直接显示了」。调用方传
 * `${levelId}:${sessionId}`。
 *
 * 只存在内存里，不写 localStorage：
 * 刷新页面等于重新开一局，重新播一次可以接受；这也属于纯动效状态，
 * 存档里只有剧情和金额需要持久化。
 */

const revealed = new Map<string, number>()

/** 该会话已经给玩家看过多少条。 */
export function revealedCountFor(key: string): number {
  return revealed.get(key) ?? 0
}

/** 记录进度。只增不减：消息只会追加，进度不该倒退。 */
export function markRevealed(key: string, count: number): void {
  const prev = revealed.get(key) ?? 0
  if (count > prev) revealed.set(key, count)
}

/**
 * 重开一局时清空。
 * 不传参数时清空全部关卡（等价于「刷新页面」）；
 * 传关卡 id 时只清那一关，避免重开第二关把第一关的进度记忆也抹掉。
 */
export function resetChatReveal(levelId?: string): void {
  if (!levelId) {
    revealed.clear()
    return
  }
  const prefix = `${levelId}:`
  for (const key of [...revealed.keys()]) {
    if (key.startsWith(prefix)) revealed.delete(key)
  }
}

/** 供测试与调试：当前记录了多少条会话进度。 */
export function revealedKeyCount(): number {
  return revealed.size
}
