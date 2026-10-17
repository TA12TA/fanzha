# 《反诈局中局：你的手机》协作规约

适用范围：本仓库全部文件。接手开发的模型/开发者先读 `README.md`、`LEVELS.md`、`LEVEL-01.md`、`LEVEL-02.md`、`DEVELOPMENT.md`、`SCENES.md`、`ACCEPTANCE.md`、`CASES.md`，再修改项目。当前状态：**多关卡结构** —— 第一关「刷单返利」与第二关「冒充客服退款」可玩，第三关「冒充公检法」仅有元数据（大厅里是锁定卡，无剧情）。此文件是开发约束，不是已完成的功能声明。

## 1. 产品边界（必须遵守，任何关卡都不例外）

- 游戏仅作反诈教育。所有金额、账户、消息、截图、转账均为虚构模拟；不接真实支付、充值、提现、银行卡、验证码或通讯录接口。
- 不向玩家索取真实姓名、手机号、银行信息、密码、验证码；不上传玩家选择记录。首版无需账号、服务器和分析 SDK。
- 不使用真实微信/银行标志、二维码、可跳转到真实支付或诈骗站点的链接；场景一律使用虚构应用、虚构品牌与虚构人物。
- **不再挂「剧情模拟 / 无真实交易 / 不会动你的真钱」这类免责标记**（2026-10-17 按用户要求改）：整个网站本身就是一段模拟叙事，满屏的"这是假的"提示反而破坏沉浸感，也让内容读起来像法律文件。
  - 本规则替代原来的「持续显示剧情模拟标记」。**但实质边界一条没放松**：仍然不接真实支付、不采集真实敏感信息、不出现真实品牌标志、不提供可跳转的真实链接或二维码。判断依据从"挂个标"改为"根本不做真实的事"。
  - 唯一的例外是**剧情里的模拟验证码**：第二关会让玩家把一条短信验证码发给"客服"（这是骗局的核心环节，删掉就没法讲）。该验证码由本地随机生成、只显示在本游戏的通知里，不来自任何真实短信、也不会被提交到任何地方。
- 不将“报警”表述为保证追回损失；建议呈现为：停止操作、保存聊天与交易证据，通过官方渠道举报并及时报警/求助。不要鼓励玩家与骗子周旋、套话或实施所谓“反杀”。
- 用故事呈现骗局识别与求助路径，不提供可复用的诈骗实施教程、可操作收款账号、实用假链接或可对外使用的诱骗素材。教学复盘解释风险和正确做法。

## 2. 交付范围与优先级

1. P0：**整页手机模拟容器＋自由探索**（桌面、状态栏、虚构消息/钱包/手册，随时切换、暂停和恢复剧情）＋首屏进入 → 全部剧情分支 → 正确模拟账本 → 按经历复盘 → 可重玩；移动端可点击、无死路。剧情以用户主动操作推进，不得强制锁在聊天/付款/结局页面。
2. P1：逐条聊天动画、轻量动效、可选图鉴；资料查看已纳入 P0 必备交互，动画和图鉴可以简化。
3. P2：音效、分享海报、后续关卡、排行榜、登录、后端、“骗子工作台”。
4. 优先保证触摸和键盘都可操作；动效不能阻止推进，音频不能成为必要交互。无需依赖倒计时判错。
5. **新增关卡走数据驱动**：按 `LEVELS.md` 的步骤新增 `src/data/levels/levelNN.ts` 并在注册表登记，不得回头把某一关的节点名、话术或金额写进引擎、存档、导航与场景组件。`tests/levels.spec.ts` 会对新关卡自动跑结构、可达性、金额与文案守卫，无需为新关卡补测试。

## 3. 项目结构与模块职责

入口链：`index.html` → `src/main.ts` → `src/App.vue` → `src/app/AppShell.vue`。别名 `@` = `src/`。

