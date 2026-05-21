# 状态效果系统

> 这是流荒之路的"状态效果系统"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

新独立

## 负责什么

- 6 种基础状态（减速 / 流血 / 减伤 / 加攻 / 加攻速 / 加移速）的施加、持续、到期
- 状态效果的层数管理（如流血叠加）
- 状态效果的来源跟踪（哪个装备 / 技能 / 消耗品 来的）

## 不负责什么

- 状态效果造成的实际伤害（这是战斗系统的事）
- 流血叠加致死的判定（在战斗深度系统里）

## 发出哪些事件

- `StatusEffectApplied`
- `StatusEffectExpired`

## 监听哪些事件

- `PlayerAttacked`
- `PlayerSkillCast`
- `ItemUsed`
- `ItemEquipped`

## 数据存哪里

每个玩家的活跃状态列表

## 当前代码位置

- `server/src/combat/player-effects.ts（待迁入）`

## 后续工作

后续步骤把 combat/player-effects.ts 里的状态效果逻辑迁入本板块。
