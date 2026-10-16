import type { AvatarTone, ChatMessage } from '@/game/level'

/**
 * 跨关卡共用数据。
 *
 * 这里只放**与具体骗局无关**的东西：虚构应用命名、通用手册、家人与班级群
 * 这类纯拟真内容、头像。任何属于某一关的话术、金额、节点都留在该关文件里。
 *
 * 命名统一由这里定义：改名时全局一致，避免同一部手机里出现两个叫法。
 */

/** 虚构应用名（全局统一命名）。 */
export const BRAND = {
  os: '青屏 OS',
  chat: '青讯',
  wallet: '安心钱包',
  /**
   * 反诈知识应用。
   * 识骗手册已并入「国家反诈中心」应用：桌面图标、应用内标题与复盘统一用它，
   * 不再出现两个反诈入口。
   */
  manual: '国家反诈中心',
  /** 应用内页面的栏目名（用于应用标题下方副标题）。 */
  manualSection: '识骗手册',
  /** 关卡大厅（桌面入口 + 大厅标题）。 */
  levels: '关卡',
  /** 家人（生活费来源，纯剧情，不对应任何真实的人）。 */
  mom: '妈妈',
  /** 班级通知群（纯拟真，不参与剧情分支）。 */
  classGroup: '班级通知群',
  counselor: '辅导员',
} as const

/**
 * 发言者头像表。
 * 用「一个字 + 一种色调」表示虚构联系人，避免任何真实照片或平台头像。
 *
 * 这张表覆盖所有关卡的发言人：它只是「显示名 → 首字 + 色调」的视觉映射，
 * 不含任何剧情信息，因此集中一处维护比每关各带一份更不容易漂移。
 * 未知显示名会回退到「首字 + 灰调」，所以新关卡漏登记也不会渲染出错。
 */
export const SENDER_AVATARS: Record<string, { text: string; tone: AvatarTone }> = {
  我: { text: '我', tone: 'blue' },
  [BRAND.mom]: { text: '妈', tone: 'amber' },
  [BRAND.counselor]: { text: '辅', tone: 'green' },
  '群成员 A': { text: 'A', tone: 'green' },
  '群成员 B': { text: 'B', tone: 'slate' },
  // 第一关「刷单返利」
  '自称“学姐”的林某': { text: '姐', tone: 'violet' },
  '群主·任务派单员': { text: '群', tone: 'blue' },
  // 第二关「冒充客服退款」
  '青集商城·客服': { text: '客', tone: 'rose' },
  '青集商城·官方客服': { text: '官', tone: 'green' },
}

/** 取某个发送者的头像；未知发送者回退到首字 + 灰调。 */
export function avatarFor(name: string): { text: string; tone: AvatarTone } {
  const hit = SENDER_AVATARS[name]
  if (hit) return hit
  return { text: name.slice(0, 1) || '?', tone: 'slate' }
}

/**
 * 每关初始模拟余额都是 800 元（并列剧本，不是同一笔钱连续消耗）。
 * 妈妈会话里的转账卡片金额也用这个值，保证「钱从哪来」在故事里交代清楚。
 */
export const INITIAL_BALANCE = 800

/** 妈妈会话：生活费从哪来说清楚，顺带给一句真实提醒。 */
export const MOM_MESSAGES: ChatMessage[] = [
  {
    id: 'm1',
    from: 'them',
    name: BRAND.mom,
    text: '这个月生活费转过去了，收到回我一声。',
  },
  {
    id: 'm2',
    from: 'them',
    name: BRAND.mom,
    variant: 'transfer',
    amount: INITIAL_BALANCE,
    transferStatus: 'received',
    transferNote: '生活费',
    text: '转账给你',
  },
  {
    id: 'm3',
    from: 'me',
    text: '收到啦，谢谢妈',
  },
  {
    id: 'm4',
    from: 'them',
    name: BRAND.mom,
    text: '在外边别乱花。要你交钱才能做兼职的，一律别信。',
  },
]

/** 班级通知群：纯拟真，不参与剧情分支，用来让会话列表像个真的消息应用。 */
export const CLASSGROUP_MESSAGES: ChatMessage[] = [
  {
    id: 'c1',
    from: 'them',
    name: BRAND.counselor,
    text: '下周一上午 9 点，带学生证到教材科领本学期教材。',
  },
]

/**
 * 反诈应用内的通用内容（不剧透任何一关的复盘）。
 * 「识骗手册」已并入国家反诈中心应用，这里作为应用内的栏目名保留。
 */
export const MANUAL_GENERAL = {
  title: '识骗手册',
  items: [
    {
      title: '让你先垫钱的兼职，直接退出',
      body: '正规兼职不要求你先出钱或先买任务。凡是「做完再返你」还要你先垫的，都是在拿你的钱试你的底线。',
    },
    {
      title: '群里晒的收益，不算证据',
      body: '晒收益的往往就是同一批人。收益能不能进你自己的账户，只有你自己查了才算数。',
    },
    {
      title: '页面上的数字不等于到账',
      body: '平台里那个「返利」「退款」「余额」，可能只是页面上的字。能不能提出来才是关键。',
    },
    {
      title: '「冻结要交解冻费」是升级信号',
      body: '已经拿不到钱了，对方还让你继续交钱——这时候该做的是停手，不是凑钱。',
    },
    {
      title: '退钱不需要你先转钱',
      body: '真的退款是钱进你的账户，不需要你先转「验证金」「保证金」，也不需要你的短信验证码。',
    },
    {
      title: '万一已经转出去了',
      body: '停止操作，保存聊天和转账记录，通过官方渠道举报并及时报警求助。报警不保证追回损失，但越早处理越有利。',
    },
  ],
  disclaimer: '以上是通用提醒，不构成法律意见，也不承诺追回损失。',
} as const

/**
 * 结尾给出的可执行建议（两关共用，不承诺追回）。
 * 放在 shared 里是因为这三条与具体骗局类型无关。
 */
export const SHARED_ACTIONS: string[] = [
  '别再加钱。对方还在要，就是直接不回。',
  '截图留好聊天记录、转账记录和对方账号，别删对话。',
  '通过官方渠道举报，必要时报警。报警不保证追回，但越早越好。',
]

/** 通用免责说明（手册页脚）。 */
export const MANUAL_DISCLAIMER = MANUAL_GENERAL.disclaimer
