# 怪物板块（客户端）

> 这是流荒之路的"怪物板块（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

重构

## 负责什么

怪物渲染（外观、动画）+ 怪物特效（蓄力光圈、愤怒状态光效、死亡爆裂）+ 怪物音效（蓄力声、咆哮）。

## 监听哪些事件

- `MonsterSpawned`
- `MonsterWindupStarted`
- `MonsterEnragedStarted`
- `MonsterKilled`
- `MonsterAttacked`
- `MonsterProjectileSpawned`
- `MonsterProjectileHit`

## 数据存哪里

怪物 marker 实例、动画状态

## 当前代码位置

- `client/src/game/entities/MonsterMarker.ts`
- `client/src/scenes/gameScene/monsterSkillFx.ts`
