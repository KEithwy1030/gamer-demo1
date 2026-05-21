# 音乐系统（客户端）

> 这是流荒之路的"音乐系统（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

新独立

## 负责什么

背景音乐状态机（lobby / calm / skirmish / danger / extract_pressure / death / victory）。

## 监听哪些事件

- `PhaseStarted`
- `PlayerDied`
- `ExtractSucceeded`
- `ExtractChannelStarted`
- `BeaconLit`
- `MusicModeChanged`

## 数据存哪里

当前 BGM 模式

## 当前代码位置

（新独立板块）
