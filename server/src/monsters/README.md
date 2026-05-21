# 怪物系统

> 这是流荒之路的"怪物系统"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

重构

## 负责什么

- 怪物生成（出生、节奏、位置选择）
- 怪物 AI（巡逻、追击、攻击、技能、撤退）
- 怪物攻击玩家的伤害计算
- 怪物的蓄力 / 暴怒等行为状态
- 怪物的投射物（弓箭怪的箭）

## 不负责什么

- 怪物掉落物的生成（在背包系统里，监听 MonsterKilled 决定掉什么）
- 玩家攻击怪物的伤害计算（在战斗系统里）

## 发出哪些事件

- `MonsterSpawned`
- `MonsterWindupStarted`
- `MonsterAttacked`
- `MonsterEnragedStarted`
- `MonsterKilled`
- `MonsterProjectileSpawned`
- `MonsterProjectileHit`
- `MonsterProjectileDespawned`
- `PhaseStarted`

## 监听哪些事件

- `PlayerDamaged`
- `ChestRummageStarted`
- `PlayerDied`

## 数据存哪里

怪物列表（runtime）、spawn 定义、阶段状态

## 当前代码位置

- `server/src/monsters/monster-manager.ts`
- `server/src/monsters/projectile-manager.ts`
- `server/src/spawn/spawn-director.ts`

## 后续工作

S3 已加入 MonsterSpawned / MonsterKilled 入队。S5 关闭旧通路时迁移其余事件（含客户端推断的 MonsterWindupStarted / MonsterEnragedStarted）。
