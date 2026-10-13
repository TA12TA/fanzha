# 品牌素材目录

## 当前状态：**没有官方素材文件**

本项目目前**不包含任何官方机构标志**。反诈应用图标由 `src/scenes/HomeScene.vue`、
`src/scenes/ManualScene.vue`、`src/components/BottomNav.vue` 中的**自绘 SVG** 实现
（蓝底 + 白色盾牌 + 对勾）。

## 为什么没有官方 logo

按要求尝试从网上获取国家反诈中心官方图标，但**所有途径均不可用**：

| 途径 | 结果 |
|---|---|
| `96110.cn` / `www.96110.cn` / `gab.96110.cn` | **DNS 无 A 记录**（域名未提供网站） |
| `12381.cn` / `www.12381.cn` | **DNS 无 A 记录** |
| `gab.gov.cn` | **DNS 无 A 记录** |
| `www.mps.gov.cn`（公安部） | HTTP **521**（源站不可达） |
| `nazx.cn` | Cloudflare **403**（拦截自动化访问） |
| 小米应用商店 / 应用宝详情页 | 页面 JS 渲染，静态抓取取不到图标 |
| 应用宝图标 CDN 直连 | HTTP **404** |
| Bing / 百度 图片搜索 | 返回的「结果」实际是**人民大会堂会议照**、**世界国旗图标集**等无关图片，来源为第三方素材站（360/千图/21世纪教育网），**授权不明** |

## 还有一条产品边界

`AGENTS.md` 第 1 节要求「**不使用真实微信/银行标志**」，用意是避免产出
**可被伪造的官方素材**。反诈教育游戏若使用真实官方徽标，其截图反而可能被
用于制作假的「官方通知」，与教学目的相悖。因此当前自绘方案同时也是**合规选择**。

## 如需替换为官方图标

拿到**有授权的**图片后，按以下步骤替换：

1. 把文件放到本目录，例如 `src/assets/antifraud-logo.png`
2. 在三个位置把内联 `<svg>` 换成 `<img>`：

   - `src/scenes/HomeScene.vue` — 桌面图标（`.app__glyph--brand` 内）
   - `src/scenes/ManualScene.vue` — 应用标识条（`.appbrand__icon` 内）
   - `src/components/BottomNav.vue` — 底部导航「反诈」按钮

   示例：

   ```vue
   <script setup lang="ts">
   import logoUrl from '@/assets/antifraud-logo.png'
   </script>

   <template>
     <img :src="logoUrl" alt="" width="24" height="24" />
   </template>
   ```

3. 同步更新 `README.md`「已知问题与未完成项」中关于 logo 的说明。

> 注意：Vite 会把 `src/assets/` 下的图片作为资源打包，`base: './'` 已配置相对路径，
> 静态部署不受影响。请勿放入大体积素材（仓库规约禁止提交大体积媒体文件）。
