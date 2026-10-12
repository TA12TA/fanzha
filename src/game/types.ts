/**
 * 剧情与状态类型定义。
 *
 * 所有金额均为**游戏模拟余额**，与真实资金无关；本文件不含任何真实支付概念。
 */

/** 剧情节点 ID。保持稳定，供转移表、复盘与测试引用。 */
export type NodeId =
  | 'intro' // 开场 / 锁屏
  | 'invite' // 邀请会话
  | 'group' // 兼职群聊
  | 'transfer-100' // 首次模拟垫付待确认
  | 'rebate' // 平台展示返利
  | 'freeze' // 提现异常
  | 'transfer-300' // 追加模拟垫付待确认
  | 'end-clear' // 结局：提前识破
  | 'end-stop' // 结局：及时止损
  | 'end-loss' // 结局：追加后损失
  | 'debrief' // 复盘

/** 剧情选项 ID。所有状态推进只能通过这些 ID 触发。 */
export type OptionId =
  | 'start'
  | 'reject-invite'
  | 'enter-group'
  | 'report-group'
  | 'accept-task'
  | 'view-profile'
  | 'cancel-100'
  | 'confirm-100'
  | 'stop-after-100'
  | 'continue-task'
  | 'stop-at-freeze'
  | 'accept-extra'
  | 'cancel-300'
  | 'confirm-300'
  | 'review'
  | 'restart'

/** 结局 ID（与结局节点同名）。 */
export type EndingId = 'end-clear' | 'end-stop' | 'end-loss'

/** 玩家实际经历的风险标记，用于按经历生成复盘，避免复述未发生的话术。 */
export type RiskTag =
  | 'early-reject' // 一开始就拒绝邀请
  | 'entered-group' // 进过群
  | 'reported-in-group' // 进群后退出并举报
  | 'viewed-profile' // 查看过对方资料
  | 'saw-pad-request' // 见过「先垫 100」话术
  | 'stopped-before-pay' // 转账前取消
  | 'paid-100' // 确认过首次模拟垫付
  | 'saw-rebate-claim' // 见过「平台显示返 130」
  | 'stopped-after-100' // 首次垫付后停止
  | 'withdraw-failed' // 遇到提现失败
  | 'asked-freeze-fee' // 被要求交「解冻费」
  | 'stopped-at-freeze' // 提现异常时停止
  | 'asked-extra' // 见过追加 300 的要求
  | 'stopped-before-extra' // 追加页取消
  | 'paid-300' // 确认过追加模拟垫付

/** 单条操作历史。 */
export interface HistoryEntry {
  optionId: OptionId
  from: NodeId
  to: NodeId
  /** 该选项是否改变了模拟金额。 */
  moneyChanged: boolean
}

/** 完整剧情状态。UI 导航状态不在此处。 */
export interface GameState {
  /** 存档结构版本。 */
  version: number
  /** 当前剧情节点。 */
  node: NodeId
  /** 真实可支配的**游戏模拟余额**。 */
  balance: number
  /** 平台内展示但**未兑现**的金额，永不计入 balance。 */
  platformDisplayed: number
  /** 累计已确认的模拟垫付金额。 */
  paidTotal: number
  /** 已确认的模拟垫付次数。 */
  paidCount: number
  /** 是否查看过对方资料（一次性）。 */
  viewedProfile: boolean
  /** 已经历的风险标记（去重）。 */
  riskTags: RiskTag[]
  /** 操作历史。 */
  history: HistoryEntry[]
  /** 已生效过的一次性选项，用于阻止重复提交。 */
  appliedOnce: Partial<Record<OptionId, true>>
  /** 当前结局；未结束为 null。 */
  ending: EndingId | null
}

/** 转移失败原因。非法输入不会抛出异常，也不会改变状态。 */
export type TransitionFailure =
  | 'unknown-option' // 选项 ID 不存在
  | 'illegal-option' // 选项存在但不属于当前节点
  | 'already-applied' // 一次性选项已生效过

/** 转移结果。 */
export type TransitionResult =
  | { ok: true; state: GameState; optionId: OptionId; effect: OptionEffect | null }
  | { ok: false; reason: TransitionFailure; state: GameState; optionId: string }

/** 选项效果。金额变更只能由此描述，并由引擎在事务内应用一次。 */
export interface OptionEffect {
  /** 模拟余额变化量（负数为支出）。 */
  balanceDelta?: number
  /** 累计模拟垫付变化量。 */
  paidDelta?: number
  /** 追加的风险标记。 */
  addTags?: RiskTag[]
  /** 设置平台内展示但**未兑现**的金额（永不计入 balance）。 */
  platformDisplay?: number
  /** 是否将 viewedProfile 置为 true。 */
  markProfileViewed?: boolean
  /** 是否为不可重复的一次性效果。 */
  once?: boolean
  /** 是否清空全部进度并回到开场（仅 `restart` 使用）。 */
  reset?: boolean
}

/** 剧情选项定义。 */
export interface StoryOption {
  id: OptionId
  /** 按钮/操作文案。 */
  label: string
  /** 所属节点。 */
  from: NodeId
  /** 跳转目标节点。 */
  to: NodeId
  effect?: OptionEffect
  /** 无障碍说明，供 aria-label 使用。 */
  hint?: string
}

/** 节点定义。 */
export interface StoryNode {
  id: NodeId
  /** 进入节点时一次性应用的效果（同一事务内，因此不会重复生效）。 */
  onEnter?: OptionEffect
  /** 该节点是否为结局。 */
  ending?: EndingId
}

/** 复盘条目。 */
export interface DebriefItem {
  id: string
  title: string
  /** 玩家实际遇到的话术/环节说明。 */
  observation: string
  /** 风险点解释。 */
  risk: string
  /** 正确做法。 */
  advice: string
}

/** 完整复盘。 */
export interface Debrief {
  endingLabel: string
  summary: string
  balance: number
  paidTotal: number
  items: DebriefItem[]
  actions: string[]
}
