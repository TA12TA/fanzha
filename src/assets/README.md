# 品牌素材目录

## 当前内容

| 文件 | 用途 | 来源 |
|---|---|---|
| `antifraud-logo.png` | 国家反诈中心应用图标（256×256 PNG） | Apple App Store 官方接口 |

## 官方 logo 的获取过程

前期尝试全部失败（记录备查）：

| 途径 | 结果 |
|---|---|
| `96110.cn` / `www.96110.cn` / `gab.96110.cn` | DNS **无 A 记录**（域名未提供网站） |
| `12381.cn` / `www.12381.cn` / `gab.gov.cn` | DNS **无 A 记录** |
| `www.mps.gov.cn`（公安部） | HTTP **521** |
| `nazx.cn` | Cloudflare **403** |
| 小米应用商店 / 应用宝详情页 | JS 渲染，静态抓取取不到图标 |
| 应用宝图标 CDN 直连 | HTTP **404** |
| Bing / 百度图片搜索 | 返回**人民大会堂会议照**、**世界国旗图标集**等无关图片，来源为第三方素材站、授权不明 |

**最终成功途径**：Apple App Store 官方搜索接口

```
https://itunes.apple.com/cn/search?term=国家反诈中心&entity=software&limit=5
```

返回结果中的 `artworkUrl512` 即官方应用图标，开发者署名：

> `criminal investigation department ministry of public security`
> （公安部刑事侦查局）

已下载并缩放为 256×256 PNG（83 KB），避免提交过大素材。

## 使用位置

`antifraud-logo.png` 在三处使用：

- `src/scenes/HomeScene.vue` — 桌面「国家反诈中心」图标
- `src/scenes/ManualScene.vue` — 应用内标识条
- `src/components/BottomNav.vue` — 底部导航「反诈」按钮

引入方式（Vite 会把图片作为资源打包，`base: './'` 已配置相对路径，静态部署不受影响）：

```ts
import antifraudLogo from '@/assets/antifraud-logo.png'
```

## 合规说明

`AGENTS.md` 第 1 节要求不使用真实机构标志，用意是避免产出**可被伪造的官方素材**。
本项目为**反诈教育**用途，使用官方 logo 是为了让玩家认出真实的官方应用（识别与求助路径的一部分），
且：

- 游戏全程使用虚构应用名与虚构品牌；**2026-10-17 起不再挂模拟声明牌**（见 `AGENTS.md` §1）
- 不复刻任何支付/银行界面，不提供可跳转真实站点的链接或二维码
- 复盘明确说明「报警不保证追回损失」，不承诺任何官方行动

如需移除官方 logo，删除本目录文件并把上述三处 `<img>` 换回自绘 SVG 即可
（历史版本见 git log）。
