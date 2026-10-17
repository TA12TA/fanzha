import { beforeEach, describe, expect, it } from 'vitest'
import {
  currentRandomState,
  nextRandom,
  pickSome,
  randomInt,
  resetRandomSeed,
  setRandomSeed,
} from '@/app/random'

/**
 * 可复现的随机源。
 *
 * 这个模块存在的唯一理由，就是让「随机」与「断言」共存：
 * 默认种子固定 → 测试稳定；浏览器用时间戳播种 → 每局不一样。
 * 所以这里必须证明两件事：**同种子同结果**、**换种子会变**。
 */

describe('R. 可复现随机源', () => {
  beforeEach(() => {
    resetRandomSeed()
  })

  it('相同的种子产生完全相同的序列', () => {
    setRandomSeed(12345)
    const a = Array.from({ length: 8 }, () => nextRandom())
    setRandomSeed(12345)
    const b = Array.from({ length: 8 }, () => nextRandom())
    expect(a).toEqual(b)
  })

  it('不同的种子产生不同的序列', () => {
    setRandomSeed(1)
    const a = Array.from({ length: 8 }, () => nextRandom())
    setRandomSeed(2)
    const b = Array.from({ length: 8 }, () => nextRandom())
    expect(a).not.toEqual(b)
  })

  it('默认种子是固定的：reset 之后回到同一个起点', () => {
    const first = nextRandom()
    resetRandomSeed()
    expect(nextRandom()).toBe(first)
  })

  it('种子 0 会被换成默认值，不会退化成恒等序列', () => {
    setRandomSeed(0)
    const a = nextRandom()
    const b = nextRandom()
    expect(a).not.toBe(b)
    expect(currentRandomState()).not.toBe(0)
  })

  it('输出落在 [0, 1) 内', () => {
    setRandomSeed(7)
    for (let i = 0; i < 300; i += 1) {
      const v = nextRandom()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('randomInt 覆盖到区间两端，且不越界', () => {
    setRandomSeed(99)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i += 1) {
      const v = randomInt(5)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(5)
      seen.add(v)
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4])
    expect(randomInt(0)).toBe(0)
  })

  it('pickSome 不重复、不越界，且条数正确', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f']
    setRandomSeed(2024)
    for (let n = 0; n <= pool.length + 2; n += 1) {
      const picked = pickSome(pool, n)
      expect(picked.length).toBe(Math.min(n, pool.length))
      expect(new Set(picked).size).toBe(picked.length)
      for (const item of picked) expect(pool).toContain(item)
    }
  })

  it('pickSome 确实会抽到不同的组合（不是永远取前几个）', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const combos = new Set<string>()
    for (let seed = 1; seed <= 20; seed += 1) {
      setRandomSeed(seed)
      combos.add(pickSome(pool, 3).join(''))
    }
    expect(combos.size, '20 个种子应该抽出多种不同组合').toBeGreaterThan(5)
  })
})
