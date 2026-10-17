import type {
  DebriefRule,
  GameState,
  LevelId,
  NodeId,
  OptionId,
  RiskTag,
  StoryNode,
  StoryOption,
} from '@/game/types'

/**
 * 关卡契约。
 *
 * 本项目是「一关 = 一部手机」的多关卡结构：每个关卡自带节点表、转移表、
 * 会话与话术、金额口径、复盘规则和界面文案。引擎、场景组件都不再引用
 * 任何具体关卡的数据，只认这里的 `PlayableLevel`。
 *
 * 为什么各关的 id 用泛型而不是全局并集：如果所有关卡的节点 id 汇成一个
 * 全局联合类型，两关之间就会互相 import，很快变成循环依赖。改成
 * 「各关文件内保留字面量类型 + 引擎边界按 string 消费」，编译期仍能挡住
 * 写错的 id，运行时由 `data/levels/index.ts` 的注册表和存档校验兜底。
 */

/* ============================ 剧情数据形状 ============================ */

/** 头像色调（自绘，不使用真实照片）。 */
export type AvatarTone = 'blue' | 'green' | 'amber' | 'violet' | 'slate' | 'rose'

/** 群聊消息。`delayMs` 仅用于逐条呈现，可跳过。 */
export interface ChatMessage {
  id: string
  from: 'them' | 'me' | 'system'
  /** 发言人显示名。 */
  name?: string
  text: string
  /**
   * 消息样式：
   * - `claim`    对方自称收益/到账（示意卡片）
   * - `risk`     风险提示卡（系统）
   * - `failed`   提现失败（系统）
   * - `transfer` 转账卡片（妈妈转来的生活费）
   * - `order`    订单卡（第二关：购物订单）
   * - `refund`   退款进度卡（第二关：平台内未兑现数字）
   */
  variant?: 'text' | 'claim' | 'risk' | 'failed' | 'transfer' | 'order' | 'refund'
  /** 转账金额（仅 transfer 变体）。 */
  amount?: number
  /** 转账状态（仅 transfer 变体）。 */
  transferStatus?: 'received' | 'pending'
  /** 转账备注（仅 transfer 变体）。 */
  transferNote?: string
  /** 订单标题（仅 order 变体）。 */
  orderTitle?: string
  /** 订单金额（仅 order 变体）。 */
  orderAmount?: number
  /** 订单状态（仅 order 变体）。 */
  orderStatus?: string
  /** 平台内展示的退款金额（仅 refund 变体，**未兑现**）。 */
  refundAmount?: number
  /** 退款进度文案（仅 refund 变体）。 */
  refundStatus?: string
}

/**
 * 会话（聊天列表里的一行）。
 * 群聊有成员数、消息带发言人昵称；私聊没有成员数、只说「对方」。
 */
export interface ChatSession {
  id: string
  kind: 'private' | 'group'
  name: string
  /** 群成员数（仅群聊）。 */
  memberCount?: number
  /** 会话列表里显示的时间标签（虚构）。 */
  lastTime: string
  /** 消息（剧情推进后可能追加，见 `LevelChatSpec.extraMessages`）。 */
  messages: ChatMessage[]
}

/** 资料弹层内容（虚构，不含真实个人信息）。 */
export interface ProfileInfo {
  nickname: string
  account: string
  fields: { label: string; value: string }[]
  notice: string
}

/* ============================ 会话规格 ============================ */

/** 待确认的模拟付款请求（由关卡声明，金额变更仍由引擎按选项处理）。 */
export interface PendingRequest<TOption extends string = string> {
  /** 待确认金额（界面上的大数字）。 */
  amount: number
  /** 标题：「有一笔待确认」。 */
  title: string
  /** 确认选项 id（其 label 直接用作按钮文案）。 */
  confirm: TOption
  /** 取消选项 id。 */
  cancel: TOption
}

/** 可打开的详情弹层（如第二关的订单详情）。 */
export interface DetailSheet<TNode extends string = string, TOption extends string = string> {
  /** 在哪些节点可打开。 */
  nodes: TNode[]
  /** 打开时提交的选项（用于记录一次线索，可省略）。 */
  option?: TOption
  title: string
  fields: { label: string; value: string }[]
  notice: string
}

