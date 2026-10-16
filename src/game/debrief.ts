import { requireLevel } from '@/data/levels'
import type { Debrief, DebriefItem, GameState, RiskTag } from '@/game/types'

/**
 * 按玩家**实际经历**生成复盘。
 *
 * 规则：只引用 `state.riskTags` 中存在的环节，不把玩家没遇到的话术写成亲历；
 * 不承诺追回损失；不出现「反杀」「报警成功」等误导性表述。
 *
 * 复盘规则、结局文案、风险标签都来自状态所属的关卡（`state.levelId`），
 * 因此新增关卡不用改本文件。
 */

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
  const level = requireLevel(state.levelId)
  const tags = new Set<RiskTag>(state.riskTags)
  const items: DebriefItem[] = level.debriefRules
    .filter((rule) => rule.triggers.some((tag) => tags.has(tag)))
    .map((rule) => ({
      id: rule.id,
      title: rule.title,
      observation: rule.observation,
      risk: rule.risk,
      advice: rule.advice,
    }))

  // 没有结局时（理论上到不了复盘）用一个中性兜底，避免读 undefined。
  const fallbackEnding = Object.keys(level.endings)[0] ?? ''
  const endingKey = state.ending ?? fallbackEnding
  const info = level.endings[endingKey] ?? { title: '本局结果', reason: '' }

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
    actions: level.debriefActions.slice(0, 3),
  }
}

/** 复盘条目对应的风险标记说明，供界面展示标注。 */
export function riskLabelsOf(state: GameState): string[] {
  const level = requireLevel(state.levelId)
  return state.riskTags
    .map((tag) => level.riskTagLabels[tag])
    .filter((label): label is string => typeof label === 'string')
}
