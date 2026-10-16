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
