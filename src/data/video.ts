/**
 * 虚构视频应用「青影」的内容数据。
 *
 * 视频标题、作者、播放量与封面全部为虚构；不包含真实视频文件、
 * 外链或第三方平台素材。
 */

export type VideoArt = 'city' | 'sea' | 'food' | 'music' | 'road' | 'campus'

export interface VideoItem {
  id: string
  title: string
  creator: string
  views: string
  /** 展示用时长。 */
  duration: string
  category: string
  blurb: string
  art: VideoArt
  colors: [string, string]
}

export const VIDEO_CATEGORIES = ['推荐', '生活', '旅行', '音乐', '校园'] as const

export const VIDEOS: VideoItem[] = [
  {
    id: 'last-metro',
    title: '城市最后一班地铁',
    creator: '路灯下的小周',
    views: '12.8 万次播放',
    duration: '04:32',
    category: '生活',
    blurb: '从终点站走回学校的那段路，藏着很多人的一天。',
    art: 'city',
    colors: ['#344a7a', '#101a2e'],
  },
  {
    id: 'seaside-sunset',
    title: '海边日落，风把云吹开了',
    creator: '海盐汽水',
    views: '8.6 万次播放',
    duration: '02:18',
    category: '旅行',
    blurb: '没有旁白，只有浪声和一整片慢慢暗下来的天空。',
    art: 'sea',
    colors: ['#f08a6a', '#734a9e'],
  },
  {
    id: 'late-noodle',
    title: '深夜食堂：一碗热汤面',
    creator: '阿满的厨房',
    views: '5.2 万次播放',
    duration: '06:05',
    category: '生活',
    blurb: '宿舍也能做的简单夜宵，步骤少、锅也好洗。',
    art: 'food',
    colors: ['#c98a4b', '#6f3f25'],
  },
  {
    id: 'band-rehearsal',
    title: '校园乐队排练日记',
    creator: '地下二层',
    views: '3.9 万次播放',
    duration: '07:44',
    category: '音乐',
    blurb: '为了迎新晚会排练的第三周，主唱终于没有忘词。',
    art: 'music',
    colors: ['#7b5bd6', '#33206f'],
  },
  {
    id: 'west-sichuan-road',
    title: '川西自驾 3 天：把手机放下',
    creator: '在路上的老陈',
    views: '15.4 万次播放',
    duration: '10:12',
    category: '旅行',
    blurb: '山路、云海和一间没有信号的民宿。',
    art: 'road',
    colors: ['#4b8f9c', '#1c3f57'],
  },
  {
    id: 'campus-evening',
    title: '傍晚六点的校园',
    creator: '青禾摄影',
    views: '2.1 万次播放',
    duration: '03:10',
    category: '校园',
    blurb: '下课铃、篮球场和食堂飘出来的第一阵饭香。',
    art: 'campus',
    colors: ['#e7a45c', '#7c4a54'],
  },
]
