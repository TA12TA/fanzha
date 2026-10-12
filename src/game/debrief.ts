import { ENDING_INFO, RISK_TAG_LABELS } from '@/data/level01'
import type { Debrief, DebriefItem, GameState, RiskTag } from '@/game/types'

/**
 * 按玩家**实际经历**生成复盘。
 *
 * 规则：只引用 `state.riskTags` 中存在的环节，不把玩家没遇到的话术写成亲历；
 * 不承诺追回损失；不出现「反杀」「报警成功」等误导性表述。
 */

/** 复盘条目定义：命中任一触发标记即展示。 */
interface DebriefRule {
  id: string
  triggers: RiskTag[]
  title: string
  observation: string
  risk: string
  advice: string
}

const RULES: DebriefRule[] = [
  {
    id: 'invite-refused',
    triggers: ['early-reject'],
    title: '陌生兼职邀请',
    observation:
      '你收到了一条来自陌生人的兼职邀请，对方自称「学姐」，说课余做任务当天结算。',
    risk: '自称身份不等于真实身份；陌生兼职是刷单类骗局最常见的入口。',
    advice: '不因对方自称同学、学姐就放松警惕，先通过学校官方渠道核实招聘信息。',
  },
  {
    id: 'joined-group',
    triggers: ['entered-group'],
    title: '兼职任务群',
    observation: '你进入了一个兼职任务群，群里有群主发布任务、也有成员晒收益。',
    risk: '群内晒收益的人可能是同一批人；群里的话术和氛围本身就是施加压力的手段。',
    advice: '群聊里的「到账」不能替代独立核实，不要用群内信息判断真伪。',
  },
  {
    id: 'reported-in-group',
    triggers: ['reported-in-group'],
    title: '进群后退出并举报',
    observation: '你进群后没有接任务，选择退出并举报。',
    risk: '即使已经进群，只要没有付款，风险仍可控制。',
    advice: '退出后保留邀请与群聊记录，通过官方渠道举报，避免再次被拉入同类群。',
  },
  {
    id: 'profile-check',
    triggers: ['viewed-profile'],
    title: '查看对方资料',
    observation:
      '你查看了对方的资料，看到账号注册时间很短、资料不完整、也找不到可核验的线索。',
    risk: '头像和自称身份都不等于可信身份；资料不完整是明显的可疑信号。',
    advice: '涉及转账时，必须通过独立渠道（学校官方通知、当面或电话向本人）核实身份。',
  },
  {
    id: 'pad-request',
    triggers: ['saw-pad-request'],
    title: '「先垫 100 元」的要求',
    observation: '群主提出：先垫付 100 元接单，做完平台显示返 130 元。',
    risk: '正规兼职不会要求你先出钱。凡是「先垫付再返还」的任务，都是刷单类骗局的核心特征。',
    advice: '看到「先垫钱」就应该停止参与，不要用「先小额试试」来验证。',
  },
  {
    id: 'paid-first',
    triggers: ['paid-100'],
    title: '你确认了首次模拟垫付 100 元',
    observation: '在本局游戏中，你确认了一笔 100 元的模拟垫付，模拟余额从 800 元变为 700 元。',
    risk: '首次小额垫付往往是骗局用来建立信任的手段，它会让后续更大金额的付款看起来「合理」。',
    advice: '已经垫付不等于必须继续。任何时候停止，都能避免更大的损失。',
  },
  {
    id: 'fake-rebate',
    triggers: ['saw-rebate-claim'],
    title: '「平台已显示返 130」的说法',
    observation: '群主称平台已显示 130 元收益，可以继续做更高收益的任务。',
    risk: '平台内显示的数字不等于你账户里的钱。它不能提现，也不会进入你的可支配余额。',
    advice: '不要因为页面上多了一个数字就继续转账；能否真正提现才是关键。',
  },
  {
    id: 'freeze-fee',
    triggers: ['withdraw-failed', 'asked-freeze-fee'],
    title: '提现失败与「解冻费」',
    observation: '页面显示提现失败、收益被冻结，群主要求你交 300 元「解冻费」才能激活通道。',
    risk: '以「冻结、解冻」为由要求继续交钱，是风险升级的典型信号，交钱不会让提现成功。',
    advice: '停止一切付款，不要再为「解冻」支付任何费用。',
  },
  {
    id: 'extra-request',
    triggers: ['asked-extra'],
    title: '追加 300 元的要求',
    observation: '你看到了一笔 300 元的追加垫付请求。',
    risk: '在已经付款之后被要求追加，说明对方的目标是持续榨取，而不是完成所谓任务。',
    advice: '不追加、不转账；已发生的付款不会因为再交钱而变得可提现。',
  },
  {
    id: 'paid-extra',
    triggers: ['paid-300'],
    title: '你确认了追加模拟垫付 300 元',
    observation: '在本局游戏中，你确认了 300 元追加垫付，模拟余额变为 400 元，累计模拟损失 400 元。',
    risk: '追加付款让损失扩大，而且并不改变「无法提现」的结果。',
    advice: '立即停止付款，并尽快处理已经发生的情况。',
  },
  {
    id: 'stopped-before-pay',
    triggers: ['stopped-before-pay'],
    title: '你在付款前取消了',
    observation: '你在模拟转账页选择取消，没有付款。',
    risk: '在付款前停下，是最有效、代价最小的止损。',
    advice: '保持这个习惯：只要对方要求你先出钱，就直接结束对话。',
  },
  {
    id: 'stopped-after-100',
    triggers: ['stopped-after-100'],
    title: '你在首次垫付后停止',
    observation: '你在平台显示「返 130」之后选择停止，没有再继续付款。',
    risk: '你没有因为页面上的数字继续投入，这一步避免了更大的损失。',
    advice: '已付出的 100 元是模拟损失；现实中遇到同样情况，应停止付款并保存记录。',
  },
  {
    id: 'stopped-at-freeze',
    triggers: ['stopped-at-freeze'],
    title: '你在提现异常时停止',
    observation: '面对「解冻费」的要求，你选择停止操作并保留证据。',
    risk: '在风险升级时停止付款，避免了损失继续扩大。',
    advice: '保存聊天与交易记录，通过官方渠道举报并及时报警求助。',
  },
  {
    id: 'stopped-before-extra',
    triggers: ['stopped-before-extra'],
    title: '你取消了追加付款',
    observation: '你看到了追加 300 元的请求，并选择取消，没有继续付款。',
    risk: '追加付款不会让已付款项变得可提现，取消是正确的选择。',
    advice: '把注意力转到止损与取证：保存记录、举报、必要时及时求助。',
  },
]

