# 第三方图标与素材许可

本项目的虚构应用图标来自开源图标库；「国家反诈中心」使用官方 logo 图片。
真实品牌商标不随本项目分发。

## Google Material Symbols

- 来源：<https://fonts.google.com/icons>
- npm 包：`@material-symbols/svg-400@0.48.2`
- 使用文件：`rounded/*-fill.svg`（`forum`、`wallet`、`imagesmode`、`call`、`comment`、`shopping_bag`、`music_note`、`smart_display`、`stairs`、`notifications`、`settings`）
- 许可证：Apache License 2.0
- 使用位置：`src/components/AppIcon.vue`
- 修改说明：仅将 SVG 的 `path d` 内联到 Vue 组件，未修改图形几何。
- 许可证全文：<https://www.apache.org/licenses/LICENSE-2.0>

## 国家反诈中心 logo

- 文件：`src/assets/antifraud-logo.png`
- 用途：仅作为虚构手机中「国家反诈中心」应用的识别图标，不用于商业宣传。
- 如用于正式发布，请按官方素材使用规范复核。

## SoundHelix 音乐

- 文件：`src/assets/music/track-1.mp3` … `track-5.mp3`
- 来源：<https://www.soundhelix.com/audio-examples>
- 曲目：SoundHelix Song 1–5
- 作者：T. Schürger
- 使用方式：本地打包完整 MP3，运行时请求本站资源，不调用外部音乐服务。
- 许可说明：SoundHelix 音频示例页面明确允许“use these audio examples in any way you like”，并要求标注 SoundHelix 与对应曲目的作者。本项目在青听音乐页底部显示“音乐：SoundHelix · T. Schürger”，并在此文件保留署名。
- 用途：反诈教育演示，不用于商业发行。
