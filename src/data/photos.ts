import lakeSunset from '@/assets/photos/lake-sunset.jpg'
import snowPeak from '@/assets/photos/snow-peak.jpg'
import beachSunset from '@/assets/photos/beach-sunset.jpg'
import cityNight from '@/assets/photos/city-night.jpg'
import ginkgoRoad from '@/assets/photos/ginkgo-road.jpg'
import starrySky from '@/assets/photos/starry-sky.jpg'

/**
 * 相册照片数据。
 *
 * 使用下载到 `src/assets/photos/` 的真实照片（Picsum 的公开图片），
 * 由 Vite 作为本地资源打包，运行时不请求外部图片服务。
 * 标题按实际照片内容命名，不再使用自绘 SVG。
 */

export interface Photo {
  id: string
  /** 照片名（查看器与缩略图的无障碍标签）。 */
  title: string
  /** 拍摄日期（虚构，用于相册按日期分组）。 */
  date: string
  /** 本地图片资源。 */
  src: string
}

/**
 * 相册内容（顺序即展示顺序）。
 *
 * 日期故意排成「同一天出去拍的连拍」：3 张一天、2 张一天、1 张一天，
 * 分组后每行不会只剩一张孤零零的缩略图，看起来更像真机相册。
 */
export const PHOTOS: Photo[] = [
  { id: 'p1', title: '峡湾与湖面', date: '10月12日', src: lakeSunset },
  { id: 'p2', title: '高地公路', date: '10月12日', src: snowPeak },
  { id: 'p3', title: '海岸悬崖', date: '10月12日', src: beachSunset },
  { id: 'p4', title: '山谷与松林', date: '10月9日', src: cityNight },
  { id: 'p5', title: '森林瀑布', date: '10月9日', src: ginkgoRoad },
  { id: 'p6', title: '橙色水母', date: '10月3日', src: starrySky },
]
