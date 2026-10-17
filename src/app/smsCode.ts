/**
 * 模拟短信验证码。
 *
 * 全部为本地生成、只在本游戏内显示：不读取真实短信、不申请任何权限、
 * 也不把玩家输入的任何内容发送出去。它只是把「对方索要验证码」这个骗局
 * 的核心环节演出来 —— 没有这一步，玩家就只能读到一句"别给验证码"的结论。
 *
 * 设计约束：
 * - 每次索要都是**新的**验证码（包括输错后重发），所以不能用固定字面量；
 * - 生成逻辑可注入随机源，便于测试得到确定值；
 * - 输入清洗与判定都是纯函数，界面只负责展示与转发。
 */

/** 验证码位数。6 位是国内短信验证码最常见的长度，也不需要额外解释。 */
export const CODE_LENGTH = 6

/**
 * 生成一个验证码（6 位数字，首位非 0）。
 *
 * 不用 `Math.random().toString().slice(2, 8)`：那样首位可能是 0，
 * 看起来不像验证码，而且长度也不稳定。
 */
export function generateCode(rng: () => number = Math.random): string {
  const n = Math.floor(rng() * 900000) + 100000
  return String(n)
}

/** 只保留数字并截到 6 位 —— 输入框用它做实时清洗，粘贴带空格也能收。 */
export function sanitizeCodeInput(raw: string): string {
  return String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, CODE_LENGTH)
}

/** 是否已填满 6 位（决定「确认」按钮能不能点）。 */
export function isCodeComplete(raw: string): boolean {
  return sanitizeCodeInput(raw).length === CODE_LENGTH
}

/** 输入是否与当前验证码一致。 */
export function codeMatches(raw: string, code: string): boolean {
  return sanitizeCodeInput(raw) === code
}

/**
 * 把短信模板里的 `{code}` 换成实际验证码。
 *
 * 模板来自关卡数据（`codeGate.smsTemplate`），校验函数会强制它必须含 `{code}`，
 * 否则短信发出去却没有码，玩家会被卡死。
 */
export function renderSms(template: string, code: string): string {
  return template.split('{code}').join(code)
}
