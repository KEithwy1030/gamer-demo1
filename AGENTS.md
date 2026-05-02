# AGENTS.md · 流荒之路 项目工作规则

任何接管本项目的 AI（claude code / codex / gemini / 其它）必须遵守。
本规则优先级高于 AI 各自的全局配置。

进项目第一件事：读完本文件。

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
工作树中已存在的 untracked 或 modified 文件，先与用户确认意图后再决定保留 / 处理 / 忽略。

### 3. 资产集成闭环

集成图片 / 模型 / 音频等资产时，**资产文件本身**和**引用资产的代码**作为同一个 commit 一起提交。

### 4. 项目状态以 git 为单一真源

项目进度、任务清单、决策记录等状态信息全部通过 commit message 承载。
本规则文件（AGENTS.md）只规定原则，不记录任务、不记录进度。

---

## B. 工作风格

### 5. 用户已确认的事直接执行

用户说"做" / "OK" / "确认"之后即可执行，无需重复请求许可。
例外：不可逆操作（force push / rm 大目录 / drop 数据库 / 覆盖远端历史）执行前需要再次确认。

### 6. 卡顿处理

单步连续卡 30 分钟以上无进展时，停下报告。把卡点写进 commit message 或对话回复。
报告时如实区分：哪些验证过、哪些没验证。

---

## 项目特定上下文

- **产品愿景**：见 `PITCH.md`（产品定位、世界观、核心情绪、不变锚点）
- **数值规格**：见 `GDD.md`（数值参数、规则细节、技术规格）
- **资产位置**：`client/public/assets/generated/`
- **构建验证**：`npm run build`（shared / server / client 全部编译通过即视为构建绿）
- **运行验证**：`npm run dev:server` + `npm run dev:client`，浏览器 `http://localhost:5173/` 体验主线流程

---

改动本文件本身需要用户明确同意。