/** 结尾给出的可执行建议（固定 2–3 条，不承诺追回）。 */
const ACTIONS: string[] = [
  '停止继续转账：只要对方还在要求你付款，就直接结束对话，不再回复。',
  '保存证据：截图保存聊天记录、模拟交易记录和对方的账号信息，不要删除对话。',
  '通过官方渠道举报并及时报警求助：报警不保证追回损失，但越早处理越有利。',
]

/** 明确禁止出现在复盘文案中的表述（避免误导为「一定能追回」或「反杀成功」）。 */
export const FORBIDDEN_PHRASES = [
  '保证追回',
  '必定追回',
  '一定能追回',
  '报警成功',
  '反杀',
  '骗子工作台',
] as const

/** 否定前缀：紧邻其后的短语属于「不承诺」，不算违规表述。 */
const NEGATION_PREFIXES = ['不', '无法', '不能', '不承诺', '并不', '没有']

/**
 * 检查文本是否含**肯定式**的误导表述。
 * 「报警不保证追回损失」属于正确表述，不应被判为违规。
 */
export function findForbiddenClaim(text: string): string | null {
  for (const phrase of FORBIDDEN_PHRASES) {
    let index = text.indexOf(phrase)
    while (index !== -1) {
      const before = text.slice(Math.max(0, index - 4), index)
      const negated = NEGATION_PREFIXES.some((prefix) => before.endsWith(prefix))
      if (!negated) return phrase
      index = text.indexOf(phrase, index + 1)
    }
  }
  return null
}

/** 由状态生成复盘。 */
export function buildDebrief(state: GameState): Debrief {
  const tags = new Set<RiskTag>(state.riskTags)
  const items: DebriefItem[] = RULES.filter((rule) =>
    rule.triggers.some((tag) => tags.has(tag)),
  ).map((rule) => ({
    id: rule.id,
    title: rule.title,
    observation: rule.observation,
    risk: rule.risk,
    advice: rule.advice,
  }))

  const endingKey = state.ending ?? 'end-stop'
  const info = ENDING_INFO[endingKey]

  const summary =
    state.paidTotal === 0
      ? `本局你没有任何模拟损失，模拟余额保持 ${state.balance} 元。${info.reason}`
      : `本局模拟余额 ${state.balance} 元，累计模拟损失 ${state.paidTotal} 元。${info.reason}`

  return {
    endingLabel: info.title,
    summary,
    balance: state.balance,
    paidTotal: state.paidTotal,
    items,
    actions: ACTIONS.slice(0, 3),
  }
}

/** 复盘条目对应的风险标记说明，供界面展示标注。 */
export function riskLabelsOf(state: GameState): string[] {
  return state.riskTags.map((tag) => RISK_TAG_LABELS[tag])
}
