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
 * 只存在内存里，不写 localStorage：
 * 刷新页面等于重新开一局，重新播一次可以接受；这也属于纯动效状态，
 * 存档里只有剧情和金额需要持久化。
 */

const revealed = new Map<string, number>()

/** 该会话已经给玩家看过多少条。 */
export function revealedCountFor(sessionId: string): number {
  return revealed.get(sessionId) ?? 0
}

/** 记录进度。只增不减：消息只会追加，进度不该倒退。 */
export function markRevealed(sessionId: string, count: number): void {
  const prev = revealed.get(sessionId) ?? 0
  if (count > prev) revealed.set(sessionId, count)
}

/** 重开一局时清空，避免上一局的进度影响新的一局。 */
export function resetChatReveal(): void {
  revealed.clear()
}
