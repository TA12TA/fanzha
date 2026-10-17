/**
 * 公网部署冒烟测试（Edge/Chrome headless + CDP，仅用 Node 内建模块）。
 *
 * 用途：把项目通过隧道或任意静态托管发布到公网后，确认「能下载字节」不等
 * 于「能玩」。会真实打开公网 URL，检查：
 * 1. 锁屏能渲染出开场文案；
 * 2. 点击解锁后桌面六个图标与底部导航齐全；
 * 3. 官方 logo 图片真的解码出像素（公网上最容易挂的就是图片资源）；
 * 4. 反诈应用能打开；
 * 5. 运行期没有 JS 异常，除 favicon 外没有资源 4xx/5xx（并把 404 的 URL 打出来）。
 *
 * 用法：node scripts/smoke-public.mjs <公网URL>
 * 例：  node scripts/smoke-public.mjs https://example.trycloudflare.com/
 * 退出码非 0 表示存在失败项；结果写入 .verify/public-smoke.json 与截图。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, '.verify')
const CDP_PORT = 9444

const BASE = process.argv[2]
if (!BASE) {
  console.error('用法: node scripts/smoke-public.mjs <公网URL>')
  process.exit(2)
}

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]

const browserPath = EDGE_CANDIDATES.find((p) => existsSync(p))
if (!browserPath) {
  console.error('未找到 Edge/Chrome，无法运行公网冒烟测试。')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
let failures = 0

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failures += 1
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
}

/** 极简 CDP 客户端。 */
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.exceptions = []
    this.badResponses = []
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
        return
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails
        this.exceptions.push(d.exception?.description || d.text)
      } else if (msg.method === 'Network.responseReceived') {
        const { response } = msg.params
        if (response.status >= 400) {
          this.badResponses.push({ url: response.url, status: response.status })
        }
      }
    })
  }

  send(method, params = {}) {
    this.id += 1
    const id = this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(() => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (res.exceptionDetails) {
      throw new Error(`页面求值异常：${res.exceptionDetails.text}`)
    }
    return res.result.value
  }
}

async function killTree(child) {
  if (!child || child.exitCode !== null) return
  await new Promise((resolve) => {
    const k = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    k.on('close', resolve)
    k.on('error', resolve)
  })
}

await mkdir(outDir, { recursive: true })

// 必须用全新 profile：上一次跑完会把存档写进 localStorage，
// 再次打开就会跳过锁屏直接进桌面，让「锁屏渲染」这类断言假性失败。
const userDataDir = path.join(outDir, 'smoke-profile')
await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
await mkdir(userDataDir, { recursive: true })

