import { describe, expect, it } from 'vitest'
import {
  CODE_LENGTH,
  codeMatches,
  generateCode,
  isCodeComplete,
  renderSms,
  sanitizeCodeInput,
} from '@/app/smsCode'

/**
 * 模拟验证码的纯函数。
 *
 * 这些函数决定了「玩家能不能顺利把码填进去」，所以必须单独测：
 * 生成器越界、清洗逻辑写错、模板替换漏了 `{code}`，任何一个出错
 * 都会让玩家拿着一条短信却永远填不对 —— 这种 bug 在界面测试里很难看出来。
 */

describe('V. 模拟验证码', () => {
  it('生成的验证码固定 6 位、全是数字、且不以 0 开头', () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generateCode()
      expect(code).toMatch(/^\d{6}$/)
      expect(code[0], '首位不应是 0（看起来不像验证码）').not.toBe('0')
      expect(code.length).toBe(CODE_LENGTH)
    }
  })

  it('生成器吃注入的随机源，便于测试得到确定值', () => {
    // rng 返回 0 → 下界；返回 0.999… → 上界附近
    expect(generateCode(() => 0)).toBe('100000')
    expect(generateCode(() => 0.999999)).toBe('999999')
  })

  it('同一随机源重复调用会得到同一个值（证明没在用 Math.random 兜底）', () => {
    const rng = () => 0.5
    expect(generateCode(rng)).toBe(generateCode(rng))
  })

  it('输入清洗：只留数字、截到 6 位（粘贴带空格/横线也能收）', () => {
    expect(sanitizeCodeInput(' 123 456 ')).toBe('123456')
    expect(sanitizeCodeInput('123-456')).toBe('123456')
    expect(sanitizeCodeInput('abc')).toBe('')
    expect(sanitizeCodeInput('1234567')).toBe('123456')
  })

  it('是否填满 6 位', () => {
    expect(isCodeComplete('123456')).toBe(true)
    expect(isCodeComplete('12345')).toBe(false)
    expect(isCodeComplete(' 123 456 ')).toBe(true)
  })

  it('比对时先清洗再比，所以「带空格粘贴」不会误判为错', () => {
    expect(codeMatches(' 123 456 ', '123456')).toBe(true)
    expect(codeMatches('123457', '123456')).toBe(false)
    expect(codeMatches('', '123456')).toBe(false)
  })

  it('模板替换会换掉全部 {code}（不止第一个）', () => {
    expect(renderSms('校验码 {code}，{code} 请勿转发', '364117')).toBe(
      '校验码 364117，364117 请勿转发',
    )
    expect(renderSms('没有占位符', '364117')).toBe('没有占位符')
  })
})
