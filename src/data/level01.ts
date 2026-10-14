import type {
  NodeId,
  OptionId,
  RiskTag,
  StoryNode,
  StoryOption,
} from '@/game/types'

/**
 * 第一关「刷单返利」剧情数据。
 *
 * 全部金额为**游戏模拟余额**；平台展示金额为未兑现数字，永不计入余额。
 * 数值口径来自 `LEVEL-01.md`：初始 800 → 确认首次垫付后 700 → 确认追加垫付后 400。
 */

/** 初始模拟余额。 */
export const INITIAL_BALANCE = 800
/** 首次模拟垫付金额。 */
export const FIRST_PAD_AMOUNT = 100
/** 追加模拟垫付金额。 */
export const EXTRA_PAD_AMOUNT = 300
/** 平台内展示但不可提现的「返利」数字。 */
export const PLATFORM_REBATE_DISPLAY = 130
/** 累计模拟损失上限（两次垫付之和），用于断言。 */
export const MAX_PAID_TOTAL = FIRST_PAD_AMOUNT + EXTRA_PAD_AMOUNT

/** 虚构应用名（全局统一命名）。 */
export const BRAND = {
  os: '青屏 OS',
  chat: '青讯',
  wallet: '安心钱包',
  /**
   * 反诈知识应用。
   * 识骗手册已并入「国家反诈中心」应用：桌面图标、应用内标题与复盘统一用它，
   * 不再出现两个反诈入口。
   */
  manual: '国家反诈中心',
  /** 应用内页面的栏目名（用于应用标题下方副标题）。 */
  manualSection: '识骗手册',
  /** 虚构联系人昵称，非真实身份。 */
  senior: '自称“学姐”的林某',
  groupOwner: '群主·任务派单员',
  group: '校园兼职·日结任务群',
  /** 家人（生活费来源，纯剧情，不对应任何真实的人）。 */
  mom: '妈妈',
  /** 班级通知群（纯拟真，不参与剧情分支）。 */
  classGroup: '班级通知群',
  counselor: '辅导员',
} as const

/** 节点定义。`onEnter` 效果在同一事务内应用，天然只生效一次。 */
export const NODES: Record<NodeId, StoryNode> = {
  intro: { id: 'intro' },
  invite: { id: 'invite' },
  group: { id: 'group' },
  'transfer-100': { id: 'transfer-100' },
  rebate: {
    id: 'rebate',
    onEnter: {
      addTags: ['saw-rebate-claim'],
      platformDisplay: PLATFORM_REBATE_DISPLAY,
    },
  },
  freeze: {
    id: 'freeze',
    onEnter: { addTags: ['withdraw-failed', 'asked-freeze-fee'] },
  },
  'transfer-300': {
    id: 'transfer-300',
    onEnter: { addTags: ['asked-extra'] },
  },
  'end-clear': { id: 'end-clear', ending: 'end-clear' },
  'end-stop': { id: 'end-stop', ending: 'end-stop' },
  'end-loss': { id: 'end-loss', ending: 'end-loss' },
  debrief: { id: 'debrief' },
}

/**
 * 转移表。金额变更只在此处声明，并由 `engine.choose` 事务式应用一次。
 *
 * `label` / `hint` 是供界面与测试引用的稳定文案；实际渲染文案在各场景组件中，
 * 修改界面用语时需同步这里，避免两处漂移。
 */
