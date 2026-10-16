import type { ComingSoonLevel } from '@/game/level'

/**
 * 第三关「冒充公检法」：**只有元数据，没有剧情**。
 *
 * 大厅里以锁定卡片呈现（`aria-disabled`，点击给出明确反馈而不进入）。
 * 刻意不写任何节点与话术：半成品剧情比明确的「正在制作」更容易误导玩家，
 * 而且「安全账户」这类话术一旦写成可读剧本，本身就接近可复用的诈骗素材。
 */
export const level03: ComingSoonLevel = {
  kind: 'coming-soon',
  meta: {
    id: 'level-03',
    order: 3,
    ordinal: '第三关',
    title: '冒充公检法',
    category: '冒充公检法',
    blurb: '「你涉嫌一起案件」的电话，下一步会要你把钱转到「安全账户」。',
    goal: '公检法不会打电话让你转账，也没有所谓的安全账户。',
    accent: ['#e0483a', '#a8271b'],
  },
  note: '正在制作，敬请期待',
}
