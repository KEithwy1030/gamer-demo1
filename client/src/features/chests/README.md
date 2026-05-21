# 宝箱板块（客户端）

> 这是流荒之路的"宝箱板块（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

重构

## 负责什么

宝箱外观 + 宝箱音效（开箱声、翻找声、警报声）+ 宝箱特效（开箱光、噪音波纹、战利品弹出）+ 宝箱交互 UI（「按 E 翻找」提示、进度圈）。

## 监听哪些事件

- `ChestRummageStarted`
- `ChestRummageTicked`
- `ChestRummageInterrupted`
- `ChestOpened`

## 数据存哪里

宝箱 UI 实例、翻找进度展示状态

## 当前代码位置

- `client/src/scenes/gameScene/interactions.ts（chest 部分将拆入）`
