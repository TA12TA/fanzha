/**
 * 虚构短信应用的数据。
 *
 * 短信内容全部为游戏内虚构信息；不读取真实短信、不申请短信权限、
 * 不向任何号码发送内容。第二关的模拟验证码会作为「安心钱包」的一条短信
 * 显示在这里，玩家可以在这台手机自己的短信应用里看到它。
 *
 * 除了剧情相关的两三条，其余都是日常通知/取件码/余额提醒等“无关紧要”的
 * 短信：真实手机的收件箱不会只躺着几条和骗局有关的信息。
 */

export interface SmsMessage {
  id: string
  from: 'them' | 'me'
  text: string
  time: string
}

export interface SmsThread {
  id: string
  name: string
  /** 列表头像上的一个字。 */
  initial: string
  tone: 'blue' | 'green' | 'amber' | 'violet' | 'rose' | 'slate'
  time: string
  unread: number
  messages: SmsMessage[]
}

export const SMS_THREADS: SmsThread[] = [
  {
    id: 'wallet',
    name: '安心钱包',
    initial: '安',
    tone: 'green',
    time: '今天 09:00',
    unread: 0,
    messages: [
      { id: 's1', from: 'them', text: '账户安全提醒：任何客服都不会索要短信验证码。', time: '今天 09:00' },
    ],
  },
  {
    id: 'shop',
    name: '青集商城',
    initial: '青',
    tone: 'rose',
    time: '今天 17:02',
    unread: 0,
    messages: [
      { id: 's1', from: 'them', text: '您的订单已签收，感谢在青集商城购物。', time: '今天 17:02' },
      { id: 's2', from: 'them', text: '订单有问题可在 App 内查看售后规则，平台不会要求您先转账。', time: '今天 17:02' },
    ],
  },
  {
    id: 'campus',
    name: '校园通知',
    initial: '校',
    tone: 'blue',
    time: '今天 16:20',
    unread: 1,
    messages: [
      { id: 's1', from: 'them', text: '本周五 19:00 在图书馆报告厅有一场反诈讲座，欢迎参加。', time: '今天 16:20' },
    ],
  },
  {
    id: 'courier',
    name: '快递驿站',
    initial: '递',
    tone: 'amber',
    time: '今天 15:40',
    unread: 1,
    messages: [
      { id: 's1', from: 'them', text: '您的包裹已到 3 号驿站，取件码 4-2-118，请 20:00 前取走。', time: '今天 15:40' },
    ],
  },
  {
    id: 'campus-card',
    name: '校园卡',
    initial: '卡',
    tone: 'violet',
    time: '今天 14:12',
    unread: 0,
    messages: [
      { id: 's1', from: 'them', text: '校园卡余额 42.60 元，今日消费 12.00 元。', time: '今天 14:12' },
    ],
  },
  {
    id: 'telecom',
    name: '青屏通信',
    initial: '通',
    tone: 'blue',
    time: '今天 11:30',
    unread: 1,
    messages: [
      { id: 's1', from: 'them', text: '本月流量已使用 18.6GB，剩余 1.4GB，请注意使用。', time: '今天 11:30' },
    ],
  },
  {
    id: 'cinema',
    name: '青屏影城',
    initial: '影',
    tone: 'rose',
    time: '今天 10:05',
    unread: 0,
    messages: [
      { id: 's1', from: 'them', text: '您预订的 10 月 18 日 19:30《风从海上来》出票成功，取票码 8842。', time: '今天 10:05' },
    ],
  },
  {
    id: 'food',
    name: '青食外卖',
    initial: '食',
    tone: 'amber',
    time: '昨天 19:22',
    unread: 0,
    messages: [
      { id: 's1', from: 'them', text: '您的订单已送达，祝您用餐愉快。', time: '昨天 19:22' },
    ],
  },
  {
    id: 'weather',
    name: '青屏天气',
    initial: '天',
    tone: 'blue',
    time: '昨天 07:05',
    unread: 0,
    messages: [
      { id: 's1', from: 'them', text: '明天多云转晴，12–21℃，早晚温差较大，记得带外套。', time: '昨天 07:05' },
    ],
  },
  {
    id: 'library',
    name: '青屏图书馆',
    initial: '书',
    tone: 'slate',
    time: '10月15日',
    unread: 0,
    messages: [
      { id: 's1', from: 'them', text: '您借阅的《网络社会学》将于 10 月 22 日到期，请及时归还或续借。', time: '10月15日' },
    ],
  },
  {
    id: 'music',
    name: '青听音乐',
    initial: '音',
    tone: 'violet',
    time: '10月15日',
    unread: 0,
    messages: [
      { id: 's1', from: 'them', text: '您关注的歌单「走回宿舍的那首歌」更新了 12 首。', time: '10月15日' },
    ],
  },
  {
    id: 'tutor',
    name: '辅导员办公室',
    initial: '辅',
    tone: 'green',
    time: '10月14日',
    unread: 0,
    messages: [
      { id: 's1', from: 'them', text: '下周一班会改到 302 教室，请提前十分钟到。', time: '10月14日' },
    ],
  },
  {
    id: 'secondhand',
    name: '二手书交易',
    initial: '书',
    tone: 'amber',
    time: '10月13日',
    unread: 1,
    messages: [
      { id: 's1', from: 'them', text: '同学，你那本《传播学概论》还在吗？我想收一本。', time: '10月13日' },
    ],
  },
  {
    id: 'mom',
    name: '妈妈',
    initial: '妈',
    tone: 'amber',
    time: '昨天 20:16',
    unread: 0,
    messages: [
      { id: 's1', from: 'them', text: '生活费已经转过去了，别乱花。', time: '昨天 20:16' },
      { id: 's2', from: 'me', text: '收到，谢谢妈。', time: '昨天 20:18' },
    ],
  },
  {
    id: 'video',
    name: '青影',
    initial: '影',
    tone: 'slate',
    time: '10月12日',
    unread: 0,
    messages: [
      { id: 's1', from: 'them', text: '你收藏的「川西自驾 3 天」更新了花絮。', time: '10月12日' },
    ],
  },
]
