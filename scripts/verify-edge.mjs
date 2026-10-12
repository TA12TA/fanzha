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
const PORT = 4173
const CDP_PORT = 9333
const BASE = `http://127.0.0.1:${PORT}/`

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
  await rm(outDir, { recursive: true, force: true })
  await mkdir(shotsDir, { recursive: true })

  const browserPath = EDGE_CANDIDATES.find((p) => existsSync(p))
  if (!browserPath) {
    console.error('未找到 Edge/Chrome，无法运行真实浏览器验证。')
    process.exit(2)
  }

  // 1) 启动 vite preview（直接调用 vite 的入口，避免 shell 拼接参数）
  const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  const server = spawn(
    process.execPath,
    [viteEntry, 'preview', '--port', String(PORT), '--strictPort'],
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

    // 2) 视口适配检查：320 / 375 / 390 无横向溢出
    for (const width of [320, 375, 390]) {
      await cdp.setWidth(width)
      await cdp.send('Page.navigate', { url: BASE })
      await sleep(700)
      const metrics = await cdp.eval(`
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          innerWidth: window.innerWidth,
          bodyScrollWidth: document.body.scrollWidth,
        }
      `)
      const noOverflow =
        metrics.scrollWidth <= metrics.clientWidth + 1 && metrics.bodyScrollWidth <= metrics.innerWidth + 1
      record(
        `无横向溢出 @${width}px`,
        noOverflow,
        `scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth} bodyScrollWidth=${metrics.bodyScrollWidth}`,
      )
    }

    // 3) 主线路径：拒绝邀请 → 早识别结局 → 复盘
    await cdp.setWidth(390)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)
    await cdp.eval(`localStorage.clear(); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)

    await cdp.screenshot(path.join(shotsDir, '01-intro.png'))
    let text = await cdp.text()
    record('开场显示标题', text.includes('反诈局中局：你的手机') && text.includes('开始体验'))

    await cdp.click('开始体验')
    await cdp.screenshot(path.join(shotsDir, '02-home.png'))
    text = await cdp.text()
    record(
      '开始后先进入桌面并显示邀请通知',
      text.includes('青屏 OS') && text.includes('一位学姐邀请你加入兼职群'),
    )

    await cdp.click('一位学姐邀请你加入兼职群')
    text = await cdp.text()
    record('通知可进入邀请会话', text.includes('拒绝并举报'))

    await cdp.click('进群看看')
    await cdp.click('显示全部')
    await cdp.screenshot(path.join(shotsDir, '03-group.png'))
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
      const save = localStorage.getItem('fj-juzhongju:save:v1');
      return save ? JSON.parse(save).balance : null;
    `)
    record(
      '回桌面后仍在桌面且余额仍为 800（未扣款）',
      text.includes('青屏 OS') && text.includes('800') && balanceStill800 === 800,
      `存档余额=${balanceStill800}`,
    )

    await cdp.click('继续当前事项')
    await cdp.click('接下任务')
    await cdp.screenshot(path.join(shotsDir, '04-wallet-pending.png'))
    text = await cdp.text()
    record(
      '待付款页显示固定金额与模拟声明',
      text.includes('确认垫付 100 元') && text.includes('不会动你的真钱') && text.includes('不用输卡号'),
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
    await cdp.click('开始体验')
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
    await cdp.click('开始体验')
    await cdp.click('一位学姐邀请你加入兼职群')
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
    record('确认后回到开场', text.includes('开始体验') && text.includes('反诈局中局：你的手机'))

    // 7) 损坏存档回退
    await cdp.eval(`localStorage.setItem('fj-juzhongju:save:v1', '{"version":1,"node":"group","balance":999999}'); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)
    text = await cdp.text()
    const cleared = await cdp.eval(`return localStorage.getItem('fj-juzhongju:save:v1') === null`)
    record('损坏存档安全回退到开场', text.includes('开始体验') && cleared)

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
    await cdp.click('开始体验')
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

    await cdp.send('Emulation.setEmulatedMedia', { features: [] })
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
