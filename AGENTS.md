# AGENTS.md · 流荒之路 项目工作规则

任何接管本项目的 AI（claude code / codex / gemini / 其它）必须遵守。
本规则优先级高于 AI 各自的全局配置。

进项目第一件事：读完本文件。

---

## 核心立场

本项目采用 **"先对齐 → 自主执行"** 工作模型：

- **对齐阶段**（任务开始前）：与用户确认任务目标、范围、关键决策点
- **执行阶段**（任务进行中）：自主推进到完成，不就实现细节反复请示

执行阶段的"问 / 不问"边界写在规则 5。

---

## A. 工程纪律

### 1. Commit + Push 纪律

完成每一个独立可验证的小步骤后，立即：

```
git add -A && git commit -m "<清楚的说明>" && git push
```

- 一个 commit 只承载一件清楚的事
- commit message 写明：做了什么 / 验收通过项 / 卡点（如有）
- push 是阶段完成的唯一标志

### 2. 进项目第一件事

```
git fetch && git status && git log --oneline -10
```

通过 git history 和 git status 判断项目当前状态。
工作树中已存在的 untracked 或 modified 文件，结合命名 / 路径 / 提交历史**合理推断意图**继续工作，推断有明显歧义时方需用户确认。

### 3. 资产集成闭环

集成图片 / 模型 / 音频等资产时，**资产文件本身**和**引用资产的代码**作为同一个 commit 一起提交。

### 4. 项目状态以 git 为单一真源

项目进度、任务清单、决策记录等状态信息全部通过 commit message 承载。
本规则文件（AGENTS.md）只规定原则，不记录任务、不记录进度。

---

## B. 工作风格

### 5. 自主执行边界

对齐阶段确认任务目标后，进入自主执行阶段。执行阶段不就技术细节反复请示。

执行阶段 **必须** 停下询问的场景：

- 不可逆操作（force push / rm 大目录 / drop 数据库 / 覆盖远端历史）
- 任务出现**产品方向决策**（数值取舍、玩法走向、UI 风格选择等需用户拍板的事）
- 卡顿超过 30 分钟（见规则 6）

执行阶段 **不需要** 询问的场景：

- 选择实现方式（用什么库、什么模式、目录结构）
- 调整数值以符合 GDD
- 修复执行路径中遇到的具体 bug
- 中间过程的进度汇报（用 commit message 承载即可）

### 6. 卡顿处理

单步连续卡 30 分钟以上无进展，**或同一段代码 / 同一函数连续修改 3 次仍未通过验证**，视为卡顿。

- 属于规则 7 描述的人工验证项 → 按规则 7 处理（跳过 + 记录）
- 其余情况 → 停下报告，把卡点写进 commit message 或对话回复

报告时如实区分：哪些验证过、哪些没验证。

### 7. 自动验证之外的项

部分验证项依赖于真实时间走过 / 真实多人在场 / 真实硬件输入（键盘 / 触屏 / 手柄）/ 视觉手感判断。这些天然是「人工验证项」，agent 自动化做不到。

遇到识别为人工验证项的部分：

- **优先用业界标准值或参考类似游戏实现一个合理默认版本**，再标记「参数待人工调优」。仅当连合理默认值都给不出时才整项跳过
- 在最终 commit message 加「**待人工验证**」段，写清：项目名 / 测试步骤 / 期望结果 / 失败时的可观察现象
- 同一项的 mock / workaround 方案最多尝试 2 次，仍不通过即判定为人工验证项
- 不中途停下问用户——人工验证留给用户介入时统一处理
- **不要因为最终效果需要人评估就跳过整个任务**——视觉/手感任务先实现默认版本，让 agent 能把"可见的东西"做出来再交给人调味

---

## C. 测试与验证

### 8. 测试分层：按被测对象选最小环境，不是所有测试都要开全局

| 被测对象 | 用什么 | 例子 |
|---|---|---|
| 纯逻辑 / 规则 / 状态机 | Node 契约脚本（零地图、零怪物、零浏览器，直接 import 服务端模块构造假 room） | `validate-chest-contract.ts`、`validate-secure-pouch.ts` |
| 单一机制的视觉 / 交互 | 沙盒预设：`?devRoomPreset=sandbox`（真客户端+真服务端，但空场、无怪物刷新、无雾压力，玩家旁放好被测对象） | 开箱动画、打击反馈、新资产观感 |
| 跨系统链路（结算 / 档案回流 / 多人 / 撤离全程） | 全局测试（`validate:carry-loop-release`、`accept:*` 脚本） | 装备带出带回、结算金币入账 |

判断口诀：**被测行为依赖几个系统，就开几个系统**。开箱不需要地图和野怪；结算回流必须开全局。全局测试慢、变量多（野怪会打死测试玩家），只留给真正跨系统的验证。