export const OPTIONS: Record<OptionId, StoryOption> = {
  start: {
    id: 'start',
    label: '开始体验',
    from: 'intro',
    to: 'invite',
    hint: '进入虚构手机桌面',
  },
  'reject-invite': {
    id: 'reject-invite',
    label: '拒绝并举报',
    from: 'invite',
    to: 'end-clear',
    effect: { addTags: ['early-reject'] },
  },
  'enter-group': {
    id: 'enter-group',
    label: '进群看看',
    from: 'invite',
    to: 'group',
    effect: { addTags: ['entered-group'] },
  },
  'report-group': {
    id: 'report-group',
    label: '退出并举报',
    from: 'group',
    to: 'end-clear',
    effect: { addTags: ['reported-in-group'] },
  },
  'accept-task': {
    id: 'accept-task',
    label: '接下任务',
    from: 'group',
    to: 'transfer-100',
    effect: { addTags: ['saw-pad-request'] },
  },
  'view-profile': {
    id: 'view-profile',
    label: '群主资料',
    from: 'group',
    to: 'group',
    // 效果本身幂等（标记去重），因此可反复打开而不产生额外影响。
    effect: { markProfileViewed: true },
    hint: '打开资料弹层，只记录一次线索，不影响余额',
  },
  'cancel-100': {
    id: 'cancel-100',
    label: '取消，不参与',
    from: 'transfer-100',
    to: 'end-stop',
    effect: { addTags: ['stopped-before-pay'] },
  },
  'confirm-100': {
    id: 'confirm-100',
    label: `确认垫付 ${FIRST_PAD_AMOUNT} 元`,
    from: 'transfer-100',
    to: 'rebate',
    effect: {
      balanceDelta: -FIRST_PAD_AMOUNT,
      paidDelta: FIRST_PAD_AMOUNT,
      addTags: ['paid-100'],
      once: true,
    },
  },
  'stop-after-100': {
    id: 'stop-after-100',
    label: '到此为止',
    from: 'rebate',
    to: 'end-stop',
    effect: { addTags: ['stopped-after-100'] },
  },
  'continue-task': {
    id: 'continue-task',
    label: '继续查看任务',
    from: 'rebate',
    to: 'freeze',
  },
  'stop-at-freeze': {
    id: 'stop-at-freeze',
    label: '停止操作并保留证据',
    from: 'freeze',
    to: 'end-stop',
    effect: { addTags: ['stopped-at-freeze'] },
  },
  'accept-extra': {
    id: 'accept-extra',
    label: '查看追加垫付',
    from: 'freeze',
    to: 'transfer-300',
  },
  'cancel-300': {
    id: 'cancel-300',
    label: '取消，不再付款',
    from: 'transfer-300',
    to: 'end-stop',
    effect: { addTags: ['stopped-before-extra'] },
  },
  'confirm-300': {
    id: 'confirm-300',
    label: `确认垫付 ${EXTRA_PAD_AMOUNT} 元`,
    from: 'transfer-300',
    to: 'end-loss',
    effect: {
      balanceDelta: -EXTRA_PAD_AMOUNT,
      paidDelta: EXTRA_PAD_AMOUNT,
      addTags: ['paid-300'],
      once: true,
    },
  },
  review: {
    id: 'review',
    label: '看复盘',
    from: 'end-stop',
    to: 'debrief',
    hint: '结局和复盘都可以离开，随时从桌面或识骗手册再次进入',
  },
  restart: {
    id: 'restart',
    label: '再玩一次',
    from: 'debrief',
    to: 'intro',
    // 清空全部进度并恢复初始模拟余额。
    effect: { reset: true },
  },
}

/** 每个节点可用的选项 ID（顺序即界面展示顺序）。 */
export const NODE_OPTIONS: Record<NodeId, OptionId[]> = {
  intro: ['start'],
  invite: ['enter-group', 'reject-invite'],
  group: ['accept-task', 'report-group', 'view-profile'],
  'transfer-100': ['confirm-100', 'cancel-100'],
  rebate: ['continue-task', 'stop-after-100'],
  freeze: ['accept-extra', 'stop-at-freeze'],
  'transfer-300': ['confirm-300', 'cancel-300'],
  'end-clear': ['review'],
  'end-stop': ['review'],
  'end-loss': ['review'],
  debrief: ['restart'],
}

/** 风险标记的中文短名，用于复盘标注。 */
export const RISK_TAG_LABELS: Record<RiskTag, string> = {
  'early-reject': '直接拒绝了陌生兼职',
  'entered-group': '进了兼职群',
  'reported-in-group': '进群后退出并举报',
  'viewed-profile': '看过对方资料',
  'saw-pad-request': '看到「先垫 100」',
  'stopped-before-pay': '转账前退出',
  'paid-100': '付了 100',
  'saw-rebate-claim': '看到「平台显示返 130」',
  'stopped-after-100': '付了 100 后停手',
  'withdraw-failed': '提现失败',
  'asked-freeze-fee': '被要「解冻费」',
  'stopped-at-freeze': '提现失败时停手',
  'asked-extra': '被要追加 300',
  'stopped-before-extra': '追加时取消',
  'paid-300': '付了追加的 300',
}

/** 结局标题与一句话原因。 */
export const ENDING_INFO: Record<
  'end-clear' | 'end-stop' | 'end-loss',
  { title: string; reason: string }
> = {
  'end-clear': {
    title: '提前识破',
    reason: '兼职还要你自己先垫钱，到这一步就可以退了。',
  },
  'end-stop': {
    title: '及时止损',
    reason: '你停在了继续掏钱之前，这是最有用的一步。',
  },
  'end-loss': {
    title: '追加后损失',
    reason: '让你交钱才能解冻，这句话本身就是在骗你。',
  },
}

/** 头像色调（自绘，不使用真实照片）。 */
export type AvatarTone = 'blue' | 'green' | 'amber' | 'violet' | 'slate' | 'rose'

/**
 * 发言者头像。
 * 用「一个字 + 一种色调」表示虚构联系人，避免任何真实照片或平台头像。
 */
