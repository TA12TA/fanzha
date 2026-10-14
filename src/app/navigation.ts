import type { NodeId } from '@/game/types'
import type { ChatSessionId } from '@/data/level01'

/**
 * UI 导航状态：只描述「当前打开哪个应用/哪层界面」。
 * **不包含剧情与金额**；任何视图切换都不会推进剧情、扣款或产生结局。
 */

/** 可打开的应用。 */
export type AppId = 'chat' | 'wallet' | 'manual' | 'photos' | 'notifications' | 'settings'

/**
 * 消息应用内部的子视图。
 * `list` 是会话列表（像真手机的消息应用首页），其余是具体会话。
 */
export type ChatView = 'list' | ChatSessionId

/** 应用视图栈。 */
export interface NavState {
  /** 当前栈顶应用；`null` 表示在桌面。 */
  app: AppId | null
  /** 消息应用当前会话。 */
  chatView: ChatView
  /** 是否打开资料弹层。 */
  profileOpen: boolean
  /** 是否打开只读通知面板。 */
  noticePanelOpen: boolean
  /** 是否有确认弹层（重开等）。 */
  confirm: ConfirmKind | null
}

/** 二次确认类型。 */
export type ConfirmKind = 'restart' | null

export function createNavState(): NavState {
  return {
    app: null,
    chatView: 'list',
    profileOpen: false,
    noticePanelOpen: false,
    confirm: null,
  }
}

/** 消息应用内应展示的会话：由剧情节点决定，但读取不改状态。 */
export function chatViewForNode(node: NodeId): ChatView {
  switch (node) {
    case 'intro':
      return 'list'
    case 'invite':
      return 'senior'
    case 'group':
    case 'rebate':
    case 'freeze':
      return 'taskgroup'
    case 'transfer-100':
    case 'transfer-300':
      return 'taskgroup'
    case 'end-clear':
    case 'end-stop':
    case 'end-loss':
    case 'debrief':
      return 'list'
    default:
      return 'list'
  }
}

/** 打开消息应用时应定位到的会话（邀请未处理时先看邀请）。 */
export function preferredChatView(node: NodeId): ChatView {
  if (node === 'invite') return 'senior'
  if (
    node === 'group' ||
    node === 'rebate' ||
    node === 'freeze' ||
    node === 'transfer-100' ||
    node === 'transfer-300'
  ) {
    return 'taskgroup'
  }
  return 'list'
}

/** 该节点是否处于待确认的模拟付款页（决定钱包是否显示待处理请求）。 */
export function isPendingPayment(node: NodeId): boolean {
  return node === 'transfer-100' || node === 'transfer-300'
}

/** 该节点是否已经产生结局（含复盘）。 */
export function hasOutcome(node: NodeId): boolean {
  return node === 'end-clear' || node === 'end-stop' || node === 'end-loss' || node === 'debrief'
}

/** 待确认付款金额（仅待确认节点有效）。 */
export function pendingAmount(node: NodeId): number | null {
  if (node === 'transfer-100') return 100
  if (node === 'transfer-300') return 300
  return null
}
