import { describe, expect, it } from 'vitest'
import {
  isLevelLocked,
  levelCardAriaLabel,
  levelCtaText,
  levelStatusText,
} from '@/app/levelCardText'
import { getPlayableLevel } from '@/data/levels'
import { level03 } from '@/data/levels/level03'
import type { LevelEntry } from '@/game/level'
import type { LevelSlotSummary } from '@/game/storage'

/**
 * 关卡卡片文案的推导（纯函数）。
 *
 * 单独测这四个状态的原因：卡片上那三行字是「关卡数据 + 存档摘要」推出来的，
 * 一旦某个分支写错（例如锁定关卡也去读存档摘要、读到 null 拼出
 * 「余额 null 元」），只有把四个状态都走一遍才会暴露。
 * 组件测试只覆盖渲染路径，这里补的是**取值本身**。
 */

const playable = getPlayableLevel('level-01') as LevelEntry
const locked = level03 as LevelEntry

/** 造一个存档摘要。 */
function slot(patch: Partial<LevelSlotSummary> = {}): LevelSlotSummary {
  return { started: false, finished: false, balance: null, endingTitle: null, ...patch }
}

describe('L. 关卡卡片文案', () => {
  it('还没开始：状态「还没开始」、行动「开始」', () => {
    const s = slot()
    expect(levelStatusText(playable, s)).toBe('还没开始')
    expect(levelCtaText(playable, s)).toBe('开始')
  })

  it('进行中：带上当前余额，行动是「继续」', () => {
    const s = slot({ started: true, finished: false, balance: 600 })
    expect(levelStatusText(playable, s)).toBe('进行中 · 余额 600 元')
    expect(levelCtaText(playable, s)).toBe('继续')
  })

  it('已完成：带上结局名与余额，行动是「重看复盘」', () => {
    const s = slot({ started: true, finished: true, balance: 800, endingTitle: '提前识破' })
    expect(levelStatusText(playable, s)).toBe('已完成 · 提前识破（余额 800 元）')
    expect(levelCtaText(playable, s)).toBe('重看复盘')
  })

  it('已完成但没有结局标题时不留一个空括号', () => {
    const s = slot({ started: true, finished: true, balance: 300, endingTitle: null })
    expect(levelStatusText(playable, s)).toBe('已完成（余额 300 元）')
  })

  it('锁定关卡：不读存档摘要，直接「正在制作 / 敬请期待」', () => {
    // 关键：即使传进来一份「有余额」的摘要，也不该把它拼进文案里 ——
    // 第三关没有任何存档，显示「余额 null 元」是最典型的这类 bug。
    const s = slot({ started: true, finished: true, balance: 123, endingTitle: '不该出现' })
    expect(isLevelLocked(locked)).toBe(true)
    expect(levelStatusText(locked, s)).toBe('正在制作')
    expect(levelCtaText(locked, s)).toBe('敬请期待')
  })

  it('无障碍标签说清关号、标题、状态与「点了会怎样」', () => {
    const s = slot({ started: true, balance: 700 })

    expect(levelCardAriaLabel(playable, s)).toBe(
      '第一关 刷单返利，进行中 · 余额 700 元，进入',
    )
    // 历史轮播版对非中心卡传「先移到中间」
    expect(levelCardAriaLabel(playable, s, '先移到中间')).toContain('先移到中间')

    // 锁定关卡要明确说「暂不可进入」，不能让读屏用户以为能点进去
    expect(levelCardAriaLabel(locked, slot())).toBe('第三关 冒充公检法，正在制作，暂不可进入')
  })

  it('可玩关卡都不会被判成锁定', () => {
    for (const id of ['level-01', 'level-02']) {
      const entry = getPlayableLevel(id) as LevelEntry
      expect(isLevelLocked(entry), `${id} 不应是锁定关卡`).toBe(false)
    }
  })
})
