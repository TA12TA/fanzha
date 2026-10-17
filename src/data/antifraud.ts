import { LEVELS, getPlayableLevel } from '@/data/levels'
import type { NodeId } from '@/game/types'

/**
 * 反诈提醒内容。
 *
 * 以「国家反诈中心提醒您」的口径，在剧情关键节点给出保护性提示。
 * 只使用文字：不绘制官方徽标、警徽或二维码，避免产出可被伪造的官方文书素材。
 * 不写具体报警电话与外部链接，统一表述为「通过官方渠道报警求助」。
 *
 * 提醒正文按关卡声明在各关文件里（`level.reminders`），本文件只提供取用方式。
 */

export const REMINDER_TITLE = '国家反诈中心提醒您'

/**
 * 弹窗提醒的第一行（2026-10-17 新增）。
 *
 * 用户要求：「国家反诈的提示应该为检测到你疑似被诈骗或者其他原因」。
 * 横幅只有一行字的空间，说不清"发生了什么"；弹窗有，所以把判断依据放在这里，
 * 让玩家知道**为什么**会突然被提醒 —— 而不是看到一条莫名其妙的标语。
 */
export const REMINDER_HEADLINE = '检测到你疑似正在被诈骗'

/**
 * 真实案例卡（手册里的「真实案例」栏目）。
 *
 * 来源、金额、时间与案情均来自 `CASES.md` 记录的可访问来源；
 * 游戏内不展示真实姓名、可点击外链、二维码或真实联系方式。
 * 名称统一匿名化为「受害人」，金额照原文，不补充来源没有的数字。
 */
export interface RealCase {
  id: string
  title: string
  body: string
  takeaway: string
  source: string
}

export const REAL_CASES: RealCase[] = [
  {
    id: 'refund-code',
    title: '“订单需要核验”，索要面部照片和验证码',
    body:
      '2024 年 4 月，一名受害人接到冒充电商客服的电话，对方称订单需要核验账户，' +
      '诱导其绑定银行卡，索要面部照片和短信验证码。信息提交后，银行卡被连续多笔转账，损失 8901 元。',
    takeaway: '订单问题在购物 App 的订单页核实；验证码、人脸信息不转发。',
    source: '天津理工大学管理学院反诈宣传页（转述，案例日期 2024-04）',
  },
  {
    id: 'flight-refund',
    title: '航班延误理赔，扫码刷脸后被转走 1.3 万元',
    body:
      '2024 年 5 月，一名受害人接到自称“机场工作人员”的电话，称航班延误可理赔 300 元。' +
      '其按指引在支付宝内输入网址退款，又扫描二维码并做人脸认证，银行卡内 1.3 万元被转走。',
    takeaway: '退款走原支付渠道；不要在陌生网址里扫码或刷脸。',
    source: '陵水县政府网转载警方反诈课堂（2024-05-29）',
  },
  {
    id: 'fake-police-screen',
    title: '冒充公检法，要求屏幕共享并转“保证金”',
    body:
      '2024 年 5 月，一名受害人接到自称刑侦民警的电话，称其银行卡涉嫌洗钱。' +
      '对方用云会议软件视频、发来伪造通缉令，要求开启屏幕共享并向银行发送指定短信，' +
      '最后以“保证金”为名骗走 98961 元。',
    takeaway: '公检法不会视频办案，不会要求屏幕共享，也没有“安全账户”。',
    source: '陵水县政府网转载警方反诈课堂（2024-05-29）',
  },
  {
    id: 'brushing-topup',
    title: '助力抢单充值后，被要求不断补任务',
    body:
      '2024 年 5 月，一名受害人被拉入 QQ 群做助力抢单，扫码充值 1000 元后无法提现。' +
      '客服称助力码有误，要求补做任务，受害人又充值 5000 元、3179.99 元和 32500 元，' +
      '仍无法提现，共损失 41679.99 元。',
    takeaway: '先垫付、先充值才能提现的“任务”，都是骗局。',
    source: '陵水县政府网转载警方反诈课堂（2024-05-29）',
  },
]

/** 取某关某节点对应的提醒正文；无则返回 null。 */
export function reminderFor(levelId: string, node: NodeId): string | null {
  const level = getPlayableLevel(levelId)
  if (!level) return null
  return level.reminders[node] ?? null
}

/** 某关的全部提醒（供测试与内容审校遍历）。 */
export function allReminders(levelId?: string): { levelId: string; node: NodeId; body: string }[] {
  const levels = levelId
    ? LEVELS.filter((entry) => entry.meta.id === levelId)
    : LEVELS
  const out: { levelId: string; node: NodeId; body: string }[] = []
  for (const entry of levels) {
    if (entry.kind !== 'playable') continue
    for (const [node, body] of Object.entries(entry.reminders)) {
      if (typeof body === 'string') out.push({ levelId: entry.meta.id, node, body })
    }
  }
  return out
}
