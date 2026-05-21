# 战斗板块（客户端）

> 这是流荒之路的"战斗板块（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

重构

## 负责什么

战斗音效（攻击声、受伤声、暴击声）+ 战斗特效（伤害数字、火花、击杀爆裂、屏幕震动、hit stop）+ 战斗输入（鼠标点击、技能键、闪避键）。

## 监听哪些事件

- `PlayerAttacked`
- `PlayerSkillCast`
- `PlayerDodged`
- `PlayerDamaged`
- `PlayerCriticalHit`
- `PlayerDied`

## 数据存哪里

本板块 UI / VFX 状态（伤害飘字、屏幕震动残留时间等）

## 当前代码位置

- `client/src/scenes/gameScene/feedbackFx.ts（VFX 部分将拆入）`
- `client/src/audio/gameAudio.ts（音效 controller 共用）`