export const SENDER_AVATARS: Record<string, { text: string; tone: AvatarTone }> = {
  我: { text: '我', tone: 'blue' },
  [BRAND.mom]: { text: '妈', tone: 'amber' },
  [BRAND.senior]: { text: '姐', tone: 'violet' },
  [BRAND.groupOwner]: { text: '群', tone: 'blue' },
  '群成员 A': { text: 'A', tone: 'green' },
  '群成员 B': { text: 'B', tone: 'slate' },
  [BRAND.counselor]: { text: '辅', tone: 'green' },
}

/** 取某个发送者的头像；未知发送者回退到首字 + 灰调。 */
export function avatarFor(name: string): { text: string; tone: AvatarTone } {
  const hit = SENDER_AVATARS[name]
  if (hit) return hit
  return { text: name.slice(0, 1) || '?', tone: 'slate' }
}

/** 群聊消息。`delayMs` 仅用于逐条呈现，可跳过。 */
export interface ChatMessage {
  id: string
  from: 'them' | 'me' | 'system'
  /** 发言人显示名。 */
  name?: string
  text: string
  /**
   * 消息样式：普通气泡 / 收益自称卡片 / 风险提示卡 / 提现失败 / 转账卡片。
   * `transfer` 用于表现「妈妈转来的生活费」，让 800 元有明确来源。
   */
  variant?: 'text' | 'claim' | 'risk' | 'failed' | 'transfer'
  /** 转账金额（仅 transfer 变体）。 */
  amount?: number
  /** 转账状态（仅 transfer 变体）。 */
  transferStatus?: 'received' | 'pending'
  /** 转账备注（仅 transfer 变体）。 */
  transferNote?: string
}

/** 妈妈会话：生活费从哪来说清楚，顺带给一句真实提醒。 */
export const MOM_MESSAGES: ChatMessage[] = [
  {
    id: 'm1',
    from: 'them',
    name: BRAND.mom,
    text: '这个月生活费转过去了，收到回我一声。',
  },
  {
    id: 'm2',
    from: 'them',
    name: BRAND.mom,
    variant: 'transfer',
    amount: INITIAL_BALANCE,
    transferStatus: 'received',
    transferNote: '生活费',
    text: '转账给你',
  },
  {
    id: 'm3',
    from: 'me',
    text: '收到啦，谢谢妈',
  },
  {
    id: 'm4',
    from: 'them',
    name: BRAND.mom,
    text: '在外边别乱花。要你交钱才能做兼职的，一律别信。',
  },
]

/** 班级通知群：纯拟真，不参与剧情分支，用来让会话列表像个真的消息应用。 */
export const CLASSGROUP_MESSAGES: ChatMessage[] = [
  {
    id: 'c1',
    from: 'them',
    name: BRAND.counselor,
    text: '下周一上午 9 点，带学生证到教材科领本学期教材。',
  },
]

/** 邀请会话消息。 */
export const INVITE_MESSAGES: ChatMessage[] = [
  {
    id: 'i1',
    from: 'them',
    name: BRAND.senior,
    text: '学妹你好呀，我是大四的学姐～最近在带一个校园兼职的群，课余做做任务，报酬当天就结',
  },
  {
    id: 'i2',
    from: 'them',
    name: BRAND.senior,
    text: '手机上就能做，先拉你进群看看？不合适随时退',
  },
  {
    id: 'i3',
    from: 'system',
    variant: 'risk',
    text: '对方说是学姐，但这没法证明她是谁。',
  },
]

/** 群聊消息。 */
export const GROUP_MESSAGES: ChatMessage[] = [
  {
    id: 'g1',
    from: 'them',
    name: BRAND.groupOwner,
    text: '欢迎新同学～群规很简单，先垫 100 接单，做完平台显示返 130，当天结算',
  },
  {
    id: 'g2',
    from: 'them',
    name: '群成员 A',
    variant: 'claim',
    text: '我今天做了三单，收益到账了～截图就不发了，怕被同行学走',
  },
  {
    id: 'g3',
    from: 'them',
    name: '群成员 B',
    variant: 'claim',
    text: '跟着群主做就对了，我昨天刚提现成功',
  },
  {
    id: 'g4',
    from: 'them',
    name: BRAND.groupOwner,
    text: '名额有限，先垫付的先派单。垫的钱做完一起返给你，走个流程而已',
  },
  {
    id: 'g5',
    from: 'system',
    variant: 'risk',
    text: '群里说「到账」的，也都是他们自己说的。',
  },
]

/** 返利展示消息。 */
export const REBATE_MESSAGES: ChatMessage[] = [
  {
    id: 'r1',
    from: 'them',
    name: BRAND.groupOwner,
    text: `任务过了，平台显示 ${PLATFORM_REBATE_DISPLAY} 收益，可以接着做更高的`,
  },
  {
    id: 'r2',
    from: 'system',
    variant: 'risk',
    text: '「平台显示」的数字，和钱包里能用的钱不是一回事。',
  },
]

