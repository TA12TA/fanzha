import { createApp } from 'vue'
import App from './App.vue'
import { setRandomSeed } from './app/random'
import './styles/tokens.css'
import './styles/base.css'
import './styles/wallpaper.css'

/*
 * 用时间戳播种：班级通知群里的反诈通知每次打开都不一样。
 * 测试不走 `main.ts`，拿到的是固定默认种子 —— 断言不会随机变红。
 * 放在挂载之前，保证关卡数据第一次被读取时就已经播好种。
 */
setRandomSeed(Date.now())

createApp(App).mount('#app')