/**
 * 关卡在消息应用里的全部特有逻辑。
 *
 * 原先这些判断写在 `ChatScene.vue` 里（哪些会话可见、哪个会话显示选项、
 * 哪个节点追加哪些卡片），属于「关卡数据混进组件」。搬到这里之后，
 * 组件只按规格渲染，新增关卡不用改组件。
 */
export interface LevelChatSpec<TNode extends string = string, TOption extends string = string> {
  /** 会话列表（顺序即展示顺序）。 */
  sessions: ChatSession[]
  /** 某些会话只在剧情推进后才出现在列表里：会话 id → 还看不到它的节点。 */
  hiddenAt?: Record<string, TNode[]>
  /** 某节点额外追加到某会话的消息（按节点给出，顺序即追加顺序）。 */
  extraMessages?: Partial<Record<TNode, { session: string; messages: ChatMessage[] }[]>>
  /** 该节点的剧情选项显示在哪个会话底部。 */
  optionSession: Partial<Record<TNode, string>>
  /** 打开消息应用时应定位到的会话（如邀请未处理时先看学姐）。 */
  preferredSession: Partial<Record<TNode, string>>
  /** 渲染为次要按钮的选项（其余为主要按钮）。 */
  secondaryOptions: TOption[]
  /**
   * **不渲染成底部按钮**的选项：由界面上的专门入口触发
   * （标题栏的「订单详情」、资料入口的「···」等）。
   * 它们仍是合法剧情选项（会记录线索），只是不占底部操作区。
   */
  hiddenOptions?: TOption[]
  /** 提供「看资料」入口的会话；`option` 为打开时提交的选项（可选）。 */
  profile: { session: string; option?: TOption }[]
  /** 资料弹层内容（key = 会话 id）。 */
  profiles: Record<string, ProfileInfo>
  /** 节点 → 该会话显示未读角标。 */
  unread?: Partial<Record<TNode, string>>
  /** 详情弹层（订单等）。 */
  detailSheet?: DetailSheet<TNode, TOption>
}

/* ============================ 关卡元数据 ============================ */

/** 关卡元数据（大厅卡片、锁屏副标题、手册都要用）。 */
export interface LevelMeta {
  id: LevelId
  /** 排序序号（1 起，连续）。 */
  order: number
  /** 中文序数，用于文案：「第一关」。 */
  ordinal: string
  /** 关卡标题：「刷单返利」。 */
  title: string
  /** 类型标签：「网络兼职」。 */
  category: string
  /** 大厅卡片上的一句话简介。 */
  blurb: string
  /** 一句话正确做法（卡片与手册共用）。 */
  goal: string
  /** 大厅卡片的渐变主色（取自现有色板，不新增色系）。 */
  accent: [string, string]
  /**
   * 开局时推送的消息类通知正文（点开进消息应用）。
   * 省略时不推消息通知 —— 但只推反诈预警，避免「一进桌面就有东西在等」的错觉。
   */
  startNotice?: string
}

/* ============================ 界面文案 ============================ */

/**
 * 关卡自己的界面文案。
 *
 * 只把**确实因关而异**的文案放在这里；通用的界面用语（「看本局结果」
 * 「不用输卡号、验证码或密码」等）留在组件里，避免把组件变成填空模板。
 */
export interface LevelCopy {
  /** 余额来源的说法（钱包与桌面组件）：第一关「生活费」。 */
  balanceLabel: string
  /** 累计付出金额的说法：第一关「已垫付」，第二关「已转出」。 */
  spentLabel: string
  /** 会话底部待付款提示（`{n}` 会替换成金额）。 */
  pendingHint: string
  /** 平台内未兑现数字的称呼：「平台内显示」。 */
  platformLabel: string
  /** 聊天页底部的平台数字说明（带当前可支配余额）。 */
  platformChatNote: (balance: number) => string
  /** 钱包里的平台数字说明。 */
  platformWalletNote: string
  /** 桌面「继续当前事项」按节点的文案。 */
  resume: Record<string, string>
  /** 找不到节点对应文案时的兜底。 */
  resumeFallback: string
}

/* ============================ 关卡定义 ============================ */

