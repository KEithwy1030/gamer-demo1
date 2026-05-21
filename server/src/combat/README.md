# 战斗系统

> 这是流荒之路的"战斗系统"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

重构

## 负责什么

- 玩家普攻、技能、闪避的判定
- 伤害计算（基础伤害 → 装备加成 → 暴击 → 减伤 → 最终伤害）
- 玩家死亡判定
- 攻击范围、攻击间隔、技能 CD

## 不负责什么

- 怪物对玩家的攻击（在怪物系统里）
- 装备词条加成的计算（在装备系统里）
- 状态效果的持续逻辑（在状态效果系统里）
- 战斗特殊机制如杀神武器、流血叠加（在战斗深度系统里）

## 发出哪些事件

- `PlayerAttacked`
- `PlayerSkillCast`
- `PlayerDodged`
- `PlayerDamaged`
- `PlayerCriticalHit`
- `PlayerDied`

## 监听哪些事件

- `ItemEquipped`
- `ItemUnequipped`
- `PlayerStatsRecomputed`
- `StatusEffectApplied`
- `StatusEffectExpired`
- `EnvironmentDamageDealt`

## 数据存哪里

每个玩家的战斗运行时状态（hp、cooldown、最后攻击时间、buff 列表）

## 当前代码位置

- `server/src/combat/combat-service.ts`
- `server/src/combat/player-effects.ts`

## 后续工作

S3 已加入 PlayerDamaged 域事件入队。S5 关闭旧通路时迁移其余事件。
