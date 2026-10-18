import { defineLevel } from '@/game/level'
import type { ChatMessage, ProfileInfo } from '@/game/level'
import { BRAND, CLASSGROUP_MESSAGES, INITIAL_BALANCE, MOM_MESSAGES } from '@/data/levels/shared'

/**
 * 第一关「刷单返利」。
 *
 * 全部金额为**游戏模拟余额**；平台展示金额为未兑现数字，永不计入余额。
 * 数值口径来自 `LEVEL-01.md`：初始 800 → 确认首次垫付后 700 → 确认追加垫付后 400。
 *
 * 本文件是这一关的**唯一**数据来源：节点、转移表、话术、金额、复盘、提醒、
 * 界面文案都在这里。组件与引擎不再引用具体关卡。
 */

/** 首次模拟垫付金额。 */
export const FIRST_PAD_AMOUNT = 100
/** 追加模拟垫付金额。 */
export const EXTRA_PAD_AMOUNT = 300
/** 平台内展示但不可提现的「返利」数字。 */
export const PLATFORM_REBATE_DISPLAY = 130
/** 累计模拟损失上限（两次垫付之和），用于断言。 */
export const MAX_PAID_TOTAL = FIRST_PAD_AMOUNT + EXTRA_PAD_AMOUNT

/** 本关专有的虚构联系人昵称（非真实身份）。 */
export const L1_BRAND = {
  senior: '自称“学姐”的林某',
  groupOwner: '群主·任务派单员',
  group: '校园兼职·日结任务群',
} as const

/** 节点 ID。 */
type L1Node =
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

/** 选项 ID。 */
type L1Option =
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

/**
 * 风险标记。
 *
 * 这个别名不只是文档：它被 `riskTagLabels` 用作键类型，
 * 于是**漏给某个标记写中文名就是编译错误**（复盘页会显示 undefined 的那种 bug）。
 * 「有中文名但没有任何复盘规则引用」这类反向问题由 `validateLevel` 与
 * `tests/levels.spec.ts` 守卫。
 */
export type L1Tag =
  | 'early-reject'
  | 'entered-group'
  | 'reported-in-group'
  | 'viewed-profile'
  | 'saw-pad-request'
  | 'stopped-before-pay'
  | 'paid-100'
  | 'saw-rebate-claim'
  | 'stopped-after-100'
  | 'withdraw-failed'
  | 'asked-freeze-fee'
  | 'stopped-at-freeze'
  | 'asked-extra'
  | 'stopped-before-extra'
  | 'paid-300'

/** 邀请会话消息。 */
const INVITE_MESSAGES: ChatMessage[] = [
  {
    id: 'i1',
    from: 'them',
    name: L1_BRAND.senior,
    text: '学妹你好呀，我是大四的学姐～最近在带一个校园兼职的群，课余做做任务，报酬当天就结',
  },
  {
    id: 'i2',
    from: 'them',
    name: L1_BRAND.senior,
    text: '手机上就能做，先拉你进群看看？不合适随时退',
  },
  {
    id: 'i3',
    from: 'system',
    variant: 'risk',
    text: '对方说是学姐，但这没法证明她是谁。',
  },
]

/** 群聊消息（导出供测试断言「逐条出现」的条数）。 */
export const GROUP_MESSAGES: ChatMessage[] = [
  {
    id: 'g1',
    from: 'them',
    name: L1_BRAND.groupOwner,
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
    name: L1_BRAND.groupOwner,
    text: '名额有限，先垫付的先派单。垫的钱做完一起返给你，走个流程而已',
  },
  {
    id: 'g5',
    from: 'system',
    variant: 'risk',
    text: '群里说「到账」的，也都是他们自己说的。',
  },
]

