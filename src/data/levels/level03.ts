import { defineLevel } from '@/game/level'
import type { ChatMessage, ProfileInfo } from '@/game/level'
import { BRAND, CLASSGROUP_MESSAGES, INITIAL_BALANCE, MOM_MESSAGES } from '@/data/levels/shared'

/**
 * 第三关「冒充公检法」。
 *
 * 剧本：一个自称青屏市公安局刑侦支队的人通过青讯联系学生，发来一份只在聊天里
 * 出现的「协查通知」，要求配合“资金核查”，随后要求屏幕共享、转入“安全账户”，
 * 再以“取保候审”为由要第二笔钱。
 *
 * 数值口径（唯一）：初始 800 → 确认「资金核查 500」后 300 → 确认「保证金 300」后 0。
 * 本关没有平台退款数字；所有扣款都由待确认请求触发一次。
 *
 * 内容边界：不出现真实办案单位、警号、案号、通缉令样式、真实账号、链接、
 * 二维码或屏幕共享操作步骤；只呈现“对方提出要求”和玩家的选择。
 */

/** 第一次「资金核查」金额。 */
export const L3_FUND_CHECK_AMOUNT = 500
/** 第二次「取保候审保证金」金额。 */
export const L3_BAIL_AMOUNT = 300
/** 本关累计模拟损失上限。 */
export const L3_MAX_PAID_TOTAL = L3_FUND_CHECK_AMOUNT + L3_BAIL_AMOUNT

/** 本关专有的虚构联系人昵称（非真实身份）。 */
export const L3_BRAND = {
  officer: '青屏市公安局·陈警官',
  case: '协查通知',
} as const

/** 节点 ID。 */
type L3Node =
  | 'intro'
  | 'l3-call' // 假警官首次联系，发协查通知
  | 'l3-screen' // 要求屏幕共享/会议软件
  | 'l3-transfer-1' // 资金核查 500 待确认
  | 'l3-safe-claim' // 对方称已进入安全账户
  | 'l3-pressure' // 以取保候审施压，索要 300
  | 'l3-transfer-2' // 保证金 300 待确认
  | 'l3-end-clear'
  | 'l3-end-stop'
  | 'l3-end-loss'
  | 'debrief'

/** 选项 ID。 */
type L3Option =
  | 'start'
  | 'l3-verify'
  | 'l3-cooperate'
  | 'l3-refuse'
  | 'l3-share-screen'
  | 'l3-refuse-screen'
  | 'l3-confirm-500'
  | 'l3-cancel-500'
  | 'l3-continue'
  | 'l3-stop'
  | 'l3-accept-300'
  | 'l3-refuse-300'
  | 'l3-confirm-300'
  | 'l3-cancel-300'
  | 'review'
  | 'restart'

/** 风险标记。 */
export type L3Tag =
  | 'l3-saw-notice'
  | 'l3-early-verify'
  | 'l3-early-refuse'
  | 'l3-cooperated'
  | 'l3-shared-screen'
  | 'l3-refused-screen'
  | 'l3-paid-500'
  | 'l3-saw-safe-claim'
  | 'l3-stopped-after-500'
  | 'l3-threatened'
  | 'l3-asked-300'
  | 'l3-stopped-before-300'
  | 'l3-paid-300'
  | 'l3-stopped-before-pay'

/** 假警官首次联系：先亮身份，再发“通知”，最后索要屏幕共享。 */
const CALL_MESSAGES: ChatMessage[] = [
  {
    id: 'c1',
    from: 'them',
    name: L3_BRAND.officer,
    text: '你好，我是青屏市公安局刑侦支队的陈明。你名下的一张银行卡涉嫌一起洗钱案件，需要你配合调查。',
  },
  {
    id: 'c2',
    from: 'them',
    name: L3_BRAND.officer,
    variant: 'notice',
    noticeTitle: '协查通知（对方发来的文件）',
    noticeFields: [
      { label: '发文单位', value: '青屏市公安局刑侦支队（对方自称）' },
      { label: '案号', value: '青公刑协〔2026〕0417 号' },
      { label: '事由', value: '涉嫌洗钱，需要配合资金核查' },
      { label: '要求', value: '将资金转入安全账户核查' },
    ],
    noticeNote: '这份文件只在聊天里出现，无法在官方渠道核验。',
    text: '协查通知',
  },
  {
    id: 'c3',
    from: 'them',
    name: L3_BRAND.officer,
    text: '这件事不要告诉任何人，包括家人，否则按泄密处理。你现在配合我们做一次屏幕共享，我这边指导你操作。',
  },
  {
    id: 'c4',
    from: 'system',
    variant: 'risk',
    text: '真正的公检法不会通过聊天办案，也不会让你把钱转到“安全账户”。',
  },
]

