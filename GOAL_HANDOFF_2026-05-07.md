# Goal Handoff 2026-05-07

本文件记录本轮 `/goal` 交付过程中的真实问题、临时决策和后续收口路径。它不是项目规则文件，不替代 `AGENTS.md`；目的是在上下文压缩或会话中断后，保留可执行的交付事实。

## 当前优先级

1. 先完成本轮 P0-A / P0-B 交付收口。
2. 本轮剩余阶段不再启动新的 subagent，不再使用 Chrome DevTools MCP 或 Playwright MCP 做正式验收。
3. 正式验收优先使用脚本化 Playwright / Node 命令，并要求固定端口、固定 run id、证据落盘、进程清理。
4. MCP 启动超时、`Starting MCP servers` 长时间停留、残留进程清理等环境问题，交付后单独处理。

## 本轮主要异常

- 多次出现 `Starting MCP servers` 长时间停留，包括 `playwright-mcp` 和 `codex_apps`。
- MCP 启动等待发生在 Codex 运行时或 subagent 初始化层，不完全受项目内规则控制。
- 频繁创建 browser / MCP 测试 subagent 会放大问题：即使任务提示要求不用 MCP，subagent 启动时也可能先触发配置中的 MCP server 初始化。
- Chrome DevTools MCP 会弹出浏览器授权，用户不在电脑前时无法授权，导致测试等待或超时。
- 多轮浏览器验收后存在未关闭浏览器、Node launcher、MCP server 进程的风险，长期会堆积后台进程。
- 当前工作区存在大量 `.codex-artifacts` 历史产物，提交前必须选择性整理，不能盲目 `git add -A`。

## 已形成的经验

- 浏览器 MCP 只适合人工在场时的探索，不适合作为无人值守正式验收路径。
- 正式验收应使用可重复脚本：启动服务、执行浏览器动作、保存截图/日志/summary、关闭浏览器、停止服务、确认端口释放。
- 验收脚本必须把「核心事件链」和「截图质量/附加观察」分开；核心事件链已满足时，不应被旧的预检查或弱截图误判为失败。
- 多工作区并行开发时，不得杀全局 Node/Chrome，不得抢占常用端口，不得修改全局代理/MCP 配置；只能清理本次 run 明确启动的 PID。
- GPT-5.4 可用于业务实现和脚本修复，最终浏览器验收和证据判断应尽量由 GPT-5.5 或主会话完成；本轮特殊收口阶段改为主会话直接执行。

## 当前交付事实

### P0-A lock / attack

- 最新有效证据目录：`.codex-artifacts/p0-a-final-tester-20260507-01/`
- 已观察到真实鼠标点击触发：
  - `player:attack`
  - `combat:result amount=12`
  - UI 命中反馈
  - retreat/manual cancel 截图
- 状态：基本可收口，仅需最终 diff 和测试确认。

### P0-B extract readbar / restart

- 关键代码方向：
  - server 统一 `extract:opened` 首包载荷。
  - client 不再把 interrupted 误归类为 success。
  - dev-only test hook 通过真实网络路径发送移动和撤离动作。
  - dev preset 下延长撤离 channel duration，降低脚本动作时间竞争。
  - `validate-p0b-browser.mjs` 根据最终事件链重新分类结果。
- 关键有效证据目录：`.codex-artifacts/p0-b-browser-script-20260507-codex-minfix-8115/`
- 该证据中已出现完整核心事件链：
  - first `player:startExtract`
  - first `extract:progress started`
  - first `extract:progress progress`
  - `extract:progress interrupted reason=left_zone`
  - second `player:startExtract`
  - second `extract:progress started`
  - second `extract:progress progress`
- 当时脚本 summary 将结果写成 fail，原因是旧的 focused movement 预检查误判；后续脚本已修复为核心事件链优先。
- 当前会话直接收口后，最新有效命令行浏览器验收目录：`.codex-artifacts/p0-b-browser-script-20260507-direct-8515-r3/`
- 最新 summary：`result=pass`，`classification=full_p0b_sequence`。
- 最新核心断言：
  - `firstNonZeroInputMoveBeforeExtractSuccessInbound=true`
  - `selfMovedAfterFirstNonZeroInput=true`
  - `leftZoneInterrupted=true`
  - `secondStarted=true`
  - `secondProgress=true`
- 最新脚本清理结果：`browserClosed=true`，`launcherExited=true`，`portsAfter.server=[]`，`portsAfter.client=[]`。
- 本轮修复过一个测试脚本问题：提前创建的等待 Promise 会在未 await 前超时崩 Node 24，已改为按需等待；另一个脚本动作问题是第二次回圈方向写死，已改为复用动态回到撤离起始半径的逻辑。

## 已通过验证

- `npm run build`
- `npm run validate:lock-assist`
- `npm run validate:extract-service`
- `npm run validate:dev-room-presets`
- `P0B_SERVER_PORT=8515 P0B_CLIENT_PORT=9585 P0B_RUN_ID=p0-b-browser-script-20260507-direct-8515-r3 node scripts/validate-p0b-browser.mjs`

## 当前收口计划

1. 审计当前 git diff，区分业务代码、验证脚本、证据产物和无关脏文件。
2. 运行非 MCP 验证：
   - `npm run build`
   - `npm run validate:lock-assist` 或实际存在的等价脚本
   - `npm run validate:extract-service` 或实际存在的等价脚本
   - 必要时运行一次脚本化 P0-B 浏览器验收，但只用命令行 Playwright，不用 MCP。
3. 若 P0-B 脚本仍偶发失败，优先判断是否为测试脚本时序问题；只修脚本，不扩大业务改动。
4. 清点本次应提交文件，避免提交大量历史 `.codex-artifacts`。
5. 小步 commit + push。commit message 写清验收通过项和待人工验证项。

## 禁止动作

- 不再新开 browser/MCP subagent。
- 不使用 Chrome DevTools MCP 或 Playwright MCP 做本轮正式验收。
- 不盲目清理全局 Node/Chrome/MCP 进程。
- 不 `git add -A` 提交所有 `.codex-artifacts` 历史目录。
- 不修改 `AGENTS.md`，除非用户明确要求。
