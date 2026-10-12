import { describe, expect, it } from 'vitest'
import { RISK_TAG_LABELS } from '@/data/level01'
import { FORBIDDEN_PHRASES, buildDebrief, findForbiddenClaim } from '@/game/debrief'
import { choose, createInitialState } from '@/game/engine'
import type { GameState, OptionId } from '@/game/types'

function play(optionIds: OptionId[], from: GameState = createInitialState()): GameState {
  let state = from
  for (const id of optionIds) {
    const result = choose(state, id)
    if (!result.ok) throw new Error(`选项 ${id} 在节点 ${state.node} 非法`)
    state = result.state
  }
  return state
}

/** 复盘全部可见文本，用于禁用词与经历一致性检查。 */
function debriefText(state: GameState): string {
  const debrief = buildDebrief(state)
  return [
    debrief.endingLabel,
    debrief.summary,
    ...debrief.items.flatMap((item) => [item.title, item.observation, item.risk, item.advice]),
    ...debrief.actions,
  ].join('\n')
}

describe('D. 复盘（按经历生成）', () => {
  it('A01 早拒绝：复盘不含「已垫付」「垫付 100」等未经历的表述', () => {
    const state = play(['start', 'reject-invite', 'review'])
    const text = debriefText(state)
    expect(text).toContain('提前识破')
    expect(text).not.toContain('你确认了首次模拟垫付')
    expect(text).not.toContain('解冻费')
    expect(text).not.toContain('追加')
    const debrief = buildDebrief(state)
    expect(debrief.paidTotal).toBe(0)
    expect(debrief.balance).toBe(800)
  })

  it('A02 进群后举报：体现「进群后退出」，但不写成付过钱', () => {
    const state = play(['start', 'enter-group', 'report-group', 'review'])
    const text = debriefText(state)
    expect(text).toContain('进群后退出并举报')
    expect(text).not.toContain('你确认了首次模拟垫付')
    expect(buildDebrief(state).paidTotal).toBe(0)
  })

  it('A03 查看资料：复盘包含资料线索，并给出独立核实建议', () => {
    const state = play(['start', 'enter-group', 'view-profile', 'accept-task', 'cancel-100', 'review'])
    const text = debriefText(state)
    expect(text).toContain('查看对方资料')
    expect(text).toContain('独立渠道')
    expect(buildDebrief(state).paidTotal).toBe(0)
  })

  it('A04 首次垫付后停止：准确显示模拟损失 100，说明平台展示数字不等于到账', () => {
    const state = play(['start', 'enter-group', 'accept-task', 'confirm-100', 'stop-after-100', 'review'])
    const debrief = buildDebrief(state)
    expect(debrief.paidTotal).toBe(100)
    expect(debrief.balance).toBe(700)
    expect(debrief.summary).toContain('100')
    const text = debriefText(state)
    expect(text).toContain('平台内显示的数字不等于你账户里的钱')
  })

  it('A05 提现异常时停止：复盘包含「解冻费」风险', () => {
    const state = play([
      'start',
      'enter-group',
      'accept-task',
      'confirm-100',
      'continue-task',
      'stop-at-freeze',
      'review',
    ])
    const text = debriefText(state)
    expect(text).toContain('解冻费')
    expect(text).toContain('停止一切付款')
    expect(buildDebrief(state).paidTotal).toBe(100)
  })

  it('A07 追加后损失：显示 400，且不出现「保证追回」等文案', () => {
    const state = play([
      'start',
      'enter-group',
      'accept-task',
      'confirm-100',
      'continue-task',
      'accept-extra',
      'confirm-300',
      'review',
    ])
    const debrief = buildDebrief(state)
    expect(debrief.paidTotal).toBe(400)
    expect(debrief.balance).toBe(400)
    expect(debrief.summary).toContain('400')
    expect(debrief.endingLabel).toBe('追加后损失')
    const text = debriefText(state)
    const forbidden = findForbiddenClaim(text)
    expect(forbidden, `复盘不得出现肯定式误导表述，命中：${forbidden}`).toBeNull()
    // 「不保证追回」是允许且需要的正确表述。
    expect(text).toContain('不保证追回')
    // 不责备玩家，而是给出可执行建议。
    expect(debrief.actions.length).toBeGreaterThanOrEqual(2)
    expect(debrief.actions.length).toBeLessThanOrEqual(3)
  })

  it('禁用词检查本身能识别肯定式表述（负向用例）', () => {
    expect(findForbiddenClaim('警方保证追回全部损失')).toBe('保证追回')
    expect(findForbiddenClaim('本局实现了反杀')).toBe('反杀')
    expect(findForbiddenClaim('报警不保证追回损失')).toBeNull()
    expect(findForbiddenClaim('无法保证追回')).toBeNull()
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(findForbiddenClaim(`这里写了${phrase}`)).toBe(phrase)
    }
  })

  it('复盘只引用玩家亲历环节：未经历的话术不会出现', () => {
    const early = buildDebrief(play(['start', 'reject-invite', 'review']))
    const ids = early.items.map((item) => item.id)
    expect(ids).toContain('invite-refused')
    expect(ids).not.toContain('pad-request')
    expect(ids).not.toContain('freeze-fee')
    expect(ids).not.toContain('paid-extra')

    const deep = buildDebrief(
      play([
        'start',
        'enter-group',
        'accept-task',
        'confirm-100',
        'continue-task',
        'accept-extra',
        'confirm-300',
        'review',
      ]),
    )
    const deepIds = deep.items.map((item) => item.id)
    expect(deepIds).toEqual(
      expect.arrayContaining(['joined-group', 'pad-request', 'paid-first', 'fake-rebate', 'freeze-fee', 'extra-request', 'paid-extra']),
    )
  })

  it('结尾建议包含停止付款、保存证据、官方渠道举报与及时求助，且不承诺追回', () => {
    const debrief = buildDebrief(
      play(['start', 'enter-group', 'accept-task', 'confirm-100', 'stop-after-100', 'review']),
    )
    const joined = debrief.actions.join('\n')
    expect(joined).toContain('停止继续转账')
    expect(joined).toContain('保存')
    expect(joined).toContain('举报')
    // 必须明确不承诺追回，且不出现肯定式误导表述。
    expect(joined).toContain('不保证追回')
    expect(findForbiddenClaim(joined)).toBeNull()
  })

  it('每个风险标记都有中文短名，界面不会出现裸 ID', () => {
    for (const [tag, label] of Object.entries(RISK_TAG_LABELS)) {
      expect(label.length, `标记 ${tag} 应有中文说明`).toBeGreaterThan(0)
      expect(label).not.toBe(tag)
    }
  })
})
