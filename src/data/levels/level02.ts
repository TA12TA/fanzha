import { defineLevel } from '@/game/level'
import type { ChatMessage, ProfileInfo } from '@/game/level'
import { BRAND, CLASSGROUP_MESSAGES, INITIAL_BALANCE, MOM_MESSAGES } from '@/data/levels/shared'

/**
 * 第二关「冒充客服退款」。
 *
 * 剧本：同一部手机、同一名学生。在虚构购物平台「青集商城」买了一双鞋 199 元，
 * 收到「客服」消息说订单异常重复扣款、要给她退款。
 *
 * 数值口径（唯一）：初始 800 → 确认「账户验证金 200」后 600 → 确认「保证金 300」后 300。
 * 平台里显示的「退款 199 · 已受理」是**未兑现数字**，永不计入余额。
 *
 * 与第一关并列，不是同一笔钱的连续消耗：每关都从 800 开始，
 * 否则数值口径会变成排列组合，玩家没法核对，测试也没法写死。
 */

/** 订单金额（虚构）。 */
export const ORDER_AMOUNT = 199
/** 第一次「账户验证金」。 */
export const VERIFY_AMOUNT = 200
/** 第二次「保证金」。 */
export const DEPOSIT_AMOUNT = 300
/** 本关累计模拟损失上限。 */
export const L2_MAX_PAID_TOTAL = VERIFY_AMOUNT + DEPOSIT_AMOUNT

/** 本关专有的虚构联系人昵称（非真实身份）。 */
export const L2_BRAND = {
  service: '青集商城·客服',
  platform: '青集商城',
} as const

/** 节点 ID。 */
type L2Node =
  | 'intro'
  | 'l2-contact' // 客服私聊：订单异常要退款
  | 'l2-verify-1' // 首次待确认：账户验证金 200
  | 'l2-refund-claim' // 退款进度 + 索要验证码
  | 'l2-verify-2' // 二次验证失败 + 征信威胁 + 要 300
  | 'l2-verify-3' // 追加待确认：保证金 300
  | 'l2-end-clear'
  | 'l2-end-stop'
  | 'l2-end-loss'
  | 'debrief'

/** 选项 ID。 */
type L2Option =
  | 'start'
  | 'l2-cooperate'
  | 'l2-refuse'
  | 'l2-check-order'
  | 'l2-confirm-200'
  | 'l2-cancel-200'
  | 'l2-continue'
  | 'l2-stop'
  | 'l2-accept-300'
  | 'l2-refuse-300'
  | 'l2-confirm-300'
  | 'l2-cancel-300'
  | 'review'
  | 'restart'

/**
 * 风险标记。
 *
 * 与第一关同样的用法：`riskTagLabels` 用它作键类型，
 * 漏写中文名或写错标记名都是编译错误。
 */
export type L2Tag =
  | 'l2-early-refuse'
  | 'l2-checked-order'
  | 'l2-cooperated'
  | 'l2-paid-200'
  | 'l2-saw-refund-claim'
  | 'l2-asked-code'
  | 'l2-stopped-after-200'
  | 'l2-credit-threat'
  | 'l2-asked-300'
  | 'l2-stopped-before-300'
  | 'l2-paid-300'
  | 'l2-stopped-before-pay'

/** 客服私聊：先给订单，再提退款，最后才说「验证金」。 */
const CONTACT_MESSAGES: ChatMessage[] = [
  {
    id: 's1',
    from: 'them',
    name: L2_BRAND.service,
    text: '同学你好，我是青集商城客服。你的订单有一笔重复扣款，这边要给你退回去。',
  },
  {
    id: 's2',
    from: 'them',
    name: L2_BRAND.service,
    variant: 'order',
    orderTitle: '轻跑运动鞋 · 白色 42 码',
    orderAmount: ORDER_AMOUNT,
    orderStatus: '已完成 · 已签收',
    text: '订单信息',
  },
  {
    id: 's3',
    from: 'them',
    name: L2_BRAND.service,
    text: `系统升级导致重复扣款，要给你退 ${ORDER_AMOUNT}。走的是官方通道，不用你操作别的。`,
  },
  {
    id: 's4',
    from: 'them',
    name: L2_BRAND.service,
    text: `不过你的账户等级不够，退款前要先做一次账户验证：转入 ${VERIFY_AMOUNT} 元验证金，验证完立刻原路退回。`,
  },
  {
    id: 's5',
    from: 'system',
    variant: 'risk',
    text: '真客服不会让你先转账验证。退款是钱进你的账户，不用你先出钱。',
  },
]

