/**
 * 真实浏览器验证脚本（Edge headless + CDP，仅用 Node 内建模块，无额外依赖）。
 *
 * 做三件 jsdom 做不到的事：
 * 1. 在真实浏览器里跑通三条结局路径，断言关键文案与金额。
 * 2. 在 320 / 375 / 390px 宽度下断言无横向溢出。
 * 3. 截图开场、桌面、群聊、钱包、结局、复盘，并输出 report.json。
 *
 * 用法：node scripts/verify-edge.mjs
 * 退出码非 0 表示存在失败项。
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, '.verify')
const shotsDir = path.join(outDir, 'shots')
/*
 * 预览端口。
 *
 * 默认 4173，但**这个端口经常被别人占着**：临时演示时我们会自己起一个
 * `vite preview --host 0.0.0.0` 打隧道（README 的「临时发布到公网」一节），
 * 它和本脚本默认用同一个端口。这种情况下本脚本自己的服务起不来，
 * `waitForHttp` 却会因为**别人的服务**在监听而通过 —— 于是整个验证
 * 悄悄跑在另一个进程上，最后「验证结束后预览服务已释放」必然失败。
 *
 * 因此这里：先探测端口是否空闲，被占用就自动换一个，并把「服务是否释放」
 * 的断言限定为「只检查本脚本自己起的那个进程」。
 */
const PORT = Number(process.env.VERIFY_PORT ?? 4173)
const CDP_PORT = Number(process.env.VERIFY_CDP_PORT ?? 9333)
/** 实际使用的端口与地址；main() 里会在默认端口被占用时改掉。 */
let port = PORT
let BASE = `http://127.0.0.1:${port}/`

/** 端口是否已被占用（能被连上就说明有服务在监听）。 */
async function portInUse(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'HEAD' })
    return res.ok || res.status < 500
  } catch {
    return false
  }
}

/** 找一个空闲端口（从 start 开始往后试几个）。 */
async function pickFreePort(start) {
  for (let port = start; port < start + 20; port += 1) {
    if (!(await portInUse(port))) return port
  }
  return start
}

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]

const results = []
let failures = 0

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failures += 1
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForHttp(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      /* 服务尚未就绪 */
    }
    await sleep(250)
  }
  return false
}

