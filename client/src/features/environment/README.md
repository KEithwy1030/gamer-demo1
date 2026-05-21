# 环境板块（客户端）

> 这是流荒之路的"环境板块（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

新独立

## 负责什么

尸毒迷雾的视觉表现（屏幕雾气、颜色叠加）+ 河流警告 UI + 环境伤害飘字。

## 监听哪些事件

- `EnvironmentDamageDealt`
- `FogPhaseChanged`

## 数据存哪里

迷雾叠加层、河流伤害 UI

## 当前代码位置

- `client/src/scenes/gameScene/corpseFogVisualState.ts`
- `client/src/scenes/gameScene/miasmaPipeline.ts`