/**
 * 「模拟验证码」环节（2026-10-17 新增）。
 *
 * 某个节点上，对方索要一条短信验证码；玩家必须把**刚刚收到的那一条**填回去。
 * 验证码由本地随机生成（`app/smsCode.ts`），以通知的形式弹出，每次都不一样。
 *
 * 为什么把它做成关卡数据而不是组件里的硬编码：骗局的这一环是"要验证码"，
 * 后续关卡（甚至同一关的多个位置）都可能出现，界面与判定必须复用，
 * 文案与"输对之后走哪个选项"则属于关卡自己的剧情。
 */
export interface CodeGate<TOption extends string = string> {
  /** 短信发送方 —— 必须是虚构品牌，不要用真实机构名。 */
  sender: string
  /** 短信正文模板，**必须含 `{code}`**（校验函数会拦住写错的模板）。 */
  smsTemplate: string
  /** 输入框上方那行催促语（对方的原话）。 */
  prompt?: string
  /** 输对之后执行的选项 ID：必须是该节点上的正常选项，仍然走 `choose()`。 */
  onCorrect: TOption
  /** 输错时对方回的那句话。语气不能施压 —— 骗子这时通常很"有耐心"。 */
  retryLine: string
}

/** 可玩关卡。 */
export interface PlayableLevel<TNode extends string = string, TOption extends string = string> {
  kind: 'playable'
  meta: LevelMeta
  /** 节点表。 */
  nodes: Record<TNode, StoryNode>
  /** 转移表：金额变更只在这里声明。 */
  options: Record<TOption, StoryOption<TNode, TOption>>
  /** 每个节点可用的选项 ID（顺序即界面展示顺序）。 */
  nodeOptions: Record<TNode, TOption[]>
  /** 需要玩家填回模拟验证码的节点（没有就不是验证码环节）。 */
  codeGate?: Partial<Record<TNode, CodeGate<TOption>>>
  /** 开场节点（锁屏）。 */
  startNode: TNode
  /** 复盘节点。 */
  debriefNode: TNode
  /** 本关初始模拟余额。 */
  initialBalance: number
  /** 合法的模拟余额取值（存档校验与断言共用）。 */
  validBalances: readonly number[]
  /** 合法的平台内展示金额取值。 */
  validPlatformDisplays: readonly number[]
  /** 平台展示数字必须已付多少才允许出现（取代写死的 130/100 规则）。 */
  platformRequiresPaid: readonly { display: number; minPaid: number }[]
  /** 待确认付款请求（按节点）。 */
  pendingRequests: Partial<Record<TNode, PendingRequest<TOption>>>
  /** 结局标题与一句话原因（key = 结局节点 id）。 */
  endings: Record<string, { title: string; reason: string }>
  /** 风险标记的中文短名，用于复盘标注。 */
  riskTagLabels: Record<RiskTag, string>
  /** 复盘规则：命中任一触发标记即展示。 */
  debriefRules: DebriefRule[]
  /** 结尾给出的可执行建议（不承诺追回）。 */
  debriefActions: string[]
  /** 节点 → 反诈提醒正文（≤70 字，无网址、无号码）。 */
  reminders: Partial<Record<TNode, string>>
  /**
   * 这些节点的反诈提醒**用弹窗**而不是顶部横幅（2026-10-17 新增）。
   *
   * 为什么不把所有提醒都改成弹窗：弹窗会打断操作。满屏打断的结果是玩家开始
   * 无脑点「知道了」，反而更不看。所以只把「真的可能正在被骗」的那几个节点
   * 挑出来弹窗，其余仍在顶部横幅里轻声提示。
   */
  popupReminders?: readonly TNode[]
  /** 界面文案。 */
  copy: LevelCopy
  /** 钱包收支记录（完全由状态推导，不单独存储）。 */
  walletRecords: (state: GameState) => { label: string; amount: number }[]
  /** 消息应用规格。 */
  chat: LevelChatSpec<TNode, TOption>
}

/** 尚未开放的关卡：只有元数据，不含任何剧情。 */
export interface ComingSoonLevel {
  kind: 'coming-soon'
  meta: LevelMeta
  /** 锁定卡上的说明。 */
  note: string
}

export type LevelEntry = PlayableLevel | ComingSoonLevel

/** 类型守卫。 */
export function isPlayable(entry: LevelEntry): entry is PlayableLevel {
  return entry.kind === 'playable'
}

