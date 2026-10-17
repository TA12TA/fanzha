/**
 * 可注入、可复现的随机源。
 *
 * 为什么不用 `Math.random()` 直接撒：这个项目里几乎所有行为都有断言盯着，
 * 真随机会让「班级通知群今天来了几条」这类用例在 CI 上随机变红。
 *
 * 做法：内置一个 mulberry32 伪随机数发生器，**默认种子固定** ——
 * 测试跑出来永远是同一批数据；浏览器在启动时用时间戳播种（见 `main.ts`），
 * 于是每局打开看到的通知都不一样。
 *
 * 这不是加密随机，也不需要：它只决定「这次给玩家看哪几条通知」。
 */

/** 默认种子。固定值 = 可复现，测试依赖这一点。 */
const DEFAULT_SEED = 0x9e3779b9

let state = DEFAULT_SEED

/** 设定种子（浏览器启动时用时间戳播种）。0 会被换成默认值，避免退化。 */
export function setRandomSeed(seed: number): void {
  const n = seed >>> 0
  state = n === 0 ? DEFAULT_SEED : n
}

/** 回到默认种子 —— 测试用它把状态复位。 */
export function resetRandomSeed(): void {
  state = DEFAULT_SEED
}

/** 当前内部状态（调试用；测试可以用它确认播种生效）。 */
export function currentRandomState(): number {
  return state
}

/** 下一个 [0, 1) 之间的数（mulberry32）。 */
export function nextRandom(): number {
  state = (state + 0x6d2b79f5) >>> 0
  let t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** [0, maxExclusive) 的整数。 */
export function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0
  return Math.floor(nextRandom() * maxExclusive)
}

/**
 * 从数组里**不重复**地随机取 count 个（先洗牌再切片）。
 * count 超过长度时返回整份的乱序副本。
 */
export function pickSome<T>(list: readonly T[], count: number): T[] {
  const copy = [...list]
  // Fisher-Yates：从后往前换，保证每种排列等概率
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  const n = Math.min(Math.max(0, count), copy.length)
  return copy.slice(0, n)
}
