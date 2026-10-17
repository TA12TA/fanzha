/**
 * 虚构音乐应用「青听音乐」的曲库。
 *
 * 歌名、歌手、专辑均为虚构；不包含真实音频文件、版权素材或外链。
 * 播放器只做界面内的进度演示，不请求任何音乐服务。
 */

export interface MusicTrack {
  id: string
  title: string
  artist: string
  album: string
  /** 时长（秒）。 */
  duration: number
  /** 封面渐变的两端颜色。 */
  colors: [string, string]
  mood: string
}

export interface MusicPlaylist {
  id: string
  title: string
  subtitle: string
  colors: [string, string]
  trackIds: string[]
}

export const MUSIC_TRACKS: MusicTrack[] = [
  {
    id: 'evening-letter',
    title: '晚风寄信',
    artist: '林屿',
    album: '把夏天折起来',
    duration: 226,
    colors: ['#8e7dff', '#4a3fbd'],
    mood: '晚风',
  },
  {
    id: 'playground-summer',
    title: '操场边的夏天',
    artist: '青柠汽水',
    album: '下课以后',
    duration: 198,
    colors: ['#ffb36b', '#e26b4f'],
    mood: '轻快',
  },
  {
    id: 'mountain-night',
    title: '山城夜行',
    artist: '远山乐队',
    album: '沿着江边走',
    duration: 254,
    colors: ['#5f8ef7', '#26428f'],
    mood: '夜行',
  },
  {
    id: 'after-rain',
    title: '雨停之后',
    artist: '白昼电台',
    album: '天气转晴',
    duration: 211,
    colors: ['#61c8c0', '#247f89'],
    mood: '清透',
  },
  {
    id: 'ask-the-wind',
    title: '把答案交给风',
    artist: '小满',
    album: '没有标准答案',
    duration: 240,
    colors: ['#f08ab9', '#a83d72'],
    mood: '松弛',
  },
]

export const MUSIC_PLAYLISTS: MusicPlaylist[] = [
  {
    id: 'walk-home',
    title: '走回宿舍的那首歌',
    subtitle: '晚风 · 慢走',
    colors: ['#5a6cd6', '#232f74'],
    trackIds: ['evening-letter', 'after-rain'],
  },
  {
    id: 'study-room',
    title: '自习室轻背景',
    subtitle: '不打扰 · 专注',
    colors: ['#49a99f', '#1c615f'],
    trackIds: ['mountain-night', 'ask-the-wind'],
  },
]