/**
 * 定义关卡。
 *
 * 泛型在这里的作用：各关文件调用时 TNode/TOption 会被推断成该关自己的
 * 字面量联合，于是 `from` / `to` / `nodeOptions` 里写错一个 id 就是编译错误。
 */
export function defineLevel<TNode extends string, TOption extends string>(
  def: PlayableLevel<TNode, TOption>,
): PlayableLevel<TNode, TOption> {
  return def
}

/* ============================ 结构校验 ============================ */

/**
 * 关卡数据的结构校验，返回问题列表（空数组表示合法）。
 *
 * 开发期自检与 `tests/levels.spec.ts` 共用同一份规则，避免「测试里查过、
 * 运行时没查」的两套标准。这里只查**结构**：可达性、id 一致性、金额口径。
 * 文案类守卫（禁用词、网址、号码）在测试里做，因为它要 import `debrief.ts`，
 * 放进本文件会造成循环依赖。
 */
export function validateLevel(level: PlayableLevel): string[] {
  const problems: string[] = []
  const nodeIds = Object.keys(level.nodes)

  if (!nodeIds.includes(level.startNode)) problems.push(`startNode「${level.startNode}」不在节点表里`)
  if (!nodeIds.includes(level.debriefNode)) problems.push(`debriefNode「${level.debriefNode}」不在节点表里`)

  // 1) 每个选项的 from/to 都必须是本关节点，且 id 与键名一致。
  for (const [key, option] of Object.entries(level.options)) {
    if (option.id !== key) problems.push(`选项「${key}」的 id 字段是「${option.id}」`)
    if (!nodeIds.includes(option.from)) problems.push(`选项「${key}」的 from「${option.from}」不是节点`)
    if (!nodeIds.includes(option.to)) problems.push(`选项「${key}」的 to「${option.to}」不是节点`)
  }

  // 2) nodeOptions 的键必须是节点，值必须是从该节点出发的选项，且不重复。
  //
  // 注意：**权威是 `nodeOptions`，不是选项的 `from` 字段**。一个选项可以被
  // 多个节点共用 —— 例如三个结局节点都提供同一个「看复盘」，它只能有一个
  // `from`（写出它主要从哪来）。引擎与存档校验本来就读 `nodeOptions`，
  // 所以这里只要求 `from` 是「列出它的节点之一」，写错仍会被抓出来。
  for (const [node, list] of Object.entries(level.nodeOptions)) {
    if (!nodeIds.includes(node)) problems.push(`nodeOptions 里有未知节点「${node}」`)
    const seen = new Set<string>()
    for (const id of list) {
      if (seen.has(id)) problems.push(`节点「${node}」重复列出选项「${id}」`)
      seen.add(id)
      if (!level.options[id]) problems.push(`节点「${node}」引用了不存在的选项「${id}」`)
    }
  }

  // 3) 反向：每个选项都必须至少被一个节点列出，否则永远点不到；
  //    并且它的 `from` 必须是列出它的节点之一（防止 from 写错后无人发现）。
  for (const [id, option] of Object.entries(level.options)) {
    const listedBy = Object.entries(level.nodeOptions)
      .filter(([, list]) => list.includes(id))
      .map(([node]) => node)
    if (listedBy.length === 0) {
      problems.push(`选项「${id}」没有出现在任何节点的可选项里（永远不可达）`)
      continue
    }
    if (!listedBy.includes(option.from)) {
      problems.push(`选项「${id}」的 from 是「${option.from}」，但只有 [${listedBy.join(', ')}] 会提供它`)
    }
  }

  // 4) 结局节点的 id 与 endings 的键必须一一对应。
  for (const [node, ending] of Object.entries(level.endings)) {
    const def = level.nodes[node]
    if (!def) {
      problems.push(`endings 里的「${node}」不是节点`)
      continue
    }
    if (def.ending !== node) problems.push(`结局节点「${node}」的 ending 字段应是「${node}」`)
    if (!ending.title || !ending.reason) problems.push(`结局「${node}」缺少 title 或 reason`)
  }
  for (const node of nodeIds) {
    if (level.nodes[node].ending && !(node in level.endings)) {
      problems.push(`节点「${node}」标了结局，但 endings 里没有它`)
    }
  }

  // 5) 风险标记与复盘规则必须双向对齐：标签没有规则会白显示，规则没有标签会显示 undefined。
  const labelKeys = new Set(Object.keys(level.riskTagLabels))
  for (const rule of level.debriefRules) {
    if (rule.triggers.length === 0) problems.push(`复盘规则「${rule.id}」没有任何触发标记`)
    for (const tag of rule.triggers) {
      if (!labelKeys.has(tag)) problems.push(`复盘规则「${rule.id}」用了没有中文名的标记「${tag}」`)
    }
  }
  const coveredTags = new Set(level.debriefRules.flatMap((rule) => rule.triggers))
  for (const tag of labelKeys) {
    if (!coveredTags.has(tag)) problems.push(`风险标记「${tag}」有中文名，但没有任何复盘规则引用它`)
  }

  // 6) 可达性：从开场能到所有节点；每个节点都能到某个结局；每个结局都能到复盘。
  const reachable = new Set<string>([level.startNode])
  const queue = [level.startNode]
  while (queue.length) {
    const node = queue.shift() as string
    for (const id of level.nodeOptions[node] ?? []) {
      const next = level.options[id]?.to
      if (next && !reachable.has(next)) {
        reachable.add(next)
        queue.push(next)
      }
    }
  }
  for (const node of nodeIds) {
    if (!reachable.has(node)) problems.push(`节点「${node}」从开场走不到（死代码）`)
  }

  const canReachEnding = (from: string): boolean => {
    const seen = new Set<string>([from])
    const pending = [from]
    while (pending.length) {
      const node = pending.shift() as string
      if (node in level.endings) return true
      for (const id of level.nodeOptions[node] ?? []) {
        const next = level.options[id]?.to
        if (next && !seen.has(next)) {
          seen.add(next)
          pending.push(next)
        }
      }
    }
    return false
  }
  for (const node of nodeIds) {
    if (!canReachEnding(node)) problems.push(`节点「${node}」走不到任何结局（死路）`)
  }
  for (const ending of Object.keys(level.endings)) {
    if (!canReachEnding(level.debriefNode) && !reachable.has(level.debriefNode)) {
      problems.push('复盘节点不可达')
      break
    }
    if (!(level.nodeOptions[ending] ?? []).length) problems.push(`结局「${ending}」没有任何可用选项（走不出去）`)
  }

  // 7) 复盘节点必须能重开。
  const debriefOptions = level.nodeOptions[level.debriefNode] ?? []
  if (!debriefOptions.some((id) => level.options[id]?.effect?.reset)) {
    problems.push('复盘节点缺少带 reset 的「重开」选项')
  }

  // 8) 金额口径：所有无环路径上的余额都必须落在 validBalances 里。
  if (!level.validBalances.includes(level.initialBalance)) {
    problems.push(`validBalances 里没有初始余额 ${level.initialBalance}`)
  }
  const balances = new Set<number>([level.initialBalance])
  const walk = (node: string, balance: number, paid: number, visited: Set<string>, depth: number): void => {
    if (depth > 24) return
    for (const id of level.nodeOptions[node] ?? []) {
      const option = level.options[id]
      if (!option) continue
      const nextBalance = balance + (option.effect?.balanceDelta ?? 0)
      const nextPaid = paid + (option.effect?.paidDelta ?? 0)
      if (nextBalance !== level.initialBalance - nextPaid) {
        problems.push(`选项「${id}」破坏了「余额 = 初始余额 - 累计付出」的不变式`)
      }
      balances.add(nextBalance)
      if (!level.validBalances.includes(nextBalance)) {
        problems.push(`走选项「${id}」后余额 ${nextBalance} 不在 validBalances 里`)
      }
      const target = option.to
      if (option.effect?.reset || visited.has(target)) continue
      const nextVisited = new Set(visited)
      nextVisited.add(target)
      walk(target, nextBalance, nextPaid, nextVisited, depth + 1)
    }
  }
  walk(level.startNode, level.initialBalance, 0, new Set([level.startNode]), 0)

  // 9) 待确认付款请求必须与引擎真正会扣的金额一致。
  //
  // 这里刻意**不**用「初始余额 - 待确认金额」去推合法余额：待确认页的余额
  // 取决于走到它的路径（第一关的 transfer-300 是在已付 100 之后才到的，
  // 那时余额是 700 而不是 800）。真正值得守的是另一件事：
  // 钱包上显示的那个大数字，必须等于确认选项实际会扣掉的金额 ——
  // 两者不一致就是最糟的一类 bug（界面说 300，引擎扣 500）。
  for (const [node, request] of Object.entries(level.pendingRequests)) {
    if (!request) continue
    const list = level.nodeOptions[node] ?? []
    const confirm = level.options[request.confirm]
    const cancel = level.options[request.cancel]

    for (const [role, option] of [
      ['确认', confirm],
      ['取消', cancel],
    ] as const) {
      if (!option) problems.push(`节点「${node}」的待确认请求引用了不存在的${role}选项`)
      else if (!list.includes(option.id)) {
        problems.push(`节点「${node}」的${role}选项「${option.id}」不在该节点可选项里`)
      }
    }
    if (confirm) {
      const delta = confirm.effect?.balanceDelta
      if (delta === undefined || delta >= 0) {
        problems.push(`节点「${node}」的确认选项「${confirm.id}」必须声明负数 balanceDelta`)
      } else if (-delta !== request.amount) {
        problems.push(
          `节点「${node}」的待确认金额是 ${request.amount}，但确认选项实际扣 ${-delta} —— 界面与引擎不一致`,
        )
      }
      if (!confirm.effect?.once) {
        problems.push(`节点「${node}」的确认选项「${confirm.id}」必须是一次性的（once: true）`)
      }
      if ((confirm.effect?.paidDelta ?? 0) !== request.amount) {
        problems.push(`节点「${node}」的确认选项「${confirm.id}」的 paidDelta 应等于待确认金额`)
      }
    }
    if (cancel) {
      if ((cancel.effect?.balanceDelta ?? 0) !== 0) {
        problems.push(`节点「${node}」的取消选项「${cancel.id}」不应改变余额`)
      }
      if (cancel.to === node) {
        problems.push(`节点「${node}」的取消选项「${cancel.id}」不能留在原节点（玩家会卡住）`)
      }
    }
  }

  // 10) 提醒文案：每个结局与关键节点都要有；长度适合顶部横幅。
  for (const ending of Object.keys(level.endings)) {
    if (!level.reminders[ending]) problems.push(`结局「${ending}」没有反诈提醒`)
  }

  /*
   * 10b) 弹窗提醒的节点必须真实存在、且**确实有提醒正文** ——
   * 否则会出现「弹出一个空弹窗」，比不弹更糟。
   */
  for (const node of level.popupReminders ?? []) {
    if (!nodeIds.includes(node)) {
      problems.push(`popupReminders 里有未知节点「${node}」`)
    } else if (!level.reminders[node]) {
      problems.push(`popupReminders 里的「${node}」没有提醒正文，弹窗会是空的`)
    }
  }

  // 11) 会话引用完整性。
  const sessionIds = new Set(level.chat.sessions.map((s) => s.id))
  const refs: [string, string | undefined][] = [
    ...Object.entries(level.chat.optionSession).map(
      ([node, id]) => [`optionSession[${node}]`, id] as [string, string | undefined],
    ),
    ...Object.entries(level.chat.preferredSession).map(
      ([node, id]) => [`preferredSession[${node}]`, id] as [string, string | undefined],
    ),
    ...Object.entries(level.chat.hiddenAt ?? {}).map(([id]) => [`hiddenAt`, id] as [string, string | undefined]),
    ...Object.entries(level.chat.profiles).map(([id]) => [`profiles`, id] as [string, string | undefined]),
    ...level.chat.profile.map((p) => [`profile`, p.session] as [string, string | undefined]),
    ...Object.entries(level.chat.unread ?? {}).map(
      ([node, id]) => [`unread[${node}]`, id] as [string, string | undefined],
    ),
  ]
  for (const [where, id] of refs) {
    if (id && !sessionIds.has(id)) problems.push(`${where} 引用了不存在的会话「${id}」`)
  }
  for (const [node, list] of Object.entries(level.chat.extraMessages ?? {})) {
    if (!nodeIds.includes(node)) problems.push(`extraMessages 里有未知节点「${node}」`)
    for (const item of list ?? []) {
      if (!sessionIds.has(item.session)) problems.push(`extraMessages[${node}] 指向未知会话「${item.session}」`)
    }
  }
  for (const [node, list] of Object.entries(level.chat.hiddenAt ?? {})) {
    if (!sessionIds.has(node)) problems.push(`hiddenAt 里有未知会话「${node}」`)
    for (const at of list ?? []) {
      if (!nodeIds.includes(at)) problems.push(`hiddenAt[${node}] 里有未知节点「${at}」`)
    }
  }
  for (const [node, id] of Object.entries(level.chat.optionSession)) {
    if (id && !(level.nodeOptions[node] ?? []).length) {
      problems.push(`optionSession 里的「${node}」没有任何可选项`)
    }
  }

  // 12) 由专门入口触发（不渲染成底部按钮）的选项必须真实存在，
  //     否则「订单详情」这类按钮会点了没反应。
  for (const id of level.chat.hiddenOptions ?? []) {
    if (!level.options[id]) problems.push(`hiddenOptions 引用了不存在的选项「${id}」`)
  }
  for (const entry of level.chat.profile) {
    if (entry.option && !level.options[entry.option]) {
      problems.push(`资料入口引用了不存在的选项「${entry.option}」`)
    }
  }
  const sheet = level.chat.detailSheet
  if (sheet) {
    if (sheet.nodes.length === 0) problems.push('detailSheet 没有指定任何可打开的节点')
    for (const node of sheet.nodes) {
      if (!nodeIds.includes(node)) problems.push(`detailSheet 里的节点「${node}」不存在`)
    }
    if (sheet.option && !level.options[sheet.option]) {
      problems.push(`detailSheet 引用了不存在的选项「${sheet.option}」`)
    }
    if (sheet.option && !(level.chat.hiddenOptions ?? []).includes(sheet.option)) {
      problems.push(`detailSheet 的选项「${sheet.option}」应同时列进 hiddenOptions，否则会重复渲染成按钮`)
    }
  }

  // 13) 每个节点都必须有可点击的出口（除了「走不动」的中间态不允许存在）。
  for (const node of nodeIds) {
    if (!(level.nodeOptions[node] ?? []).length) {
      problems.push(`节点「${node}」没有任何可用选项（玩家会卡住）`)
    }
  }

  /*
   * 14) 模拟验证码环节（`codeGate`）。
   *
   * 这一段是最容易把玩家卡死的地方，所以校验得很死：短信里没有码、
   * 输对之后没有出口、出口不在这个节点上，任何一条都会让玩家拿着一个
   * 6 位数字却无处可填 / 填对了也走不下去。
   */
  for (const [node, gate] of Object.entries(level.codeGate ?? {})) {
    if (!gate) continue
    if (!nodeIds.includes(node)) {
      problems.push(`codeGate 里有未知节点「${node}」`)
      continue
    }
    if (!gate.smsTemplate.includes('{code}')) {
      problems.push(`codeGate[${node}] 的短信模板必须包含 {code}，否则玩家永远拿不到验证码`)
    }
    if (!gate.smsTemplate.includes(gate.sender)) {
      problems.push(`codeGate[${node}] 的短信模板应带上发送方「${gate.sender}」`)
    }
    if (!gate.retryLine.trim()) {
      problems.push(`codeGate[${node}] 缺少输错时的回话（retryLine）`)
    }
    const option = level.options[gate.onCorrect]
    if (!option) {
      problems.push(`codeGate[${node}] 的 onCorrect 指向不存在的选项「${gate.onCorrect}」`)
    } else {
      if (!(level.nodeOptions[node] ?? []).includes(gate.onCorrect)) {
        problems.push(`codeGate[${node}] 的 onCorrect「${gate.onCorrect}」不在该节点的可选项里`)
      }
      if (option.to === node) {
        problems.push(`codeGate[${node}] 的 onCorrect 不能留在原节点（会立刻再次索要验证码）`)
      }
    }
    // 输对之后必须还有别的出口（至少留一条退路，不能只剩验证码输入）
    const others = (level.nodeOptions[node] ?? []).filter((id) => id !== gate.onCorrect)
    if (others.length === 0) {
      problems.push(`codeGate[${node}] 的节点只剩一个选项，玩家输了就没法中止`)
    }
  }

  return problems
}

