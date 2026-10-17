import type { PlayableLevel } from '@/game/level'
import type { NodeId, OptionId } from '@/game/types'

/**
 * UI 导航状态：只描述「当前打开哪个应用/哪层界面」。
 * **不包含剧情与金额**；任何视图切换都不会推进剧情、扣款或产生结局。
 *
 * 这里不再出现任何具体关卡的节点名 —— 视图与节点的对应关系由各关的
 * `chat` 规格（`preferredSession` / `optionSession`）与 `pendingRequests` 提供。
 */

/** 可打开的应用。 */
export type AppId =
  | 'chat'
  | 'wallet'
  | 'manual'
  | 'photos'
  | 'notifications'
  | 'settings'
  | 'shop'
  | 'music'
  | 'video'
  | 'phone'
  | 'sms'

/** 只读/轻交互应用：从桌面的通用入口打开。 */
export type PlainAppId = 'photos' | 'notifications' | 'shop' | 'music' | 'video' | 'phone' | 'sms'

/**
 * 消息应用内部的子视图。
 * `list` 是会话列表（像真手机的消息应用首页），其余是具体会话 id。
 */
export type ChatView = 'list' | string

/** 二次确认类型。 */
export type ConfirmKind = 'restart' | null

/** 打开消息应用时应定位到的会话（邀请未处理时先看邀请）。 */
export function preferredChatView(level: PlayableLevel, node: NodeId): ChatView {
  return level.chat.preferredSession[node] ?? 'list'
}

/** 该节点是否处于待确认的模拟付款页（决定钱包是否显示待处理请求）。 */
export function isPendingPayment(level: PlayableLevel, node: NodeId): boolean {
  return Boolean(level.pendingRequests[node])
}

/** 待确认付款请求（仅待确认节点有效）。 */
export function pendingRequestOf(level: PlayableLevel, node: NodeId) {
  return level.pendingRequests[node] ?? null
}

/** 待确认付款金额（仅待确认节点有效）。 */
export function pendingAmount(level: PlayableLevel, node: NodeId): number | null {
  return level.pendingRequests[node]?.amount ?? null
}

/** 该节点是否已经产生结局（含复盘）。 */
export function hasOutcome(level: PlayableLevel, node: NodeId): boolean {
  return node in level.endings || node === level.debriefNode
}

/** 该节点是否已经进入过结局节点本身（不含复盘）。 */
export function isEndingNodeOf(level: PlayableLevel, node: NodeId): boolean {
  return node in level.endings
}

/**
 * 剧情节点 → 打开消息应用时该定位到哪一层。
 * 结局/复盘之后给会话列表，让玩家自己决定看哪一条。
 */
export function chatViewForNode(level: PlayableLevel, node: NodeId): ChatView {
  if (hasOutcome(level, node)) return 'list'
  return preferredChatView(level, node)
}

/** 剧情节点对应的「该看哪一屏」（不含应用内部层级）。 */
export type SceneTarget = 'intro' | 'home' | 'chat' | 'wallet' | 'result' | 'review'

/**
 * 由节点推导应该把玩家带到哪一屏。
 *
 * 这里的判断顺序就是**优先级的声明**：待确认付款优先（必须先处理钱），
 * 其次是结局/复盘，再是消息应用，最后才是桌面。
 * 全部依据关卡数据，因此新增关卡不用改这段逻辑。
 */
export function sceneForNode(level: PlayableLevel, node: NodeId): SceneTarget {
  if (node === level.startNode) return 'intro'
  if (isPendingPayment(level, node)) return 'wallet'
  if (isEndingNodeOf(level, node)) return 'result'
  if (node === level.debriefNode) return 'review'
  if (level.chat.preferredSession[node] || level.chat.optionSession[node]) return 'chat'
  return 'home'
}

/** 该节点是否有「有人在等你回消息」（用于桌面角标与开场通知）。 */
export function hasUnreadMessage(level: PlayableLevel, node: NodeId): boolean {
  return Boolean(level.chat.unread?.[node])
}

/**
 * 从某节点去复盘的选项 id（结局页的「看复盘」按钮用）。
 *
 * 不写死 `'review'`：新增关卡可以叫别的名字，只要能走到复盘节点就行。
 */
export function debriefOptionOf(level: PlayableLevel, node: NodeId): OptionId | null {
  const list = level.nodeOptions[node] ?? []
  return list.find((id) => level.options[id]?.to === level.debriefNode) ?? null
}

/** 关卡里「重开本关」的选项 id（带 reset 效果的那个）。 */
export function resetOptionOf(level: PlayableLevel): OptionId | null {
  const list = level.nodeOptions[level.debriefNode] ?? []
  return list.find((id) => level.options[id]?.effect?.reset) ?? null
}

/** 关卡开场节点上唯一的「开始」选项 id（锁屏按钮用）。 */
export function startOptionOf(level: PlayableLevel): OptionId | null {
  return (level.nodeOptions[level.startNode] ?? [])[0] ?? null
}
