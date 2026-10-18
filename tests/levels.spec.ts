import { describe, expect, it } from 'vitest'
import { DEFAULT_LEVEL_ID, LEVELS, getLevel, getPlayableLevel, isPlayableLevelId, playableLevels } from '@/data/levels'
import { collectLevelText, isPlayable, validateLevel } from '@/game/level'
import type { PlayableLevel } from '@/game/level'
import { findForbiddenClaim } from '@/game/debrief'
import { choose, createInitialState, isStateConsistent } from '@/game/engine'
import type { GameState, LevelId, OptionId } from '@/game/types'

/**
 * 关卡数据的结构守卫。
 *
 * 为什么值得单独写一整套：多关卡之后，「某一关的节点写错一个 id」或
 * 「某个标记漏了中文名」不会在编译期全部暴露（id 在引擎边界是 string），
 * 而它们都会在玩家面前变成死路、undefined 或走不通的结局。
 * 这里对**每一关**跑同一套规则，新增关卡自动被覆盖，不需要补测试。
 *
 * 规则实现放在 `game/level.ts` 的 `validateLevel`，与开发期自检共用一份，
 * 避免「测试里查过、运行时没查」的两套标准。
 */

/** 依次提交选项，断言每一步都合法。 */
function play(optionIds: OptionId[], levelId: LevelId): GameState {
  let state = createInitialState(levelId)
  for (const id of optionIds) {
    const result = choose(state, id)
    expect(result.ok, `选项 ${id} 应合法（${levelId} 当前节点 ${state.node}）`).toBe(true)
    if (result.ok) state = result.state
  }
  return state
}

/**
 * 穷举从开场出发的所有可达路径（节点序列，带环保护）。
 *
 * 两点要注意：
 * 1. **自环选项要跳过**（`view-profile` / `l2-check-order` 这类「看资料/看订单」
 *    是可选支线，点了还停在原节点）。它们不是路径的终点，也不该被算成一条
 *    「走不通」的路径 —— 否则会误报「停在 group 走不到复盘」。
 * 2. 到结局 / 复盘就收一条完整路径；带 reset 的选项不继续走（它回到开场）。
 */
function allPaths(level: PlayableLevel): OptionId[][] {
  const paths: OptionId[][] = []
  const walk = (node: string, taken: OptionId[], visited: Set<string>, depth: number): void => {
    if (depth > 20) return
    const options = level.nodeOptions[node] ?? []
    for (const id of options) {
      const option = level.options[id]
      if (!option) continue
      // 自环（可选支线）：不推进节点，因此不算一条独立路径，也不作为终点
      if (option.to === node && !option.effect?.reset) continue

      const next = [...taken, id]
      const target = option.to
      if (option.effect?.reset || target in level.endings || target === level.debriefNode) {
        paths.push(next)
        continue
      }
      if (visited.has(target)) continue
      const nextVisited = new Set(visited)
      nextVisited.add(target)
      walk(target, next, nextVisited, depth + 1)
    }
  }
  walk(level.startNode, [], new Set([level.startNode]), 0)
  return paths
}

const levels = playableLevels()