/**
 * 把一关的**全部面向玩家的文案**拼成一段文本，供测试做禁用词/网址/号码守卫。
 * 只收玩家真的能看到的内容，不含注释与元数据。
 */
export function collectLevelText(level: PlayableLevel): string {
  const parts: string[] = [
    level.meta.title,
    level.meta.category,
    level.meta.blurb,
    level.meta.goal,
    level.copy.balanceLabel,
    level.copy.spentLabel,
    level.copy.pendingHint,
    level.copy.platformLabel,
    level.copy.platformWalletNote,
    level.copy.platformChatNote(level.initialBalance),
    level.copy.resumeFallback,
    ...Object.values(level.copy.resume),
    ...Object.values(level.endings).flatMap((e) => [e.title, e.reason]),
    ...Object.values(level.riskTagLabels),
    ...level.debriefRules.flatMap((r) => [r.title, r.observation, r.risk, r.advice]),
    ...level.debriefActions,
    ...Object.values(level.reminders).filter((body): body is string => typeof body === 'string'),
    ...Object.values(level.options).map((o) => o.label),
    ...Object.values(level.pendingRequests)
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => r.title),
  ]

  for (const session of level.chat.sessions) {
    parts.push(session.name)
    for (const message of session.messages) {
      parts.push(message.text)
      if (message.transferNote) parts.push(message.transferNote)
      if (message.orderTitle) parts.push(message.orderTitle)
      if (message.orderStatus) parts.push(message.orderStatus)
      if (message.refundStatus) parts.push(message.refundStatus)
    }
  }
  for (const list of Object.values(level.chat.extraMessages ?? {})) {
    for (const item of list ?? []) {
      for (const message of item.messages) {
        parts.push(message.text)
        if (message.orderTitle) parts.push(message.orderTitle)
        if (message.orderStatus) parts.push(message.orderStatus)
        if (message.refundStatus) parts.push(message.refundStatus)
      }
    }
  }
  for (const profile of Object.values(level.chat.profiles)) {
    parts.push(profile.nickname, profile.account, profile.notice)
    for (const field of profile.fields) parts.push(field.label, field.value)
  }
  const sheet = level.chat.detailSheet
  if (sheet) {
    parts.push(sheet.title, sheet.notice)
    for (const field of sheet.fields) parts.push(field.label, field.value)
  }
  // 验证码环节的短信模板、催促语与输错回话同样是玩家看得见的文案
  for (const gate of Object.values(level.codeGate ?? {})) {
    if (!gate) continue
    parts.push(gate.sender, gate.smsTemplate, gate.retryLine)
    if (gate.prompt) parts.push(gate.prompt)
  }

  return parts.filter(Boolean).join('\n')
}

