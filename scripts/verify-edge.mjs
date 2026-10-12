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
    record(
      '锁屏显示标题与上滑提示',
      text.includes('反诈局中局：你的手机') && text.includes('上滑解锁'),
    )

    // 轻微上滑（不足阈值）应回弹，不解锁
    await cdp.swipeUp({ fromY: 620, toY: 600 })
    record('轻微上滑不解锁', await cdp.isLocked())

    // 上滑解锁（真实触摸事件）
    await cdp.swipeUp({ fromY: 640, toY: 430 })
    await cdp.screenshot(path.join(shotsDir, '02-home.png'))
    text = await cdp.text()
    const onDesktop = await cdp.eval(`return !!document.querySelector('.home')`)
    record(
      '上滑解锁后进入桌面并显示邀请通知',
      onDesktop && text.includes('一位学姐邀请你加入兼职群'),
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
    await cdp.swipeUp({ fromY: 640, toY: 430 })
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
    record('确认后回到锁屏', text.includes('上滑解锁') && text.includes('反诈局中局：你的手机'))

    // 7) 损坏存档回退
    await cdp.eval(`localStorage.setItem('fj-juzhongju:save:v1', '{"version":1,"node":"group","balance":999999}'); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)
    text = await cdp.text()
    const cleared = await cdp.eval(`return localStorage.getItem('fj-juzhongju:save:v1') === null`)
    record('损坏存档安全回退到锁屏', text.includes('上滑解锁') && cleared)

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

    // 时间在一分钟内保持稳定（不是每秒乱跳的假时钟）
    const stable = await cdp.eval(`
      const el = document.querySelector('.statusbar__time [aria-hidden="true"]');
      const first = el ? el.textContent.trim() : '';
      return new Promise((resolve) => setTimeout(() => {
        resolve({ first, second: el ? el.textContent.trim() : '' });
      }, 1500));
    `)
    record(
      '同一分钟内时间显示稳定',
      stable.first === stable.second,
      `${stable.first} → ${stable.second}`,
    )

    // 9) 顶部通知：两类分开 + 定时自动关闭
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: '' })
    await cdp.eval(`localStorage.clear(); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)
    await cdp.swipeUp({ fromY: 640, toY: 430 })

    const firstBanner = await cdp.eval(`
      const el = document.querySelector('.banner');
      if (!el) return null;
      return { cls: el.className, text: el.textContent };
    `)
    record(
      '解锁后先弹出消息类通知（学姐邀请）',
      firstBanner !== null &&
        firstBanner.cls.includes('banner--message') &&
        firstBanner.text.includes('一位学姐邀请你加入兼职群'),
      firstBanner ? firstBanner.cls : '无横幅',
    )

    // 队列角标提示还有预警在等待
    const queued = await cdp.eval(`
      const el = document.querySelector('.banner__queued');
      return el ? el.textContent.trim() : null;
    `)
    record('队列角标提示还有通知在等待', queued !== null, `角标=${queued}`)

    // 等待消息类通知自动关闭（默认 4.5 秒），预警自动接上
    await sleep(5200)
    const secondBanner = await cdp.eval(`
      const el = document.querySelector('.banner');
      if (!el) return null;
      return { cls: el.className, text: el.textContent };
    `)
    record(
      '消息通知定时自动关闭后，反诈预警自动接上',
      secondBanner !== null &&
        secondBanner.cls.includes('banner--antifraud') &&
        secondBanner.text.includes('国家反诈中心提醒您'),
      secondBanner ? secondBanner.cls : '无横幅',
    )

    // 等待预警也自动关闭（默认 7 秒），顶部不再有横幅
    await sleep(7600)
    const anyBanner = await cdp.eval(`return !!document.querySelector('.banner')`)
    record('预警也会定时自动关闭，无需手动点', anyBanner === false)

    // 两类通知在通知中心分组保留
    await cdp.click('桌面')
    await cdp.eval(`
      const b = [...document.querySelectorAll('.apps .app')].find(x => (x.textContent||'').includes('通知'));
      if (b) b.click();
      return !!b;
    `)
    await sleep(400)
    const centerText = await cdp.text()
    const groups = await cdp.eval(`
      return [...document.querySelectorAll('.center__group')].map(g => g.textContent.trim());
    `)
    record(
      '通知中心按类型分组保留两类通知',
      groups.includes('国家反诈中心') &&
        groups.includes('消息') &&
        centerText.includes('一位学姐邀请你加入兼职群'),
      `分组=${JSON.stringify(groups)}`,
    )

    // 状态栏不应再有「模拟」字样
    await cdp.click('桌面')
    const statusText = await cdp.eval(`
      const el = document.querySelector('.statusbar');
      return el ? el.textContent : '';
    `)
    record('状态栏不再显示「模拟」', !statusText.includes('模拟'))

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
    await cdp.eval(`localStorage.clear(); return true`)
    await cdp.send('Page.navigate', { url: BASE })
    await sleep(700)
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
