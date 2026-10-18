# 关卡清单与新增关卡指南

本项目是**多关卡**结构：一关 = 一部手机。玩家在「关卡大厅」的书桌上选关，
每关的进度各自保留（互不覆盖），随时可以切回继续。

## 1. 当前关卡

| 关号 | 标题 | 类型 | 状态 | 初始余额 | 金额口径 |
|---|---|---|---|---|---|
| 第一关 | 刷单返利 | 网络兼职 | 可玩 | 800 元 | 800 → 700（垫付 100）→ 400（追加 300）；平台展示「返 130」**不入账** |
| 第二关 | 冒充客服退款 | 冒充客服 | 可玩 | 800 元 | 800 → 600（验证金 200）→ 300（保证金 300）；平台展示「退款 199」**不入账** |
| 第三关 | 冒充公检法 | 冒充公检法 | 可玩 | 800 元 | 800 → 300（资金核查 500）→ 0（保证金 300） |

第三关剧情、金额、结局、复盘与提醒全部在 `src/data/levels/level03.ts`，
设计稿见 `LEVEL-03.md`。三关都从 800 元独立开局，互不累计。

**每关独立开局、初始余额都是 800 元**，是并列剧本而不是同一笔钱的连续消耗。
这样每关的数值口径都能被单独核对，玩家也能直接从任意一关开始体验。

## 2. 文件位置

```text
src/game/level.ts           # 关卡契约：PlayableLevel / ComingSoonLevel / defineLevel /
                            # validateLevel / collectLevelText
src/game/types.ts           # 剧情状态、效果、复盘条目类型（id 在引擎边界是 string）
src/game/engine.ts          # choose() 事务式转移，按 state.levelId 解析关卡
src/game/storage.ts         # 每关一个存档槽 + v1 迁移
src/game/debrief.ts         # 按 state.levelId 生成复盘
src/data/levels/
  shared.ts                 # 跨关共用：品牌名、妈妈转账卡、通用手册、头像表
  level01.ts                # 第一关全部数据
  level02.ts                # 第二关全部数据
  level03.ts                # 第三关全部剧情数据（冒充公检法）
  index.ts                  # 注册表：LEVELS / getLevel / getPlayableLevel / playableLevels
src/app/navigation.ts       # 节点 → 场景的通用映射（不含任何具体关卡 id）
src/app/smsCode.ts          # 模拟验证码：生成（可注入随机源）/ 清洗 / 比对 / 模板替换
src/app/random.ts           # 可复现随机源（mulberry32）：浏览器用时间戳播种，测试用固定种子
src/app/classNews.ts        # 班级通知群的随机反诈通知（每关抽一次并缓存）
src/app/LevelDesk.vue       # 关卡大厅（书桌版，当前主版本）
src/app/DeskPhone.vue       # 书桌上的「一部手机」
src/app/AppShell.vue        # 根壳：大厅 / 手机 两态
src/app/PhoneShell.vue      # 一部手机（= 一个关卡）
```

**边界**：引擎、存档、复盘、导航、以及全部场景组件都**不 import 任何具体关卡文件**，
只通过注册表取数据。新增关卡不需要改这些文件。

## 2.1 需要「模拟验证码」的关卡怎么写

骗局里「把短信验证码发我」这一步可以用关卡数据声明，不需要改界面：

```ts
codeGate: {
  'l2-refund-claim': {
    sender: '安心钱包',                      // 短信发送方：必须是虚构品牌
    smsTemplate: '【安心钱包】校验码 {code}，请勿转发。', // 必须含 {code}
    prompt: '收到没？念给我就行。',            // 输入框上方的催促语
    onCorrect: 'l2-continue',                // 填对之后执行的选项（仍走 choose）
    retryLine: '好像不太对，你再看一下短信？我再发一条。', // 填错时对方的回话，语气别施压
  },
},
```

- 短信由本游戏的通知弹出，验证码**本地随机生成、每次不同**，不读真实短信也不上传；
- 声明了 `codeGate` 的节点，`onCorrect` 那个选项**不再渲染成按钮**（否则玩家点一下就绕过验证码），
  其余选项照旧保留 —— 必须留一条中止退路；
- `validateLevel` 会检查：模板含 `{code}`、`onCorrect` 存在且在该节点、不会自环、节点还有别的出口。

## 2.2 哪些节点的反诈提醒该用弹窗

反诈提醒默认是**顶部横幅**（轻提示、不打断）。如果某个节点是「真的可能正在被骗」的分水岭，
把它列进 `popupReminders`，就会改成模态的「国家反诈中心」弹窗：

