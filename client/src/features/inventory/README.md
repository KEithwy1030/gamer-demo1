# 背包板块（客户端）

> 这是流荒之路的"背包板块（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

重构

## 负责什么

背包面板（10×6 起步、可升级容量）+ 拖拽逻辑 + 装备槽展示 + 拾取动画。

## 监听哪些事件

- `LootPickedUp`
- `LootSpawned`
- `ItemDropped`
- `InventoryChanged`
- `BackpackCapacityUpgraded`

## 数据存哪里

背包 UI 状态、拖拽中的物品

## 当前代码位置

- `client/src/ui/InventoryPanel.ts`
- `client/src/ui/inventoryDrag/shared.ts`
