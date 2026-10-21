import cityImage from '@/assets/videos/city.jpg'
import seaImage from '@/assets/videos/sea.jpg'
import foodImage from '@/assets/videos/food.jpg'
import musicImage from '@/assets/videos/music.jpg'
import roadImage from '@/assets/videos/road.jpg'
import campusImage from '@/assets/videos/campus.jpg'
import antiFraudVideo from '@/assets/videos/anti-fraud.mp4'
import antiFraudPoster from '@/assets/videos/anti-fraud.jpg'

/**
 * 虚构短视频应用「青影」的内容数据。
 *
 * 视频标题、作者、播放量与评论全部虚构；封面是下载到 `src/assets/videos/`
 * 的真实照片，由 Vite 本地打包，运行时不请求外部视频或图库服务。
 */

export interface VideoItem {
  id: string
  title: string
  creator: string
  views: string
  /** 展示用时长。 */
  duration: string
  category: string
  blurb: string
  /** 本地封面照片。 */
  image: string
  /** 可选的真实视频文件；没有时只展示封面。 */
  video?: string
  /** 封面遮罩的渐变色。 */
  colors: [string, string]
  /** 展示用点赞数（虚构条目为虚构数字，真实视频为原视频公开数字）。 */
  likes: number
  /** 评论区可展示的评论（真实视频只保留可公开、无个人信息的部分）。 */
  comments: string[]
  /** 原视频的公开评论总数；省略时按 comments.length 计算。 */
  commentTotal?: number
  /** 底部音乐条文案。 */
  music: string
}

export const VIDEO_CATEGORIES = ['推荐', '生活', '旅行', '音乐', '校园', '反诈'] as const

export const VIDEOS: VideoItem[] = [
  {
    id: 'anti-fraud-lover',
    title: '反诈短剧：专属恋人',
    creator: '国家反诈中心',
    views: '反诈宣传短剧',
    duration: '04:03',
    category: '反诈',
    blurb: '网恋对象迟迟不肯见面，却一直催你转账——先停下来想一想。',
    image: antiFraudPoster,
    video: antiFraudVideo,
    colors: ['#2c4a3e', '#091511'],
    likes: 943,
    comments: ['网恋第一步，先见人', '多多宣传'],
    commentTotal: 65,
    music: '国家反诈中心 · 原声',
  },
  {
    id: 'last-metro',
    title: '城市最后一班地铁',
    creator: '路灯下的小周',
    views: '12.8 万次播放',
    duration: '04:32',
    category: '生活',
    blurb: '从终点站走回学校的那段路，藏着很多人的一天。',
    image: cityImage,
    colors: ['#344a7a', '#101a2e'],
    likes: 23800,
    comments: ['这个点地铁里真的全是故事。', '拍得好安静，像把城市调成了静音。'],
    music: '原声 · 路灯下的小周',
  },
  {
    id: 'seaside-sunset',
    title: '海边日落，风把云吹开了',
    creator: '海盐汽水',
    views: '8.6 万次播放',
    duration: '02:18',
    category: '旅行',
    blurb: '没有旁白，只有浪声和一整片慢慢暗下来的天空。',
    image: seaImage,
    colors: ['#f08a6a', '#734a9e'],
    likes: 15600,
    comments: ['看到最后那一下，突然想去海边了。', '这个颜色不用滤镜都好看。'],
    music: '原声 · 海盐汽水',
  },
  {
    id: 'late-noodle',
    title: '深夜食堂：一碗热汤面',
    creator: '阿满的厨房',
    views: '5.2 万次播放',
    duration: '06:05',
    category: '生活',
    blurb: '宿舍也能做的简单夜宵，步骤少、锅也好洗。',
    image: foodImage,
    colors: ['#c98a4b', '#6f3f25'],
    likes: 9200,
    comments: ['收藏了，明晚就试。', '看起来比外卖香。'],
    music: '轻食厨房 · 原声',
  },
  {
    id: 'band-rehearsal',
    title: '校园乐队排练日记',
    creator: '地下二层',
    views: '3.9 万次播放',
    duration: '07:44',
    category: '音乐',
    blurb: '为了迎新晚会排练的第三周，主唱终于没有忘词。',
    image: musicImage,
    colors: ['#7b5bd6', '#33206f'],
    likes: 7600,
    comments: ['主唱最后那个笑太真实了。', '求完整版！'],
    music: '地下二层 · 排练室原声',
  },
  {
    id: 'west-sichuan-road',
    title: '川西自驾 3 天：把手机放下',
    creator: '在路上的老陈',
    views: '15.4 万次播放',
    duration: '10:12',
    category: '旅行',
    blurb: '山路、云海和一间没有信号的民宿。',
    image: roadImage,
    colors: ['#4b8f9c', '#1c3f57'],
    likes: 32400,
    comments: ['这路看着就晕，但好想开一次。', '没有信号的那段最治愈。'],
    music: '一路向西 · 原声',
  },
  {
    id: 'campus-evening',
    title: '傍晚六点的校园',
    creator: '青禾摄影',
    views: '2.1 万次播放',
    duration: '03:10',
    category: '校园',
    blurb: '下课铃、篮球场和食堂飘出来的第一阵饭香。',
    image: campusImage,
    colors: ['#e7a45c', '#7c4a54'],
    likes: 4300,
    comments: ['我们学校也是这个点最好看。', '食堂那阵香味隔着屏幕都闻到了。'],
    music: '校园傍晚 · 原声',
  },
]