```ts
reminders: {
  'l2-refund-claim': '页面上的退款进度不是你的余额。验证码给出去，等于把账户交出去。请立即停止。',
  'l2-verify-2': '以「影响征信」施压要求转账是典型话术……',
},
popupReminders: ['l2-refund-claim'],   // 只有它弹窗，其余仍是横幅
```

- 弹窗第一行固定是「检测到你疑似正在被诈骗」（`REMINDER_HEADLINE`），正文就是该节点的提醒文案 ——
  也就是**判断依据**。所以提醒文案要写得像"为什么提醒你"，别写成口号；
- **不要每个节点都列进来**：弹窗打断操作，满屏弹窗会让玩家开始无脑点「我知道了」；
- `validateLevel` 会检查：节点存在、且该节点**确实有提醒正文**（否则弹出一个空弹窗）。

## 2.3 班级通知群的随机反诈通知

会话规格里的 `newsSession` 指向哪个会话，那个会话就会在固定消息之后
追加 3–5 条随机反诈通知（内容来自 `CLASSGROUP_NEWS` 池子）：

```ts
chat: {
  sessions: [ /* … */ ],
  newsSession: 'classgroup',   // 就是班级通知群
}
```

- 抽取在 `app/classNews.ts`：**每关抽一次并缓存**，同一次游玩里切来切去都是同一批；
  重新打开页面 / 「重新开始本局」才会换；
- 随机源是 `app/random.ts`，浏览器启动时用时间戳播种；测试用固定种子；
- 想加内容就往 `CLASSGROUP_NEWS` 里加一条（`{ name, text }`），不必改代码；
- `validateLevel` 会检查 `newsSession` 指向的会话真实存在。




## 3. 新增一关的步骤

1. **建数据文件** `src/data/levels/levelNN.ts`，用 `defineLevel<你的节点联合, 你的选项联合>({...})`。
   泛型参数让你在文件内保留字面量 id —— `from` / `to` / `nodeOptions` 里写错一个 id 就是编译错误。
   必须提供：
   - `meta`：关号、标题、类型、一句话简介、一句话正确做法、卡片主色；
   - `nodes` / `options` / `nodeOptions`（**`nodeOptions` 是权威**：引擎与存档都读它；
     `option.from` 只需是「列出它的节点之一」，因此多个结局可以共用同一个「看复盘」选项）；
   - `startNode`（固定 `intro`）、`debriefNode`（固定 `debrief`）；
   - `initialBalance` / `validBalances` / `validPlatformDisplays` / `platformRequiresPaid`；
   - `pendingRequests`：待确认付款（金额 + 确认/取消选项 id）；
   - `endings` / `riskTagLabels` / `debriefRules` / `debriefActions` / `reminders`；
   - `copy`（界面文案）、`walletRecords`（收支记录）、`chat`（会话规格）。
2. **在 `src/data/levels/index.ts` 注册**（加进 `LEVELS` 数组）。
3. **跑守卫测试**：`npx vitest run tests/levels.spec.ts`。
   它对**所有**可玩关卡自动跑同一套规则，不需要为新关卡补测试。
4. **跑全量**：`npm run typecheck && npm test && npm run build && npm run verify`。

### 守卫会自动检查什么（`tests/levels.spec.ts` + `validateLevel`）

- 结构：`from`/`to`/`nodeOptions`/`endings` 的 id 一致性；每个选项都可达；
  每个节点都有出口；复盘节点有带 `reset` 的重开选项。
- 可达性：从开场能走到所有节点；每个节点都能到某个结局；每个结局都能到复盘。
- 金额：所有无环路径上的余额都落在 `validBalances`；`余额 = 初始余额 - 累计付出` 恒成立；
  扣款选项必须是 `once: true`（防重复扣款）；**待确认页显示的金额必须等于确认选项实际扣的金额**。
- 标记：`riskTagLabels` 与 `debriefRules.triggers` 双向对齐（没有孤儿标记，也不会渲染 undefined）。
- 文案：两关全部面向玩家的文本统一过禁用词与正则守卫 ——
  不承诺追回、不出现「反杀」「套话」「周旋」、无网址、无 11 位手机号、
  无具体报警号码（110 / 96110）、无 16–19 位连续数字（卡号）。
- 提醒：每个非开场/非复盘节点都要有提醒，长度 ≤70 字（顶部横幅读得完）。

### 必须遵守的产品边界（见 `AGENTS.md`）

反诈教育用途、金额全为模拟、不接真实支付、不索取真实个人信息、
不使用真实平台商标、不产出可对外复用的诈骗素材（订单/退款卡都是纯文字，不画 logo）。