/**
 * 取某节点上的模拟验证码环节；没有则返回 null。
 *
 * 单独导出而不是让组件自己 `level.codeGate?.[node]`：这样「验证码环节」
 * 的判定只有一处，将来加别的关卡也不会有人各写一遍。
 */
export function codeGateFor<TNode extends string, TOption extends string>(
  level: PlayableLevel<TNode, TOption>,
  node: NodeId,
): CodeGate<TOption> | null {
  const gate = level.codeGate?.[node as TNode]
  return gate ?? null
}

/** 该节点的反诈提醒是否应该用**弹窗**呈现（而不是顶部横幅）。 */
export function wantsReminderPopup<TNode extends string, TOption extends string>(
  level: PlayableLevel<TNode, TOption>,
  node: NodeId,
): boolean {
  return (level.popupReminders ?? []).includes(node as TNode)
}

/** 由状态取当前关卡要用的界面文案（找不到时回退到兜底文案）。 */
export function resumeTextOf(level: PlayableLevel, node: NodeId): string {
  return level.copy.resume[node] ?? level.copy.resumeFallback
}

/** 便捷别名：让调用方少写一层 `level.meta`。 */
export function levelTitle(level: LevelEntry): string {
  return level.meta.title
}

/** 选项 id 在本关是否存在（供导航层判断，不改变状态）。 */
export function hasOption(level: PlayableLevel, id: OptionId): boolean {
  return Object.prototype.hasOwnProperty.call(level.options, id)
}
