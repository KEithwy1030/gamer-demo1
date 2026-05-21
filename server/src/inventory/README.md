# 背包系统（含永久升级）

> 这是流荒之路的"背包系统（含永久升级）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

重构

## 负责什么

- 背包的格子系统（初始 10×6，可永久升级）
- 物品形状（剑 1×3、枪 1×4 等）和放置校验
- 拾取、丢弃、移动物品
- 玩家死亡后的全部掉落（除保险箱内物品）
- 怪物 / 宝箱掉落物的生成（监听 MonsterKilled / ChestRummageTicked）
- 塔科夫式持久化：累计撤离次数 / 累计带出珍品价值触发背包容量永久升级

## 不负责什么

- 装备穿戴和属性计算（在装备系统里）
- 消耗品的实际效果（在消耗品系统里）
- 保险箱内物品的保留逻辑（在消耗品 / 工具系统里）

## 发出哪些事件

- `LootSpawned`
- `LootPickedUp`
- `ItemDropped`
- `InventoryChanged`
- `BackpackCapacityUpgraded`

## 监听哪些事件

- `MonsterKilled`
- `ChestRummageTicked`
- `PlayerDied`
- `ExtractSucceeded`

## 数据存哪里

每个玩家的背包格子状态、地面掉落物列表

## 当前代码位置

- `server/src/inventory/service.ts`
- `server/src/inventory/index.ts`
- `server/src/inventory/catalog.ts`
- `server/src/loot/loot-manager.ts`

## 后续工作

S5/S6 期间实现背包容量永久升级机制（按累计撤离次数 / 累计珍品价值）。