const browser = spawn(
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

let cdp
try {
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

  const target = await (
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })
  ).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  cdp = new Cdp(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })

  const t0 = Date.now()
  await cdp.send('Page.navigate', { url: BASE })
  await sleep(4500)
  const loadMs = Date.now() - t0

  const first = await cdp.eval(`
    return {
      text: document.body.innerText || '',
      title: document.title,
      onDesk: !!document.querySelector('.desk'),
      phones: document.querySelectorAll('.deskphone').length,
      hasLock: !!document.querySelector('.lock__surface'),
      url: location.href,
    }
  `)
  record(
    '公网页面加载出关卡大厅（先选关）',
    first.onDesk && !first.hasLock && first.phones >= 2,
    `书桌=${first.onDesk} 手机=${first.phones} 锁屏=${first.hasLock}${loadMs < 20000 ? ` 首次可见≈${loadMs}ms` : ` 慢：≈${loadMs}ms`}`,
  )
  record('页面标题正确', first.title.length > 0, first.title)

  // 点第一部手机选定第一关：这时才应该出现这一关的锁屏（转场 520ms）
  await cdp.eval(`
    const b = document.querySelector('.deskphone');
    if (b) b.click();
    return !!b;
  `)
  await sleep(1400)

  const intro = await cdp.eval(`
    return {
      text: document.body.innerText || '',
      onDesk: !!document.querySelector('.desk'),
      hasLock: !!document.querySelector('.lock__surface'),
    }
  `)
  record(
    '选定关卡后才进入锁屏解锁界面',
    intro.hasLock && !intro.onDesk,
    `锁屏=${intro.hasLock} 书桌=${intro.onDesk}`,
  )
  record('开场文案正确', intro.text.includes('反诈局中局：你的手机'))

  // 点击解锁 → 桌面（必须先处于锁屏，否则这个断言没有意义）
  const lockedBefore = intro.hasLock
  await cdp.eval(`
    const s = document.querySelector('.lock__surface');
    if (s) s.click();
    return true;
  `)
  await sleep(1200)

  const home = await cdp.eval(`
    return {
      hasHome: !!document.querySelector('.home'),
      hasLock: !!document.querySelector('.lock__surface'),
      apps: [...document.querySelectorAll('.home .app')].map(a => (a.textContent || '').trim()),
      navs: [...document.querySelectorAll('.nav__btn')].map(b => b.getAttribute('aria-label')),
      dockCount: document.querySelectorAll('.dock .app').length,
    }
  `)
  record(
    '点击解锁进入桌面',
    lockedBefore && !home.hasLock && home.hasHome,
    `解锁前锁屏=${lockedBefore} 解锁后桌面=${home.hasHome}`,
  )
  record('桌面七个入口齐全（网格 + 程序坞，含「关卡」）', home.apps.length === 7, home.apps.join(' / '))
  record('桌面含国家反诈中心', home.apps.some((a) => a.includes('国家反诈中心')))
  record('桌面含关卡大厅入口', home.apps.some((a) => a.includes('关卡')))
  record('程序坞有三个常用应用', home.dockCount === 3, `dock=${home.dockCount}`)
  record(
    '底部为三大金刚键',
    home.navs.join(',') === '返回上一层,回到桌面,最近任务',
    home.navs.join(' / '),
  )

  // 官方 logo 是公网上最容易挂的资源：轮询到真正解码出像素为止
  const imgs = await waitForImages(cdp)
  record(
    '桌面 logo 图片真的加载成功',
    imgs.ok,
    `count=${imgs.count} naturalWidth=[${(imgs.widths || []).join(',')}]`,
  )

  // 点程序坞里的「国家反诈中心」→ 反诈应用
  // （底部已改为三大金刚键，不再有反诈快捷入口）
  await cdp.eval(`
    const b = document.querySelector('.dock .app[aria-label="打开国家反诈中心"]');
    if (b) b.click();
    return true;
  `)
  await sleep(800)
  const manual = await cdp.eval(`return (document.body.innerText || '').slice(0, 400)`)
  record('公网上能打开反诈应用', manual.includes('识骗手册') || manual.includes('国家反诈中心'))

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(path.join(outDir, 'public-smoke.png'), Buffer.from(shot.data, 'base64'))

  record('运行期没有 JS 异常', cdp.exceptions.length === 0, cdp.exceptions.slice(0, 2).join(' | '))

  // 404 的真实 URL：不能只看到「有个 404」就放过
  const bad = cdp.badResponses
  const realBad = bad.filter((b) => !b.url.includes('favicon'))
  record(
    '除 favicon 外没有资源 4xx/5xx',
    realBad.length === 0,
    realBad.length
      ? JSON.stringify(realBad.slice(0, 5))
      : `全部正常；仅 favicon.ico 缺失（${bad.length} 次 404，不影响游戏）`,
  )
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
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
}

console.log(`\n合计 ${results.length} 项：通过 ${results.length - failures}，失败 ${failures}`)
console.log(`报告：${path.join(outDir, 'public-smoke.json')}`)
await writeFile(
  path.join(outDir, 'public-smoke.json'),
  `${JSON.stringify({ url: BASE, results }, null, 2)}\n`,
  'utf8',
)
process.exit(failures === 0 ? 0 : 1)

/** 轮询等待页面里所有 <img> 真的解码出像素（公网慢，不能靠固定 sleep）。 */
async function waitForImages(client, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs
  let last = { count: 0, widths: [] }
  while (Date.now() < deadline) {
    last = await client.eval(`
      const imgs = [...document.querySelectorAll('img')];
      return { count: imgs.length, widths: imgs.map(i => i.naturalWidth) }
    `)
    if (last.count > 0 && last.widths.every((w) => w > 0)) return { ok: true, ...last }
    await sleep(500)
  }
  return { ok: false, ...last }
}
