/**
 * 剧情与状态类型定义。
 *
 * 所有金额均为**游戏模拟余额**，与真实资金无关；本文件不含任何真实支付概念。
 *
 * 本项目是**多关卡**结构：每个关卡的节点/选项 ID 由各自的 `defineLevel`
 * （见 `game/level.ts`）收窄成字面量联合，引擎在边界上按 string 消费。
 * 因此这里的 `NodeId` / `OptionId` / `RiskTag` / `EndingId` 都是 string 别名 ——
 * 这样各关文件之间不会因为「id 并集」互相依赖，也不会产生循环引用。
 *
 * 安全性由三处补回，缺一不可：
 * 1. `defineLevel` 的泛型约束：各关文件内写错 id 在编译期就报错；
 * 2. `tests/levels.spec.ts` 的注册表守卫：遍历所有关卡的转移表与可达性；
 * 3. `game/storage.ts` 的存档校验：未知 id 一律判为损坏存档。
 */

/** 关卡 ID。新增关卡时在这里登记，并在 `data/levels/index.ts` 注册。 */
export type LevelId = 'level-01' | 'level-02' | 'level-03'

/** 剧情节点 ID。具体取值由各关 `defineLevel` 收窄。 */
export type NodeId = string

/** 剧情选项 ID。所有状态推进只能通过这些 ID 触发。 */
export type OptionId = string

/** 结局 ID（与结局节点同名）。 */
export type EndingId = string

/** 玩家实际经历的风险标记，用于按经历生成复盘，避免复述未发生的话术。 */
export type RiskTag = string

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
  /** 本状态属于哪个关卡（每关各自独立存档）。 */
  levelId: LevelId
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

/** 剧情选项定义。泛型参数让各关文件保留自己的字面量 id。 */
export interface StoryOption<TNode extends string = string, TOption extends string = string> {
  id: TOption
  /** 按钮/操作文案。 */
  label: string
  /** 所属节点。 */
  from: TNode
  /** 跳转目标节点。 */
  to: TNode
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

/**
 * 复盘规则：命中任一触发标记即展示该条。
 * 定义在 `types.ts` 而不是 `debrief.ts`，因为关卡数据要携带它。
 */
export interface DebriefRule {
  id: string
  triggers: RiskTag[]
  title: string
  observation: string
  risk: string
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