/** 返利展示消息（导出供测试断言条数）。 */
export const REBATE_MESSAGES: ChatMessage[] = [
  {
    id: 'r1',
    from: 'them',
    name: L1_BRAND.groupOwner,
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
const FREEZE_MESSAGES: ChatMessage[] = [
  {
    id: 'f1',
    from: 'system',
    variant: 'failed',
    text: '提现失败：账户状态异常，收益暂被冻结。',
  },
  {
    id: 'f2',
    from: 'them',
    name: L1_BRAND.groupOwner,
    text: '你账户被风控冻结了，先交 300 解冻费激活通道，激活后本金和收益一起返你',
  },
  {
    id: 'f3',
    from: 'them',
    name: L1_BRAND.groupOwner,
    text: '别的同学都交了，别耽误大家结算',
  },
  {
    id: 'f4',
    from: 'system',
    variant: 'risk',
    text: '要你先交钱才能解冻，这个说法本身就不成立。',
  },
]

/** 对方资料弹层内容（虚构，不含真实个人信息）。 */
const PROFILE_INFO: ProfileInfo = {
  nickname: L1_BRAND.senior,
  account: 'qx_****2048',
  fields: [
    { label: '注册时间', value: '最近 7 天内' },
    { label: '资料完整度', value: '不完整：无学校、无实名信息' },
    { label: '可核验线索', value: '无。无法通过独立渠道确认其身份' },
  ],
  notice: '头像和自称的身份都证明不了什么。真要转账，用别的渠道自己核实一遍。',
}

/** 群主资料弹层内容（虚构；群聊里要转账的那个人）。 */
const PROFILE_INFO_OWNER: ProfileInfo = {
  nickname: L1_BRAND.groupOwner,
  account: 'qx_****7731',
  fields: [
    { label: '注册时间', value: '最近 7 天内' },
    { label: '资料完整度', value: '不完整：无学校、无实名信息' },
    { label: '可核验线索', value: '无。无法通过独立渠道确认其身份' },
  ],
  notice: '头像是风景图，昵称是「群主」，这些都证明不了他是谁。真要转账，用别的渠道自己核实一遍。',
}

export const level01 = defineLevel<L1Node, L1Option>({
  kind: 'playable',

  meta: {
    id: 'level-01',
    order: 1,
    ordinal: '第一关',
    title: '刷单返利',
    category: '网络兼职',
    blurb: '有人拉你进兼职群：先垫 100，做完平台显示返 130。',
    goal: '让你先垫钱的兼职，直接退出并举报。',
    accent: ['#b8864e', '#7d5731'],
    miniPreview: {
      caption: '兼职群 · 128 人',
      glyphs: ['chat', 'wallet', 'manual', 'levels'],
    },
    startNotice: '一位学姐邀请你加入兼职群',
  },

  /** 节点定义。`onEnter` 效果在同一事务内应用，天然只生效一次。 */
  nodes: {
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
  },

  /**
   * 转移表。金额变更只在此处声明，并由 `engine.choose` 事务式应用一次。
   *
   * `label` 是按钮与自动化断言共用的稳定文案；界面直接读它渲染，
   * 不再让场景组件各写一份，避免两处漂移。
   */
  options: {
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
  },

  /** 每个节点可用的选项 ID（顺序即界面展示顺序）。 */
  nodeOptions: {
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
  },

  startNode: 'intro',
  debriefNode: 'debrief',
  initialBalance: INITIAL_BALANCE,
  validBalances: [INITIAL_BALANCE, INITIAL_BALANCE - FIRST_PAD_AMOUNT, INITIAL_BALANCE - MAX_PAID_TOTAL],
  validPlatformDisplays: [0, PLATFORM_REBATE_DISPLAY],
  platformRequiresPaid: [{ display: PLATFORM_REBATE_DISPLAY, minPaid: FIRST_PAD_AMOUNT }],

  pendingRequests: {
    'transfer-100': {
      amount: FIRST_PAD_AMOUNT,
      title: '有一笔待确认',
      confirm: 'confirm-100',
      cancel: 'cancel-100',
    },
    'transfer-300': {
      amount: EXTRA_PAD_AMOUNT,
      title: '有一笔待确认',
      confirm: 'confirm-300',
      cancel: 'cancel-300',
    },
  },

  /** 结局标题与一句话原因。 */
  endings: {
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
  },

  /**
   * 风险标记的中文短名，用于复盘标注。
   *
   * `satisfies Record<L1Tag, string>`：漏掉任何一个标记的中文名都是编译错误
   * （复盘页会显示 undefined 的那种 bug）。多写一个不存在的标记同样报错。
   */
  riskTagLabels: {
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
  } satisfies Record<L1Tag, string>,

  /** 复盘规则：命中任一触发标记即展示。 */
  debriefRules: [
    {
      id: 'invite-refused',
      triggers: ['early-reject'],
      title: '陌生人的兼职邀请',
      observation: '有人加你，说是大四学姐，带校园兼职群，报酬当天结。',
      risk: '「学姐」只是她自己说的。真要骗你，说自己是同校同学成本最低。',
      advice: '学校官方的招聘信息才有用，别人私聊发的兼职先当没看见。',
    },
    {
      id: 'joined-group',
      triggers: ['entered-group'],
      title: '进了兼职群',
      observation: '群里有群主发任务，也有几个人说自己做完了、拿到钱了。',
      risk: '晒收益的很可能就是同一伙人。一群人一起说「真的能赚」，比一个人说更有迷惑性。',
      advice: '别人说赚到钱，不算你也能赚到的证据。',
    },
    {
      id: 'reported-in-group',
      triggers: ['reported-in-group'],
      title: '进群后退出并举报',
      observation: '你进群看了一眼，没接任务就退了，顺手举报。',
      risk: '进群本身没什么，只要没掏钱，损失就是 0。',
      advice: '聊天记录先别删，举报的时候用得上。',
    },
    {
      id: 'profile-check',
      triggers: ['viewed-profile'],
      title: '看过对方资料',
      observation: '账号注册不到一周，资料空着，没有学校也没有实名。',
      risk: '头像和昵称想怎么填就怎么填，这些都不能证明她是谁。',
      advice: '对方是谁，要用另一个渠道去问，别在聊天框里问她自己。',
    },
    {
      id: 'pad-request',
      triggers: ['saw-pad-request'],
      title: '「先垫 100，做完返 130」',
      observation: '群主说先垫 100 接单，做完平台显示返 130。',
      risk: '正常兼职是你干活、对方给钱。要你先出钱的，钱就已经往错的方向走了。',
      advice: '看到「先垫付」三个字就可以退了，不用先垫一笔小的去试试。',
    },
    {
      id: 'paid-first',
      triggers: ['paid-100'],
      title: '你付了第一笔 100',
      observation: '你确认了 100 元垫付，余额从 800 变成 700。',
      risk: '先让你垫一笔小的、再爽快返给你，就是为了让你相信「下一笔也没事」。',
      advice: '已经垫了不代表要继续。现在停，损失就是这 100。',
    },
    {
      id: 'fake-rebate',
      triggers: ['saw-rebate-claim'],
      title: '「平台显示返 130」',
      observation: '群主说你任务过了，平台显示 130 收益，可以接着做更高的。',
      risk: '那个 130 是页面上的字，不是你能用的钱。提不出来，就等于没有。',
      advice: '页面上的数字涨了，不代表你的钱多了。别因为这个继续转。',
    },
    {
      id: 'freeze-fee',
      triggers: ['withdraw-failed', 'asked-freeze-fee'],
      title: '提现失败，要交「解冻费」',
      observation: '提现失败、收益被冻结，群主让你交 300 解冻费激活通道。',
      risk: '这就是同一件事的第二步：先让你拿不到，再让你为「拿到」付更多钱。',
      advice: '别再往里转钱，交了解冻费也不会到账。',
    },
    {
      id: 'extra-request',
      triggers: ['asked-extra'],
      title: '又要追加 300',
      observation: '你看到一笔 300 的追加垫付请求。',
      risk: '已经付过一轮了还要你再付，说明对面要的不是你完成任务，是你的钱。',
      advice: '不追加。之前付的钱，不会因为你再付一笔就变得能提现。',
    },
    {
      id: 'paid-extra',
      triggers: ['paid-300'],
      title: '你付了追加的 300',
      observation: '你确认了 300 元垫付，余额变成 400，累计出去 400。',
      risk: '多付的这一笔没换来任何东西，提现还是失败。',
      advice: '现在就停手。已经出去的 400 是损失，再付只会更多。',
    },
    {
      id: 'stopped-before-pay',
      triggers: ['stopped-before-pay'],
      title: '你在付款前退出了',
      observation: '到了转账页，你选择取消，没付。',
      risk: '在掏钱之前停下来，是最省事的止损。',
      advice: '以后也一样：对方让你先出钱，就没必要再聊下去。',
    },
    {
      id: 'stopped-after-100',
      triggers: ['stopped-after-100'],
      title: '你在付了 100 之后停手',
      observation: '平台显示 130 之后，你选择停下来，没有再往里转。',
      risk: '你没被那个数字带着继续走，这一步省下了后面的 300。',
      advice: '这 100 就是这局的损失。现实里遇到同样的事，停手之后记得保存记录。',
    },
    {
      id: 'stopped-at-freeze',
      triggers: ['stopped-at-freeze'],
      title: '提现失败时你停手了',
      observation: '对方让你交解冻费，你没交，选择保存证据。',
      risk: '这是最容易被带着走的一步，你在这里停住了。',
      advice: '保存好聊天和转账记录，通过官方渠道举报，需要的话报警求助。',
    },
    {
      id: 'stopped-before-extra',
      triggers: ['stopped-before-extra'],
      title: '追加那笔你取消了',
      observation: '看到 300 的追加请求，你选择取消，没付。',
      risk: '再付一笔也不会让之前的钱能提现，取消是对的。',
      advice: '接下来把精力放在两件事上：留证据、走举报渠道。',
    },
  ],

  /** 结尾给出的可执行建议（不承诺追回）。 */
  debriefActions: [
    '别再加钱。对方还在要，就是直接不回。',
    '截图留好聊天记录、转账记录和对方账号，别删对话。',
    '通过官方渠道举报，必要时报警。报警不保证追回，但越早越好。',
  ],

  /** 节点 → 反诈提醒正文（≤70 字）。 */
  reminders: {
    invite:
      '有人自称学姐拉你进兼职群？先别急着答应。正规兼职不会通过陌生私聊招人，更不会让你先垫钱。',
    group:
      '刷单返利是当前高发的诈骗类型。凡是要求你先垫付、再返还的任务，都是诈骗，没有例外。',
    'transfer-100':
      '你正在向陌生账户支付「任务垫付款」。这类转账一旦完成，资金极难追回。转账前请再确认一次。',
    rebate:
      '平台里显示的收益只是页面上的数字，能不能提现才是关键。不要因为「收益在涨」而继续转账。',
    freeze:
      '以「账户冻结、需交解冻费」为由要求继续转账，是刷单诈骗的固定套路。请立即停止付款。',
    'transfer-300': '要求追加转账才能解冻提现，属于二次诈骗。请立即停止，不要再支付任何费用。',
    'end-clear': '你识别并拒绝了可疑的兼职邀请。遇到同类情况，保留证据并通过官方渠道举报。',
    'end-stop':
      '你已经停止付款，这是止损最关键的一步。请保存聊天与转账记录，通过官方渠道报警求助。',
    'end-loss':
      '如果已经转账，请立即停止一切付款，保存聊天与转账记录，通过官方渠道举报并及时报警求助。',
  },

  /*
   * 用弹窗而不是横幅的节点：**三个真的要掏钱的时刻**。
   *
   * `transfer-100`（首次垫付）、`freeze`（被要求交解冻费）、`transfer-300`（追加垫付）
   * —— 这三个节点上玩家正要把钱转出去；横幅只停留几秒、还可能被下一条通知顶掉，
   * 拦不住人。其余节点（邀请、进群、返利展示、结局）仍是横幅：
   * 弹窗多了玩家就开始无脑点「知道了」，等于没弹。
   */
  popupReminders: ['transfer-100', 'freeze', 'transfer-300'],

  copy: {
    balanceLabel: '生活费',
    spentLabel: '已垫付',
    pendingHint: '有一笔 {n} 元等着你处理。走开不算付，也不算取消。',
    platformLabel: '平台内显示',
    platformChatNote: (balance) => `页面上的数字，提不出来。钱包还是 ${balance} 元。`,
    platformWalletNote: '这笔显示在平台里，取不出来，也不在上面那笔余额里。',
    resume: {
      intro: '开始体验',
      invite: '有人拉你进兼职群',
      group: '回群里看看',
      'transfer-100': '有一笔 100 元等你处理',
      rebate: '看看任务结果',
      freeze: '提现出了点问题',
      'transfer-300': '有一笔 300 元等你处理',
      'end-clear': '看本局结果与复盘',
      'end-stop': '看本局结果与复盘',
      'end-loss': '看本局结果与复盘',
      debrief: '看本局结果与复盘',
    },
    resumeFallback: '继续当前事项',
  },

  /** 模拟收支记录：完全由状态推导，不单独存储。 */
  walletRecords: (state) => {
    const list: { label: string; amount: number }[] = [
      // 与青讯里妈妈的转账卡片对应：800 元有明确来源，不是凭空出现的数字。
      { label: '妈妈转来的生活费', amount: INITIAL_BALANCE },
    ]
    if (state.paidTotal >= FIRST_PAD_AMOUNT) list.push({ label: '垫付 · 第一单', amount: -FIRST_PAD_AMOUNT })
    if (state.paidTotal >= MAX_PAID_TOTAL) list.push({ label: '垫付 · 解冻费', amount: -EXTRA_PAD_AMOUNT })
    return list
  },

  chat: {
    /** 会话列表（顺序即展示顺序；taskgroup 在玩家进群后才出现）。 */
    sessions: [
      {
        id: 'senior',
        kind: 'private',
        name: L1_BRAND.senior,
        lastTime: '10:26',
        messages: INVITE_MESSAGES,
      },
      {
        id: 'taskgroup',
        kind: 'group',
        name: L1_BRAND.group,
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
    ],

    /**
     * 兼职群只有在玩家真的「进群看看」之后才出现在列表里 ——
     * 进群是剧情里的一个明确选择（`entered-group`），没进之前不该能看到群里的话术。
     */
    hiddenAt: { taskgroup: ['intro', 'invite'] },

    /*
     * 班级通知群在固定消息之后追加一组**随机**的反诈通知（每关每局抽一批）。
     * 见 `app/classNews.ts`：抽到哪几条由关卡 id 与本次会话的随机种子决定，
     * 一局之内稳定，重新打开页面才会换。
     */
    newsSession: 'classgroup',

    /** 群聊会话按剧情节点追加返利 / 提现异常卡片。 */
    extraMessages: {
      rebate: [{ session: 'taskgroup', messages: REBATE_MESSAGES }],
      freeze: [
        { session: 'taskgroup', messages: REBATE_MESSAGES },
        { session: 'taskgroup', messages: FREEZE_MESSAGES },
      ],
    },

    /** 剧情选项归属的会话：邀请属于学姐私聊，群聊相关属于兼职群。 */
    optionSession: {
      invite: 'senior',
      group: 'taskgroup',
      rebate: 'taskgroup',
      freeze: 'taskgroup',
    },

    /** 打开消息应用时应定位到的会话。 */
    preferredSession: {
      invite: 'senior',
      group: 'taskgroup',
      rebate: 'taskgroup',
      freeze: 'taskgroup',
      'transfer-100': 'taskgroup',
      'transfer-300': 'taskgroup',
    },

    /**
     * 渲染为次要按钮的选项（其余为主要按钮）。
     *
     * `view-profile` 不在其中：它由标题栏的「···」入口触发，
     * 列在下面的 `hiddenOptions` 里，因此底部操作区只有两个按钮 ——
     * 与第一关原先的行为一致。
     */
    secondaryOptions: ['reject-invite', 'report-group', 'cancel-100', 'stop-after-100', 'stop-at-freeze', 'cancel-300'],

    /** 由资料入口触发，不作为底部按钮渲染。 */
    hiddenOptions: ['view-profile'],

    /** 群聊看群主，私聊看对方；打开时记录一次线索（余额不变）。 */
    profile: [
      { session: 'taskgroup', option: 'view-profile' },
      { session: 'senior' },
    ],

    profiles: {
      senior: PROFILE_INFO,
      taskgroup: PROFILE_INFO_OWNER,
    },

    /** 未处理的学姐邀请在列表里有未读角标。 */
    unread: { invite: 'senior' },
  },
})
