# 撤离系统

> 这是流荒之路的"撤离系统"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

重构

## 负责什么

- 撤离点的位置（每张地图 2-3 个，分布在中央区域）
- 撤离点的开放时机（第 8 分钟）
- 火把点燃机制：玩家必须找到火把 → 带回某个撤离点 → 点燃 → 该撤离点才能使用
- 玩家撤离读条（5 秒）
- 撤离读条期间玩家可在撤离区内移动（不必站立不动），但离开撤离区会打断
- 撤离压力机制（点燃的撤离点对所有玩家可见，会吸引争夺）
- 撤离成功的判定和结算触发

## 不负责什么

- 撤离结算（在结算系统里，监听 ExtractSucceeded）
- 撤离后的物品保留逻辑（背包系统 + 消耗品/工具系统的保险箱）
- 火把本身的物品逻辑（在消耗品 / 工具系统里）

## 发出哪些事件

- `BeaconLit`
- `ExtractOpened`
- `ExtractChannelStarted`
- `ExtractChannelTicked`
- `ExtractChannelInterrupted`
- `ExtractSucceeded`

## 监听哪些事件

- `BeaconLit（来自消耗品/工具系统）`
- `PlayerDamaged`
- `PlayerDied`

## 数据存哪里

撤离区状态（每个撤离点是否点燃）、每个玩家的撤离进度、压力状态

## 当前代码位置

- `server/src/extract/service.ts`
- `server/src/extract/index.ts`

## 后续工作

S3 已加入 ExtractOpened / ExtractSucceeded 入队。S6 时调整为 2-3 个撤离点 + 火把点燃机制 + 撤离可移动。
