# 环境系统

> 这是流荒之路的"环境系统"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

新独立

## 负责什么

- 尸毒迷雾的阶段切换（蔓延期 / 反噬期 / 加剧期）
- 尸毒迷雾的反噬伤害
- 河流伤害（站在尸河里持续掉血）
- 未来的其他环境危险（毒区、火区等）

## 不负责什么

- 视野收窄效果（这是客户端视野系统的事，监听 FogPhaseChanged）

## 发出哪些事件

- `EnvironmentDamageDealt`
- `FogPhaseChanged`

## 监听哪些事件

- `（几乎不监听，自己跑 tick）`

## 数据存哪里

当前迷雾阶段、河流位置（从分区地图读）

## 当前代码位置

- `server/src/corpse-fog.ts（待迁入）`

## 后续工作

S6 调整尸毒反噬时间（提前开始 + 总持续延长）。把 corpse-fog.ts 迁入本目录。