/** 屏幕共享要求之后的催促。 */
const SCREEN_MESSAGES: ChatMessage[] = [
  {
    id: 'sc1',
    from: 'them',
    name: L3_BRAND.officer,
    text: '你只需要把卡里的钱转到安全账户，核查资金来源合法后原路退回。这是证明你清白的流程。',
  },
  {
    id: 'sc2',
    from: 'them',
    name: L3_BRAND.officer,
    text: '不要挂断，也不要拖延。你不配合的话，我们只能按程序处理。',
  },
]

/** 第一笔钱之后：对方称进入安全账户，并继续索要 300。 */
const SAFE_CLAIM_MESSAGES: ChatMessage[] = [
  {
    id: 'sf1',
    from: 'them',
    name: L3_BRAND.officer,
    text: '资金已经进入安全账户，核查通过后会原路返还。',
  },
  {
    id: 'sf2',
    from: 'them',
    name: L3_BRAND.officer,
    variant: 'notice',
    noticeTitle: '资金核查进度（对方发来的文字）',
    noticeFields: [
      { label: '核查金额', value: `¥${L3_FUND_CHECK_AMOUNT}` },
      { label: '状态', value: '已接收，待返还' },
    ],
    noticeNote: '这是对方自己发来的文字，不是你的余额，也不代表钱会回来。',
    text: '资金核查进度',
  },
]

/** 二次施压：取保候审保证金。 */
const PRESSURE_MESSAGES: ChatMessage[] = [
  {
    id: 'p1',
    from: 'them',
    name: L3_BRAND.officer,
    text: `系统显示你还有涉案资金没有说明清楚，需要再交 ${L3_BAIL_AMOUNT} 元保证金办理取保候审，否则我们会上门。`,
  },
  {
    id: 'p2',
    from: 'them',
    name: L3_BRAND.officer,
    text: '这是最后一步。处理完保证金，案件就能结案，前面的钱也会一起退。',
  },
  {
    id: 'p3',
    from: 'system',
    variant: 'risk',
    text: '拿“上门”“取保候审”施压，是让你来不及思考的固定话术。',
  },
]

/** 账号资料：看起来完整，但身份无法核验。 */
const PROFILE_INFO_OFFICER: ProfileInfo = {
  nickname: L3_BRAND.officer,
  account: 'qpg_****1108',
  fields: [
    { label: '单位', value: '青屏市公安局刑侦支队（对方自称）' },
    { label: '警号', value: '无法在官方渠道核验' },
    { label: '账号', value: '近期添加，资料可伪造' },
    { label: '可核验线索', value: '无。聊天里的头像、昵称和职位都不能证明身份' },
  ],
  notice:
    '身份信息看起来完整，也不代表这次对话是真的。遇到“案件”，先挂断，通过官方渠道自己核实；不要把钱转给任何人。',
}

