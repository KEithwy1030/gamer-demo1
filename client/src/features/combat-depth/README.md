# 战斗深度板块（客户端）

> 这是流荒之路的"战斗深度板块（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

新增预留

## 负责什么

杀神武器的蓄力 VFX / 音效告警、流血叠加 UI 指示器、环境击杀提示。

## 监听哪些事件

- `SlayerSkillCharging`
- `SlayerSkillTriggered`
- `BleedStackedToLethal`
- `EnvironmentKillRegistered`

## 数据存哪里

杀神蓄力动画状态、流血层数 UI 显示

## 当前代码位置

（新独立板块）