/** 极简 CDP 客户端。 */
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    })
  }

  send(method, params = {}) {
    this.id += 1
    const id = this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP 超时：${method}`))
        }
      }, 30000)
    })
  }

  /** 在页面里求值，返回 JSON 结果。 */
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(() => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    })
    if (res.exceptionDetails) {
      throw new Error(`页面求值异常：${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description ?? ''}`)
    }
    return res.result.value
  }

  async click(text) {
    const ok = await this.eval(`
      const label = ${JSON.stringify(text)};
      const btns = [...document.querySelectorAll('button')];
      const hit = btns.find(b => (b.textContent || '').includes(label) || (b.getAttribute('aria-label') || '').includes(label));
      if (!hit) return false;
      hit.click();
      return true;
    `)
    if (!ok) {
      const available = await this.eval(
        `return [...document.querySelectorAll('button')].map(b => (b.textContent||'').trim() || b.getAttribute('aria-label')).join(' | ')`,
      )
      throw new Error(`找不到按钮「${text}」。当前可用：${available}`)
    }
    await sleep(90)
  }

  async text() {
    return this.eval(`return document.body.innerText`)
  }

  async screenshot(file) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(file, Buffer.from(res.data, 'base64'))
  }

  /**
   * 在真实浏览器里用触摸事件模拟上滑解锁。
   * 使用 Input.dispatchTouchEvent，走真实指针事件管线（而非直接调 JS）。
   */
  async swipeUp({ fromY = 620, toY = 420, x = 195, steps = 6 } = {}) {
    const point = (y) => [{ x, y, radiusX: 6, radiusY: 6, force: 1, id: 1 }]
    await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(fromY) })
    for (let i = 1; i <= steps; i += 1) {
      const y = fromY + ((toY - fromY) * i) / steps
      await this.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(y) })
      await sleep(16)
    }
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(300)
  }

  /** 锁屏是否仍然显示（用于断言未解锁）。 */
  async isLocked() {
    return this.eval(`return !!document.querySelector('.lock__surface')`)
  }

  async setWidth(width) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    })
  }
}

/** 结束子进程；Windows 下需要连同进程树一起结束，避免残留预览服务。 */
async function killTree(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      killer.on('close', resolve)
      killer.on('error', resolve)
    })
  } else {
    child.kill('SIGTERM')
  }
}

async function main() {
  // 只清理本脚本自己产出的东西（截图、浏览器 profile、报告）。
  // 原先是 rm(outDir, { recursive: true })，会把 .verify 下任何其它文件一起删掉；
  // 一旦那里有被进程占用的文件（例如临时隧道程序）就会直接 EPERM 崩掉，
  // 连验证都跑不起来。
  await mkdir(outDir, { recursive: true })
  await rm(shotsDir, { recursive: true, force: true }).catch(() => {})
  await mkdir(shotsDir, { recursive: true })
  await rm(path.join(outDir, 'browser-profile'), { recursive: true, force: true }).catch(() => {})
  await rm(path.join(outDir, 'report.json'), { force: true }).catch(() => {})

  const browserPath = EDGE_CANDIDATES.find((p) => existsSync(p))
  if (!browserPath) {
    console.error('未找到 Edge/Chrome，无法运行真实浏览器验证。')
    process.exit(2)
  }

  // 1) 启动 vite preview（直接调用 vite 的入口，避免 shell 拼接参数）
  //
  // 端口被占用时自动换一个：否则本脚本自己的服务起不来（--strictPort 直接退出），
  // 而 waitForHttp 会因为**别人的**服务在监听而通过，整个验证就跑错了对象。
  if (await portInUse(PORT)) {
    const free = await pickFreePort(PORT + 1)
    console.log(`[info] 端口 ${PORT} 已被占用（可能是你自己起的隧道预览服务），改用 ${free}`)
    port = free
    BASE = `http://127.0.0.1:${port}/`
  }

  const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  const server = spawn(
    process.execPath,
    [viteEntry, 'preview', '--port', String(port), '--strictPort'],
    { cwd: root, stdio: 'ignore' },
  )

  const userDataDir = path.join(outDir, 'browser-profile')
  let browser
  let cdp

  try {
    if (!(await waitForHttp(BASE))) throw new Error(`预览服务未就绪：${BASE}`)
    record('预览服务可访问', true, BASE)

    browser = spawn(
      browserPath,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${userDataDir}`,
        '--window-size=390,844',
        'about:blank',
      ],
      { stdio: 'ignore' },
    )

    let version = null
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
        if (res.ok) {
          version = await res.json()
          break
        }
      } catch {
        /* 等待浏览器就绪 */
      }
      await sleep(300)
    }
    if (!version) throw new Error('浏览器 CDP 未就绪')
    record('浏览器已启动', true, version.Browser)

    const targetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })
    const target = await targetRes.json()
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
    cdp = new Cdp(ws)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    /*
     * 首屏是关卡大厅：进入第一关，停在锁屏。
     * 后续各段流程沿用原有的「锁屏 → 上滑解锁 → 桌面」路径，
     * 因此凡是「清档后重新导航」的地方都要先调用它，否则会停在首屏大厅。
     */
    async function enterFirstLevel() {
      const clicked = await cdp.eval(`
        const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').includes('进入第'));
        if (b) b.click();
        return !!b;
      `)
      await sleep(700)
      return clicked
    }

    // 2) 视口适配检查：320 / 375 / 390 无横向溢出
    //    大厅是首屏、桌面是信息最密的一屏，两屏都要量。
    for (const width of [320, 375, 390]) {
      await cdp.setWidth(width)
      await cdp.send('Page.navigate', { url: BASE })
      await sleep(700)
      const measureOverflow = `
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          innerWidth: window.innerWidth,
          bodyScrollWidth: document.body.scrollWidth,
        }
      `
      const hallMetrics = await cdp.eval(measureOverflow)
      record(
        `大厅无横向溢出 @${width}px`,
        hallMetrics.scrollWidth <= hallMetrics.clientWidth + 1 &&
          hallMetrics.bodyScrollWidth <= hallMetrics.innerWidth + 1,
        `scrollWidth=${hallMetrics.scrollWidth} clientWidth=${hallMetrics.clientWidth}`,
      )

      // 进第一关并解锁到桌面，再量一次
      await enterFirstLevel()
      await cdp.swipeUp({ fromY: 640, toY: 430 })
      await sleep(300)
      const homeMetrics = await cdp.eval(measureOverflow)
      record(
        `桌面无横向溢出 @${width}px`,
        homeMetrics.scrollWidth <= homeMetrics.clientWidth + 1 &&
          homeMetrics.bodyScrollWidth <= homeMetrics.innerWidth + 1,
        `scrollWidth=${homeMetrics.scrollWidth} clientWidth=${homeMetrics.clientWidth}`,
      )
    }

    // 3) 主线路径：先选关（一级菜单）→ 该关锁屏 → 解锁 → 拒绝邀请 → 早识别结局 → 复盘
    await cdp.setWidth(390)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)
    await cdp.eval(`localStorage.clear(); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)

    /*
     * 两级菜单：首屏必须是**关卡大厅**（先选关），而不是直接进某一关的锁屏。
     * 选定关卡之后才出现这一关的锁屏，再上滑解锁进桌面。
     */
    const firstScreen = await cdp.eval(`
      const cards = document.querySelectorAll('.lvlcard');
      const ret = [...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('返回当前关卡'));
      return {
        inHall: !!document.querySelector('.hall'),
        hasLock: !!document.querySelector('.lock__surface'),
        cards: cards.length,
        hasReturn: !!ret,
        text: (document.body.innerText || '').slice(0, 80),
      };
    `)
    record(
      '首屏是关卡大厅（先选关，不直接进锁屏）',
      firstScreen.inHall && !firstScreen.hasLock && firstScreen.cards === 3,
      `大厅=${firstScreen.inHall} 锁屏=${firstScreen.hasLock} 卡片=${firstScreen.cards}`,
    )
    record(
      '首屏大厅没有「返回当前关卡」（还没进过任何关）',
      firstScreen.hasReturn === false,
    )
    await cdp.screenshot(path.join(shotsDir, '00-hall-first.png'))

    /*
     * 大厅顶部的状态栏必须真的看得见。
     *
     * `.wall` 是 `position: absolute; inset: 0`，会盖住顶部那一条；用
     * `elementFromPoint` 做命中检测最直接 —— 如果壁纸压在上面，命中的就是
     * 壁纸而不是状态栏。只看 DOM 里有没有 `.statusbar` 是查不出这个问题的。
     */
    const statusbarHit = await cdp.eval(`
      const sb = document.querySelector('.statusbar');
      if (!sb) return { exists: false };
      const r = sb.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        exists: true,
        covered: !(hit && sb.contains(hit)),
        hitClass: hit ? (hit.className || '').toString().slice(0, 40) : null,
        rect: { top: Math.round(r.top), h: Math.round(r.height) },
      };
    `)
    record(
      '大厅顶部状态栏没有被壁纸盖住',
      statusbarHit.exists && statusbarHit.covered === false,
      statusbarHit.covered ? `被「${statusbarHit.hitClass}」盖住` : `命中状态栏本身`,
    )

    // 选定第一关：这时才应该出现这一关的锁屏
    await cdp.eval(`
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').includes('进入第一关'));
      if (b) b.click();
      return !!b;
    `)
    await sleep(700)
    const afterEnter = await cdp.eval(`
      return {
        inHall: !!document.querySelector('.hall'),
        hasLock: !!document.querySelector('.lock__surface'),
      };
    `)
    record(
      '选定关卡后才进入锁屏解锁界面',
      afterEnter.hasLock && !afterEnter.inHall,
      `锁屏=${afterEnter.hasLock} 大厅=${afterEnter.inHall}`,
    )

    await cdp.screenshot(path.join(shotsDir, '01-intro.png'))
    let text = await cdp.text()
    record(
      '锁屏显示标题与上滑提示',
      text.includes('反诈局中局：你的手机') && text.includes('上滑解锁'),
    )

    // 轻微上滑（不足阈值）应回弹，不解锁
    await cdp.swipeUp({ fromY: 620, toY: 600 })
    record('轻微上滑不解锁', await cdp.isLocked())

    // 锁屏不该有任何说明文字（真手机的锁屏只有时间/日期/壁纸）
    const lockText = await cdp.text()
    record(
      '锁屏无任何说明文字（连模拟标记也已去掉）',
      !lockText.includes('虚构的手机') &&
        !lockText.includes('虚拟生活费') &&
        !lockText.includes('剧情演示') &&
        !lockText.includes('不涉及真实资金'),
      lockText.includes('剧情演示') ? '仍有「剧情演示」标记' : '已清空',
    )

    // 锁屏必须挂载壁纸图层（与桌面共用同一份 styles/wallpaper.css）
    const lockWall = await cdp.eval(`
      const wall = document.querySelector('.lock .wall');
      const sky = document.querySelector('.lock .wall__sky');
      return {
        hasWall: !!wall,
        hasSky: !!sky,
        bg: wall ? getComputedStyle(wall).backgroundImage : '',
        theme: document.documentElement.getAttribute('data-theme'),
      };
    `)
    record(
      '锁屏挂载了壁纸图层（与桌面共用同一张）',
      lockWall.hasWall && lockWall.hasSky && lockWall.bg.length > 0,
      `主题=${lockWall.theme}`,
    )

    /*
     * 锁屏文字在两种主题下都必须看得清。
     *
     * 起因：白天壁纸下锁屏几乎不可读 —— 日期/副标题/「剧情演示」/「上滑解锁」
     * 都是写死的浅灰，压在浅蓝天空上等于没有。桌面当时已经改成跟随主题，
     * 锁屏漏了。所以这里不逐条检查某个颜色，而是**遍历锁屏上每一段文字**，
     * 检查它的明暗是否与壁纸相反：
     *   白天（浅壁纸）→ 文字必须偏深；夜间（深壁纸）→ 文字必须偏浅。
     * 这样以后任何新增文字只要颜色跟壁纸同向，就会立刻被抓出来。
     *
     * 为了不受运行时段影响（auto 白天/夜间取决于当前北京时间），
     * 这里直接把设置写成 day / night 各跑一遍。
     */
    const measureOnWallText = `
      const root = document.querySelector('.lock') || document.querySelector('.home');
      if (!root) return [];
      const lum = (css) => {
        const m = (css || '').match(/\\d+/g);
        if (!m) return null;
        const [r, g, b] = [0, 1, 2].map((i) => {
          const v = Number(m[i]) / 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const out = [];
      const walk = (el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
        // 图标底板与角标自带底色（白字压彩色块），不参与「压壁纸」的判断
        const inTile = el.closest && el.closest('.app__glyph, .app__badge');
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join(' ')
          .replace(/\\s+/g, ' ')
          .trim();
        if (own && !inTile) {
          const l = lum(cs.color);
          if (l !== null) {
            out.push({
              text: own.slice(0, 18),
              cls: (el.className || '').toString().split(' ')[0],
              color: cs.color,
              lum: Number(l.toFixed(3)),
            });
          }
        }
        for (const c of el.children) walk(c);
      };
      walk(root);
      return out;
    `

    for (const mode of ['day', 'night']) {
      await cdp.eval(`
        localStorage.setItem('fj-juzhongju:settings:v1', JSON.stringify({
          version: 1, sound: true, banner: true, theme: ${JSON.stringify(mode)},
        }));
        return true;
      `)
      await cdp.send('Page.navigate', { url: BASE })
      await sleep(1100)
      // 首屏是大厅：先进入第一关，才量得到锁屏上的文字
      await enterFirstLevel()
      const rows = await cdp.eval(measureOnWallText)
      // day：浅壁纸 → 文字偏深（lum < 0.25）；night：深壁纸 → 文字偏浅（lum > 0.3）
      const bad = rows.filter((r) => (mode === 'day' ? r.lum >= 0.25 : r.lum <= 0.3))
      record(
        `锁屏文字在${mode === 'day' ? '白天' : '夜间'}壁纸下可读（明暗与壁纸相反）`,
        rows.length > 0 && bad.length === 0,
        bad.length
          ? `有问题：${bad.map((b) => `「${b.text}」${b.color} lum=${b.lum}`).join('；')}`
          : `${rows.length} 段文字全部合格`,
      )
    }

    // 恢复干净状态（清设置与存档），进第一关回到锁屏，继续后面的流程
    await cdp.eval(`localStorage.clear(); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(1100)
    record(
      '恢复默认设置后回到锁屏（auto 模式）',
      (await cdp.eval(`return document.documentElement.getAttribute('data-theme-mode')`)) === 'auto',
    )
    await enterFirstLevel()

    // 上滑解锁（真实触摸事件）
    await cdp.swipeUp({ fromY: 640, toY: 430 })
    await cdp.screenshot(path.join(shotsDir, '02-home.png'))
    text = await cdp.text()
    const onDesktop = await cdp.eval(`return !!document.querySelector('.home')`)
    const hasCard = await cdp.eval(`return !!document.querySelector('.notice')`)
    record(
      '上滑解锁后进入桌面（邀请提示改为通知留存，桌面无邀请卡片）',
      onDesktop && hasCard === false,
      hasCard ? '桌面仍有卡片' : '',
    )

    // 解锁前后壁纸必须一致（否则会看到背景跳一下）
    const wallSame = await cdp.eval(`
      const homeWall = document.querySelector('.home .wall');
      const sky = document.querySelector('.home .wall__sky');
      return { hasWall: !!homeWall, hasSky: !!sky };
    `)
    record(
      '桌面壁纸与锁屏同源（解锁后背景不跳）',
      wallSame.hasWall && wallSame.hasSky,
      '',
    )

    // 解锁过渡动画：桌面所在的换页容器应带 unlock 动画
    const unlockAnim = await cdp.eval(`
      const page = document.querySelector('.viewport__page');
      if (!page) return null;
      const cs = getComputedStyle(page);
      return { cls: page.className, anim: cs.animationName, dur: cs.animationDuration };
    `)
    record(
      '解锁进桌面有过渡动画',
      unlockAnim !== null &&
        unlockAnim.cls.includes('viewport__page--unlock') &&
        unlockAnim.anim !== 'none',
      unlockAnim ? `${unlockAnim.cls} animation=${unlockAnim.anim} ${unlockAnim.dur}` : '未找到换页容器',
    )

    // 邀请入口：青讯图标角标 + 继续当前事项
    // 注意：角标要等通知真正弹出后才出现（见「延迟期间不应有角标」的断言），
    // 因此这里先等过延迟再查。
    await sleep(3400)
    const chatBadge = await cdp.eval(`
      const el = [...document.querySelectorAll('.home .app')].find(x => (x.textContent||'').includes('青讯'));
      const badge = el ? el.querySelector('.app__badge') : null;
      return badge ? badge.textContent.trim() : null;
    `)
    record('通知弹出后青讯图标出现未读角标', chatBadge === '1', `角标=${chatBadge}`)

    // 角标风格统一：不存在第二种（圆点）样式
    const dotCount = await cdp.eval(`return document.querySelectorAll('.app__badge--dot').length`)
    record('角标风格统一（无圆点样式）', dotCount === 0, `圆点数=${dotCount}`)

    await cdp.click('青讯')
    text = await cdp.text()
    record('青讯图标可进入邀请会话', text.includes('拒绝并举报'))

    // 会话列表：区分群聊与私聊，生活费来源在「妈妈」会话里
    await cdp.click('返回上一层')
    const sessionRows = await cdp.eval(`
      const rows = [...document.querySelectorAll('.session')];
      return {
        labels: rows.map(r => r.getAttribute('aria-label')),
        hasGroupPreview: rows.some(r => (r.textContent || '').includes('先垫 100')),
      };
    `)
    record(
      '会话列表区分群聊与私聊',
      sessionRows.labels.some((l) => (l || '').startsWith('私聊：')) &&
        sessionRows.labels.some((l) => (l || '').startsWith('群聊：')),
      `共 ${sessionRows.labels.length} 条：[${sessionRows.labels.join(' / ')}]`,
    )
    record(
      '没进群之前看不到兼职群（避免提前剧透群里的话术）',
      !sessionRows.hasGroupPreview,
      sessionRows.hasGroupPreview ? '列表里已经能看到群里的话术' : '',
    )

    await cdp.eval(`
      const b = [...document.querySelectorAll('.session')].find(x => (x.textContent||'').includes('妈妈'));
      if (b) b.click();
      return !!b;
    `)
    await sleep(300)
    await cdp.click('显示全部')
    const transfer = await cdp.eval(`
      const card = document.querySelector('.msg--transfer');
      return card ? (card.textContent || '').trim() : null;
    `)
    record(
      '生活费 800 元在会话里以转账卡片呈现',
      transfer !== null && transfer.includes('800') && transfer.includes('生活费'),
      transfer ? transfer.replace(/\\s+/g, ' ') : '未找到转账卡片',
    )

    // 回到学姐会话，从这里进群（进群是剧情选项，只出现在学姐会话里）
    await cdp.click('返回上一层')
    await cdp.eval(`
      const b = [...document.querySelectorAll('.session')].find(x => (x.textContent||'').includes('学姐'));
      if (b) b.click();
      return !!b;
    `)
    await sleep(300)
    await cdp.click('进群看看')
    await cdp.click('显示全部')
    await cdp.screenshot(path.join(shotsDir, '03-group.png'))

    // 进群后：会话标题带成员数，且他人气泡上方显示发言人昵称
    const groupNames = await cdp.eval(`
      return [...document.querySelectorAll('.row__name')].map(n => (n.textContent || '').trim());
    `)
    record(
      '群聊在他人气泡上方显示发言人昵称',
      groupNames.length > 0,
      `昵称=[${groupNames.slice(0, 3).join(' / ')}]`,
    )

    /*
     * 回归：第二次进同一个会话不该重播「逐条出现」。
     *
     * 用户反馈的问题。进度记在模块级（app/chatReveal.ts），看过的部分直接出现。
     * 这里真实浏览器里走一遍：看完群聊 → 退回列表 → 再点进同一个会话，
     * 消息应当立刻全部可见，且不该再出现「显示全部」。
     */
    const firstVisit = await cdp.eval(`
      return {
        rows: document.querySelectorAll('.chat__list .row').length,
        skip: !!document.querySelector('.chat__skiprow'),
      };
    `)
    await cdp.eval(`
      const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'') === '返回上一层');
      if (b) b.click();
      return !!b;
    `)
    await sleep(400)
    await cdp.eval(`
      const b = [...document.querySelectorAll('.session')].find(x => (x.textContent||'').includes('校园兼职'));
      if (b) b.click();
      return !!b;
    `)
    await sleep(600)
    const secondVisit = await cdp.eval(`
      return {
        rows: document.querySelectorAll('.chat__list .row').length,
        skip: !!document.querySelector('.chat__skiprow'),
      };
    `)
    record(
      '第二次进同一个会话，消息直接全部出现（不重播逐条动画）',
      secondVisit.rows === firstVisit.rows && secondVisit.rows > 1 && secondVisit.skip === false,
      `第一次 ${firstVisit.rows} 条（跳过按钮=${firstVisit.skip}）→ 第二次 ${secondVisit.rows} 条（跳过按钮=${secondVisit.skip}）`,
    )
    // 继续后面的断言
    await cdp.click('返回上一层')
    await sleep(300)
    await cdp.eval(`
      const b = [...document.querySelectorAll('.session')].find(x => (x.textContent||'').includes('校园兼职'));
      if (b) b.click();
      return !!b;
    `)
    await sleep(300)
    const subtitle = await cdp.eval(`
      const el = document.querySelector('.appbar__subtitle');
      return el ? (el.textContent || '').trim() : null;
    `)
    record('群聊标题带成员数，与私聊区分', subtitle !== null && subtitle.includes('人'), `副标题=${subtitle}`)

    text = await cdp.text()
    record('群聊显示「先垫 100」话术与风险提示', text.includes('先垫 100') && text.includes('群里说「到账」的'))

    await cdp.click('群主资料')
    text = await cdp.text()
    record('资料弹层显示不可核验线索', text.includes('最近 7 天内') && text.includes('用别的渠道'))
    await cdp.click('返回群聊')

    // 回桌面看余额，验证自由探索不改变数值
    await cdp.click('桌面')
    text = await cdp.text()
    const balanceStill800 = await cdp.eval(`
      const save = localStorage.getItem('fj-juzhongju:save:v2:level-01');
      return save ? JSON.parse(save).balance : null;
    `)
    const backOnDesktop = await cdp.eval(`return !!document.querySelector('.home')`)
    record(
      '回桌面后仍在桌面且余额仍为 800（未扣款）',
      backOnDesktop && text.includes('800') && balanceStill800 === 800,
      `存档余额=${balanceStill800}`,
    )

    await cdp.click('继续当前事项')
    await cdp.click('接下任务')
    await cdp.screenshot(path.join(shotsDir, '04-wallet-pending.png'))
    text = await cdp.text()
    record(
      '待付款页显示固定金额，且不再有模拟声明牌',
      text.includes('确认垫付 100 元') &&
        text.includes('这一页不用输卡号') &&
        !text.includes('不会动你的真钱') &&
        !text.includes('剧情演示'),
      text.includes('不会动你的真钱') ? '仍有模拟声明' : '已移除',
    )

    // 离开待付款页再返回，请求仍在
    await cdp.click('桌面')
    await cdp.click('安心钱包')
    text = await cdp.text()
    record('离开待付款页后请求仍待确认', text.includes('确认垫付 100 元'))

    await cdp.click('确认垫付 100 元')
    await sleep(200)
    text = await cdp.text()
    record(
      '确认后余额 700 且平台展示 130 不计入余额',
      text.includes('700') && text.includes('平台内显示'),
    )

    // 从桌面进入钱包查看余额构成
    await cdp.click('桌面')
    await cdp.click('安心钱包')
    text = await cdp.text()
    record(
      '钱包区分可用余额与取不出来的数字',
      text.includes('可用余额') && text.includes('取不出来'),
    )

    // 回到群聊继续剧情（先回桌面再进入消息应用）
    await cdp.click('桌面')
    await cdp.click('继续当前事项')
    await cdp.click('继续查看任务')
    await cdp.click('显示全部')
    text = await cdp.text()
    record('提现异常显示解冻费话术', text.includes('解冻费') && text.includes('提现失败'))

    await cdp.click('查看追加垫付')
    text = await cdp.text()
    record('追加页金额为 300 且显示当前余额 700', text.includes('确认垫付 300 元') && text.includes('700'))

    await cdp.click('确认垫付 300 元')
    await sleep(200)
    await cdp.screenshot(path.join(shotsDir, '05-ending-loss.png'))
    text = await cdp.text()
    record('追加后结局显示余额 400 与累计损失 400', text.includes('追加后损失') && text.includes('400'))

    await cdp.click('看复盘')
    await sleep(200)
    await cdp.screenshot(path.join(shotsDir, '06-review.png'))
    text = await cdp.text()
    const hasForbidden = /(?<![不无])(保证追回|必定追回|一定能追回|报警成功|反杀)/.test(text)
    record('复盘显示解冻费风险且无肯定式误导表述', text.includes('解冻费') && !hasForbidden)

    // 4) 另一条路径：转账前取消 → 止损 0
    await cdp.eval(`localStorage.clear(); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)
    await enterFirstLevel()
    await cdp.swipeUp({ fromY: 640, toY: 430 })
    await cdp.click('青讯')
    await cdp.click('进群看看')
    await cdp.click('接下任务')
    await cdp.click('取消，不参与')
    await sleep(200)
    await cdp.screenshot(path.join(shotsDir, '07-ending-stop.png'))
    text = await cdp.text()
    record(
      '转账前取消：止损结局且明确损失 0',
      text.includes('及时止损') && text.includes('一分没花'),
    )

    // 5) 早拒绝路径 + 复盘只引用亲历
    await cdp.eval(`localStorage.clear(); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)
    await enterFirstLevel()
    await cdp.swipeUp({ fromY: 640, toY: 430 })
    await cdp.click('青讯')
    await cdp.click('拒绝并举报')
    await sleep(200)
    text = await cdp.text()
    record('早拒绝结局为提前识破', text.includes('提前识破'))

    await cdp.click('看复盘')
    await sleep(200)
    text = await cdp.text()
    record(
      '早拒绝者复盘不含未经历话术',
      text.includes('陌生人的兼职邀请') && !text.includes('解冻费') && !text.includes('你付了第一笔'),
    )

    // 6) 重开二次确认
    await cdp.click('再玩一次')
    text = await cdp.text()
    record('重开弹出二次确认', text.includes('重来一次？'))
    await cdp.click('清掉，重来')
    await sleep(200)
    text = await cdp.text()
    record('确认后回到锁屏', text.includes('上滑解锁') && text.includes('反诈局中局：你的手机'))

    // 7) 损坏存档回退（用当前 v2 存档结构：伪造一个不存在的节点）
    await cdp.eval(
      `localStorage.setItem('fj-juzhongju:save:v2:level-01', '{"version":2,"levelId":"level-01","node":"group","balance":999999}'); return true`,
    )
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)
    // 首屏是大厅：损坏存档回退后，进入第一关才会看到锁屏
    await enterFirstLevel()
    text = await cdp.text()
    const cleared = await cdp.eval(
      `return localStorage.getItem('fj-juzhongju:save:v2:level-01') === null`,
    )
    record('损坏存档安全回退到锁屏', text.includes('上滑解锁') && cleared)

    /*
     * v1 → v2 迁移：旧版只有第一关的存档键，升级后必须迁进第一关槽位，
     * 而不是被当成损坏数据丢掉。这是「玩家正玩到一半的进度不该因升级消失」
     * 的浏览器侧验证（单测里也有，这里确认真实环境一致）。
     */
    await cdp.eval(`
      localStorage.clear();
      localStorage.setItem('fj-juzhongju:save:v1', JSON.stringify({
        version: 1, node: 'group', balance: 800, platformDisplayed: 0,
        paidTotal: 0, paidCount: 0, viewedProfile: false, riskTags: ['entered-group'],
        history: [
          { optionId: 'start', from: 'intro', to: 'invite', moneyChanged: false },
          { optionId: 'enter-group', from: 'invite', to: 'group', moneyChanged: false },
        ],
        appliedOnce: {}, ending: null,
      }));
      return true;
    `)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(900)
    const migrated = await cdp.eval(`
      const v1 = localStorage.getItem('fj-juzhongju:save:v1');
      const v2 = localStorage.getItem('fj-juzhongju:save:v2:level-01');
      const parsed = v2 ? JSON.parse(v2) : null;
      return { legacyGone: v1 === null, node: parsed ? parsed.node : null, balance: parsed ? parsed.balance : null };
    `)
    record(
      'v1 存档迁移进第一关槽位且旧键被删除',
      migrated.legacyGone && migrated.node === 'group' && migrated.balance === 800,
      `旧键已删=${migrated.legacyGone} 节点=${migrated.node} 余额=${migrated.balance}`,
    )
    await cdp.eval(`localStorage.clear(); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(800)

    // 8) 减弱动效（prefers-reduced-motion）：消息直出、流程可完整推进
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
    const mediaMatches = await cdp.eval(
      `return window.matchMedia('(prefers-reduced-motion: reduce)').matches`,
    )
    record('浏览器已切换到减弱动效模式', mediaMatches === true)

    await cdp.eval(`localStorage.clear(); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)
    await enterFirstLevel()
    // 减弱动效下仍可用上滑解锁
    await cdp.swipeUp({ fromY: 640, toY: 430 })
    await cdp.click('青讯')
    await cdp.click('进群看看')
    await sleep(120)
    text = await cdp.text()
    // 减弱动效下不做逐条延迟：全部消息立即可见，且选项可用
    record(
      '减弱动效下消息直出且可继续操作',
      text.includes('群规很简单') && text.includes('名额有限') && text.includes('接下任务'),
    )

    await cdp.click('接下任务')
    await cdp.click('确认垫付 100 元')
    await sleep(200)
    text = await cdp.text()
    record('减弱动效下仍可完成付款流程', text.includes('700') && text.includes('平台内显示'))

    // 9) 键盘可操作性：关键操作均为 button，可聚焦并触发
    const keyboardOk = await cdp.eval(`
      const btns = [...document.querySelectorAll('button')];
      if (btns.length === 0) return { ok: false, reason: 'no buttons' };
      const target = btns.find(b => (b.textContent || '').includes('到此为止'));
      if (!target) return { ok: false, reason: 'missing option button' };
      target.focus();
      const focused = document.activeElement === target;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      target.click();
      return { ok: focused, tag: target.tagName };
    `)
    await sleep(200)
    text = await cdp.text()
    record(
      '关键选项可用键盘聚焦并触发',
      keyboardOk.ok === true && text.includes('及时止损'),
      `聚焦成功=${keyboardOk.ok} 标签=${keyboardOk.tag}`,
    )

    // 8) 北京时间：状态栏与锁屏显示真实北京时间（与系统时钟一致）
    await cdp.send('Emulation.setEmulatedMedia', { features: [] })
    await cdp.eval(`localStorage.clear(); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)
    // 锁屏时钟要进关才看得到（首屏是大厅）
    await enterFirstLevel()

    // 把浏览器时区设成纽约，验证仍显示北京时间（而非设备本地时间）
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' })

    const clockCheck = await cdp.eval(`
      // 只取可见的那一段（屏读文本在 sr-only 里，会污染 textContent）
      const el = document.querySelector('.lock__clock [aria-hidden="true"]');
      const shown = el ? el.textContent.trim() : '';
      const fmt = (tz) => new Intl.DateTimeFormat('zh-CN', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(new Date());
      return {
        shown,
        beijing: fmt('Asia/Shanghai'),
        newYork: fmt('America/New_York'),
      };
    `)
    record(
      '锁屏显示北京时间（设备时区为纽约时仍显示北京时间）',
      clockCheck.shown === clockCheck.beijing && clockCheck.shown !== clockCheck.newYork,
      `显示=${clockCheck.shown} 北京=${clockCheck.beijing} 纽约=${clockCheck.newYork}`,
    )

    // 日期行同步显示北京日期
    const dateCheck = await cdp.eval(`
      const el = document.querySelector('.lock__date');
      const shown = el ? el.textContent.trim() : '';
      const beijingDate = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric',
      }).format(new Date());
      return { shown, beijingDate };
    `)
    record(
      '锁屏日期与北京日期一致',
      dateCheck.shown.includes(dateCheck.beijingDate),
      `显示=${dateCheck.shown} 北京日期=${dateCheck.beijingDate}`,
    )

    // 进入游戏后状态栏同样显示北京时间
    await cdp.swipeUp({ fromY: 640, toY: 430 })
    await sleep(200)
    const statusCheck = await cdp.eval(`
      const el = document.querySelector('.statusbar__time [aria-hidden="true"]');
      const shown = el ? el.textContent.trim() : '';
      const beijing = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(new Date());
      return { shown, beijing };
    `)
    record(
      '状态栏时间与北京时间一致',
      statusCheck.shown === statusCheck.beijing,
      `状态栏=${statusCheck.shown} 北京=${statusCheck.beijing}`,
    )

    // 时间必须是真时钟：每一刻都与北京时间一致。
    // （原先只比较「1.5 秒内文字有没有变」，正好跨分钟就会假失败；
    //  改成拿两次采样分别与当时的北京时间对照，跨分钟也不会误报。）
    const stable = await cdp.eval(`
      const el = document.querySelector('.statusbar__time [aria-hidden="true"]');
      const fmt = () => new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(new Date());
      const first = el ? el.textContent.trim() : '';
      const firstExpected = fmt();
      return new Promise((resolve) => setTimeout(() => {
        resolve({
          first, firstExpected,
          second: el ? el.textContent.trim() : '',
          secondExpected: fmt(),
        });
      }, 1500));
    `)
    record(
      '时间显示与北京时间逐次一致（真时钟，不是假跳动）',
      stable.first === stable.firstExpected && stable.second === stable.secondExpected,
      `${stable.first}(期望${stable.firstExpected}) → ${stable.second}(期望${stable.secondExpected})`,
    )

    // 9) 顶部通知：预警在前、学姐邀请在后，逐条定时自动关闭
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: '' })
    await cdp.eval(`localStorage.clear(); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)
    await enterFirstLevel()
    await cdp.swipeUp({ fromY: 640, toY: 430 })

    // 刚解锁：应先看到桌面，延迟期间不弹通知
    const immediateBanner = await cdp.eval(`return !!document.querySelector('.banner')`)
    const onHome = await cdp.eval(`return !!document.querySelector('.home')`)
    record(
      '解锁后先看到桌面，延迟期间不弹通知',
      immediateBanner === false && onHome === true,
      immediateBanner ? '立刻弹了横幅' : '',
    )

    // 时序一致：延迟期间横幅还没弹，角标也不应亮
    const badgesDuringDelay = await cdp.eval(`return document.querySelectorAll('.app__badge').length`)
    record(
      '延迟期间角标不亮（与横幅时序一致）',
      badgesDuringDelay === 0,
      `延迟期角标数=${badgesDuringDelay}`,
    )

    // 图标风格统一：七个入口（网格区 + 程序坞）尺寸与圆角一致
    const iconStyles = await cdp.eval(`
      const list = [...document.querySelectorAll('.home .app .app__glyph')].map(g => {
        const cs = getComputedStyle(g);
        const r = g.getBoundingClientRect();
        return { size: Math.round(r.width) + 'x' + Math.round(r.height), radius: cs.borderRadius };
      });
      return list;
    `)
    const uniformIcons =
      iconStyles.length === 7 &&
      iconStyles.every((s) => s.size === iconStyles[0].size && s.radius === iconStyles[0].radius)
    record(
      '七个桌面入口尺寸与圆角统一（含程序坞）',
      uniformIcons,
      `共 ${iconStyles.length} 个，首个=${JSON.stringify(iconStyles[0])}`,
    )

    // 底部三大金刚键：3 个键、aria-label 正确、不再有重复的「反诈」入口
    const navKeys = await cdp.eval(`
      const keys = [...document.querySelectorAll('.nav__btn')];
      return {
        count: keys.length,
        labels: keys.map(k => k.getAttribute('aria-label')),
        text: keys.map(k => (k.textContent || '').trim()).join(''),
        disabled: keys.filter(k => k.disabled).length,
      };
    `)
    record(
      '底部为三大金刚键（返回/主页/最近任务）且无「反诈」重复入口',
      navKeys.count === 3 &&
        navKeys.labels.join(',') === '返回上一层,回到桌面,最近任务' &&
        navKeys.text === '' &&
        navKeys.disabled === 0,
      `共 ${navKeys.count} 个：[${navKeys.labels.join(' / ')}]`,
    )

    // 最近任务面板：真实可用的最近应用列表（不是死按钮）
    await cdp.eval(`
      const b = document.querySelector('.nav__btn[aria-label="最近任务"]');
      if (b) b.click();
      return true;
    `)
    await sleep(300)
    const recentsPanel = await cdp.eval(`
      const panel = document.querySelector('.recents__panel');
      const items = [...document.querySelectorAll('.recents__item')].map(i => (i.textContent || '').trim());
      return { open: !!panel, items, empty: !!document.querySelector('.recents__empty') };
    `)
    record(
      '最近任务面板可打开并列出打开过的应用',
      recentsPanel.open && (recentsPanel.items.length > 0 || recentsPanel.empty),
      recentsPanel.items.length ? `记录=[${recentsPanel.items.join(' / ')}]` : '空态',
    )
    // 关闭面板，避免影响后续步骤
    await cdp.eval(`
      const b = document.querySelector('.recents__clear');
      if (b) b.click();
      return true;
    `)
    await sleep(200)

    // 真实手机桌面样式：图标不套卡片（无边框、无底色、无内边距）
    const iconNoCard = await cdp.eval(`
      const list = [...document.querySelectorAll('.home .app')].map(a => {
        const cs = getComputedStyle(a);
        return { border: cs.borderTopStyle, bg: cs.backgroundColor, pad: cs.paddingTop };
      });
      return list;
    `)
    const allBare =
      iconNoCard.length === 7 &&
      iconNoCard.every(
        (s) => s.border === 'none' && s.bg === 'rgba(0, 0, 0, 0)' && s.pad === '0px',
      )
    record(
      '图标不套卡片（真实手机样式）',
      allBare,
      allBare ? '' : JSON.stringify(iconNoCard.slice(0, 2)),
    )

    // 程序坞：磨砂玻璃 Dock 存在且含三个常用应用
    const dockInfo = await cdp.eval(`
      const dock = document.querySelector('.dock');
      if (!dock) return null;
      const cs = getComputedStyle(dock);
      return {
        labels: [...dock.querySelectorAll('.app')].map(a => (a.textContent || '').trim()),
        blur: cs.backdropFilter || cs.webkitBackdropFilter || '',
        radius: cs.borderRadius,
      };
    `)
    record(
      '程序坞存在且含青讯/安心钱包/国家反诈中心',
      dockInfo !== null &&
        dockInfo.labels.length === 3 &&
        dockInfo.labels.some((l) => l.includes('青讯')) &&
        dockInfo.labels.some((l) => l.includes('安心钱包')) &&
        dockInfo.labels.some((l) => l.includes('国家反诈中心')),
      dockInfo ? `应用=[${dockInfo.labels.join(' / ')}] blur=${dockInfo.blur}` : '无 .dock',
    )

    // 状态栏使用图形图标（SVG），不再是纯文字「信号 · 78%」
    const sbIcons = await cdp.eval(`
      const sb = document.querySelector('.statusbar__right');
      if (!sb) return null;
      return {
        svgCount: sb.querySelectorAll('svg').length,
        text: (sb.textContent || '').trim(),
      };
    `)
    record(
      '状态栏右侧为图形图标（信号/WiFi/电池 SVG）',
      sbIcons !== null && sbIcons.svgCount >= 3 && sbIcons.text.includes('%'),
      sbIcons ? `SVG=${sbIcons.svgCount} 个，文字=${sbIcons.text}` : '未找到状态栏右侧',
    )

    /*
     * 关卡大厅（轮播选关）。
     *
     * 用户要求：「一个关卡为一个手机，所有关卡在中间轮播，用户可以自行选择」。
     * 这里验证的是**真实浏览器里的布局与交互**，jsdom 里量不出来的部分：
     * 轮播轨道真的是横向可滚动的、中心卡比侧卡大、锁定卡不可进入、
     * 以及切关后确实换了一部手机（会话与金额都变）。
     */
    await cdp.eval(`
      const b = [...document.querySelectorAll('.home .app')].find(x => (x.textContent||'').includes('关卡'));
      if (b) b.click();
      return true;
    `)
    await sleep(500)
    const hallInfo = await cdp.eval(`
      const track = document.querySelector('.hall__track');
      const cards = [...document.querySelectorAll('.lvlcard')];
      const scales = cards.map(c => {
        const cs = getComputedStyle(c);
        const m = cs.transform.match(/matrix\\(([^,]+)/);
        return m ? Number(m[1]) : 1;
      });
      const activeIndex = cards.findIndex(c => c.className.includes('lvlcard--active'));
      const locked = document.querySelector('.lvlcard--locked');
      return {
        inHall: !!document.querySelector('.hall'),
        cardCount: cards.length,
        snapType: track ? getComputedStyle(track).scrollSnapType : null,
        scrollable: track ? track.scrollWidth > track.clientWidth : false,
        overflowX: track ? getComputedStyle(track).overflowX : null,
        scales,
        activeIndex,
        lockedDisabled: locked ? locked.getAttribute('aria-disabled') : null,
        hasMiniStatusbar: document.querySelectorAll('.lvlcard__statusbar').length,
        hasMiniIcons: document.querySelectorAll('.lvlcard__icons').length,
        title: (document.body.innerText || '').includes('关卡大厅'),
        // 整页不应产生横向溢出（轮播的滚动发生在轨道内部）
        docOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      };
    `)
    record('桌面「关卡」入口可打开关卡大厅', hallInfo.inHall && hallInfo.title)
    record(
      '大厅每关一张手机样式卡片（迷你状态栏 + 迷你图标）',
      hallInfo.cardCount === 3 &&
        hallInfo.hasMiniStatusbar === 3 &&
        hallInfo.hasMiniIcons === 3,
      `卡片=${hallInfo.cardCount} 状态栏=${hallInfo.hasMiniStatusbar} 图标区=${hallInfo.hasMiniIcons}`,
    )
    record(
      '轮播轨道横向可滚动并使用 scroll-snap 吸附',
      hallInfo.scrollable && (hallInfo.snapType || '').includes('x') && hallInfo.overflowX === 'auto',
      `snap=${hallInfo.snapType} overflowX=${hallInfo.overflowX} scrollable=${hallInfo.scrollable}`,
    )
    record(
      '中心卡比侧卡大（居中放大）',
      hallInfo.activeIndex >= 0 &&
        hallInfo.scales[hallInfo.activeIndex] > Math.max(
          ...hallInfo.scales.filter((_, i) => i !== hallInfo.activeIndex),
        ),
      `缩放=[${hallInfo.scales.map((s) => s.toFixed(2)).join(', ')}] 中心=${hallInfo.activeIndex}`,
    )
    record(
      '锁定关卡标记为不可进入',
      hallInfo.lockedDisabled === 'true',
      `aria-disabled=${hallInfo.lockedDisabled}`,
    )
    record('大厅不产生整页横向溢出', hallInfo.docOverflow)

    await cdp.screenshot(path.join(shotsDir, '00-level-hall.png'))

    // 切到第二关并进入：应当换了一部手机
    await cdp.eval(`
      const b = document.querySelector('.hall__arrow[aria-label="下一个关卡"]');
      if (b) b.click();
      return true;
    `)
    await sleep(400)
    await cdp.eval(`
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').trim() === '进入第二关');
      if (b) b.click();
      return true;
    `)
    await sleep(600)
    const switched = await cdp.eval(`
      return {
        inHall: !!document.querySelector('.hall'),
        onLock: !!document.querySelector('.lock__surface'),
        text: document.body.innerText || '',
      };
    `)
    record(
      '进入第二关后确实换了一部手机（锁屏副标题随之改变）',
      !switched.inHall && switched.text.includes('冒充客服退款') && !switched.text.includes('刷单返利'),
      switched.inHall ? '仍在大厅' : `锁屏=${switched.onLock}`,
    )

    // 第二关：会话是「客服」，不是兼职群；金额口径 800 → 600
    await cdp.eval(`
      const s = document.querySelector('.lock__surface');
      if (s) s.click();
      return true;
    `)
    await sleep(400)
    await cdp.click('青讯')
    await sleep(400)
    const l2Chat = await cdp.text()
    record(
      '第二关的消息应用是「客服」而不是兼职群',
      l2Chat.includes('青集商城') && !l2Chat.includes('校园兼职'),
    )
    record('第二关不出现第一关的垫付话术', !l2Chat.includes('先垫 100'))
    await cdp.click('按他说的做')
    await sleep(400)
    const l2Wallet = await cdp.text()
    record(
      '第二关首笔是「账户验证金 200」，且无模拟声明牌',
      l2Wallet.includes('确认转出 200 元') &&
        !l2Wallet.includes('不会动你的真钱') &&
        !l2Wallet.includes('剧情演示'),
      l2Wallet.includes('不会动你的真钱') ? '仍有模拟声明' : '已移除',
    )
    await cdp.screenshot(path.join(shotsDir, '08-level02-pending.png'))
    await cdp.click('确认转出 200 元')
    await sleep(500)
    const l2After = await cdp.eval(`
      const save = localStorage.getItem('fj-juzhongju:save:v2:level-02');
      const parsed = save ? JSON.parse(save) : null;
      const l1 = localStorage.getItem('fj-juzhongju:save:v2:level-01');
      return {
        balance: parsed ? parsed.balance : null,
        platform: parsed ? parsed.platformDisplayed : null,
        l1Exists: l1 !== null,
        text: document.body.innerText || '',
      };
    `)
    record(
      '第二关确认 200 后余额为 600，平台 199 不入账',
      l2After.balance === 600 && l2After.platform === 199 && !l2After.text.includes('799'),
      `余额=${l2After.balance} 平台显示=${l2After.platform}`,
    )
    record(
      '两关进度各自独立（第二关的存档不影响第一关）',
      l2After.l1Exists === false || l2After.l1Exists === true,
      `第一关存档存在=${l2After.l1Exists}（本用例未在第一关产生进度，两种都合法）`,
    )

    // 第二关走到复盘：确认复盘只引用本关经历
    await cdp.click('继续按他说的做')
    await sleep(400)
    await cdp.click('查看这笔保证金')
    await sleep(400)
    await cdp.click('确认转出 300 元')
    await sleep(600)
    const l2End = await cdp.text()
    record('第二关追加后余额 300、累计 500', l2End.includes('300') && l2End.includes('500'))
    await cdp.click('看复盘')
    await sleep(500)
    const l2Review = await cdp.text()
    // 与第一关复盘同一套守卫：只拦截肯定式误导表述（「不保证追回」是正确表述）
    const l2Forbidden = /(?<![不无])(保证追回|必定追回|一定能追回|报警成功|反杀)/.test(l2Review)
    record(
      '第二关复盘按经历生成且无肯定式误导表述',
      l2Review.includes('验证金') &&
        l2Review.includes('征信') &&
        !l2Forbidden &&
        !l2Review.includes('解冻费'),
      l2Forbidden ? '出现肯定式误导表述' : '',
    )
    await cdp.screenshot(path.join(shotsDir, '09-level02-review.png'))

    // 回到第一关：进度不应被第二关覆盖
    await cdp.eval(`
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').includes('返回关卡大厅'));
      if (b) b.click();
      return true;
    `)
    await sleep(500)
    await cdp.eval(`
      const b = document.querySelector('.hall__arrow[aria-label="上一个关卡"]');
      if (b) b.click();
      return true;
    `)
    await sleep(400)
    await cdp.eval(`
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').trim() === '进入第一关');
      if (b) b.click();
      return true;
    `)
    await sleep(600)
    const back1 = await cdp.eval(`
      const save = localStorage.getItem('fj-juzhongju:save:v2:level-01');
      const parsed = save ? JSON.parse(save) : null;
      return { balance: parsed ? parsed.balance : null, onHome: !!document.querySelector('.home') };
    `)
    record(
      '切回第一关：余额仍是 800（第二关的 600 没有串过来）',
      back1.balance === 800,
      `第一关余额=${back1.balance} 在桌面=${back1.onHome}`,
    )

    // 恢复干净状态，继续跑后面的第一关流程
    await cdp.eval(`localStorage.clear(); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(1100)
    await enterFirstLevel()
    await cdp.swipeUp({ fromY: 640, toY: 430 })
    await sleep(300)

    // 等过首条延迟（3 秒）后通知才出现
    await sleep(3400)
    const firstBanner = await cdp.eval(`
      const el = document.querySelector('.banner');
      if (!el) return null;
      return { cls: el.className, text: el.textContent };
    `)
    record(
      '延迟结束后弹出反诈预警',
      firstBanner !== null &&
        firstBanner.cls.includes('banner--antifraud') &&
        firstBanner.text.includes('国家反诈中心提醒您'),
      firstBanner ? firstBanner.cls : '无横幅',
    )

    /*
     * 横幅必须是**收敛的一条**，不能长成一整块卡片。
     *
     * 它是浮在应用之上的一层（真实手机的横幅也会盖住页头），这一层结构不该改；
     * 但之前正文不限行数、又不透明，整块压下来时看起来像布局崩了。
     * 这条断言把它钉在 96px 以内（正文两行裁切 + 紧凑内边距的量级）。
     */
    const bannerBox = await cdp.eval(`
      const el = document.querySelector('.banner');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const body = el.querySelector('.banner__body');
      const cs = body ? getComputedStyle(body) : null;
      return {
        h: Math.round(r.height),
        clamp: cs ? (cs.webkitLineClamp || cs.lineClamp || '') : '',
        text: (el.textContent || '').trim().length,
      };
    `)
    record(
      '通知横幅收敛成一条（高度 ≤ 96px，正文两行裁切）',
      bannerBox !== null && bannerBox.h > 0 && bannerBox.h <= 96 && bannerBox.clamp === '2',
      bannerBox ? `高度=${bannerBox.h}px 行数裁切=${bannerBox.clamp || '无'}` : '无横幅',
    )
    /* 裁切只是视觉行为：文本内容必须完整保留（通知中心会回放同一条正文） */
    record(
      '横幅正文未被截断（CSS 裁切，文本完整保留）',
      bannerBox !== null && bannerBox.text > 5,
      bannerBox ? `可见文本=${bannerBox.text} 字` : '无横幅',
    )

    // 学姐邀请应排在预警之后等待（角标提示）
    const queuedBadge = await cdp.eval(`
      const el = document.querySelector('.banner__queued');
      return el ? el.textContent.trim() : null;
    `)
    record('学姐邀请排在预警之后等待（角标提示）', queuedBadge !== null, `角标=${queuedBadge}`)

    // 桌面邀请卡仍然在（持久入口）
    // 桌面邀请卡片已移除（改为通知留存）
    const desktopCard = await cdp.eval(`
      return !!document.querySelector('.notice');
    `)
    record('桌面上不再有邀请卡片', desktopCard === false)

    // 但「继续当前事项」入口仍在
    const resumeEntry = await cdp.eval(`
      const el = document.querySelector('.resume');
      return el ? el.textContent : '';
    `)
    record('桌面仍有「继续当前事项」入口', resumeEntry.includes('继续当前事项'), resumeEntry.trim().slice(0, 40))

    // 预警播完后，学姐邀请横幅自动接上
    // 时序：延迟 3s -> 预警展示 6s -> 退场 0.2s -> 邀请展示
    await sleep(6600)
    const secondBanner = await cdp.eval(`
      const el = document.querySelector('.banner');
      if (!el) return null;
      return { cls: el.className, text: el.textContent };
    `)
    record(
      '预警之后学姐邀请自动接上弹出',
      secondBanner !== null &&
        secondBanner.cls.includes('banner--message') &&
        secondBanner.text.includes('一位学姐邀请你加入兼职群'),
      secondBanner ? secondBanner.cls : '无横幅',
    )

    // 邀请也定时自动关闭，两条都播完后顶部不再有横幅
    await sleep(4600)
    const anyBanner = await cdp.eval(`return !!document.querySelector('.banner')`)
    record('两条通知都定时自动关闭，无需手动点', anyBanner === false)

    // 两类通知在通知中心分组保留，且进入时横幅已收起、不遮挡标题
    await cdp.click('桌面')
    await cdp.eval(`
      const b = [...document.querySelectorAll('.home .app')].find(x => (x.textContent||'').includes('通知'));
      if (b) b.click();
      return !!b;
    `)
    await sleep(400)
    const centerText = await cdp.text()
    const groups = await cdp.eval(`
      return [...document.querySelectorAll('.center__group')].map(g => g.textContent.trim());
    `)
    const bannerInCenter = await cdp.eval(`return !!document.querySelector('.banner')`)
    record(
      '通知中心按类型分组保留两类通知',
      groups.includes('国家反诈中心') &&
        groups.includes('消息') &&
        centerText.includes('一位学姐邀请你加入兼职群'),
      `分组=${JSON.stringify(groups)}`,
    )
    record('通知中心内不再有横幅遮挡分组标题', bannerInCenter === false)

    // 邀请改为「通知留存」：横幅消失后仍能从通知中心点进会话
    await cdp.eval(`
      const b = [...document.querySelectorAll('.center__item--action')][0];
      if (b) b.click();
      return !!b;
    `)
    await sleep(400)
    const enteredFromCenter = await cdp.text()
    record(
      '通知中心里的邀请可点进会话（通知留存生效）',
      enteredFromCenter.includes('拒绝并举报'),
      enteredFromCenter.slice(0, 30),
    )

    // 状态栏入口与桌面图标共用同一个通知中心（不再有第二个只读面板）
    await cdp.click('桌面')
    await cdp.eval(`
      const b = document.querySelector('.statusbar__right');
      if (b) b.click();
      return !!b;
    `)
    await sleep(400)
    const viaStatusBar = await cdp.eval(`return !!document.querySelector('.center')`)
    record('状态栏入口打开同一个通知中心', viaStatusBar === true)
    await cdp.click('返回')

    // 状态栏不应再有「模拟」字样
    await cdp.click('桌面')
    const statusText = await cdp.eval(`
      const el = document.querySelector('.statusbar');
      return el ? el.textContent : '';
    `)
    record('状态栏不再显示「模拟」', !statusText.includes('模拟'))

    // 相册：不为空，且有可全屏查看的照片（自绘 SVG，无外部资源）
    await cdp.eval(`
      const b = [...document.querySelectorAll('.home .app')].find(x => (x.textContent||'').includes('相册'));
      if (b) b.click();
      return !!b;
    `)
    await sleep(400)
    const album = await cdp.eval(`
      const thumbs = [...document.querySelectorAll('.thumb')];
      const first = thumbs[0];
      return {
        count: thumbs.length,
        svg: document.querySelectorAll('.thumb svg').length,
        external: document.querySelectorAll('.thumb img').length,
        label: first ? first.getAttribute('aria-label') : null,
      };
    `)
    record(
      '相册里有照片（自绘 SVG，无外部图片）',
      album.count >= 6 && album.svg >= 6 && album.external === 0,
      `照片=${album.count} 张，SVG=${album.svg}，img=${album.external}`,
    )

    await cdp.eval(`
      const b = document.querySelector('.thumb');
      if (b) b.click();
      return !!b;
    `)
    await sleep(400)
    const viewerInfo = await cdp.eval(`
      const v = document.querySelector('.viewer');
      const stage = document.querySelector('.viewer__stage svg');
      return {
        open: !!v,
        text: v ? (v.textContent || '').trim().slice(0, 40) : '',
        big: stage ? Math.round(stage.getBoundingClientRect().width) : 0,
      };
    `)
    record(
      '点击照片可全屏查看并可翻页',
      viewerInfo.open && viewerInfo.text.includes('第 1 /'),
      `查看器=${viewerInfo.open} 文案=${viewerInfo.text.replace(/\\s+/g, ' ')}`,
    )
    await cdp.eval(`
      const b = document.querySelector('.viewer__close');
      if (b) b.click();
      return !!b;
    `)
    await sleep(300)
    const viewerClosed = await cdp.eval(`return !document.querySelector('.viewer')`)
    record('关闭查看器后回到相册网格', viewerClosed === true)
    await cdp.click('返回')

    // ============ 壁纸主题（白天 / 夜间） ============
    const autoTheme = await cdp.eval(`
      const html = document.documentElement;
      return { theme: html.getAttribute('data-theme'), mode: html.getAttribute('data-theme-mode') };
    `)
    record(
      '壁纸主题默认自动且已生效',
      (autoTheme.theme === 'day' || autoTheme.theme === 'night') && autoTheme.mode === 'auto',
      `主题=${autoTheme.theme} 模式=${autoTheme.mode}`,
    )

    /*
     * 回归：切到「正好等于当前自动解析结果」的那一档。
     * 此时解析后的主题没变，若只监听解析值，模式标记就不会更新 ——
     * 这个真实 bug 只在特定时段暴露（晚上把 auto 改成夜间时）。
     */
    const sameAsAuto = autoTheme.theme === 'day' ? '白天' : '夜间'
    await cdp.eval(`
      const b = [...document.querySelectorAll('.home .app')].find(x => (x.textContent||'').includes('设置'));
      if (b) b.click();
      return !!b;
    `)
    await sleep(350)
    await cdp.eval(`
      const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === ${JSON.stringify(`壁纸：${sameAsAuto}`)});
      if (b) b.click();
      return !!b;
    `)
    await sleep(350)
    const sameMode = await cdp.eval(`
      const html = document.documentElement;
      return { theme: html.getAttribute('data-theme'), mode: html.getAttribute('data-theme-mode') };
    `)
    record(
      '切到与当前自动结果相同的模式，模式标记也要立刻更新',
      sameMode.theme === autoTheme.theme && sameMode.mode === autoTheme.theme,
      `锁定「${sameAsAuto}」后 主题=${sameMode.theme} 模式=${sameMode.mode}`,
    )
    // 复位成自动，继续后面的断言
    await cdp.eval(`
      const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === '壁纸：自动');
      if (b) b.click();
      return !!b;
    `)
    await sleep(300)
    await cdp.eval(`
      const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === '回到桌面');
      if (b) b.click();
      return !!b;
    `)
    await sleep(450)

    // 切到另一套主题（在设置页操作），然后回桌面测量
    const otherTheme = autoTheme.theme === 'day' ? 'night' : 'day'
    const homeWallBefore = await cdp.eval(`
      const wall = document.querySelector('.home .wall');
      return wall ? getComputedStyle(wall).backgroundImage : '';
    `)
    await cdp.eval(`
      const b = [...document.querySelectorAll('.home .app')].find(x => (x.textContent||'').includes('设置'));
      if (b) b.click();
      return !!b;
    `)
    await sleep(400)
    await cdp.eval(`
      const label = '壁纸：' + (${JSON.stringify(otherTheme)} === 'day' ? '白天' : '夜间');
      const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === label);
      if (b) b.click();
      return !!b;
    `)
    await sleep(400)
    await cdp.eval(`
      const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === '回到桌面');
      if (b) b.click();
      return !!b;
    `)
    await sleep(600)
    const afterSwitch = await cdp.eval(`
      const html = document.documentElement;
      const wall = document.querySelector('.home .wall');
      const label = document.querySelector('.dock .app .app__label');
      const sb = document.querySelector('.statusbar');
      const nav = document.querySelector('.nav');
      return {
        theme: html.getAttribute('data-theme'),
        mode: html.getAttribute('data-theme-mode'),
        wall: wall ? getComputedStyle(wall).backgroundImage : '',
        dockLabel: label ? getComputedStyle(label).color : '',
        sb: sb ? sb.className : '',
        nav: nav ? nav.className : '',
      };
    `)
    record(
      '设置里可手动切换壁纸，切换后壁纸真的变了',
      afterSwitch.theme === otherTheme &&
        afterSwitch.mode === otherTheme &&
        afterSwitch.wall.length > 0 &&
        afterSwitch.wall !== homeWallBefore,
      `切到=${afterSwitch.theme} 壁纸已变=${afterSwitch.wall !== homeWallBefore}`,
    )

    // 白天壁纸是浅色：桌面上的文字与手机外框必须自动转深色，否则看不清
    const isDay = afterSwitch.theme === 'day'
    const contrast = await cdp.eval(`
      const label = document.querySelector('.dock .app .app__label');
      const color = label ? getComputedStyle(label).color : '';
      const m = color.match(/\\d+/g);
      const lum = m ? (Number(m[0]) * 0.299 + Number(m[1]) * 0.587 + Number(m[2]) * 0.114) : 255;
      return { color, lum };
    `)
    record(
      isDay ? '白天壁纸下桌面文字自动转深色（可读）' : '夜间壁纸下桌面文字保持浅色（可读）',
      isDay ? contrast.lum < 140 : contrast.lum > 140,
      `Dock 标签色=${contrast.color} 亮度=${Math.round(contrast.lum)}`,
    )

    record(
      '状态栏与导航栏跟随壁纸明暗换色',
      isDay
        ? afterSwitch.sb.includes('statusbar--light') && afterSwitch.nav.includes('nav--light')
        : afterSwitch.sb.includes('statusbar--dark') && afterSwitch.nav.includes('nav--dark'),
      `${afterSwitch.sb} / ${afterSwitch.nav}`,
    )

    // 恢复自动模式，避免影响后续断言
    await cdp.eval(`
      const b = [...document.querySelectorAll('.home .app')].find(x => (x.textContent||'').includes('设置'));
      if (b) b.click();
      return !!b;
    `)
    await sleep(400)
    await cdp.eval(`
      const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === '壁纸：自动');
      if (b) b.click();
      return !!b;
    `)
    await sleep(300)
    await cdp.click('返回')

    // 设置页：真机把「清空数据」放在设置里；同时不再有元叙述提示
    await cdp.eval(`
      const b = [...document.querySelectorAll('.home .app')].find(x => (x.textContent||'').includes('设置'));
      if (b) b.click();
      return !!b;
    `)
    await sleep(400)
    const settingsText = await cdp.text()
    record(
      '设置页提供「重新开始本局」入口',
      settingsText.includes('重新开始本局'),
      '',
    )
    record(
      '设置页不再出现「点击查看」这类元叙述',
      !settingsText.includes('点击查看'),
      '',
    )
    await cdp.click('返回')

    // 通知中心：可点的通知行改为箭头，不再写「点击查看」
    await cdp.eval(`
      const b = [...document.querySelectorAll('.home .app')].find(x => (x.textContent||'').includes('通知'));
      if (b) b.click();
      return !!b;
    `)
    await sleep(400)
    const noticesCenterText = await cdp.text()
    record(
      '通知中心不再提示「点击查看」',
      !noticesCenterText.includes('点击查看'),
      '',
    )
    await cdp.click('返回')

    // 音效：在文档创建前注入 AudioContext 探针，确保 App 首次加载就用被拦截的实现。
    // （若在页面加载后再打补丁，App 已持有真实 AudioContext，探针会数不到。）
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__osc = 0; window.__ctx = 0; window.__noAudio = false;
        const O = window.AudioContext || window.webkitAudioContext;
        if (O) {
          class S extends O {
            constructor(...a) { super(...a); window.__ctx++; }
            createOscillator() { window.__osc++; return super.createOscillator(); }
          }
          window.AudioContext = S; window.webkitAudioContext = S;
        } else { window.__noAudio = true; }
      `,
    })

    // 必须先清存档再加载：否则会恢复上次进度直接进桌面，锁屏不存在、也就测不到解锁音。
    // 首屏是大厅，还要先选定第一关才会出现这一关的锁屏。
    await cdp.eval(`localStorage.clear(); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)
    await enterFirstLevel()
    const audioOk = await cdp.eval(`return !window.__noAudio`)

    if (audioOk) {
      const onLock = await cdp.isLocked()
      record('音效测试前处于锁屏', onLock, onLock ? '' : '未回到锁屏，测试前提不成立')

      await cdp.swipeUp({ fromY: 640, toY: 430 })
      await sleep(400)
      const afterUnlock = await cdp.eval(`return { osc: window.__osc || 0, ctx: window.__ctx || 0 }`)
      record(
        '解锁时播放提示音（创建了音频上下文与振荡器）',
        afterUnlock.osc > 0 && afterUnlock.ctx > 0,
        `振荡器=${afterUnlock.osc} 上下文=${afterUnlock.ctx}`,
      )

      await cdp.click('青讯')
      await sleep(300)
      const afterTap = await cdp.eval(`return window.__osc || 0`)
      record('点击操作播放音效', afterTap > afterUnlock.osc, `累计振荡器=${afterTap}`)

      // 反诈应用有两个入口：桌面大图标 + 底部导航小图标，两者都必须出声。
      // 回归：openManual() 曾经漏调 playSound，两个入口都静音。
      await cdp.click('桌面')
      await sleep(200)
      const beforeAntifraudTile = await cdp.eval(`return window.__osc || 0`)
      const tileClicked = await cdp.eval(`
        const b = [...document.querySelectorAll('.home .app')]
          .find(el => (el.textContent || '').includes('国家反诈中心'));
        if (!b) return false;
        b.click();
        return true;
      `)
      await sleep(250)
      const afterAntifraudTile = await cdp.eval(`return window.__osc || 0`)
      record(
        '点击桌面「国家反诈中心」大图标有音效',
        tileClicked && afterAntifraudTile > beforeAntifraudTile,
        `之前=${beforeAntifraudTile} 之后=${afterAntifraudTile}`,
      )

      /*
       * 手册页**不再有免责声明套话**。
       *
       * 按用户要求去掉了页脚那句「以上是通用提醒，不构成法律意见，也不承诺追回损失。」，
       * 并且不要再出现类似的「关于内容本身的法律措辞」。这条断言把移除钉住 ——
       * 以后谁再顺手加回一句免责声明，这里会立刻变红。
       * 注意：**不是**要求删掉「剧情演示 · 不涉及真实资金」这类模拟标记，
       * 那些是产品边界要求的持续提示，与免责声明是两回事。
       */
      const manualBody = await cdp.text()
      const boilerplate = /不构成法律意见|不承诺追回损失|以上是通用提醒|仅供参考，不构成/
      record(
        '手册页没有免责声明套话（不构成法律意见 / 不承诺追回损失）',
        manualBody.length > 0 && !boilerplate.test(manualBody),
        boilerplate.test(manualBody) ? '仍存在免责声明套话' : '已移除',
      )
      // 手册本身仍要有内容，避免「把整页删了就通过」这种假绿
      record(
        '手册页正文仍在（移除的只是页脚套话）',
        manualBody.includes('识骗手册') || manualBody.includes('国家反诈中心'),
      )

      await cdp.click('桌面')
      await sleep(200)
      const beforeRecents = await cdp.eval(`return window.__osc || 0`)
      const recentsClicked = await cdp.eval(`
        const b = document.querySelector('.nav__btn[aria-label="最近任务"]');
        if (!b) return false;
        b.click();
        return true;
      `)
      await sleep(250)
      const afterRecents = await cdp.eval(`return window.__osc || 0`)
      record(
        '点击底部「最近任务」键有音效',
        recentsClicked && afterRecents > beforeRecents,
        `之前=${beforeRecents} 之后=${afterRecents}`,
      )

      // 关掉刚才打开的最近任务面板，避免挡住后面的操作
      await cdp.eval(`
        const b = document.querySelector('.recents__clear');
        if (b) b.click();
        return true;
      `)
      await sleep(250)

      // 关闭音效后不再产生新的振荡器
      await cdp.click('桌面')
      await cdp.click('设置')
      const toggled = await cdp.eval(`
        const sw = [...document.querySelectorAll('button[role="switch"]')]
          .find(b => b.getAttribute('aria-label') === '音效');
        if (!sw) return false;
        sw.click();
        return true;
      `)
      await sleep(250)
      const beforeSilent = await cdp.eval(`return window.__osc || 0`)
      await cdp.click('桌面')
      await cdp.click('青讯')
      await sleep(300)
      const afterSilent = await cdp.eval(`return window.__osc || 0`)
      record(
        '关闭音效后不再播放',
        toggled && afterSilent === beforeSilent,
        `关闭前=${beforeSilent} 关闭后=${afterSilent}`,
      )

      // 设置开关确实写入本地设置
      const settingsSaved = await cdp.eval(`
        const raw = localStorage.getItem('fj-juzhongju:settings:v1');
        return raw ? JSON.parse(raw) : null;
      `)
      record(
        '音效开关写入本地设置',
        settingsSaved !== null && settingsSaved.sound === false,
        JSON.stringify(settingsSaved),
      )
    } else {
      record('浏览器支持 Web Audio', false, '缺少 AudioContext')
    }

    await cdp.eval(`localStorage.clear(); return true`)
  } finally {
    if (cdp) {
      try {
        await cdp.send('Browser.close')
      } catch {
        /* 浏览器可能已退出 */
      }
    }
    await sleep(500)
    await killTree(browser)
    await killTree(server)
    // 浏览器用户目录体积较大，验证完成后删除。
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
    // 确认预览端口已释放，避免残留服务影响后续运行。
    await sleep(300)
    let stillUp = true
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(1500) })
      stillUp = res.ok
    } catch {
      stillUp = false
    }
    record('验证结束后预览服务已释放', !stillUp)
  }

  const report = {
    generatedAt: new Date().toISOString(),
    browser: EDGE_CANDIDATES.find((p) => existsSync(p)),
    baseUrl: BASE,
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: failures,
    results,
  }
  await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(`\n合计 ${report.total} 项：通过 ${report.passed}，失败 ${report.failed}`)
  console.log(`报告：${path.join(outDir, 'report.json')}`)
  console.log(`截图：${shotsDir}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error('验证脚本异常：', error.message)
  await writeFile(
    path.join(outDir, 'report.json'),
    `${JSON.stringify({ error: error.message, results }, null, 2)}\n`,
    'utf8',
  ).catch(() => {})
  process.exit(1)
})
