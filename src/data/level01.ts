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
  manual: '识骗手册',
  /** 虚构联系人昵称，非真实身份。 */
  senior: '自称“学姐”的林某',
  groupOwner: '群主·任务派单员',
  group: '校园兼职·日结任务群',
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
 */
export const OPTIONS: Record<OptionId, StoryOption> = {
  start: {
    id: 'start',
    label: '开始体验',
    from: 'intro',
    to: 'invite',
    hint: '开始第一关剧情模拟，进入虚构手机桌面',
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
    label: '查看对方资料',
    from: 'group',
    to: 'group',
    // 效果本身幂等（标记去重），因此可反复打开而不产生额外影响。
    effect: { markProfileViewed: true },
    hint: '打开资料弹层，只记录一次线索，不影响余额',
  },
  'cancel-100': {
    id: 'cancel-100',
    label: '取消，停止参与',
    from: 'transfer-100',
    to: 'end-stop',
    effect: { addTags: ['stopped-before-pay'] },
  },
  'confirm-100': {
    id: 'confirm-100',
    label: `确认模拟垫付 ${FIRST_PAD_AMOUNT} 元`,
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
    label: `确认模拟垫付 ${EXTRA_PAD_AMOUNT} 元`,
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
    label: '查看我的反诈复盘',
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

/**
 * `review` 在三个结局节点都可用，为保持「一个 OptionId 一条定义」的稳定标识，
 * 合法性以 `NODE_OPTIONS` 为准；`StoryOption.from` 仅作文档说明。
 */
export const REVIEW_FROM_ENDINGS: NodeId[] = ['end-clear', 'end-stop', 'end-loss']

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
  'early-reject': '一开始就拒绝了陌生兼职邀请',
  'entered-group': '进入了兼职任务群',
  'reported-in-group': '进群后退出并举报',
  'viewed-profile': '查看过对方资料',
  'saw-pad-request': '见过「先垫 100」的要求',
  'stopped-before-pay': '转账前取消',
  'paid-100': '确认过首次模拟垫付 100 元',
  'saw-rebate-claim': '见过「平台显示返 130」的说法',
  'stopped-after-100': '首次垫付后停止',
  'withdraw-failed': '遇到提现失败',
  'asked-freeze-fee': '被要求交「解冻费」',
  'stopped-at-freeze': '提现异常时停止操作',
  'asked-extra': '见过追加 300 元的要求',
  'stopped-before-extra': '追加页取消',
  'paid-300': '确认过追加模拟垫付 300 元',
}

/** 结局标题与一句话原因。 */
export const ENDING_INFO: Record<
  'end-clear' | 'end-stop' | 'end-loss',
  { title: string; reason: string }
> = {
  'end-clear': {
    title: '提前识破',
    reason: '陌生兼职先要求自己垫钱，本身就是需要立即退出的信号。',
  },
  'end-stop': {
    title: '及时止损',
    reason: '在继续付款前停下来，是止损最关键的一步。',
  },
  'end-loss': {
    title: '追加后损失',
    reason: '以「冻结、解冻」为由要求继续交钱，是升级风险而不是解决方案。',
  },
}

/** 群聊消息。`delayMs` 仅用于逐条呈现，可跳过。 */
export interface ChatMessage {
  id: string
  from: 'them' | 'me' | 'system'
  /** 发言人显示名。 */
  name?: string
  text: string
  /** 消息样式：普通气泡 / 收益自称卡片 / 风险提示卡。 */
  variant?: 'text' | 'claim' | 'risk' | 'failed'
}

/** 邀请会话消息。 */
export const INVITE_MESSAGES: ChatMessage[] = [
  {
    id: 'i1',
    from: 'them',
    name: BRAND.senior,
    text: '学妹你好呀，我是大四的学姐。最近在带一个校园兼职群，课余做做任务，报酬当天结算。',
  },
  {
    id: 'i2',
    from: 'them',
    name: BRAND.senior,
    text: '不用出门，手机上就能做。要不要先进群看看？不合适随时退。',
  },
  {
    id: 'i3',
    from: 'system',
    variant: 'risk',
    text: '提醒：对方自称「学姐」并不等于身份可信。任何先要求你出钱的兼职都要谨慎。',
  },
]

/** 群聊消息。 */
export const GROUP_MESSAGES: ChatMessage[] = [
  {
    id: 'g1',
    from: 'them',
    name: BRAND.groupOwner,
    text: '欢迎新同学～群规很简单：先垫 100 元接单，做完平台显示返 130，当天结算。',
  },
  {
    id: 'g2',
    from: 'them',
    name: '群成员 A',
    variant: 'claim',
    text: '我今天做了三单，收益已经到账了，截图就不发了怕被同行学走～',
  },
  {
    id: 'g3',
    from: 'them',
    name: '群成员 B',
    variant: 'claim',
    text: '跟着群主做就对了，我昨天刚提现成功。',
  },
  {
    id: 'g4',
    from: 'them',
    name: BRAND.groupOwner,
    text: '名额有限，先垫付的先派单。垫付的钱做完就一起返给你，只是走个流程。',
  },
  {
    id: 'g5',
    from: 'system',
    variant: 'risk',
    text: '提醒：群内「已到账」只是成员自称的文字，不能替代独立核实。正规兼职不会要求你先垫钱。',
  },
]

/** 返利展示消息。 */
export const REBATE_MESSAGES: ChatMessage[] = [
  {
    id: 'r1',
    from: 'them',
    name: BRAND.groupOwner,
    text: `你的任务已通过审核，平台已显示 ${PLATFORM_REBATE_DISPLAY} 元收益，可继续做更高收益的任务。`,
  },
  {
    id: 'r2',
    from: 'system',
    variant: 'risk',
    text: `注意：平台内显示 ${PLATFORM_REBATE_DISPLAY} 元 ≠ 你的钱包余额。它是未兑现的数字，不能提现，也没有进入你的模拟余额。`,
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
    text: '你的账户被风控冻结了，需要先交 300 元解冻费激活通道，激活后本金和收益一起返。',
  },
  {
    id: 'f3',
    from: 'them',
    name: BRAND.groupOwner,
    text: '别的同学都交了，就你还差这一步，别耽误大家结算。',
  },
  {
    id: 'f4',
    from: 'system',
    variant: 'risk',
    text: '提醒：以「冻结、解冻」为由要求继续交钱，是典型的升级风险。此时正确做法是停止付款。',
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
    '头像与自称身份都不等于可信身份。涉及转账时，必须通过独立渠道（如学校官方通知、当面或电话向本人核实）确认对方身份。',
} as const

/** 全局面板中「识骗手册」未结束时的通用内容（不剧透本局复盘）。 */
export const MANUAL_GENERAL = {
  title: '识骗手册 · 通用提醒',
  items: [
    {
      title: '先垫钱的兼职，基本可以停在这里',
      body: '正规兼职不会要求你先垫付资金或购买任务。凡是以「完成任务后返还」为名让你先出钱的，都应立即停止。',
    },
    {
      title: '群里的「收益截图」不能作为证据',
      body: '晒收益的往往是同一批人。任何收益都应能在你自己的账户里独立验证，不能只凭聊天记录。',
    },
    {
      title: '页面显示的数字不等于到账',
      body: '平台内显示的「返利」「余额」可能只是页面上的数字，能否真正提现才是关键。',
    },
    {
      title: '「冻结、解冻」是升级风险的信号',
      body: '被要求继续交钱才能解冻提现，说明风险已经升级。此时应停止一切付款。',
    },
    {
      title: '发现自己可能被骗时',
      body: '停止操作，保存聊天与交易记录，通过官方渠道举报并及时报警求助。报警不保证追回损失，但越早处理越有利。',
    },
  ],
  disclaimer: '以上为通用防诈提示，不构成法律意见，也不承诺追回损失。',
} as const