/** 提现异常消息。 */
export const FREEZE_MESSAGES: ChatMessage[] = [
  {
    id: 'f1',
    from: 'system',
    variant: 'failed',
    text: '提现失败：账户状态异常，收益暂被冻结。',
  },
  {
    id: 'f2',
    from: 'them',
    name: BRAND.groupOwner,
    text: '你账户被风控冻结了，先交 300 解冻费激活通道，激活后本金和收益一起返你',
  },
  {
    id: 'f3',
    from: 'them',
    name: BRAND.groupOwner,
    text: '别的同学都交了，别耽误大家结算',
  },
  {
    id: 'f4',
    from: 'system',
    variant: 'risk',
    text: '要你先交钱才能解冻，这个说法本身就不成立。',
  },
]

/**
 * 会话（聊天列表里的一行）。
 *
 * 区分群聊与私聊是这一轮的重点：群聊有成员数、消息带发言人昵称；
 * 私聊没有成员数、只说「对方」。会话列表按下面的数组顺序展示。
 */
export interface ChatSession {
  id: ChatSessionId
  kind: 'private' | 'group'
  name: string
  /** 群成员数（仅群聊）。 */
  memberCount?: number
  /** 会话列表里显示的时间标签（虚构）。 */
  lastTime: string
  /** 消息（剧情推进后可能追加，见 ChatScene 中的推导）。 */
  messages: ChatMessage[]
}

/** 会话 id。 */
export type ChatSessionId = 'senior' | 'taskgroup' | 'mom' | 'classgroup'

/** 会话列表（顺序即展示顺序；taskgroup 在玩家进群后才出现）。 */
export const SESSIONS: ChatSession[] = [
  {
    id: 'senior',
    kind: 'private',
    name: BRAND.senior,
    lastTime: '10:26',
    messages: INVITE_MESSAGES,
  },
  {
    id: 'taskgroup',
    kind: 'group',
    name: BRAND.group,
    memberCount: 128,
    lastTime: '10:31',
    messages: GROUP_MESSAGES,
  },
  {
    id: 'mom',
    kind: 'private',
    name: BRAND.mom,
    lastTime: '08:12',
    messages: MOM_MESSAGES,
  },
  {
    id: 'classgroup',
    kind: 'group',
    name: BRAND.classGroup,
    memberCount: 42,
    lastTime: '昨天',
    messages: CLASSGROUP_MESSAGES,
  },
]

/** 对方资料弹层内容（虚构，不含真实个人信息）。 */
export const PROFILE_INFO = {
  nickname: BRAND.senior,
  account: 'qx_****2048',
  fields: [
    { label: '注册时间', value: '最近 7 天内' },
    { label: '资料完整度', value: '不完整：无学校、无实名信息' },
    { label: '可核验线索', value: '无。无法通过独立渠道确认其身份' },
  ],
  notice:
    '头像和自称的身份都证明不了什么。真要转账，用别的渠道自己核实一遍。',
} as const

/** 群主资料弹层内容（虚构；群聊里要转账的那个人）。 */
export const PROFILE_INFO_OWNER = {
  nickname: BRAND.groupOwner,
  account: 'qx_****7731',
  fields: [
    { label: '注册时间', value: '最近 7 天内' },
    { label: '资料完整度', value: '不完整：无学校、无实名信息' },
    { label: '可核验线索', value: '无。无法通过独立渠道确认其身份' },
  ],
  notice: '头像是风景图，昵称是「群主」，这些都证明不了他是谁。真要转账，用别的渠道自己核实一遍。',
} as const

/**
 * 反诈应用内的通用内容（不剧透本局复盘）。
 * 「识骗手册」已并入国家反诈中心应用，这里作为应用内的栏目名保留。
 */
export const MANUAL_GENERAL = {
  title: '识骗手册',
  items: [
    {
      title: '让你先垫钱的兼职，直接退出',
      body: '正规兼职不要求你先出钱或先买任务。凡是「做完再返你」还要你先垫的，都是在拿你的钱试你的底线。',
    },
    {
      title: '群里晒的收益，不算证据',
      body: '晒收益的往往就是同一批人。收益能不能进你自己的账户，只有你自己查了才算数。',
    },
    {
      title: '页面上的数字不等于到账',
      body: '平台里那个「返利」「余额」，可能只是页面上的字。能不能提出来才是关键。',
    },
    {
      title: '「冻结要交解冻费」是升级信号',
      body: '已经拿不到钱了，对方还让你继续交钱——这时候该做的是停手，不是凑钱。',
    },
    {
      title: '万一已经转出去了',
      body: '停止操作，保存聊天和转账记录，通过官方渠道举报并及时报警求助。报警不保证追回损失，但越早处理越有利。',
    },
  ],
  disclaimer: '以上是通用提醒，不构成法律意见，也不承诺追回损失。',
} as const
