# 观战板块（客户端）

> 这是流荒之路的"观战板块（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

已有需要重构

## 负责什么

死亡后观战 UI、切换队友视角、退出当局按钮。

## 监听哪些事件

- `PlayerDied`
- `ExtractSucceeded`
- `SpectateTargetChanged`

## 数据存哪里

观战 UI 状态、当前观战目标

## 当前代码位置

- `client/src/scenes/GameScene.ts（spectate HUD 部分，S4 拆出来）`