/** 退款进度与索要验证码。 */
const REFUND_MESSAGES: ChatMessage[] = [
  {
    id: 'rf1',
    from: 'them',
    name: L2_BRAND.service,
    text: '验证金收到了，退款正在处理。',
  },
  {
    id: 'rf2',
    from: 'them',
    name: L2_BRAND.service,
    variant: 'refund',
    refundAmount: ORDER_AMOUNT,
    refundStatus: '已受理，等待入账',
    text: '退款进度',
  },
  {
    id: 'rf3',
    from: 'them',
    name: L2_BRAND.service,
    text: '但是系统显示你的账户风控等级不够，钱卡在中转账户里出不来，需要再验证一次。',
  },
  {
    id: 'rf4',
    from: 'them',
    name: L2_BRAND.service,
    text: '你把手收到的短信验证码发我，我这边帮你把通道打开。',
  },
  /*
   * 这里原本还有一条系统风险气泡（「页面上的退款进度不是你的余额。验证码给出去，
   * 等于把账户交出去。」）。按用户要求，这类**宣导式提示**已搬进「国家反诈中心」
   * 的弹窗（见本关 `popupReminders` 与该节点的 `reminders` 文案）——
   * 聊天里只留对话，判断依据集中到那个弹窗上，不要两头各说一遍。
   */
]

/** 二次验证失败 + 征信威胁。 */
const VERIFY2_MESSAGES: ChatMessage[] = [
  {
    id: 'v1',
    from: 'them',
    name: L2_BRAND.service,
    text: `二次验证失败了，需要 ${DEPOSIT_AMOUNT} 元保证金刷一下流水，处理完连同前面的钱一起退回。`,
  },
  {
    id: 'v2',
    from: 'them',
    name: L2_BRAND.service,
    text: '不处理的话会影响你的征信和购物额度，你自己想清楚，别耽误时间。',
  },
  {
    id: 'v3',
    from: 'system',
    variant: 'risk',
    text: '拿征信吓你是话术。真机构不会用这种方式让你转钱。',
  },
]

/**
 * 客服资料：**故意写成看起来很正常**。
 *
 * 教学点：资料完整、注册时间久，都不代表这次对话是真的。
 * 骗子可以盗用或仿冒一个看起来正常的账号，所以「看资料」在这类骗局里
 * 不能当作安全证据 —— 判断依据应该是「退款要不要你先转钱」。
 */
const PROFILE_INFO_SERVICE: ProfileInfo = {
  nickname: L2_BRAND.service,
  account: 'qj_****6612',
  fields: [
    { label: '注册时间', value: '3 年前' },
    { label: '认证状态', value: '已通过企业认证（显示如此）' },
    { label: '可核验线索', value: '无。聊天里的认证标记不能证明这次对话是真的' },
  ],
  notice:
    '资料看起来正常，也不代表这次对话是真的。账号可以仿冒或被盗用，判断依据是它让你做什么，而不是它看起来像谁。',
}

/** 订单详情弹层：玩家自己查一遍，就知道没有所谓的重复扣款。 */
const ORDER_DETAIL = {
  nodes: ['l2-contact'] as L2Node[],
  option: 'l2-check-order' as L2Option,
  title: '订单详情',
  fields: [
    { label: '订单状态', value: '已完成 · 已签收' },
    { label: '订单金额', value: `¥${ORDER_AMOUNT}` },
    { label: '支付方式', value: '安心钱包余额' },
    { label: '重复扣款记录', value: '无。只有这一笔正常扣款' },
  ],
  notice: '自己查过订单，就知道没有所谓的重复扣款。客服说的和 App 里显示的不一样时，以你自己查到的为准。',
}

