# 装备板块（客户端）

> 这是流荒之路的"装备板块（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

新独立

## 负责什么

装备槽 UI、属性面板、装备词条展示、特殊装备的视觉标识（如杀神武器装备时其他槽位锁定的视觉反馈）。

## 监听哪些事件

- `ItemEquipped`
- `ItemUnequipped`
- `PlayerStatsRecomputed`
- `SpecialEquipmentSlotsLocked`

## 数据存哪里

装备槽 UI 状态、属性数值展示

## 当前代码位置

（新独立板块）