**禁止为测试复制一份游戏代码**（拎一份宝箱代码单独跑之类）。复制出来的副本会和真实代码漂移，产生假报警——本项目 test-loop.mjs 的"模拟玩家"曾因此烧掉数倍于其价值的维护成本。正确做法永远是：**跑真实代码，控制环境**（沙盒预设就是为此存在的）。

### 9. 画面级闭环：契约绿 ≠ 验证完成

任何改动如果玩家**看得见或听得见**，提交前必须亲眼验证渲染结果：

- 跑 `node scripts/accept-game-feel-baseline.mjs`（`GAME_FEEL_PRESET` 环境变量可选 boss/extract/contested/lategame/sandbox），然后 **Read 它产出的 `.codex-artifacts` 截图亲眼看**；或用 preview 工具开 `localhost:5288` 手动走流程截图
- 历史教训：开箱后宝箱被放大到 1254px 糊满全屏的 bug，在全部契约脚本绿灯的情况下存活了几十个提交——因为没有任何验证看过屏幕
- 音频无法"听"，用波形统计（时长 / RMS / 零交叉率 / 峰值）判断资产是否离谱
- 改动后查 `.devlog/latest.jsonl` 确认对应事件真的发生了

### 10. 测试基建速查

- **dev 预设**（URL 参数 `?devRoomPreset=...`，需服务端 `ENABLE_TEST_HOOKS=1`）：`boss`（贴脸 boss）/ `extract`（撤离就绪）/ `inventory`（满背包）/ `contested`（高危箱旁自动开箱）/ `lategame`（后期时间线）/ `sandbox`（空场+木桩怪+宝箱，测单一机制首选）
- **客户端注入钩子**（URL 加 `&p0bTestHooks=1`）：`window.__P0B_TEST_HOOKS__` 提供 `sendMoveInput` / `startExtract` / `getSnapshot`——合成 KeyboardEvent 进不了 Phaser 输入层，自动化移动要走这个
- `npm run playtest:manual` 已默认开启 ENABLE_TEST_HOOKS；它有 20 分钟自动停机，长测试注意重启

---

## 项目特定上下文

## 项目施工宪法

**任何 agent 在动这个项目代码前，必须先读两份文档：**

1. **`docs/QUALITY-BAR.md`（体验质量红线）**——项目真实完成度判定、玩家前三分钟
   验收标准、四条铁律（含"画面手感达标前冻结新系统"）、交付协议。当前开发主线
   以它为准。
2. **`docs/REFACTOR-GUIDE.md` 第一部分（产品铁则）。**

23 个板块 + 40 个事件的完整架构定义在该指南。改一个功能只动一个板块，不允许跨板块塞代码。

- **产品愿景**：见 `PITCH.md`（产品定位、世界观、核心情绪、不变锚点）
- **数值规格**：见 `GDD.md`（数值参数、规则细节、技术规格）
- **资产位置**：`client/public/assets/generated/`
- **构建验证**：`npm run build`（shared / server / client 全部编译通过即视为构建绿）
- **项目专属端口**：默认前端端口为 `5288`，默认后端端口为 `5289`。未来如需端口漂移，必须优先使用 `52XX` 段；不要占用 Vite 通用前端端口 `5173`，也不要使用通用后端端口 `3000`，避免和其它本地项目冲突。
- **运行验证**：优先使用 `npm run playtest:manual` 或 `npm run dev`，浏览器 `http://localhost:5288/` 体验主线流程；服务端健康检查为 `http://localhost:5289/health`。

## Runtime Debug Log

The client auto-streams gameplay events to disk via the dev server. Agents
read these files directly when diagnosing issues — no user action required.

**File location**: `.devlog/latest.jsonl` is always the current session. Historical
sessions are at `.devlog/session-<timestamp>.jsonl`. Retention: 24 hours by default,
total 50 MB cap (configurable via `GAMER_DEVLOG_RETENTION_HOURS` and
`GAMER_DEVLOG_MAX_TOTAL_MB` env vars).

**For users**: do nothing. Just play. When you report an issue, the agent
will read `.devlog/latest.jsonl` to find the precise event timeline.
Optional fallback: bottom-right floating panel still has Copy/Download buttons
and F12 still triggers a download — use these only if the server-side log is
unavailable for some reason.

**For AI agents debugging issues**:
- BEFORE guessing root cause from user prose: READ `E:/CursorData/gamer/.devlog/latest.jsonl`
- Use `tail` or limit reads to the last N events near the user's reported moment
- The log replaces "I think the issue is..." with concrete event evidence
- Categories: AUDIO / COMBAT / CHEST / UI / PLAYER / NET / EXTRACT / GENERAL

**Add new `logEvent` calls** sparingly when adding new systems. Keep signal-to-noise high.

---

改动本文件本身需要用户明确同意。
