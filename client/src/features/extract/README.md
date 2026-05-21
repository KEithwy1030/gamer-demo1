# 撤离板块（客户端）

> 这是流荒之路的"撤离板块（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

重构

## 负责什么

撤离区域外观（中心火堆、光晕脉动）+ 撤离 UI（读条、倒计时、被打断警告）+ 撤离音效（点火、撤离成功、警报）+ 撤离特效（成功烟花、读条光环）。

## 监听哪些事件

- `BeaconLit`
- `ExtractOpened`
- `ExtractChannelStarted`
- `ExtractChannelTicked`
- `ExtractChannelInterrupted`
- `ExtractSucceeded`

## 数据存哪里

撤离 UI 状态、读条进度展示

## 当前代码位置

- `client/src/scenes/gameScene/interactions.ts（extract 部分将拆入）`
- `client/src/scenes/extractUiState.ts`
