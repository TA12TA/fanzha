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
]

/** 结尾给出的可执行建议（固定 3 条，不承诺追回）。 */
const ACTIONS: string[] = [
  '别再加钱。对方还在要，就是直接不回。',
  '截图留好聊天记录、转账记录和对方账号，别删对话。',
  '通过官方渠道举报，必要时报警。报警不保证追回，但越早越好。',
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
      ? `这局你一分没花，余额还是 ${state.balance} 元。${info.reason}`
      : `这局你余额 ${state.balance} 元，一共出去 ${state.paidTotal} 元。${info.reason}`

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