export const level02 = defineLevel<L2Node, L2Option>({
  kind: 'playable',

  meta: {
    id: 'level-02',
    order: 2,
    ordinal: '第二关',
    title: '冒充客服退款',
    category: '冒充客服',
    blurb: '「客服」说你订单重复扣款要退款，但要你先转一笔验证金。',
    goal: '正常退款不会先让你转钱，也不会要短信验证码。',
    accent: ['#3f7f6b', '#255446'],
    miniPreview: {
      caption: '青集商城 · 客服',
      glyphs: ['shop', 'sms', 'wallet', 'manual'],
    },
    startNotice: '「青集商城客服」说你的订单重复扣款',
  },

  nodes: {
    intro: { id: 'intro' },
    'l2-contact': { id: 'l2-contact' },
    'l2-verify-1': { id: 'l2-verify-1' },
    'l2-refund-claim': {
      id: 'l2-refund-claim',
      onEnter: {
        addTags: ['l2-saw-refund-claim', 'l2-asked-code'],
        platformDisplay: ORDER_AMOUNT,
      },
    },
    'l2-verify-2': {
      id: 'l2-verify-2',
      onEnter: { addTags: ['l2-credit-threat', 'l2-asked-300'] },
    },
    'l2-verify-3': { id: 'l2-verify-3' },
    'l2-end-clear': { id: 'l2-end-clear', ending: 'l2-end-clear' },
    'l2-end-stop': { id: 'l2-end-stop', ending: 'l2-end-stop' },
    'l2-end-loss': { id: 'l2-end-loss', ending: 'l2-end-loss' },
    debrief: { id: 'debrief' },
  },

  options: {
    start: {
      id: 'start',
      label: '开始体验',
      from: 'intro',
      to: 'l2-contact',
      hint: '进入虚构手机桌面',
    },
    'l2-cooperate': {
      id: 'l2-cooperate',
      label: '按他说的做',
      from: 'l2-contact',
      to: 'l2-verify-1',
      effect: { addTags: ['l2-cooperated'] },
    },
    'l2-refuse': {
      id: 'l2-refuse',
      label: '先不办，自己查一下',
      from: 'l2-contact',
      to: 'l2-end-clear',
      effect: { addTags: ['l2-early-refuse'] },
    },
    'l2-check-order': {
      id: 'l2-check-order',
      label: '订单详情',
      from: 'l2-contact',
      to: 'l2-contact',
      // 效果本身幂等（标记去重），因此可反复打开而不产生额外影响。
      effect: { addTags: ['l2-checked-order'] },
      hint: '打开订单详情，只记录一次线索，不影响余额',
    },
    'l2-confirm-200': {
      id: 'l2-confirm-200',
      label: `确认转出 ${VERIFY_AMOUNT} 元`,
      from: 'l2-verify-1',
      to: 'l2-refund-claim',
      effect: {
        balanceDelta: -VERIFY_AMOUNT,
        paidDelta: VERIFY_AMOUNT,
        addTags: ['l2-paid-200'],
        once: true,
      },
    },
    'l2-cancel-200': {
      id: 'l2-cancel-200',
      label: '取消，不转',
      from: 'l2-verify-1',
      to: 'l2-end-stop',
      effect: { addTags: ['l2-stopped-before-pay'] },
    },
    'l2-continue': {
      id: 'l2-continue',
      label: '继续按他说的做',
      from: 'l2-refund-claim',
      to: 'l2-verify-2',
    },
    'l2-stop': {
      id: 'l2-stop',
      label: '停下来，自己查订单',
      from: 'l2-refund-claim',
      to: 'l2-end-stop',
      effect: { addTags: ['l2-stopped-after-200'] },
    },
    'l2-accept-300': {
      id: 'l2-accept-300',
      label: '查看这笔保证金',
      from: 'l2-verify-2',
      to: 'l2-verify-3',
    },
    'l2-refuse-300': {
      id: 'l2-refuse-300',
      label: '停止操作并保留证据',
      from: 'l2-verify-2',
      to: 'l2-end-stop',
      effect: { addTags: ['l2-stopped-before-300'] },
    },
    'l2-confirm-300': {
      id: 'l2-confirm-300',
      label: `确认转出 ${DEPOSIT_AMOUNT} 元`,
      from: 'l2-verify-3',
      to: 'l2-end-loss',
      effect: {
        balanceDelta: -DEPOSIT_AMOUNT,
        paidDelta: DEPOSIT_AMOUNT,
        addTags: ['l2-paid-300'],
        once: true,
      },
    },
    'l2-cancel-300': {
      id: 'l2-cancel-300',
      label: '取消，不再转钱',
      from: 'l2-verify-3',
      to: 'l2-end-stop',
      effect: { addTags: ['l2-stopped-before-300'] },
    },
    review: {
      id: 'review',
      label: '看复盘',
      from: 'l2-end-clear',
      to: 'debrief',
      hint: '结局和复盘都可以离开，随时从桌面或国家反诈中心再次进入',
    },
    restart: {
      id: 'restart',
      label: '再玩一次',
      from: 'debrief',
      to: 'intro',
      effect: { reset: true },
    },
  },

  nodeOptions: {
    intro: ['start'],
    'l2-contact': ['l2-cooperate', 'l2-refuse', 'l2-check-order'],
    'l2-verify-1': ['l2-confirm-200', 'l2-cancel-200'],
    'l2-refund-claim': ['l2-continue', 'l2-stop'],
    'l2-verify-2': ['l2-accept-300', 'l2-refuse-300'],
    'l2-verify-3': ['l2-confirm-300', 'l2-cancel-300'],
    'l2-end-clear': ['review'],
    'l2-end-stop': ['review'],
    'l2-end-loss': ['review'],
    debrief: ['restart'],
  },

  startNode: 'intro',
  debriefNode: 'debrief',
  initialBalance: INITIAL_BALANCE,
  validBalances: [INITIAL_BALANCE, INITIAL_BALANCE - VERIFY_AMOUNT, INITIAL_BALANCE - L2_MAX_PAID_TOTAL],
  validPlatformDisplays: [0, ORDER_AMOUNT],
  platformRequiresPaid: [{ display: ORDER_AMOUNT, minPaid: VERIFY_AMOUNT }],

  /*
   * 模拟验证码环节：落在 `l2-refund-claim`（「把短信验证码发我」那一步）。
   *
   * 设计说明：
   * - 短信由**本游戏自己的通知**弹出（发送方用虚构品牌「安心钱包」），
   *   每次索要都是新的 6 位数字，输错会再发一条新的 —— 真实骗局里也是这样
   *   （对方要你"再念一遍刚刚那条"，因为过期了）。
   * - 短信正文里那句「请勿转发给他人」是真实短信的原文，**故意保留**：
   *   玩家正是在这一句之后把码发出去的，这正是本关要教的点。
   * - 输错时对方的语气必须平和。现实中的骗子在这一步通常很有"耐心"，
   *   不会一上来就恐吓 —— 恐吓留到后面要钱的时候。
   */
  codeGate: {
    'l2-refund-claim': {
      sender: '安心钱包',
      smsTemplate: '【安心钱包】校验码 {code}，正在解冻账户风控。请勿转发给他人。',
      prompt: '收到没？念给我就行，我这边帮你打开通道。',
      onCorrect: 'l2-continue',
      retryLine: '好像不太对哦，你再看一下刚刚那条短信？我这边再发一条新的给你。',
    },
  },

  pendingRequests: {
    'l2-verify-1': {
      amount: VERIFY_AMOUNT,
      title: '有一笔待确认',
      confirm: 'l2-confirm-200',
      cancel: 'l2-cancel-200',
    },
    'l2-verify-3': {
      amount: DEPOSIT_AMOUNT,
      title: '有一笔待确认',
      confirm: 'l2-confirm-300',
      cancel: 'l2-cancel-300',
    },
  },

  endings: {
    'l2-end-clear': {
      title: '提前识破',
      reason: '退款是钱进你的账户，不需要你先转钱去「验证」。',
    },
    'l2-end-stop': {
      title: '及时止损',
      reason: '你停在了继续转钱之前，这是最有用的一步。',
    },
    'l2-end-loss': {
      title: '越退越亏',
      reason: '为了拿回 199，又转出去 500 —— 钱只会往一个方向走。',
    },
  },

  riskTagLabels: {
    'l2-early-refuse': '拒绝了要你先转账的「客服」',
    'l2-checked-order': '自己查了订单',
    'l2-cooperated': '答应按「客服」说的做',
    'l2-paid-200': '转出了 200 验证金',
    'l2-saw-refund-claim': '看到「退款已受理」',
    'l2-asked-code': '被索要短信验证码',
    'l2-stopped-after-200': '转出 200 后停手',
    'l2-credit-threat': '被拿征信威胁',
    'l2-asked-300': '被要 300 保证金',
    'l2-stopped-before-300': '第二次要钱时停手',
    'l2-paid-300': '转出了 300 保证金',
    'l2-stopped-before-pay': '转账前退出',
  } satisfies Record<L2Tag, string>,

  debriefRules: [
    {
      id: 'l2-refuse',
      triggers: ['l2-early-refuse'],
      title: '「客服」说要给你退款',
      observation: '对方说订单重复扣款，要退你 199，但先要你转 200 验证金。',
      risk: '退钱是钱往你这边走。任何「先转一笔才能退」的说法，方向就已经反了。',
      advice: '退款、退货一律在购物 App 里自己操作，不用听电话或私聊里的指引。',
    },
    {
      id: 'l2-order-check',
      triggers: ['l2-checked-order'],
      title: '你自己查了订单',
      observation: '订单详情里只有一笔正常的 199 元扣款，没有所谓的重复扣款。',
      risk: '对方说的和 App 里显示的对不上 —— 这就是最直接的破绽。',
      advice: '以后也这样：对方越急，越要回到官方 App 里自己看一眼。',
    },
    {
      id: 'l2-cooperated',
      triggers: ['l2-cooperated'],
      title: '你答应按他说的做',
      observation: '对方把流程说得很正规：官方通道、验证完立刻退回。',
      risk: '话术越完整越像真的，但「要你先出钱」这一条就否掉了全部。',
      advice: '遇到「验证金」「保证金」「刷流水」这类名目，直接结束对话。',
    },
    {
      id: 'l2-paid-200',
      triggers: ['l2-paid-200'],
      title: '你转出了 200 验证金',
      observation: '你确认转出 200 元，余额从 800 变成 600。',
      risk: '这笔钱一出去就不再由你控制，而对方已经拿到了第一笔。',
      advice: '已经转了不代表要继续。现在停，损失就是这 200。',
    },
    {
      id: 'l2-refund-claim',
      triggers: ['l2-saw-refund-claim'],
      title: '「退款已受理，等待入账」',
      observation: '平台里显示退款 199 已受理，但你的余额还是 600。',
      risk: '页面上的进度不是你的钱。它只是一个数字，想写多少写多少。',
      advice: '判断标准只有一个：钱有没有进你自己的账户。',
    },
    {
      id: 'l2-code',
      triggers: ['l2-asked-code'],
      title: '对方索要短信验证码',
      observation: '对方说帮你「打开通道」，让你把收到的短信验证码发过去。',
      risk: '验证码是账户的最后一道锁。谁拿到它，谁就能动你的账户。',
      advice: '验证码不给任何人，包括自称客服、银行、公安的人。',
    },
    {
      id: 'l2-stopped-after-200',
      triggers: ['l2-stopped-after-200'],
      title: '转出 200 之后你停手了',
      observation: '看到「退款已受理」之后，你选择停下来，没有再转。',
      risk: '你没有被那个进度条带着继续走，这一步省下了后面的 300。',
      advice: '这 200 就是这局的损失。停手之后记得保存记录。',
    },
    {
      id: 'l2-credit-threat',
      triggers: ['l2-credit-threat'],
      title: '拿征信和额度吓你',
      observation: '对方说不处理会影响你的征信和购物额度。',
      risk: '拿征信施压是固定话术。真正的机构不会用这种方式催你转账。',
      advice: '被吓到的时候先停手。征信有没有问题，去官方渠道自己查。',
    },
    {
      id: 'l2-asked-300',
      triggers: ['l2-asked-300'],
      title: '又要 300 保证金',
      observation: '第一次的钱还没回来，对方又要 300 元「保证金刷流水」。',
      risk: '已经收过一笔还要再收，说明对面要的不是帮你退款，是你的钱。',
      advice: '不追加。前面转出去的钱，不会因为你再转一笔就能回来。',
    },
    {
      id: 'l2-stopped-before-300',
      triggers: ['l2-stopped-before-300'],
      title: '第二次要钱时你停手了',
      observation: '看到 300 元保证金的要求，你选择停手并保留证据。',
      risk: '这是最容易被带着走的一步，你在这里停住了。',
      advice: '保存好聊天和转账记录，通过官方渠道举报，需要的话报警求助。',
    },
    {
      id: 'l2-paid-300',
      triggers: ['l2-paid-300'],
      title: '你转出了 300 保证金',
      observation: '你确认转出 300 元，余额变成 300，累计出去 500。',
      risk: '多转的这一笔没有换来任何东西，退款还是没到账。',
      advice: '现在就停手。已经出去的 500 是损失，再转只会更多。',
    },
    {
      id: 'l2-stopped-before-pay',
      triggers: ['l2-stopped-before-pay'],
      title: '你在付款前退出了',
      observation: '到了转账页，你选择取消，没转。',
      risk: '在掏钱之前停下来，是最省事的止损。',
      advice: '以后也一样：对方让你先出钱，就没必要再聊下去。',
    },
  ],

  debriefActions: [
    '别再加钱。对方还在要，就是直接不回。',
    '截图留好聊天记录、转账记录和对方账号，别删对话。',
    '退款、退货只在购物 App 里自己操作；通过官方渠道举报，必要时报警。',
  ],

  reminders: {
    'l2-contact':
      '自称客服说要给你退款，却让你先转「验证金」——退款不需要你先出钱。请先停下来核实。',
    'l2-verify-1':
      '你正在向陌生账户转账「账户验证金」。正规退款不会要求你先付款，也不会要你的验证码。',
    'l2-refund-claim':
      '页面上的退款进度不是你的余额。验证码给出去，等于把账户交出去。请立即停止。',
    'l2-verify-2':
      '以「影响征信」施压要求转账是典型话术。征信问题只能通过官方渠道查询，不要因此转账。',
    'l2-verify-3': '要求追加转账才能拿到退款，属于二次诈骗。请立即停止，不要再支付任何费用。',
    'l2-end-clear': '你识别并拒绝了假冒客服的退款要求。遇到同类情况，保留证据并通过官方渠道举报。',
    'l2-end-stop':
      '你已经停止付款，这是止损最关键的一步。请保存聊天与转账记录，通过官方渠道报警求助。',
    'l2-end-loss':
      '如果已经转账，请立即停止一切付款，保存聊天与转账记录，通过官方渠道举报并及时报警求助。',
  },

  /*
   * 用弹窗而不是横幅的节点：**索要验证码这一步**。
   *
   * 这一步是整关的分水岭 —— 把码给出去，账户就等于交出去了。横幅只停留几秒、
   * 还可能被下一条通知顶掉；这里必须让玩家停下来读一次。
   * 其余节点仍然是横幅：弹窗多了玩家就开始无脑点「知道了」。
   */
  popupReminders: ['l2-refund-claim'],

  copy: {
    balanceLabel: '生活费',
    spentLabel: '已转出',
    pendingHint: '有一笔 {n} 元等着你处理。走开不算付，也不算取消。',
    platformLabel: '平台内显示',
    platformChatNote: (balance) => `页面上的进度不是你的余额。钱包还是 ${balance} 元。`,
    platformWalletNote: '这笔退款显示在平台里，还没到你账上，也不在上面那笔余额里。',
    resume: {
      intro: '开始体验',
      'l2-contact': '「客服」说要给你退款',
      'l2-verify-1': '有一笔 200 元等你处理',
      'l2-refund-claim': '看看退款到哪一步了',
      'l2-verify-2': '验证失败了',
      'l2-verify-3': '有一笔 300 元等你处理',
      'l2-end-clear': '看本局结果与复盘',
      'l2-end-stop': '看本局结果与复盘',
      'l2-end-loss': '看本局结果与复盘',
      debrief: '看本局结果与复盘',
    },
    resumeFallback: '继续当前事项',
  },

  walletRecords: (state) => {
    const list: { label: string; amount: number }[] = [
      { label: '妈妈转来的生活费', amount: INITIAL_BALANCE },
    ]
    if (state.paidTotal >= VERIFY_AMOUNT) list.push({ label: '转出 · 账户验证金', amount: -VERIFY_AMOUNT })
    if (state.paidTotal >= L2_MAX_PAID_TOTAL) {
      list.push({ label: '转出 · 保证金', amount: -DEPOSIT_AMOUNT })
    }
    return list
  },

  chat: {
    sessions: [
      {
        id: 'l2-service',
        kind: 'private',
        name: L2_BRAND.service,
        lastTime: '14:02',
        messages: CONTACT_MESSAGES,
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

    /*
     * 班级通知群在固定消息之后追加一组**随机**的反诈通知（每关每局抽一批）。
     * 见 `app/classNews.ts`：抽到哪几条由关卡 id 与本次会话的随机种子决定，
     * 一局之内稳定，重新打开页面才会换。
     */
    newsSession: 'classgroup',

    extraMessages: {
      'l2-refund-claim': [{ session: 'l2-service', messages: REFUND_MESSAGES }],
      'l2-verify-2': [
        { session: 'l2-service', messages: REFUND_MESSAGES },
        { session: 'l2-service', messages: VERIFY2_MESSAGES },
      ],
      'l2-verify-3': [
        { session: 'l2-service', messages: REFUND_MESSAGES },
        { session: 'l2-service', messages: VERIFY2_MESSAGES },
      ],
      'l2-end-loss': [
        { session: 'l2-service', messages: REFUND_MESSAGES },
        { session: 'l2-service', messages: VERIFY2_MESSAGES },
      ],
    },

    optionSession: {
      'l2-contact': 'l2-service',
      'l2-refund-claim': 'l2-service',
      'l2-verify-2': 'l2-service',
    },

    preferredSession: {
      'l2-contact': 'l2-service',
      'l2-verify-1': 'l2-service',
      'l2-refund-claim': 'l2-service',
      'l2-verify-2': 'l2-service',
      'l2-verify-3': 'l2-service',
    },

    /** 平台展示的退款数字只在客服会话里出现。 */
    platformSession: 'l2-service',

    safeOptions: ['l2-refuse', 'l2-cancel-200', 'l2-stop', 'l2-refuse-300', 'l2-cancel-300'],

    /**
     * 这两个选项由界面上的专门入口触发，不作为底部按钮渲染：
     * - `l2-check-order`：标题栏的「订单详情」
     * - `view-profile`（第一关）：标题栏的「···」
     * 它们仍然是合法的剧情选项（会记录一次线索），只是不占底部操作区。
     */
    hiddenOptions: ['l2-check-order'],

    profile: [{ session: 'l2-service' }],

    profiles: { 'l2-service': PROFILE_INFO_SERVICE },

    detailSheet: ORDER_DETAIL,
  },
})
