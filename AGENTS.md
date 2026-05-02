# AGENTS.md · 流荒之路 项目工作规则

任何接管本项目的 AI（claude code / codex / gemini / 其它）必须遵守。
**本规则优先级高于 AI 各自的全局配置。**

进项目第一件事：读完本文件。

---

## A. 工程纪律

### 1. Commit + Push 纪律（最核心）

完成每一个独立可验证的小步骤，立即：

```
git add -A && git commit -m "<清楚的说明>" && git push
```

- 一个 commit 只承载一件清楚的事，不堆叠
- commit message 写清：做了什么 / 验收通过项 / 卡点（如有）
- push 失败 = 阻塞性问题，必须修，不要绕过
- 不要把"半成品"留在工作目录期待"下次再做"——要么做完 commit，要么明确告知用户暂存情况

### 2. 进项目第一件事

```
git fetch && git status && git log --oneline -10
```

搞清当前状态再动手：

- 看到 untracked 或 modified 的文件，**先评估**是用户/前任 AI 的进度还是垃圾
- 不确定就问用户，不要擅自 stash / 删除 / 忽略
- **不依赖项目里的过程文档判断状态** —— 用 git history 和 git status 才是唯一真源

### 3. 不主动 stash / 删除用户工作

- `git stash` 会让用户感觉"进度没了"，**严禁默认使用**
- 删除 untracked 文件之前必须先确认（"我看到 X，准备删，对吗？"）
- "看起来像垃圾"也不动，没确认前留着
- 资产文件（图片 / 模型 / 音频 / manifest）即使 untracked，**默认视为有价值**

### 4. 资产集成必须闭环

用户 / 前任 AI 生成的资产物理存在但代码不引用 = 半成品。
集成资产到代码后，把**资产本身**和**引用资产的代码**一起 commit。
不要让"资产生成完毕但代码集成未完成"的状态过夜。

### 5. 不新建 agent 过程文档

不创建 `NOW.md` / `DECISIONS.md` / `TASK_QUEUE.md` / `WORKLOG.md` / `STATUS.json` / `*_GAP_REPORT.md` 这类元文档。
状态信息全部写进 commit message。
git history 是项目状态的唯一真源。

**本规则文件（AGENTS.md）是唯一例外**——它只规定原则，不记录任务、不记录进度。

---

## B. 工作风格

### 6. 用户已确认的事直接做

用户说"做" / "OK" / "确认"之后不要反复确认。
不要每一步都"我要执行 X，可以吗？"。
**例外**：不可逆操作仍然要二次确认（force push / rm 大目录 / drop 数据库 / 覆盖远端历史）。

### 7. 卡 30 分钟以上停下报告

不要默默死磕。
卡点写进 commit message 或对话报告，跳到下一步或问用户。
报告要诚实区分：哪些验证过、哪些没验证（不能写成都过了）。

---

## 项目特定上下文

- **产品愿景**：见 `PITCH.md`（不写技术、不写数值，永恒不变）
- **数值规格**：见 `GDD.md`
- **资产位置**：`client/public/assets/generated/`（含 `image2_raw` / `image2_processed` / `medieval-*` 系列；约 56 MB）
- **当前工作清单**：不在本文件维护，看最近 git log 或用户 prompt
- **构建验证**：`npm run build`（shared / server / client 全绿即通过）
- **运行验证**：`npm run dev:server` + `npm run dev:client`，浏览器 `http://localhost:5173/`

---

最后一条原则：**改动本文件本身需要用户明确同意**。
