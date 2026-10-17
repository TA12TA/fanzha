import shoePhoto from '@/assets/shop/shoe.jpg'
import headphonesPhoto from '@/assets/shop/headphones.jpg'
import cupPhoto from '@/assets/shop/cup.jpg'
import bagPhoto from '@/assets/shop/bag.jpg'
import lampPhoto from '@/assets/shop/lamp.jpg'
import bottlePhoto from '@/assets/shop/bottle.jpg'

/**
 * 虚构购物应用「青集商城」的商品数据。
 *
 * 商品照片已下载到 `src/assets/shop/`（公开图库），由 Vite 打包成本地资源；
 * 运行时不请求外部图片服务。价格、卖点、店铺信息均为虚构，不接真实下单/支付。
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
  /** 本地商品照片。 */
  image: string
  /** 商品图的兜底渐变（图片加载前/加载失败时）。 */
  colors: [string, string]
}

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
  image: shoePhoto,
  note: '订单状态、金额与售后进度以本页为准。',
  policy: '退款会原路退回支付账户；售后请在订单页发起。',
} as const

export const SHOP_CATEGORIES = ['全部', '鞋服', '数码', '生活'] as const

export const SHOP_PRODUCTS: ShopProduct[] = [
  {
    id: 'casual-shoes',
    name: '云感轻便跑步鞋',
    price: 199,
    category: '鞋服',
    tag: '本周热卖',
    description: '轻软鞋底，适合每天走路去上课。米白与雾蓝两色可选。',
    art: 'shoe',
    image: shoePhoto,
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
    image: headphonesPhoto,
    colors: ['#7d8cf5', '#4c58c9'],
  },
  {
    id: 'travel-cup',
    name: '随行咖啡杯',
    price: 69,
    category: '生活',
    tag: '好评 2.3 万',
    description: '一杯刚好 400ml，杯口可以单手打开，放得进书包侧袋。',
    art: 'cup',
    image: cupPhoto,
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
    image: bagPhoto,
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
    image: lampPhoto,
    colors: ['#f0c75e', '#c78a1d'],
  },
  {
    id: 'sport-bottle',
    name: '轻便水瓶',
    price: 39,
    category: '生活',
    tag: '轻便',
    description: '杯身只有 180g，宽口好清洗，适合带去操场。',
    art: 'bottle',
    image: bottlePhoto,
    colors: ['#73b8ee', '#3379b9'],
  },
]