- `src/data/levels/`：剧情与文案的唯一来源。`level01.ts`（刷单返利）、`level02.ts`（冒充客服退款）可玩；`level03.ts` 只有 `coming-soon` 元数据；`index.ts` 是唯一注册表（`LEVELS`、`DEFAULT_LEVEL_ID`、`getPlayableLevel`、`requireLevel`）；`shared.ts` 是两关共用的虚构世界（品牌、妈妈转账、班级群）。`src/data/shop.ts` / `music.ts` / `video.ts` 是桌面生活应用的虚构数据；`CASES.md` 记录真实案例来源。
- `src/game/level.ts`：关卡契约 `defineLevel`（节点、转移、会话规格、金额口径 `validBalances` / `platformRequiresPaid`、复盘、提醒）。新增关卡只实现这个契约，引擎和场景不认具体关卡。
- `src/game/engine.ts`：纯状态机。`createInitialState` / `choose` / `isStateConsistent`；所有金额变化只在 `applyEffect` 内发生一次。`STATE_VERSION` 必须与 `src/game/storage.ts` 的 `SAVE_VERSION` 锁步。
- `src/game/storage.ts`：版本化 localStorage，**每关一个槽** `fj-juzhongju:save:v2:<levelId>`；`parseSave` 逐字段校验节点/选项/金额不变式，坏档只清该关并回退开场。
- `src/game/debrief.ts`：按 `state.riskTags` 生成「你实际经历了什么」的复盘，并用 `FORBIDDEN_PHRASES` / 否定前缀守卫误导性文案。
- `src/app/AppShell.vue`：根壳 = 关卡大厅（`LevelDesk.vue`）↔ 某一关的手机（`PhoneShell.vue`），切关用 `:key` 整机重挂载；主题解析和浏览器返回键也在这层。
- `src/app/PhoneShell.vue`：单关手机壳，负责锁屏、桌面、底部导航、通知、弹层与音效；剧情推进只经 `useGame(levelId).dispatch(optionId)`，组件内不直接改余额或节点。
- `src/app/` 其余文件：视图映射（`navigation.ts`）、通知、设置、聊天逐条呈现、短信验证码、时钟、随机、音效等纯前端逻辑。`src/scenes/` 是各视图，`src/components/` 是通用件。
- `tests/`：Vitest + jsdom。`levels.spec.ts` 自动守卫**所有注册关卡**（结构、可达性、金额、文案），`app.spec.ts` 挂载整部手机点真实按钮（全量约 50 秒）。新增关卡不用补测试，但要保证自动守卫通过。

## 4. 技术和结构

- 采用 Vue 3 + Vite + TypeScript，使用适合移动端的可维护组件；业务逻辑不要直接混在大段模板里。
- 剧情数据（节点/选项/复盘标签）、游戏状态转换、页面组件分离。所有选项统一经过状态转换函数；拒绝用分散在组件中的临时布尔变量决定结局。
- 状态至少包括：当前节点、所属关卡、真实可支配的**游戏模拟余额**、未兑现的**平台展示金额**（如需）、是否查看资料、垫付次数/金额、经历的风险标签、操作历史、结局。金额变动仅由确定的节点选项发生一次，禁止重复点击重复扣款。
- 金额口径按关声明、按关校验（`validBalances` / `platformRequiresPaid`），**不得跨关套用**。第一关：初始 800 → 确认首次垫付后 700 → 确认追加垫付后 400，平台声称返款 130 元**不增加可支配余额**。第二关：初始 800 → 确认验证金 200 后 600 → 确认保证金 300 后 300，平台展示退款 199 元**不增加可支配余额**。除非剧情明确设计并验证真实到账，否则不出现“返款到真实账户”。
- 如使用 `localStorage`，采用版本化存档并校验反序列化结果；**每关一个存档槽**，单关损坏只清那一关。损坏/旧版数据应安全回退到开场，可重新开始。所有面向玩家的展示按数据值渲染为文本，不把剧情文案当 HTML 注入。
- 优先相对路径资源，保证静态部署可配置基础路径；任何核心剧情不依赖外部服务。
- 竖屏移动优先，同时兼容桌面预览；适配窄屏和安全区（safe-area），避免按钮被底部工具栏遮住。尊重 `prefers-reduced-motion`，文本对比度和点击热区足够明确。

