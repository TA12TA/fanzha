import type { NodeId } from '@/game/types'

/**
 * 反诈提醒内容。
 *
 * 以「国家反诈中心提醒您」的口径，在剧情关键节点给出保护性提示。
 * 只使用文字：不绘制官方徽标、警徽或二维码，避免产出可被伪造的官方文书素材。
 * 不写具体报警电话与外部链接，统一表述为「通过官方渠道报警求助」。
 */

export const REMINDER_TITLE = '国家反诈中心提醒您'

/** 节点 → 提醒正文。没有条目的节点不弹提醒。 */
const REMINDERS: Partial<Record<NodeId, string>> = {
  invite:
    '有人自称学姐拉你进兼职群？先别急着答应。正规兼职不会通过陌生私聊招人，更不会让你先垫钱。',
  group:
    '刷单返利是当前高发的诈骗类型。凡是要求你先垫付、再返还的任务，都是诈骗，没有例外。',
  'transfer-100':
    '你正在向陌生账户支付「任务垫付款」。这类转账一旦完成，资金极难追回。转账前请再确认一次。',
  rebate:
    '平台里显示的收益只是页面上的数字，能不能提现才是关键。不要因为「收益在涨」而继续转账。',
  freeze:
    '以「账户冻结、需交解冻费」为由要求继续转账，是刷单诈骗的固定套路。请立即停止付款。',
  'transfer-300':
    '要求追加转账才能解冻提现，属于二次诈骗。请立即停止，不要再支付任何费用。',
  'end-clear': '你识别并拒绝了可疑的兼职邀请。遇到同类情况，保留证据并通过官方渠道举报。',
  'end-stop':
    '你已经停止付款，这是止损最关键的一步。请保存聊天与转账记录，通过官方渠道报警求助。',
  'end-loss':
    '如果已经转账，请立即停止一切付款，保存聊天与转账记录，通过官方渠道举报并及时报警求助。',
}

/** 取某个节点对应的提醒正文；无则返回 null。 */
export function reminderFor(node: NodeId): string | null {
  return REMINDERS[node] ?? null
}

/** 全部提醒（供测试与内容审校遍历）。 */
export function allReminders(): { node: NodeId; body: string }[] {
  return Object.entries(REMINDERS).map(([node, body]) => ({
    node: node as NodeId,
    body: body as string,
  }))
}
