import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 设计 token 的静态检查。
 *
 * 起因：我为「文字层级」新增了一个 `--c-text-secondary`，颜色和已有的
 * `--c-text-soft` 几乎一样 —— 那不是层级，是重复。肉眼很难发现，
 * 但读 tokens.css 一查就露。
 *
 * 为什么用 node:fs 直接读文件，而不是 `import css from '...css?raw'`：
 * Vitest 默认把 CSS 导入替换成空字符串（`css: false`），`?raw` 拿到的也是
 * 空串（实测 length 为 0）。读源文件最直接，也不会被测试环境的 CSS 处理影响。
 *
 * 守住三类硬约束：
 * 1. 不允许出现两个「字面颜色几乎相同」的层级 token；
 * 2. 层级从深到浅，主内容与次要信息满足正文对比度；
 * 3. 最浅一档（辅助说明）不得用在可交互控件上。
 */

const root = path.resolve(__dirname, '..')
const tokensCss = readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8')
const baseCss = readFileSync(path.join(root, 'src/styles/base.css'), 'utf8')

/** 取变量的原始值（可能是 #hex，也可能是 var(--other)）。 */
function rawOf(name: string): string | null {
  const m = tokensCss.match(new RegExp(`--${name}:\\s*([^;]+);`))
  return m ? m[1].trim() : null
}

/** 是否是 var() 别名（别名是「同一个 token 的第二个名字」，不是新档）。 */
function aliasOf(name: string): string | null {
  const raw = rawOf(name)
  const m = raw?.match(/var\(--([\w-]+)\)/)
  return m ? m[1] : null
}

/** 解析到具体 hex（跟随别名链）。 */
function resolveHex(name: string): string | null {
  const raw = rawOf(name)
  if (!raw) return null
  const alias = aliasOf(name)
  if (alias) return resolveHex(alias)
  const hex = raw.match(/#[0-9a-fA-F]{6}/)
  return hex ? hex[0].toLowerCase() : null
}

/**
 * 收集「文字层级」token（`--c-text*`）。
 *
 * 刻意排除语义色（`--c-warn-text`）—— 它是「风险」这类有含义的颜色，
 * 彼此接近是正常的，与文字层级无关。
 */
function textLevelTokens(): { name: string; hex: string }[] {
  const rootBlock = tokensCss.slice(0, tokensCss.indexOf("[data-theme='day']"))
  const names = [...rootBlock.matchAll(/--(c-text[\w-]*)\s*:/g)].map((m) => m[1])
  return names
    .filter((name) => aliasOf(name) === null) // 别名不算独立一档
    .map((name) => ({ name, hex: resolveHex(name) }))
    .filter((e): e is { name: string; hex: string } => e.hex !== null)
}

/** sRGB 相对亮度（WCAG 定义）。 */
function luminance(hex: string): number {
  const rgb = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

/** 两色的对比度。 */
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

describe('V. 设计 token 的硬约束', () => {
  it('V01 不存在两个「字面颜色几乎相同」的层级 token（重复不是层级）', () => {
    const entries = textLevelTokens()

    expect(
      entries.length,
      `应至少有三个层级 token，实际 ${entries.length} 个：${entries.map((e) => e.name).join(', ')}`,
    ).toBeGreaterThanOrEqual(3)

    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const ratio = contrast(entries[i].hex, entries[j].hex)
        expect(
          ratio,
          `${entries[i].name}(${entries[i].hex}) 与 ${entries[j].name}(${entries[j].hex}) 太接近（对比度 ${ratio.toFixed(2)}）：要么合并成一个（用 var() 别名），要么拉开差距`,
        ).toBeGreaterThanOrEqual(1.25)
      }
    }
  })

  it('V02 层级从深到浅，主内容与次要信息满足正文对比度', () => {
    const text = resolveHex('c-text')
    const soft = resolveHex('c-text-soft')
    const tertiary = resolveHex('c-text-tertiary')
    expect(text && soft && tertiary, '三个层级 token 都应能解析出颜色').toBeTruthy()

    const cText = contrast(text as string, '#ffffff')
    const cSoft = contrast(soft as string, '#ffffff')
    const cTertiary = contrast(tertiary as string, '#ffffff')

    expect(cText).toBeGreaterThan(cSoft)
    expect(cSoft).toBeGreaterThan(cTertiary)
    expect(cText, `主内容对比度 ${cText.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
    expect(cSoft, `次要信息对比度 ${cSoft.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
    // 最浅一档是辅助文字，允许低于 4.5，但不能低到看不清
    expect(cTertiary, `辅助说明对比度 ${cTertiary.toFixed(2)}`).toBeGreaterThanOrEqual(3)
  })

  it('V03 最浅一档文字色不用于可交互控件', () => {
    const interactiveBlocks = [...baseCss.matchAll(/\.(btn[\w-]*|seg[\w-]*)\s*\{[^}]*\}/g)].map(
      (m) => m[0],
    )
    expect(interactiveBlocks.length, '应能匹配到按钮样式块').toBeGreaterThan(0)
    for (const block of interactiveBlocks) {
      expect(
        block.includes('--c-text-tertiary'),
        `可交互控件不应使用最浅一档文字色：\n${block}`,
      ).toBe(false)
    }
  })

  it('V04 白天主题只覆盖「壁纸上的内容」，不改写应用内的文字色', () => {
    const dayBlock = tokensCss.slice(tokensCss.indexOf("[data-theme='day']"))
    expect(dayBlock.length, '应有白天主题的变量覆盖段').toBeGreaterThan(0)
    // 只允许改 on-wall / wall-* 系列
    expect(dayBlock.includes('--c-text:'), '白天主题不应改写应用内的主文字色').toBe(false)
    expect(dayBlock.includes('--c-text-soft:'), '白天主题不应改写应用内的次要文字色').toBe(false)
    expect(dayBlock.includes('--c-on-wall:'), '白天主题应覆盖壁纸上的文字色').toBe(true)
  })
})
