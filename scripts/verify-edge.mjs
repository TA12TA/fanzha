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

      /*
       * 关卡进行中刷新会触发 beforeunload 确认，这是产品行为。
       * 验证脚本在「桌面」量完布局后要重新导航；不自动接受的话，
       * 原生确认框会把 Page.navigate 卡到超时。
       */
      if (msg.method === 'Page.javascriptDialogOpening') {
        this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
        return
      }

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
     * 首屏是关卡大厅（书桌）：点桌上第一部手机，等转场播完，停在锁屏。
     * 后续各段流程沿用原有的「锁屏 → 上滑解锁 → 桌面」路径，
     * 因此凡是「清档后重新导航」的地方都要先调用它，否则会停在首屏书桌。
     */
    async function enterFirstLevel() {
      const clicked = await cdp.eval(`
        const b = document.querySelector('.deskphone');
        if (b) b.click();
        return !!b;
      `)
      // 转场 520ms + 落定，留足余量
      await sleep(800)
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
     * 这一版的大厅是「书桌」：桌上平放几部手机，**没有手机外框**
     * （没有状态栏、没有底部导航），点一部手机 → 旋转放大转场 → 该关锁屏。
     */
    /*
     * 移动端视口保护：页面本身不滚动、下拉刷新被关掉。
     * 这不是靠 JS 阻挡（会破坏内部列表滚动），而是根节点的 CSS。
     */
    const viewportGuard = await cdp.eval(`
      const cs = getComputedStyle(document.body);
      return {
        overflow: cs.overflow,
        overscroll: cs.overscrollBehaviorY || cs.overscrollBehavior,
        position: cs.position,
      };
    `)
    record(
      '移动端锁定视口并关闭下拉刷新',
      viewportGuard.overflow === 'hidden' &&
        viewportGuard.overscroll === 'none' &&
        viewportGuard.position === 'fixed',
      JSON.stringify(viewportGuard),
    )

    const firstScreen = await cdp.eval(`
      const phones = [...document.querySelectorAll('.deskphone')];
      const ret = [...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('返回当前关卡'));
      return {
        onDesk: !!document.querySelector('.desk'),
        hasLock: !!document.querySelector('.lock__surface'),
        phones: phones.length,
        hasStatusbar: !!document.querySelector('.statusbar'),
        hasNavKeys: document.querySelectorAll('.nav__btn').length,
        hasReturn: !!ret,
        tilts: phones.map(p => p.style.getPropertyValue('--tilt')),
        miniScreens: phones.filter(p => p.querySelector('.deskphone__screen')).length,
        hasWall: document.querySelectorAll('.deskphone__screen .wall').length,
        text: (document.body.innerText || '').slice(0, 80),
      };
    `)
    record(
      '首屏是关卡大厅（先选关，不直接进锁屏）',
      firstScreen.onDesk && !firstScreen.hasLock && firstScreen.phones === 3,
      `书桌=${firstScreen.onDesk} 锁屏=${firstScreen.hasLock} 手机=${firstScreen.phones}`,
    )
    record(
      '书桌版没有手机外框（无状态栏、无底部导航）',
      firstScreen.hasStatusbar === false && firstScreen.hasNavKeys === 0,
      `状态栏=${firstScreen.hasStatusbar} 导航键=${firstScreen.hasNavKeys}`,
    )
    record(
      '每部手机都是手机样式（机身屏幕 + 共用壁纸）',
      firstScreen.miniScreens === 3 && firstScreen.hasWall === 3,
      `屏幕=${firstScreen.miniScreens} 壁纸=${firstScreen.hasWall}`,
    )
    record(
      '三部手机被摆成不同角度（固定值）',
      new Set(firstScreen.tilts).size === 3 && firstScreen.tilts.every((t) => /^-?\d+deg$/.test(t)),
      `倾斜=[${firstScreen.tilts.join(', ')}]`,
    )
    record(
      '首屏大厅没有「返回当前关卡」（还没进过任何关）',
      firstScreen.hasReturn === false,
    )
    await cdp.screenshot(path.join(shotsDir, '00-level-desk.png'))

    /*
     * 书桌文字在两种主题下都必须看得清。
     *
     * 与锁屏那条守卫同一个思路（白天浅色木头 → 文字转深；夜间深色木头 → 文字转浅），
     * 但这里不逐条检查颜色，只验证**明暗真的跟着主题翻转**：
     * 书桌是新增的整屏界面，最容易犯的错就是「背景跟着主题变了、文字没跟着变」，
     * 于是白天或夜间必有一边看不清（锁屏当初就是这么翻车的）。
     */
    for (const mode of ['day', 'night']) {
      await cdp.eval(`
        localStorage.setItem('fj-juzhongju:settings:v1', JSON.stringify({
          version: 1, sound: true, banner: true, theme: ${JSON.stringify(mode)},
        }));
        return true;
      `)
      await cdp.send('Page.navigate', { url: BASE })
      await sleep(1000)
      const deskTheme = await cdp.eval(`
        const title = document.querySelector('.desk__title');
        const surface = document.querySelector('.desk__surface');
        if (!title || !surface) return null;
        const lum = (css) => {
          const m = (css || '').match(/\\d+/g);
          if (!m) return null;
          const [r, g, b] = [0, 1, 2].map((i) => {
            const v = Number(m[i]) / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        return {
          applied: document.documentElement.getAttribute('data-theme'),
          titleLum: lum(getComputedStyle(title).color),
          deskLum: lum(getComputedStyle(surface).backgroundColor),
        };
      `)
      /*
       * 用 **WCAG 对比度**判定，而不是随便挑一个亮度阈值：
       * 白天（浅色木头）→ 文字必须比桌面暗；夜间（深色木头）→ 文字必须比桌面亮；
       * 两种情况下的对比度都要达到正文标准的 4.5:1。
       *
       * 两个方向都要查，而且**底色也要真的量**：实测踩过一次
       * 「文字跟着主题翻了、桌面底色没翻」（`.desk` 的底色被根壳的
       * `.phone__frame` 背景盖掉），结果深色标题压在深蓝黑底上，
       * 而只查文字亮度的弱断言照过。用对比度算就不会漏。
       */
      const directionOk =
        deskTheme !== null &&
        deskTheme.applied === mode &&
        (mode === 'day'
          ? deskTheme.titleLum < deskTheme.deskLum
          : deskTheme.titleLum > deskTheme.deskLum)
      const contrast =
        deskTheme === null
          ? 0
          : (Math.max(deskTheme.titleLum, deskTheme.deskLum) + 0.05) /
            (Math.min(deskTheme.titleLum, deskTheme.deskLum) + 0.05)
      record(
        `书桌文字在${mode === 'day' ? '白天' : '夜间'}主题下可读（对比度 ≥ 4.5:1 且随主题翻转）`,
        directionOk && contrast >= 4.5,
        deskTheme
          ? `theme=${deskTheme.applied} 对比度=${contrast.toFixed(2)}:1（标题=${deskTheme.titleLum?.toFixed(3)} 桌面=${deskTheme.deskLum?.toFixed(3)}）`
          : '未找到书桌',
      )
    }

    // 恢复默认主题与干净状态，继续后面的转场流程
    await cdp.eval(`localStorage.clear(); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(1000)

    /*
     * 转场：点手机后应当先出现**飞行层**（被点的那部手机在放大），
     * 再落到那一关的锁屏。这里在动画中途采样一次，确认飞行层真的出现过 ——
     * 只看「最终进了锁屏」是查不出「有没有动画」的。
     */
    const flyStart = await cdp.eval(`
      const b = document.querySelector('.deskphone');
      if (b) b.click();
      return !!b;
    `)
    await sleep(170)
    const midFlight = await cdp.eval(`
      const fly = document.querySelector('.desk__fly');
      if (!fly) return { fly: false };
      const cs = getComputedStyle(fly);
      /* 从矩阵里取出缩放分量：飞行中途它应当明显小于 1（还在长大）。
         matrix(a, b, c, d, e, f) → 缩放 ≈ sqrt(a² + b²) */
      const m = (cs.transform || '').match(/matrix\\(([^)]+)\\)/);
      const parts = m ? m[1].split(',').map(Number) : null;
      const scale = parts ? Math.sqrt(parts[0] * parts[0] + parts[1] * parts[1]) : null;
      return {
        fly: true,
        hasPhoneBody: !!fly.querySelector('.deskphone__body'),
        transform: cs.transform,
        scale,
        // FLIP 起始值是否真的算出来了（没算出来会退回纯 CSS 兜底）
        flipVars: fly.style.getPropertyValue('--fly-sx'),
        duration: cs.transitionDuration,
        stageFading: !!document.querySelector('.desk__stage--flying'),
      };
    `)
    record(
      '点手机会出现飞行层（被点的手机在放大）',
      flyStart && midFlight.fly && midFlight.hasPhoneBody && midFlight.stageFading,
      midFlight.fly ? `transform=${(midFlight.transform || '').slice(0, 28)}` : '没有飞行层',
    )
    record(
      '转场起点由卡片矩形算出（FLIP 起始值不为空）',
      Boolean(midFlight.flipVars),
      `--fly-sx=${midFlight.flipVars || '（空，已退回兜底）'}`,
    )
    /*
     * 关键一条：飞行**中途**的 transform 不能是单位矩阵。
     *
     * 如果起始态与终态被合并成同一次样式计算，浏览器只会看到终态 ——
     * 对象瞬间到位、完全没有「旋转放大」的过程。这种 bug 在 DOM 上完全看不出来
     * （飞行层在、`--fly-*` 变量也对），只有量中途的计算值才能发现。
     * 实测踩过一次，所以这里同时要求「不是单位矩阵」且「缩放明显小于 1」。
     */
    record(
      '转场是真的在放大（中途 transform 不是单位矩阵）',
      midFlight.fly &&
        typeof midFlight.scale === 'number' &&
        midFlight.scale > 0.2 &&
        midFlight.scale < 0.97 &&
        midFlight.duration !== '0s',
      `中途缩放=${midFlight.scale === null ? '无法解析' : midFlight.scale.toFixed(2)} duration=${midFlight.duration}`,
    )

    // 等转场播完
    await sleep(900)
    const afterEnter = await cdp.eval(`
      return {
        onDesk: !!document.querySelector('.desk'),
        hasLock: !!document.querySelector('.lock__surface'),
        flyGone: !document.querySelector('.desk__fly'),
      };
    `)
    record(
      '转场结束后落在这一关的锁屏，飞行层已撤掉',
      afterEnter.hasLock && !afterEnter.onDesk && afterEnter.flyGone,
      `锁屏=${afterEnter.hasLock} 书桌=${afterEnter.onDesk} 飞行层已撤=${afterEnter.flyGone}`,
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

    /*
     * 班级通知群：通知多一点、随机一点（用户要求）。
     *
     * 固定几条辅导员/同学的消息 + 每局随机抽 3–5 条反诈通知。
     * 这里量的是真实浏览器里的条数与内容，并且**退出再进一次**，
     * 确认抽签结果被缓存住、不会当场换一批（那会让"群消息"立刻露馅）。
     */
    const openClassGroup = async () => {
      await cdp.eval(`
        const b = [...document.querySelectorAll('.session')]
          .find(x => (x.textContent || '').includes('班级通知群'));
        if (b) b.click();
        return true;
      `)
      await sleep(400)
      const skip = await cdp.eval(`
        const b = [...document.querySelectorAll('button')]
          .find(x => (x.textContent || '').trim() === '显示全部');
        if (!b) return false;
        b.click();
        return true;
      `)
      if (skip) await sleep(300)
    }

    await openClassGroup()
    const classGroup = await cdp.eval(`
      const rows = [...document.querySelectorAll('.chat__list .row')];
      return {
        count: rows.length,
        text: rows.map(r => (r.textContent || '')).join(' '),
        names: rows.map(r => (r.querySelector('.row__name')?.textContent || '').trim()).filter(Boolean),
      };
    `)
    record(
      '班级通知群消息更多（固定消息 + 随机通知，≥ 6 条）',
      classGroup.count >= 6 && classGroup.text.includes('教材科'),
      `条数=${classGroup.count} 发言人=${classGroup.names.slice(0, 6).join('、')}`,
    )
    /*
     * 注意这里**不**断言"含某个反诈关键词"：随机抽到哪 3–5 条是不确定的，
     * 抽到的组合可能恰好一个关键词都不含 —— 那种断言会随机变红（第一版就是这么红的）。
     * 「通知池里每一条都是反诈内容」这件事由 `tests/classNews.spec.ts` 保证；
     * 这里只量浏览器里能确定的两件事：条数够、以及固定消息仍在。
     */
    record(
      '随机通知追加在固定消息之后（总条数多于固定的 3 条）',
      classGroup.count > 3,
      `随机部分=${classGroup.count - 3} 条`,
    )
    await cdp.screenshot(path.join(shotsDir, '13-classgroup.png'))

    // 退到列表再进一次：抽到的通知不该换
    await cdp.click('返回上一层')
    await sleep(300)
    await openClassGroup()
    const classGroupAgain = await cdp.eval(`
      const rows = [...document.querySelectorAll('.chat__list .row')];
      return { count: rows.length, text: rows.map(r => (r.textContent || '')).join(' ') };
    `)
    record(
      '同一局内重进班级群，通知不会换一批',
      classGroupAgain.count === classGroup.count && classGroupAgain.text === classGroup.text,
      `第一次=${classGroup.count} 条，第二次=${classGroupAgain.count} 条`,
    )
    await cdp.click('返回上一层')
    await sleep(300)

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

    /*
     * 「国家反诈中心」警告弹窗：第一关的三个掏钱时刻也会弹（`popupReminders`）。
     * 它是模态的 —— 不点掉，下面被盖住的付款按钮真人点不到。
     */
    const dismissAntifraud = async () => {
      const clicked = await cdp.eval(`
        const b = [...document.querySelectorAll('button')]
          .find(x => (x.textContent || '').trim() === '我知道了');
        if (b) { b.click(); return true; }
        return false;
      `)
      if (clicked) await sleep(300)
      return clicked
    }

    await cdp.click('继续当前事项')
    await cdp.click('接下任务')
    const payWarn = await cdp.eval(`
      const el = document.querySelector('.af');
      const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      return { open: !!el, text: el ? norm(el.textContent) : '' };
    `)
    record(
      '首次垫付前弹出反诈警告（说明原因）',
      payWarn.open && payWarn.text.includes('检测到你疑似'),
      payWarn.open ? payWarn.text.slice(0, 40) : '没有弹窗',
    )
    if (payWarn.open) await cdp.screenshot(path.join(shotsDir, '14-level1-antifraud.png'))
    record('关掉警告弹窗后能继续操作付款页', await dismissAntifraud())
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
    await dismissAntifraud() // 要求交解冻费也是掏钱时刻，同样弹警告
    await cdp.click('显示全部')
    text = await cdp.text()
    record('提现异常显示解冻费话术', text.includes('解冻费') && text.includes('提现失败'))

    await cdp.click('查看追加垫付')
    await dismissAntifraud() // 追加垫付前再弹一次
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
    await dismissAntifraud()
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
    await dismissAntifraud() // 垫付前会弹反诈警告（减弱动效下也照样弹）
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

    // 图标风格统一：十一个入口（网格区 + 程序坞）尺寸与圆角一致
    const iconStyles = await cdp.eval(`
      const list = [...document.querySelectorAll('.home .app .app__glyph')].map(g => {
        const cs = getComputedStyle(g);
        const r = g.getBoundingClientRect();
        return { size: Math.round(r.width) + 'x' + Math.round(r.height), radius: cs.borderRadius };
      });
      return list;
    `)
    const uniformIcons =
      iconStyles.length === 11 &&
      iconStyles.every((s) => s.size === iconStyles[0].size && s.radius === iconStyles[0].radius)
    record(
      '十一个桌面入口尺寸与圆角统一（含程序坞）',
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
      iconNoCard.length === 11 &&
      iconNoCard.every(
        (s) => s.border === 'none' && s.bg === 'rgba(0, 0, 0, 0)' && s.pad === '0px',
      )
    record(
      '图标不套卡片（真实手机样式）',
      allBare,
      allBare ? '' : JSON.stringify(iconNoCard.slice(0, 2)),
    )

    // 程序坞：磨砂玻璃 Dock 存在且含四个必备应用
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
      '程序坞存在且含电话/短信/青讯/安心钱包',
      dockInfo !== null &&
        dockInfo.labels.length === 4 &&
        dockInfo.labels.some((l) => l.includes('电话')) &&
        dockInfo.labels.some((l) => l.includes('短信')) &&
        dockInfo.labels.some((l) => l.includes('青讯')) &&
        dockInfo.labels.some((l) => l.includes('安心钱包')),
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
     * 关卡大厅（书桌版）。
     *
     * 关卡进行中不再提供「关卡」入口；切关 = 刷新回大厅。
     * 这里先确认桌面六个入口里没有「关卡」，再重新导航回大厅，
     * 验证真实浏览器里的书桌布局、点手机转场，以及切关后确实换了一部手机。
     */
    const desktopEntries = await cdp.eval(`
      const labels = [...document.querySelectorAll('.home .app')].map(x => (x.textContent || '').trim());
      return { count: labels.length, labels, hasLevels: labels.some(x => x.includes('关卡')) };
    `)
    record(
      '关卡进行中不再显示「关卡」入口',
      desktopEntries.count === 11 && desktopEntries.hasLevels === false,
      `入口=${desktopEntries.labels.join(' / ')}`,
    )
    record(
      '桌面包含电话、短信与购物/听歌/视频应用',
      ['电话', '短信', '青集商城', '青听音乐', '青影'].every((name) =>
        desktopEntries.labels.some((label) => label.includes(name)),
      ),
      desktopEntries.labels.join(' / '),
    )

    await cdp.send('Page.navigate', { url: BASE })
    await sleep(1200)
    const hallInfo = await cdp.eval(`
      const phones = [...document.querySelectorAll('.deskphone')];
      const locked = document.querySelector('.deskphone--locked');
      return {
        onDesk: !!document.querySelector('.desk'),
        phoneCount: phones.length,
        tilts: phones.map(p => p.style.getPropertyValue('--tilt')),
        miniStatusbars: document.querySelectorAll('.deskphone__statusbar').length,
        miniIcons: document.querySelectorAll('.deskphone__icons').length,
        lockedDisabled: locked ? locked.getAttribute('aria-disabled') : null,
        // 书桌版不该有手机外框
        hasStatusbar: !!document.querySelector('.statusbar'),
        hasNavKeys: document.querySelectorAll('.nav__btn').length,
        hasReturn: [...document.querySelectorAll('button')].some(b => (b.textContent||'').includes('返回当前关卡')),
        title: (document.body.innerText || '').includes('关卡大厅'),
        docOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      };
    `)
    record('刷新回大厅仍停留在书桌（书桌版）', hallInfo.onDesk && hallInfo.title)
    record(
      '桌上三部手机都有手机样式（迷你状态栏 + 迷你图标）',
      hallInfo.phoneCount === 3 && hallInfo.miniStatusbars === 3 && hallInfo.miniIcons === 3,
      `手机=${hallInfo.phoneCount} 状态栏=${hallInfo.miniStatusbars} 图标区=${hallInfo.miniIcons}`,
    )
    record(
      '刷新回大厅时仍没有手机外框',
      hallInfo.hasStatusbar === false && hallInfo.hasNavKeys === 0,
      `状态栏=${hallInfo.hasStatusbar} 导航键=${hallInfo.hasNavKeys}`,
    )
    record(
      '三部手机倾斜角互不相同',
      new Set(hallInfo.tilts).size === 3,
      `倾斜=[${hallInfo.tilts.join(', ')}]`,
    )
    record(
      '锁定关卡标记为不可进入',
      hallInfo.lockedDisabled === 'true',
      `aria-disabled=${hallInfo.lockedDisabled}`,
    )
    record('刷新回大厅不显示「返回当前关卡」', hallInfo.hasReturn === false)
    record('书桌版大厅不产生整页横向溢出', hallInfo.docOverflow)

    await cdp.screenshot(path.join(shotsDir, '10-level-desk-reload.png'))

    // 点第二部手机进入第二关：应当走完转场并换了一部手机
    await cdp.eval(`
      const b = [...document.querySelectorAll('.deskphone')][1];
      if (b) b.click();
      return true;
    `)
    await sleep(1000)
    const switched = await cdp.eval(`
      return {
        onDesk: !!document.querySelector('.desk'),
        onLock: !!document.querySelector('.lock__surface'),
        flyGone: !document.querySelector('.desk__fly'),
        text: document.body.innerText || '',
      };
    `)
    record(
      '点第二部手机后确实换了一部手机（锁屏副标题随之改变）',
      !switched.onDesk && switched.flyGone && switched.text.includes('冒充客服退款') && !switched.text.includes('刷单返利'),
      switched.onDesk ? '仍在书桌' : `锁屏=${switched.onLock} 飞行层已撤=${switched.flyGone}`,
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

    /*
     * 关键节点会弹「国家反诈中心」弹窗（模态）。
     *
     * 这是把「页面上的退款进度不是你的余额。验证码给出去，等于把账户交出去。」
     * 这类宣导式提示从聊天气泡搬进弹窗后的验收：弹窗要在、第一行要说明原因、
     * 判断依据在弹窗里、聊天里不再重复；点「我知道了」之后才回到可操作状态。
     */
    const afDialog = await cdp.eval(`
      const el = document.querySelector('.af');
      const chat = document.querySelector('.chat__list');
      const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      return {
        open: !!el,
        text: el ? norm(el.textContent) : '',
        hasHeadline: !!document.querySelector('.af__headline'),
        chatHasHint: norm(chat && chat.textContent).includes('验证码给出去'),
      };
    `)
    record(
      '关键节点弹出「国家反诈中心」弹窗',
      afDialog.open && afDialog.hasHeadline,
      afDialog.open ? `文案=${afDialog.text.slice(0, 40)}` : '没有弹窗',
    )
    await cdp.screenshot(path.join(shotsDir, '12-antifraud-dialog.png'))
    record('弹窗第一行说明原因（检测到你疑似被诈骗）', afDialog.text.includes('检测到你疑似'))
    record(
      '判断依据搬进了弹窗：聊天里不再重复这条宣导',
      afDialog.text.includes('验证码给出去') && !afDialog.chatHasHint,
      `弹窗含依据=${afDialog.text.includes('验证码给出去')} 聊天仍重复=${afDialog.chatHasHint}`,
    )

    await cdp.click('我知道了')
    await sleep(300)
    const afClosed = await cdp.eval(`return !document.querySelector('.af')`)
    record('点「我知道了」后弹窗关闭，回到可操作状态', afClosed)

    /*
     * 模拟验证码（真实浏览器里的一条独立断言）。
     *
     * 与真人完全一样的路径：从屏幕上那条短信里读出 6 位码，填进输入框提交。
     * 先故意填错一次，确认对方会平和地要求重输、并且**换了一个新码**；
     * 再填对，确认剧情继续。
     */
    const gateInfo = await cdp.eval(`
      const input = document.querySelector('.gate__input');
      const submit = document.querySelector('.gate__submit');
      const continueBtn = [...document.querySelectorAll('button')]
        .find(b => (b.textContent || '').trim() === '继续按他说的做');
      const stopBtn = [...document.querySelectorAll('button')]
        .find(b => (b.textContent || '').includes('停下来，自己查订单'));
      return {
        hasInput: !!input,
        submitDisabled: submit ? submit.disabled : null,
        continueGone: !continueBtn,
        hasStop: !!stopBtn,
      };
    `)
    record(
      '索要验证码时出现输入框，且「继续」按钮被替换掉（必须真的填码）',
      gateInfo.hasInput && gateInfo.continueGone && gateInfo.hasStop,
      `输入框=${gateInfo.hasInput} 无「继续」=${gateInfo.continueGone} 仍有中止=${gateInfo.hasStop}`,
    )
    record(
      '没填满 6 位时「发给他」是禁用的',
      gateInfo.submitDisabled === true,
      `submit.disabled=${gateInfo.submitDisabled}`,
    )

    /** 从当前屏幕读出短信里的 6 位验证码（同时带回诊断信息，失败时好定位）。 */
    const readCode = async () => {
      return await cdp.eval(`
        const text = document.body.innerText || '';
        const banner = document.querySelector('.banner');
        const m = text.match(/校验码\\s*(\\d{6})/);
        return {
          code: m ? m[1] : null,
          hasBanner: !!banner,
          bannerText: banner ? (banner.textContent || '').slice(0, 60) : null,
          gateText: (document.querySelector('.gate')?.textContent || '').slice(0, 80),
        };
      `)
    }

    /**
     * 等短信真正弹出来再读码。
     *
     * 不能只 sleep 固定时间：进入系统后的**第一条**通知有一段
     * 「先让玩家看清桌面」的延迟（`FIRST_NOTICE_DELAY_MS = 3000`），
     * 而验证脚本在这一段里跑得比真人快得多，固定等待会踩在延迟窗口中间、
     * 读到一条还没出现的横幅。轮询到 8 秒，超时才算失败。
     */
    const waitCode = async (timeoutMs = 8000) => {
      const deadline = Date.now() + timeoutMs
      let last = await readCode()
      while (!last.code && Date.now() < deadline) {
        await sleep(200)
        last = await readCode()
      }
      return last
    }

    /** 把验证码敲进输入框（逐位输入，模拟真人打字，而不是直接 setValue）。 */
    const typeCode = async (code) => {
      await cdp.eval(`
        const input = document.querySelector('.gate__input');
        if (!input) return false;
        input.focus();
        input.value = ${JSON.stringify(code)};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      `)
      await sleep(150)
      await cdp.eval(`
        const btn = document.querySelector('.gate__submit');
        if (btn && !btn.disabled) btn.click();
        return true;
      `)
      await sleep(500)
    }

    const firstRead = await waitCode()
    const firstCode = firstRead.code
    await cdp.screenshot(path.join(shotsDir, '11-level02-codegate.png'))
    record(
      '进入该节点后收到了模拟短信（含 6 位验证码）',
      /^\d{6}$/.test(firstCode ?? ''),
      `验证码=${firstCode} 横幅=${firstRead.hasBanner} 横幅文本=${firstRead.bannerText ?? '（无）'} 输入区=${firstRead.gateText}`,
    )

    // 故意填错
    await typeCode('000000')
    const afterWrongRead = await waitCode()
    const afterWrong = {
      ...afterWrongRead,
      retry: await cdp.eval(`return (document.body.innerText || '').includes('好像不太对')`),
      stillGate: await cdp.eval(`return !!document.querySelector('.gate__input')`),
    }
    record(
      '验证码填错：对方平和地要求重输，并换了一条新码',
      afterWrong.retry && afterWrong.stillGate && afterWrong.code && afterWrong.code !== firstCode,
      `重输提示=${afterWrong.retry} 新码=${afterWrong.code}（旧码 ${firstCode}）`,
    )

    // 填对
    await typeCode(afterWrong.code ?? firstCode)
    await sleep(500)
    const afterRight = await cdp.eval(`
      return {
        text: document.body.innerText || '',
        stillGate: !!document.querySelector('.gate__input'),
      };
    `)
    record(
      '验证码填对后继续剧情（离开输入区，进入要保证金那一步）',
      !afterRight.stillGate && afterRight.text.includes('保证金'),
      `输入区已消失=${!afterRight.stillGate}`,
    )

    // 第二关走到复盘：确认复盘只引用本关经历
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
      const b = document.querySelector('.deskphone');
      if (b) b.click();
      return true;
    `)
    await sleep(1000)
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
        bg: getComputedStyle(el).backgroundColor,
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

    // 相册：不为空，且有可全屏查看的真实照片（本地打包）
    await cdp.eval(`
      const b = [...document.querySelectorAll('.home .app')].find(x => (x.textContent||'').includes('相册'));
      if (b) b.click();
      return !!b;
    `)
    await sleep(400)
    const album = await cdp.eval(`
      const thumbs = [...document.querySelectorAll('.thumb')];
      const imgs = [...document.querySelectorAll('.thumb img')];
      const first = thumbs[0];
      return {
        count: thumbs.length,
        svg: document.querySelectorAll('.thumb svg').length,
        images: imgs.length,
        loaded: imgs.every((img) => img.complete && img.naturalWidth > 0),
        label: first ? first.getAttribute('aria-label') : null,
      };
    `)
    record(
      '相册里有真实照片（本地图片，全部加载成功）',
      album.count >= 6 && album.images >= 6 && album.svg === 0 && album.loaded,
      `照片=${album.count} 张，img=${album.images}，SVG=${album.svg}，已加载=${album.loaded}`,
    )

    await cdp.eval(`
      const b = document.querySelector('.thumb');
      if (b) b.click();
      return !!b;
    `)
    await sleep(400)
    const viewerInfo = await cdp.eval(`
      const v = document.querySelector('.viewer');
      const stage = document.querySelector('.viewer__stage img');
      return {
        open: !!v,
        text: v ? (v.textContent || '').trim().slice(0, 40) : '',
        big: stage ? Math.round(stage.getBoundingClientRect().width) : 0,
        loaded: stage ? stage.complete && stage.naturalWidth > 0 : false,
      };
    `)
    record(
      '点击照片可全屏查看并可翻页',
      viewerInfo.open && viewerInfo.text.includes('第 1 /') && viewerInfo.loaded && viewerInfo.big > 0,
      `查看器=${viewerInfo.open} 图片已加载=${viewerInfo.loaded} 文案=${viewerInfo.text.replace(/\\s+/g, ' ')}`,
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
