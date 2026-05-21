# 分区地图板块（客户端）

> 这是流荒之路的"分区地图板块（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

新独立

## 负责什么

战区选择 UI（在大厅）+ 地图小地图（标注战区位置） + 战区切换提示。

## 监听哪些事件

- `SpawnZoneSelected`
- `PhaseStarted`

## 数据存哪里

战区配置缓存（来自 shared）

## 当前代码位置

（新独立板块）
