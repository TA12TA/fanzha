import { describe, expect, it } from 'vitest'
import { playableLevels } from '@/data/levels'
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
  it('A01 早拒绝：复盘不含未经历的付款与追加表述', () => {
    const state = play(['start', 'reject-invite', 'review'])
    const text = debriefText(state)
    expect(text).toContain('提前识破')
    expect(text).not.toContain('你付了第一笔')
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
    expect(text).not.toContain('你付了第一笔')
    expect(buildDebrief(state).paidTotal).toBe(0)
  })

  it('A03 查看资料：复盘包含资料线索，并给出独立核实建议', () => {
    const state = play(['start', 'enter-group', 'view-profile', 'accept-task', 'cancel-100', 'review'])
    const text = debriefText(state)
    expect(text).toContain('看过对方资料')
    expect(text).toContain('用另一个渠道')
    expect(buildDebrief(state).paidTotal).toBe(0)
  })

  it('A04 首次垫付后停止：准确显示损失 100，说明平台展示数字不等于到账', () => {
    const state = play(['start', 'enter-group', 'accept-task', 'confirm-100', 'stop-after-100', 'review'])
    const debrief = buildDebrief(state)
    expect(debrief.paidTotal).toBe(100)
    expect(debrief.balance).toBe(700)
    expect(debrief.summary).toContain('100')
    const text = debriefText(state)
    expect(text).toContain('不是你能用的钱')
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
    expect(text).toContain('别再往里转钱')
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
    expect(joined).toContain('别再加钱')
    expect(joined).toContain('截图留好')
    expect(joined).toContain('举报')
    // 必须明确不承诺追回，且不出现肯定式误导表述。
    expect(joined).toContain('不保证追回')
    expect(findForbiddenClaim(joined)).toBeNull()
  })

  it('每个风险标记都有中文短名，界面不会出现裸 ID', () => {
    // 遍历**所有关卡**：新增关卡漏写中文名会在这里被抓住，
    // 而不是等玩家在复盘页看到 undefined。
    for (const level of playableLevels()) {
      for (const [tag, label] of Object.entries(level.riskTagLabels)) {
        expect(label.length, `${level.meta.id} 的标记 ${tag} 应有中文说明`).toBeGreaterThan(0)
        expect(label, `${level.meta.id} 的标记 ${tag} 不该是裸 ID`).not.toBe(tag)
      }
    }
  })
})

/**
 * 第二关「冒充客服退款」的复盘。
 *
 * 与第一关同样的要求：只引用玩家实际遇到的环节。
 * 这一组用例同时是**跨关隔离**的回归 —— 第二关的复盘不能出现第一关的话术
 * （「先垫 100」「解冻费」），反之亦然。
 */
describe('D2. 第二关复盘（按经历生成）', () => {
  /** 第二关的路径辅助：显式指定 levelId。 */
  function play2(optionIds: OptionId[]): GameState {
    let state = createInitialState('level-02')
    for (const id of optionIds) {
      const result = choose(state, id)
      if (!result.ok) throw new Error(`选项 ${id} 在节点 ${state.node} 非法`)
      state = result.state
    }
    return state
  }

  it('早拒绝：不含保证金、征信威胁与验证码话术', () => {
    const state = play2(['start', 'l2-refuse', 'review'])
    const text = debriefText(state)
    expect(text).toContain('提前识破')
    // 没经历过的一律不能出现
    expect(text).not.toContain('保证金')
    expect(text).not.toContain('征信')
    expect(text).not.toContain('验证码')
    expect(buildDebrief(state).paidTotal).toBe(0)
    expect(buildDebrief(state).balance).toBe(800)
  })

  it('自己查订单：复盘引用「自己查过」这一环节', () => {
    const state = play2(['start', 'l2-check-order', 'l2-refuse', 'review'])
    const text = debriefText(state)
    expect(text).toContain('你自己查了订单')
    expect(text).toContain('没有所谓的重复扣款')
  })

  it('转出 200 后停手：准确显示损失 200，说明页面进度不等于到账', () => {
    const state = play2(['start', 'l2-cooperate', 'l2-confirm-200', 'l2-stop', 'review'])
    const debrief = buildDebrief(state)
    expect(debrief.paidTotal).toBe(200)
    expect(debrief.balance).toBe(600)
    const text = debriefText(state)
    expect(text).toContain('退款已受理')
    expect(text).toContain('不是你的钱')
    // 没走到第二次要钱，就不该出现保证金
    expect(text).not.toContain('300 保证金')
  })

  it('被索要验证码：复盘说明验证码等于账户', () => {
    const state = play2(['start', 'l2-cooperate', 'l2-confirm-200', 'l2-stop', 'review'])
    const text = debriefText(state)
    expect(text).toContain('短信验证码')
    expect(text).toContain('验证码不给任何人')
  })

  it('第二次要钱时停手：说明征信威胁是话术，且不含追加后的表述', () => {
    const state = play2([
      'start',
      'l2-cooperate',
      'l2-confirm-200',
      'l2-continue',
      'l2-refuse-300',
      'review',
    ])
    const debrief = buildDebrief(state)
    expect(debrief.paidTotal).toBe(200)
    const text = debriefText(state)
    expect(text).toContain('征信')
    expect(text).toContain('第二次要钱时你停手了')
    // 没有真的转出 300，就不该写成转出过
    expect(text).not.toContain('你转出了 300 保证金')
  })

  it('转出 300 后：累计 500，复盘不承诺追回', () => {
    const state = play2([
      'start',
      'l2-cooperate',
      'l2-confirm-200',
      'l2-continue',
      'l2-accept-300',
      'l2-confirm-300',
      'review',
    ])
    const debrief = buildDebrief(state)
    expect(debrief.paidTotal).toBe(500)
    expect(debrief.balance).toBe(300)
    expect(debrief.endingLabel).toBe('越退越亏')
    const text = debriefText(state)
    expect(text).toContain('500')
    expect(findForbiddenClaim(text)).toBeNull()
  })

  it('两关复盘互不串台：第二关不出现第一关话术，第一关不出现第二关话术', () => {
    const l2 = debriefText(play2(['start', 'l2-cooperate', 'l2-confirm-200', 'l2-stop', 'review']))
    expect(l2, '第二关不该出现第一关的「先垫付」话术').not.toContain('先垫 100')
    expect(l2, '第二关不该出现第一关的「解冻费」').not.toContain('解冻费')
    expect(l2, '第二关不该出现第一关的兼职群').not.toContain('兼职群')

    const l1 = debriefText(
      play(['start', 'enter-group', 'accept-task', 'confirm-100', 'stop-after-100', 'review']),
    )
    expect(l1, '第一关不该出现第二关的退款话术').not.toContain('退款')
    expect(l1, '第一关不该出现第二关的验证金').not.toContain('验证金')
    expect(l1, '第一关不该出现第二关的征信话术').not.toContain('征信')
  })
})