export const level03 = defineLevel<L3Node, L3Option>({
  kind: 'playable',

  meta: {
    id: 'level-03',
    order: 3,
    ordinal: '第三关',
    title: '冒充公检法',
    category: '冒充公检法',
    blurb: '「你涉嫌一起案件」的电话，下一步会要你把钱转到「安全账户」。',
    goal: '公检法不会打电话让你转账，也没有所谓的安全账户。',
    accent: ['#8c3b32', '#5a211d'],
    miniPreview: {
      caption: '未知来电 · 公安',
      glyphs: ['phone', 'sms', 'wallet', 'manual'],
    },
    startNotice: '一个自称公安的号码加了你，说要核实案件',
  },

  nodes: {
    intro: { id: 'intro' },
    'l3-call': { id: 'l3-call', onEnter: { addTags: ['l3-saw-notice'] } },
    'l3-screen': { id: 'l3-screen' },
    'l3-transfer-1': { id: 'l3-transfer-1' },
    'l3-safe-claim': {
      id: 'l3-safe-claim',
      onEnter: { addTags: ['l3-saw-safe-claim'] },
    },
    'l3-pressure': {
      id: 'l3-pressure',
      onEnter: { addTags: ['l3-threatened', 'l3-asked-300'] },
    },
    'l3-transfer-2': { id: 'l3-transfer-2' },
    'l3-end-clear': { id: 'l3-end-clear', ending: 'l3-end-clear' },
    'l3-end-stop': { id: 'l3-end-stop', ending: 'l3-end-stop' },
    'l3-end-loss': { id: 'l3-end-loss', ending: 'l3-end-loss' },
    debrief: { id: 'debrief' },
  },

  options: {
    start: {
      id: 'start',
      label: '开始体验',
      from: 'intro',
      to: 'l3-call',
      hint: '进入虚构手机桌面',
    },
    'l3-verify': {
      id: 'l3-verify',
      label: '挂断，自己去核实',
      from: 'l3-call',
      to: 'l3-end-clear',
      effect: { addTags: ['l3-early-verify'] },
      hint: '不通过聊天里的身份做判断',
    },
    'l3-refuse': {
      id: 'l3-refuse',
      label: '直接拒绝并退出',
      from: 'l3-call',
      to: 'l3-end-clear',
      effect: { addTags: ['l3-early-refuse'] },
    },
    'l3-cooperate': {
      id: 'l3-cooperate',
      label: '继续听他说',
      from: 'l3-call',
      to: 'l3-screen',
      effect: { addTags: ['l3-cooperated'] },
    },
    'l3-share-screen': {
      id: 'l3-share-screen',
      label: '按他说的共享屏幕',
      from: 'l3-screen',
      to: 'l3-transfer-1',
      effect: { addTags: ['l3-shared-screen'] },
    },
    'l3-refuse-screen': {
      id: 'l3-refuse-screen',
      label: '不共享，挂断',
      from: 'l3-screen',
      to: 'l3-end-clear',
      effect: { addTags: ['l3-refused-screen'] },
    },
    'l3-confirm-500': {
      id: 'l3-confirm-500',
      label: `确认转出 ${L3_FUND_CHECK_AMOUNT} 元`,
      from: 'l3-transfer-1',
      to: 'l3-safe-claim',
      effect: {
        balanceDelta: -L3_FUND_CHECK_AMOUNT,
        paidDelta: L3_FUND_CHECK_AMOUNT,
        addTags: ['l3-paid-500'],
        once: true,
      },
    },
    'l3-cancel-500': {
      id: 'l3-cancel-500',
      label: '取消，不再操作',
      from: 'l3-transfer-1',
      to: 'l3-end-stop',
      effect: { addTags: ['l3-stopped-before-pay'] },
    },
    'l3-continue': {
      id: 'l3-continue',
      label: '继续听他说',
      from: 'l3-safe-claim',
      to: 'l3-pressure',
    },
    'l3-stop': {
      id: 'l3-stop',
      label: '停下来，去核实',
      from: 'l3-safe-claim',
      to: 'l3-end-stop',
      effect: { addTags: ['l3-stopped-after-500'] },
    },
    'l3-accept-300': {
      id: 'l3-accept-300',
      label: '查看这笔保证金',
      from: 'l3-pressure',
      to: 'l3-transfer-2',
    },
    'l3-refuse-300': {
      id: 'l3-refuse-300',
      label: '停止操作并保留证据',
      from: 'l3-pressure',
      to: 'l3-end-stop',
      effect: { addTags: ['l3-stopped-before-300'] },
    },
    'l3-confirm-300': {
      id: 'l3-confirm-300',
      label: `确认转出 ${L3_BAIL_AMOUNT} 元`,
      from: 'l3-transfer-2',
      to: 'l3-end-loss',
      effect: {
        balanceDelta: -L3_BAIL_AMOUNT,
        paidDelta: L3_BAIL_AMOUNT,
        addTags: ['l3-paid-300'],
        once: true,
      },
    },
    'l3-cancel-300': {
      id: 'l3-cancel-300',
      label: '取消，不再转钱',
      from: 'l3-transfer-2',
      to: 'l3-end-stop',
      effect: { addTags: ['l3-stopped-before-300'] },
    },
    review: {
      id: 'review',
      label: '看复盘',
      from: 'l3-end-clear',
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
    'l3-call': ['l3-verify', 'l3-cooperate', 'l3-refuse'],
    'l3-screen': ['l3-share-screen', 'l3-refuse-screen'],
    'l3-transfer-1': ['l3-confirm-500', 'l3-cancel-500'],
    'l3-safe-claim': ['l3-continue', 'l3-stop'],
    'l3-pressure': ['l3-accept-300', 'l3-refuse-300'],
    'l3-transfer-2': ['l3-confirm-300', 'l3-cancel-300'],
    'l3-end-clear': ['review'],
    'l3-end-stop': ['review'],
    'l3-end-loss': ['review'],
    debrief: ['restart'],
  },

  startNode: 'intro',
  debriefNode: 'debrief',
  initialBalance: INITIAL_BALANCE,
  validBalances: [INITIAL_BALANCE, INITIAL_BALANCE - L3_FUND_CHECK_AMOUNT, 0],
  validPlatformDisplays: [0],
  platformRequiresPaid: [],

  pendingRequests: {
    'l3-transfer-1': {
      amount: L3_FUND_CHECK_AMOUNT,
      title: '有一笔待确认',
      confirm: 'l3-confirm-500',
      cancel: 'l3-cancel-500',
    },
    'l3-transfer-2': {
      amount: L3_BAIL_AMOUNT,
      title: '有一笔待确认',
      confirm: 'l3-confirm-300',
      cancel: 'l3-cancel-300',
    },
  },

  endings: {
    'l3-end-clear': {
      title: '提前识破',
      reason: '公检法不会通过聊天办案，也不会让你把钱转到“安全账户”。',
    },
    'l3-end-stop': {
      title: '及时止损',
      reason: '你停在了继续转钱之前，这一步保住了剩下的钱。',
    },
    'l3-end-loss': {
      title: '越陷越深',
      reason: '为了“证明清白”，你把生活费一笔笔转给了对方。',
    },
  },

  riskTagLabels: {
    'l3-saw-notice': '看到对方发来的“协查通知”',
    'l3-early-verify': '挂断并通过官方渠道核实',
    'l3-early-refuse': '直接拒绝并退出',
    'l3-cooperated': '继续听对方说',
    'l3-shared-screen': '答应屏幕共享',
    'l3-refused-screen': '拒绝屏幕共享并挂断',
    'l3-paid-500': '转出了 500 元资金核查',
    'l3-saw-safe-claim': '看到“资金已进入安全账户”',
    'l3-stopped-after-500': '转出 500 后停手',
    'l3-threatened': '被“取保候审”施压',
    'l3-asked-300': '被要求再交 300 保证金',
    'l3-stopped-before-300': '第二次要钱时停手',
    'l3-paid-300': '转出了 300 保证金',
    'l3-stopped-before-pay': '付款前退出',
  } satisfies Record<L3Tag, string>,

  debriefRules: [
    {
      id: 'l3-notice',
      triggers: ['l3-saw-notice', 'l3-cooperated'],
      title: '对方发来“协查通知”',
      observation: '对方在聊天里发来一份带案号的“协查通知”，让你配合资金核查。',
      risk: '真正的办案不会只在聊天里发一张文件，更不会让你把钱转到“安全账户”。',
      advice: '挂断，通过官方渠道自己核实；不要在聊天里证明清白。',
    },
    {
      id: 'l3-early-verify',
      triggers: ['l3-early-verify', 'l3-early-refuse'],
      title: '你挂断并核实',
      observation: '你没有继续听对方指挥，而是先停下来核实身份。',
      risk: '这一步把对方最想要的“持续通话、持续操作”打断了。',
      advice: '以后遇到自称公检法的来电，先挂断，再通过官方渠道核实。',
    },
    {
      id: 'l3-screen',
      triggers: ['l3-shared-screen', 'l3-refused-screen'],
      title: '对方要求屏幕共享',
      observation: '对方让你共享屏幕，说是为了“指导资金核查”。',
      risk: '屏幕共享等于把手机交给对方，银行短信、验证码和密码都可能被看到。',
      advice: '不共享屏幕，不下载陌生会议软件，不把验证码念给任何人。',
    },
    {
      id: 'l3-paid-500',
      triggers: ['l3-paid-500'],
      title: '你转出了 500 元“资金核查”',
      observation: '你确认转出 500 元，余额从 800 变成 300。',
      risk: '公检法不会让个人把钱转到“安全账户”；这笔钱一出去就不由你控制。',
      advice: '已经转了就先停手，保存聊天和转账记录，通过官方渠道举报/求助。',
    },
    {
      id: 'l3-safe-claim',
      triggers: ['l3-saw-safe-claim'],
      title: '“资金已进入安全账户”',
      observation: '对方说钱已经进入安全账户，核查后会原路返还，但你的余额没有回来。',
      risk: '“安全账户”不是你的账户，对方说的进度也不是你的余额。',
      advice: '不要为了拿回前面的钱再转一笔；停止操作，保留证据。',
    },
    {
      id: 'l3-threat',
      triggers: ['l3-threatened', 'l3-asked-300'],
      title: '拿“取保候审”和“上门”施压',
      observation: '对方说你不交保证金就会上门，要求再转 300 元。',
      risk: '制造紧迫感和恐惧，是让你来不及核实的固定话术。',
      advice: '越被催越要停。挂断，找家人、老师或官方渠道一起核实。',
    },
    {
      id: 'l3-stop-after-500',
      triggers: ['l3-stopped-after-500'],
      title: '转出 500 后你停手了',
      observation: '看到“资金已进入安全账户”之后，你选择停下来核实。',
      risk: '你在第二笔钱之前停住了，这是最关键的止损点。',
      advice: '保存记录，通过官方渠道举报；不要相信“再交一笔就能退回”。',
    },
    {
      id: 'l3-stopped-before-300',
      triggers: ['l3-stopped-before-300'],
      title: '第二次要钱时你停手了',
      observation: '对方以取保候审为由再要 300 元，你没有继续转。',
      risk: '先收一笔再收第二笔，说明对方要的不是核查，是你的钱。',
      advice: '停止所有付款，保存聊天和转账记录，尽快求助。',
    },
    {
      id: 'l3-paid-300',
      triggers: ['l3-paid-300'],
      title: '你转出了 300 元保证金',
      observation: '你确认转出 300 元，余额变成 0。',
      risk: '“保证金/取保候审”是二次要钱的话术，不会让前面的钱回来。',
      advice: '现在就停手。保存证据，通过官方渠道举报并及时求助。',
    },
    {
      id: 'l3-stopped-before-pay',
      triggers: ['l3-stopped-before-pay'],
      title: '付款前你退出了',
      observation: '到了转账页，你选择取消，没有转出资金。',
      risk: '在掏钱之前停下来，是最省事的止损。',
      advice: '以后也一样：对方让你先转钱，就没有必要继续聊。',
    },
  ],

  debriefActions: [
    '停止操作，别再加钱。不要共享屏幕，不要把验证码念给任何人。',
    '保存聊天、转账和通话记录，别删对话；通过官方渠道举报，必要时报警求助。',
    '把这件事告诉家人、老师或同学，一起核实，不要一个人被对方牵着走。',
  ],

  reminders: {
    'l3-call':
      '国家反诈中心检测到你正在遭遇冒充公检法诈骗。真正的公检法不会通过聊天办案，也不会让你把钱转到“安全账户”。',
    'l3-screen':
      '对方让你共享屏幕或下载会议软件：屏幕共享等于把手机交给对方，请立即停止。',
    'l3-transfer-1':
      '国家反诈中心检测到你正在遭遇冒充公检法诈骗。你正在向对方指定的“安全账户”转账，请立即停止。',
    'l3-safe-claim':
      '对方说资金已进入“安全账户”，但你的余额已经减少。不要为了拿回钱再转第二笔。',
    'l3-pressure':
      '“取保候审”“上门”是施压话术。不要因为害怕而转账，先停下来找可信的人核实。',
    'l3-transfer-2':
      '国家反诈中心检测到你正在遭遇冒充公检法诈骗。对方又要求追加保证金，请立即停止付款。',
    'l3-end-clear': '你识破了冒充公检法的要求。保留证据，通过官方渠道举报/求助。',
    'l3-end-stop':
      '你已经停止继续付款，这是止损最关键的一步。保存聊天与转账记录，通过官方渠道报警求助。',
    'l3-end-loss':
      '如果已经转账，请立即停止一切付款，保存聊天与转账记录，通过官方渠道举报并及时报警求助。',
  },

  popupReminders: ['l3-call', 'l3-transfer-1', 'l3-transfer-2'],
  popupCountdowns: {
    'l3-transfer-1': 3,
    'l3-transfer-2': 3,
  },

  copy: {
    balanceLabel: '生活费',
    spentLabel: '已转出',
    pendingHint: '有一笔 {n} 元等着你处理。走开不算付，也不算取消。',
    platformLabel: '对方声称',
    platformChatNote: (balance) => `对方说的数字不是你的余额。钱包还是 ${balance} 元。`,
    platformWalletNote: '这一关没有平台退款数字；对方让你转的钱会直接从余额扣除。',
    resume: {
      intro: '开始体验',
      'l3-call': '一个自称公安的人加了你',
      'l3-screen': '对方要求屏幕共享',
      'l3-transfer-1': '有一笔 500 元等你处理',
      'l3-safe-claim': '看看所谓的资金核查',
      'l3-pressure': '对方又要求交保证金',
      'l3-transfer-2': '有一笔 300 元等你处理',
      'l3-end-clear': '看本局结果与复盘',
      'l3-end-stop': '看本局结果与复盘',
      'l3-end-loss': '看本局结果与复盘',
      debrief: '看本局结果与复盘',
    },
    resumeFallback: '继续当前事项',
  },

  walletRecords: (state) => {
    const list: { label: string; amount: number }[] = [
      { label: '妈妈转来的生活费', amount: INITIAL_BALANCE },
    ]
    if (state.paidTotal >= L3_FUND_CHECK_AMOUNT) {
      list.push({ label: '转出 · 资金核查', amount: -L3_FUND_CHECK_AMOUNT })
    }
    if (state.paidTotal >= L3_MAX_PAID_TOTAL) {
      list.push({ label: '转出 · 取保候审保证金', amount: -L3_BAIL_AMOUNT })
    }
    return list
  },

  chat: {
    sessions: [
      {
        id: 'l3-police',
        kind: 'private',
        name: L3_BRAND.officer,
        lastTime: '14:18',
        messages: CALL_MESSAGES,
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

    newsSession: 'classgroup',

    extraMessages: {
      'l3-screen': [{ session: 'l3-police', messages: SCREEN_MESSAGES }],
      'l3-safe-claim': [{ session: 'l3-police', messages: SAFE_CLAIM_MESSAGES }],
      'l3-pressure': [
        { session: 'l3-police', messages: SAFE_CLAIM_MESSAGES },
        { session: 'l3-police', messages: PRESSURE_MESSAGES },
      ],
      'l3-transfer-2': [
        { session: 'l3-police', messages: SAFE_CLAIM_MESSAGES },
        { session: 'l3-police', messages: PRESSURE_MESSAGES },
      ],
      'l3-end-loss': [
        { session: 'l3-police', messages: SAFE_CLAIM_MESSAGES },
        { session: 'l3-police', messages: PRESSURE_MESSAGES },
      ],
    },

    optionSession: {
      'l3-call': 'l3-police',
      'l3-screen': 'l3-police',
      'l3-safe-claim': 'l3-police',
      'l3-pressure': 'l3-police',
    },

    preferredSession: {
      'l3-call': 'l3-police',
      'l3-screen': 'l3-police',
      'l3-transfer-1': 'l3-police',
      'l3-safe-claim': 'l3-police',
      'l3-pressure': 'l3-police',
      'l3-transfer-2': 'l3-police',
    },

    secondaryOptions: [
      'l3-verify',
      'l3-refuse',
      'l3-refuse-screen',
      'l3-cancel-500',
      'l3-stop',
      'l3-refuse-300',
      'l3-cancel-300',
    ],

    profile: [{ session: 'l3-police' }],

    profiles: { 'l3-police': PROFILE_INFO_OFFICER },
  },
})
