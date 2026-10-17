/**
 * 虚构购物应用「青集商城」的商品数据。
 *
 * 全部商品、价格、文案均为剧情世界的虚构内容；不接真实下单、支付、
 * 物流或客服接口，也不出现真实品牌、二维码或外链。
 */

export type ShopArt = 'shoe' | 'headphones' | 'cup' | 'bag' | 'lamp' | 'bottle'

export interface ShopProduct {
  id: string
  name: string
  /** 展示价，单位元（游戏内虚构数字）。 */
  price: number
  category: string
  tag: string
  description: string
  art: ShopArt
  /** 商品图的两端渐变色。 */
  colors: [string, string]
}

export const SHOP_CATEGORIES = ['全部', '鞋服', '数码', '生活'] as const

/**
 * 一笔与第二关剧情对应的虚构订单。
 *
 * 玩家在聊天里被告知「订单重复扣款」时，可以打开商城订单页自己核实；
 * 金额与商品名与 `level02` 的订单卡保持一致。这里不参与剧情状态，
 * 只作为购物 App 的只读订单数据。
 */
export const SHOP_ORDER = {
  id: 'QJ202610120427',
  title: '轻跑运动鞋 · 白色 42 码',
  amount: 199,
  status: '已完成 · 已签收',
  paidWith: '安心钱包余额',
  date: '2026-10-12 14:32',
  note: '本订单只有一笔正常扣款。订单状态、金额与售后进度以本页为准。',
  policy:
    '退款会原路退回支付账户，不需要你先转账、提供短信验证码或下载会议软件。订单有问题时，留在商城 App 内处理，不要添加陌生客服。',
} as const

export const SHOP_PRODUCTS: ShopProduct[] = [
  {
    id: 'canvas-shoes',
    name: '云感轻便帆布鞋',
    price: 199,
    category: '鞋服',
    tag: '本周热卖',
    description: '轻软鞋底，适合每天走路去上课。米白与雾蓝两色可选。',
    art: 'shoe',
    colors: ['#f6a26b', '#d8613c'],
  },
  {
    id: 'quiet-headphones',
    name: '静音降噪耳机',
    price: 129,
    category: '数码',
    tag: '新品尝鲜',
    description: '自习室和通勤路上都能用，收纳盒只有掌心大小。',
    art: 'headphones',
    colors: ['#7d8cf5', '#4c58c9'],
  },
  {
    id: 'travel-cup',
    name: '随行保温杯',
    price: 69,
    category: '生活',
    tag: '好评 2.3 万',
    description: '一杯刚好 400ml，杯盖可以单手打开，放得进书包侧袋。',
    art: 'cup',
    colors: ['#5bc7a8', '#20896f'],
  },
  {
    id: 'light-backpack',
    name: '轻旅双肩包',
    price: 159,
    category: '鞋服',
    tag: '校园推荐',
    description: '电脑夹层、侧袋和钥匙扣都有，背带加宽不勒肩。',
    art: 'bag',
    colors: ['#e6b35c', '#b8781d'],
  },
  {
    id: 'desk-lamp',
    name: '桌面护眼台灯',
    price: 89,
    category: '生活',
    tag: '宿舍好物',
    description: '三档亮度，长按可以调到最暗；灯臂能折起来省桌面空间。',
    art: 'lamp',
    colors: ['#f0c75e', '#c78a1d'],
  },
  {
    id: 'sport-bottle',
    name: '运动随手杯',
    price: 39,
    category: '生活',
    tag: '轻便',
    description: '杯身只有 180g，宽口好清洗，适合带去操场。',
    art: 'bottle',
    colors: ['#73b8ee', '#3379b9'],
  },
]
