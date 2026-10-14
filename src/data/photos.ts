/**
 * 相册照片数据。
 *
 * 照片全部是**自绘 SVG 风景**（见 `components/ScenicPhoto.vue`）：
 * 不使用任何真实照片或外部资源，因此没有版权风险、不增加仓库体积、离线可用。
 */

/** 风景类型（决定画哪一幅画）。 */
export type ScenicKind =
  | 'lake-sunset'
  | 'snow-peak'
  | 'beach-sunset'
  | 'city-night'
  | 'ginkgo-road'
  | 'starry-sky'

export interface Photo {
  id: string
  /** 照片名（查看器与缩略图的无障碍标签）。 */
  title: string
  /** 拍摄日期（虚构，用于相册按日期分组）。 */
  date: string
  kind: ScenicKind
}

/**
 * 相册内容（顺序即展示顺序）。
 *
 * 日期故意排成「同一天出去拍的连拍」：3 张一天、2 张一天、1 张一天，
 * 分组后每行不会只剩一张孤零零的缩略图，看起来更像真机相册。
 */
export const PHOTOS: Photo[] = [
  { id: 'p1', title: '晚霞下的湖面', date: '10月12日', kind: 'lake-sunset' },
  { id: 'p2', title: '远处的雪山', date: '10月12日', kind: 'snow-peak' },
  { id: 'p3', title: '海边的日落', date: '10月12日', kind: 'beach-sunset' },
  { id: 'p4', title: '城市夜景', date: '10月9日', kind: 'city-night' },
  { id: 'p5', title: '校园里的银杏道', date: '10月9日', kind: 'ginkgo-road' },
  { id: 'p6', title: '夜里拍的星空', date: '10月3日', kind: 'starry-sky' },
]