## 5. 常用命令

```bash
npm install                          # 依赖；Vue 3 是唯一运行时依赖
npm run dev                          # 开发服务器 http://127.0.0.1:5173
npm run build                        # 产物到 dist/（已 gitignore）
npm run preview                      # 预览构建 http://127.0.0.1:4173
npm run typecheck                    # vue-tsc --noEmit -p tsconfig.app.json
npm test                             # vitest run，14 个 spec / 242 个用例
npx vitest run tests/levels.spec.ts tests/engine.spec.ts  # 改关卡/引擎时先跑针对性用例
npm run verify                       # Edge/Chrome headless 跑三条结局路径 + 320/375/390px 溢出 + 截图到 .verify/
npm run smoke:public -- https://<url>/   # 发布到公网后的冒烟测试
```

- `verify` 与 `smoke:public` 依赖本机安装 Edge 或 Chrome；找不到浏览器会以退出码 2 结束。截图、报告都在 `.verify/`（已 gitignore）。
- 交付前至少跑 `npm run typecheck && npm test && npm run build`；改过布局/交互再跑 `npm run verify`。
- 改剧情或数值时，针对性跑 `tests/levels.spec.ts`、`tests/engine.spec.ts`、`tests/debrief.spec.ts`；改组件时跑 `tests/app.spec.ts`。

## 6. 工作方式

- 先做最简可运行原型并验证全部分支，再进行界面润色；每次新增节点要同时补充转移、复盘和测试。
- 不覆盖既有用户文件、不擅自重构无关目录；新增依赖时说明理由，优先复用已安装依赖；不要提交密钥、构建产物或大体积媒体素材。
- 保持脚本/状态/组件命名一致，关键教育文案需审校；如引用具体案例或统计数字，记录出处，无法核实就不写成事实数据。
- 运行构建及可运行的测试，检查失败原因并修复；最终回报应列出完成项、未完成项、实际运行的命令、剩余风险，不得把未测试功能称作已通过。
- **每轮改动必须提交一次 git**（用户明确要求）：完成一轮修改后立即 `git add -A && git commit`，不要攒着留到后面。提交信息用中文、按 `类型: 简述` 的格式（如 `feat:` / `fix:` / `refactor:` / `docs:` / `test:`），正文写清改了什么、为什么改、跑了哪些验证。回报时应给出本轮提交的哈希，并确认工作区干净（`git status` 无未提交改动）。
- **中文文本一律不要经过 PowerShell 处理**（已两次踩坑，务必遵守）：
  - 不要用 `-replace` / `Get-Content -Raw` + `Set-Content` 做文本替换，会把 UTF-8 中文变成乱码（本项目曾因此损坏源文件三次，只能 `git checkout --` 重做）；
  - 不要用 `Out-File` / `Set-Content` 写 git 提交信息：Windows PowerShell 的 `-Encoding utf8` 会写入 BOM，提交主题会带上一个零宽字符。应使用编辑工具直接写文件，再 `git commit -F <文件>`；
  - 反过来，**不要用 PowerShell 的字符串方法判断编码**：捕获原生程序（如 git）输出时 PowerShell 会自行加上 U+FEFF，导致 `$s.StartsWith([char]0xFEFF)` 之类的检查误报。要确认 BOM 是否存在，请读文件字节比对 `EF BB BF`。
- `LEVELS.md` 是关卡清单与新增关卡指南；`LEVEL-01.md` / `LEVEL-02.md` 定义各关剧情和数值，`DEVELOPMENT.md` 定义工程结构和全屏实现，`SCENES.md` 定义手机视图与场景操作（含关卡大厅），`ACCEPTANCE.md` 定义验收。若发现矛盾，先在交付说明中指出并采用不产生真实交易、数值可核对、玩家可止损的保守处理。

## 7. 备注（快速补充）
