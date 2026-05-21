# 宝箱系统

> 这是流荒之路的"宝箱系统"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

重构

## 负责什么

- 宝箱出生位置和分布（按分区地图的规则）
- 宝箱状态（关闭 / 翻找中 / 已开 / 被中断）
- 翻找进度和节奏（每 1.2 秒掉一件物品）
- 宝箱掉落物的随机内容（按掉落表）
- 掉落表的时间梯度：游戏后期掉落质量提升（激励玩家在尸毒反噬期多停留）
- 宝箱噪音机制（contested 宝箱招怪）

## 不负责什么

- 玩家拾取宝箱掉落物的入包逻辑（背包系统里）
- 宝箱噪音吸引怪物的怪物 AI 反应（怪物系统里监听 ChestRummageStarted）

## 发出哪些事件

- `ChestRummageStarted`
- `ChestRummageTicked`
- `ChestRummageInterrupted`
- `ChestOpened`

## 监听哪些事件

- `PlayerDamaged`
- `PlayerDied`
- `PhaseStarted`

## 数据存哪里

宝箱列表、每个宝箱的状态、当前翻找者、当前对局的阶段掉落权重

## 当前代码位置

- `server/src/chests/chest-manager.ts`

## 后续工作

S3 已加入 ChestRummageStarted / ChestOpened 入队。S5 时关闭旧通路。
