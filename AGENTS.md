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

## 项目特定上下文

- **产品愿景**：见 `PITCH.md`（产品定位、世界观、核心情绪、不变锚点）
- **数值规格**：见 `GDD.md`（数值参数、规则细节、技术规格）
- **资产位置**：`client/public/assets/generated/`
- **构建验证**：`npm run build`（shared / server / client 全部编译通过即视为构建绿）
- **项目专属端口**：默认前端端口为 `5288`，默认后端端口为 `5289`。未来如需端口漂移，必须优先使用 `52XX` 段；不要占用 Vite 通用前端端口 `5173`，也不要使用通用后端端口 `3000`，避免和其它本地项目冲突。
- **运行验证**：优先使用 `npm run playtest:manual` 或 `npm run dev`，浏览器 `http://localhost:5288/` 体验主线流程；服务端健康检查为 `http://localhost:5289/health`。

## Runtime Debug Log

The client has a runtime debug log at `client/src/dev/runtimeLog.ts`. When enabled,
it captures gameplay events (audio triggers, combat events, chest interactions,
UI clicks, network state) into a circular buffer.

**For users**:
- Enable: append `?devLog=1` to the game URL, OR set `localStorage.setItem("gamer.devLog", "1")`
- Export: bottom-right floating panel has Copy/Download buttons; F12 also triggers download
- The downloaded `.json` file is the precise event timeline of your playtest session

**For AI agents debugging issues**:
- Before guessing root cause from prose descriptions, ASK FOR THE LOG FILE
- The log gives objective signals: audio cues fired with timestamps, chest event ordering, click hit targets
- Read entries near the reported issue's timestamp window
- The log replaces "I think the issue is..." with "the log shows at T+12.3s, audio.play(attack) was triggered 4 times with overlapping_instances=3"
- Categories: AUDIO / COMBAT / CHEST / UI / PLAYER / NET / EXTRACT / GENERAL

**Add new `logEvent` calls** sparingly when adding new systems. Don't log every frame
or every message - keep the buffer signal-to-noise high.

---

改动本文件本身需要用户明确同意。
