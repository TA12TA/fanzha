import { nextRandom, pickSome } from '@/app/random'
import { CLASSGROUP_NEWS } from '@/data/levels/shared'
import type { ChatMessage } from '@/game/level'

/**
 * 班级通知群里的**随机反诈通知**。
 *
 * 用户要求「班级群通知多一点，随机一点，比如通知反诈的新闻这些」。
 *
 * 三个必须的处理：
 * 1. **每关只抽一次**（模块级缓存）。抽签如果放在渲染里，切个应用回来整段通知就
 *    换了一批，"群消息"立刻变成假的了；放在模块里缓存，一局之内稳定，
 *    重新打开页面才会换。这一点和 `app/chatReveal.ts` 的记忆方式是同一套思路。
 * 2. **随机源可注入**（`app/random.ts`）。浏览器启动时用时间戳播种，
 *    所以每局不一样；测试里种子固定，断言才不会随机变红。
 * 3. 抽到的条数在 3–5 之间 —— 太少显得群很冷清，太多会把会话详情撑得很长，
 *    而且「逐条出现」的动画会拖很久。
 */

/** 抽到的条数范围（含两端）。 */
export const CLASS_NEWS_MIN = 3
export const CLASS_NEWS_MAX = 5

/** 关卡 id → 这一关抽到的通知（抽一次，之后固定）。 */
const cache = new Map<string, ChatMessage[]>()

/**
 * 取某关班级群的随机通知（首次调用时抽取）。
 *
 * `later` 只影响签名，不用改它；保留参数是为了将来按节点变化时不必改调用方。
 */
export function classGroupNews(levelId: string): ChatMessage[] {
  const hit = cache.get(levelId)
  if (hit) return hit

  const span = CLASS_NEWS_MAX - CLASS_NEWS_MIN + 1
  const count = CLASS_NEWS_MIN + Math.floor(nextRandom() * span)
  const picked = pickSome(CLASSGROUP_NEWS, count)

  const built: ChatMessage[] = picked.map((item, index) => ({
    id: `${levelId}-news-${index}`,
    from: 'them',
    name: item.name,
    text: item.text,
  }))

  cache.set(levelId, built)
  return built
}

/**
 * 清空缓存（下一次取会重新抽）。
 * 「重新开始本局」和测试用它 —— 否则重开一局看到的还是上一批通知。
 */
export function resetClassGroupNews(): void {
  cache.clear()
}
