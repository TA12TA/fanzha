import { beforeEach, describe, expect, it } from 'vitest'
import { CLASS_NEWS_MAX, CLASS_NEWS_MIN, classGroupNews, resetClassGroupNews } from '@/app/classNews'
import { resetRandomSeed, setRandomSeed } from '@/app/random'
import { CLASSGROUP_NEWS } from '@/data/levels/shared'

/**
 * 班级通知群的随机反诈通知。
 *
 * 用户要求「班级群通知多一点，随机一点，比如通知反诈的新闻这些」。
 * 这里锁住三件事：**条数在范围内**、**内容只来自通知池**、
 * **一局之内稳定（重进不变）、换种子会变**。
 * 最后一条是这功能的意义所在 —— 每次打开都一样就不叫随机了。
 */

const POOL_TEXTS = CLASSGROUP_NEWS.map((item) => item.text)

describe('N. 班级群随机通知', () => {
  beforeEach(() => {
    resetRandomSeed()
    resetClassGroupNews()
  })

  it('抽到的条数落在 3–5 之间', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      setRandomSeed(seed)
      resetClassGroupNews()
      const news = classGroupNews('level-01')
      expect(news.length, `seed=${seed}`).toBeGreaterThanOrEqual(CLASS_NEWS_MIN)
      expect(news.length, `seed=${seed}`).toBeLessThanOrEqual(CLASS_NEWS_MAX)
    }
  })

  it('内容只来自通知池，且不重复', () => {
    setRandomSeed(42)
    const news = classGroupNews('level-01')
    for (const item of news) {
      expect(POOL_TEXTS, `「${item.text}」不在通知池里`).toContain(item.text)
      expect(item.from).toBe('them')
      expect(item.name, '每条通知都要有发言人').toBeTruthy()
    }
    expect(new Set(news.map((n) => n.text)).size).toBe(news.length)
    expect(new Set(news.map((n) => n.id)).size).toBe(news.length)
  })

  it('一局之内稳定：同一个关卡反复取，拿到的是同一批', () => {
    setRandomSeed(7)
    const first = classGroupNews('level-01')
    // 中间推进随机源，模拟别的地方也用随机数
    setRandomSeed(999)
    const again = classGroupNews('level-01')
    expect(again).toEqual(first)
  })

  it('换种子 + 清缓存会换一批（这就是"随机一点"）', () => {
    setRandomSeed(1)
    resetClassGroupNews()
    const a = classGroupNews('level-01').map((n) => n.text).join('|')
    setRandomSeed(2)
    resetClassGroupNews()
    const b = classGroupNews('level-01').map((n) => n.text).join('|')
    expect(a).not.toBe(b)
  })

  it('两关各自独立抽取，互不影响', () => {
    setRandomSeed(5)
    const l1 = classGroupNews('level-01')
    const l2 = classGroupNews('level-02')
    expect(l1).not.toEqual(l2)
    // id 带关卡前缀，避免两关撞 id
    expect(l1.every((n) => n.id.startsWith('level-01-'))).toBe(true)
    expect(l2.every((n) => n.id.startsWith('level-02-'))).toBe(true)
  })

  it('通知池本身足够大，且都写了发言人与正文', () => {
    expect(CLASSGROUP_NEWS.length).toBeGreaterThanOrEqual(CLASS_NEWS_MAX * 2)
    for (const item of CLASSGROUP_NEWS) {
      expect(item.name.length).toBeGreaterThan(0)
      expect(item.text.length).toBeGreaterThan(10)
      // 不写可跳转的链接（产品边界：不给可点击的真实/假链接）
      expect(item.text).not.toMatch(/https?:\/\//)
    }
  })
})
