# 观战板块

> 这是流荒之路的"观战板块"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

已有需要重构

## 负责什么

- 玩家死亡后切换为观战模式
- 观战目标限制：只能观战同队队友
- 玩家可独自退出当局（不影响其他队友）
- 可等待队友撤离一起退出

## 不负责什么

- 录像 / 回放（不做）
- 精彩集锦（不做）
- 跨队观战（不做）

## 发出哪些事件

- `SpectateStarted`
- `SpectateTargetChanged`
- `SpectateExited`

## 监听哪些事件

- `PlayerDied`
- `ExtractSucceeded`

## 数据存哪里

每个观战中的玩家、当前观战目标

## 当前代码位置

- `client/src/scenes/GameScene.ts（spectate HUD 部分，S4 拆出来）`

## 后续工作

S4 已把客户端 spectate HUD 拆到独立板块。服务端 spectate 板块未来若需要状态同步再加。