describe('X. 关卡数据守卫（所有可玩关卡）', () => {
  it('X01 注册表完整：id 唯一、order 连续、至少两关可玩', () => {
    const ids = LEVELS.map((entry) => entry.meta.id)
    expect(new Set(ids).size, '关卡 id 不能重复').toBe(ids.length)

    const orders = LEVELS.map((entry) => entry.meta.order).sort((a, b) => a - b)
    expect(orders, 'order 应当从 1 开始连续').toEqual(orders.map((_, i) => i + 1))

    expect(playableLevels().length, '至少应有两关可玩').toBeGreaterThanOrEqual(2)

    // 未知 id 一律取不到（存档校验依赖这一点）
    expect(getLevel('level-99')).toBeNull()
    expect(getPlayableLevel('level-99')).toBeNull()
    expect(isPlayableLevelId('level-99')).toBe(false)
    expect(isPlayableLevelId(DEFAULT_LEVEL_ID)).toBe(true)
  })

  it('X02 锁定关卡如果存在，只登记元数据，不含任何剧情', () => {
    const locked = LEVELS.filter((entry) => !isPlayable(entry))
    for (const entry of locked) {
      expect(entry.meta.title.length).toBeGreaterThan(0)
      expect(entry.meta.goal.length).toBeGreaterThan(0)
      // 锁定关卡不能有节点/选项这类剧情数据，否则就是半成品剧情
      expect('nodes' in entry, `${entry.meta.id} 不该有剧情节点`).toBe(false)
      expect('options' in entry, `${entry.meta.id} 不该有选项`).toBe(false)
    }
  })

  it.each(levels.map((level) => [level.meta.id, level] as const))(
    'X03 %s：结构校验无问题（节点、选项、结局、标记、金额）',
    (_id, level) => {
      const problems = validateLevel(level)
      expect(problems, `结构问题：\n${problems.join('\n')}`).toEqual([])
    },
  )

  it.each(levels.map((level) => [level.meta.id, level] as const))(
    'X04 %s：每条可达路径都能走通、金额不变式成立、能到复盘',
    (_id, level) => {
      const paths = allPaths(level)
      expect(paths.length, '应有可达路径').toBeGreaterThan(0)
      for (const path of paths) {
        const state = play(path, level.meta.id)
        expect(isStateConsistent(state), `路径 ${path.join(' → ')} 的状态不满足不变式`).toBe(true)
        expect(level.validBalances, `路径 ${path.join(' → ')} 的余额不在白名单`).toContain(state.balance)
        // 路径终点必须是结局或复盘（`allPaths` 只在这里收尾），且能再走到复盘
        const isEnding = state.node in level.endings
        const isDebrief = state.node === level.debriefNode
        expect(
          isEnding || isDebrief,
          `路径 ${path.join(' → ')} 停在 ${state.node}，既不是结局也不是复盘`,
        ).toBe(true)
        if (isEnding) {
          const reviewId = (level.nodeOptions[state.node] ?? []).find(
            (id) => level.options[id]?.to === level.debriefNode,
          )
          expect(reviewId, `结局 ${state.node} 应能走到复盘`).toBeTruthy()
        }
      }
    },
  )

  it.each(levels.map((level) => [level.meta.id, level] as const))(
    'X05 %s：付款选项只生效一次（重复提交不二次扣款）',
    (_id, level) => {
      for (const [id, option] of Object.entries(level.options)) {
        if (typeof option.effect?.balanceDelta !== 'number' || option.effect.balanceDelta >= 0) continue
        expect(option.effect.once, `扣款选项 ${id} 必须是一次性的（once: true）`).toBe(true)
      }
      // 逐个验证：确认一笔钱后，同样的选项不能再提交
      for (const [id, option] of Object.entries(level.options)) {
        if (!option.effect?.once || (option.effect.balanceDelta ?? 0) >= 0) continue
        const before = createInitialState(level.meta.id)
        // 直接构造一个「该选项可用」的状态代价太大，这里用真实路径走到它
        const reachable = allPaths(level).find((path) => path.includes(id))
        if (!reachable) continue
        const state = play(reachable, level.meta.id)
        const again = choose(state, id)
        expect(again.ok, `已生效过的 ${id} 不应再次成功`).toBe(false)
        expect(again.state.balance, '重复提交不得改变余额').toBe(state.balance)
        expect(before.balance, '初始余额不变').toBe(level.initialBalance)
      }
    },
  )

  it.each(levels.map((level) => [level.meta.id, level] as const))(
    'X06 %s：文案不含误导表述、网址、电话或卡号',
    (_id, level) => {
      const text = collectLevelText(level)

      // 不承诺追回、不出现「反杀」这类误导表述（否定式如「不保证追回」是允许的）
      expect(findForbiddenClaim(text), '出现肯定式误导表述').toBeNull()

      // 不出现任何可点/可复制的真实信息
      expect(text, '不应含网址').not.toMatch(/https?:\/\//)
      expect(text, '不应含 www').not.toMatch(/www\./i)
      expect(text, '不应含 11 位手机号').not.toMatch(/\b1[3-9]\d{9}\b/)
      expect(text, '不应含具体报警号码').not.toMatch(/96110|\b110\b/)
      // 16–19 位连续数字：银行卡号的典型长度，剧情里不该出现
      expect(text, '不应含卡号长度的数字串').not.toMatch(/\d{16,19}/)

      // 不鼓励与骗子周旋、套话或「反杀」
      expect(text).not.toContain('套话')
      expect(text).not.toContain('周旋')
    },
  )

  it.each(levels.map((level) => [level.meta.id, level] as const))(
    'X07 %s：提醒文案长度适合顶部横幅，且每个结局都有提醒',
    (_id, level) => {
      for (const [node, body] of Object.entries(level.reminders)) {
        if (typeof body !== 'string') continue
        expect(body.length, `节点 ${node} 的提醒过长`).toBeLessThanOrEqual(70)
        expect(body.length, `节点 ${node} 的提醒过短`).toBeGreaterThan(10)
      }
      for (const ending of Object.keys(level.endings)) {
        expect(level.reminders[ending], `结局 ${ending} 应有提醒`).toBeTruthy()
      }
      // 开场与复盘不需要提醒（那时没什么可提醒的）
      expect(level.reminders[level.startNode]).toBeUndefined()
      expect(level.reminders[level.debriefNode]).toBeUndefined()
    },
  )

  it.each(levels.map((level) => [level.meta.id, level] as const))(
    'X08 %s：复盘建议有 3 条，且包含止损与留证据',
    (_id, level) => {
      expect(level.debriefActions.length).toBe(3)
      const joined = level.debriefActions.join('\n')
      expect(joined, '建议应包含停止加钱').toMatch(/别再加钱|不追加|停止/)
      expect(joined, '建议应包含保存证据').toMatch(/截图|记录/)
      expect(joined, '建议应包含官方渠道').toContain('官方渠道')
      // 不承诺追回
      expect(findForbiddenClaim(joined)).toBeNull()
    },
  )

  it.each(levels.map((level) => [level.meta.id, level] as const))(
    'X09 %s：每关都从同一初始余额开局，且与妈妈转账卡片一致',
    (_id, level) => {
      const state = createInitialState(level.meta.id)
      expect(state.balance).toBe(level.initialBalance)
      expect(level.validBalances).toContain(level.initialBalance)
      // 生活费来源在每一关都交代（妈妈会话共用同一份消息）
      const mom = level.chat.sessions.find((s) => s.id === 'mom')
      expect(mom, '每关都应有妈妈会话（交代生活费来源）').toBeTruthy()
      const transfer = mom?.messages.find((m) => m.variant === 'transfer')
      expect(transfer?.amount, '转账卡片金额应与初始余额一致').toBe(level.initialBalance)
    },
  )

  it('X10 跨关隔离：一关的选项在另一关的状态上非法', () => {
    const first = getPlayableLevel('level-01')
    const second = getPlayableLevel('level-02')
    expect(first && second).toBeTruthy()
    if (!first || !second) return

    // 第一关的「进群看看」不该能在第二关生效
    const l2 = play(['start'], 'level-02')
    const wrong = choose(l2, 'enter-group')
    expect(wrong.ok).toBe(false)
    expect(wrong.state.balance, '非法选项不得改变金额').toBe(l2.balance)

    // 第二关的「按他说的做」同样不该能在第一关生效
    const l1 = play(['start'], 'level-01')
    const wrong2 = choose(l1, 'l2-cooperate')
    expect(wrong2.ok).toBe(false)
    expect(wrong2.state.node, '非法选项不得改变节点').toBe(l1.node)
  })

  it('X11 每一关的重开都只回到本关开场，并清空本关进度', () => {
    for (const level of levels) {
      // 走一条真实路径到复盘节点（重开只从复盘节点发出）
      const paths = allPaths(level).filter((path) => path.length > 1)
      expect(paths.length).toBeGreaterThan(0)
      const ended = play(paths[0], level.meta.id)

      // 走到复盘：结局节点上的「看复盘」
      const reviewId = (level.nodeOptions[ended.node] ?? []).find(
        (id) => level.options[id]?.to === level.debriefNode,
      )
      expect(reviewId, `${level.meta.id} 的结局应能进复盘`).toBeTruthy()
      if (!reviewId) continue
      const atDebrief = choose(ended, reviewId)
      expect(atDebrief.ok).toBe(true)
      if (!atDebrief.ok) continue
      expect(atDebrief.state.node).toBe(level.debriefNode)

      // 在复盘页重开
      const restarted = choose(atDebrief.state, 'restart')
      expect(restarted.ok).toBe(true)
      if (!restarted.ok) continue
      expect(restarted.state.levelId, '重开不得改变关卡').toBe(level.meta.id)
      expect(restarted.state.node, '重开应回到本关开场').toBe(level.startNode)
      expect(restarted.state.balance).toBe(level.initialBalance)
      expect(restarted.state.paidTotal).toBe(0)
      expect(restarted.state.riskTags).toEqual([])
      expect(restarted.state.history).toEqual([])
      expect(restarted.state.ending).toBeNull()
    }
  })
})
