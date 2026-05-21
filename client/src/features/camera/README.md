# 摄像机系统（客户端）

> 这是流荒之路的"摄像机系统（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

已有

## 负责什么

跟随玩家、屏幕震动、死亡视角切换。

## 监听哪些事件

- `PlayerDamaged`
- `PlayerDied`
- `MonsterKilled（elite/boss）`
- `PlayerSkillCast`
- `SlayerSkillTriggered`

## 数据存哪里

摄像机震动状态

## 当前代码位置

（新独立板块）
