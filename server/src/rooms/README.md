# 房间大厅

> 这是流荒之路的"房间大厅"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

已有

## 负责什么

- 房间创建、加入、离开
- 房主权限（设置人数、强制开始）
- Bot 填位规则（不足 6 人补 Bot）
- 大厅 UI
- 战区选择（玩家选择本局出生战区）

## 不负责什么

- 对局过程中的状态（在各业务板块里）
- 玩家长期档案（在玩家档案系统里）

## 发出哪些事件

- `RoomCreated`
- `PlayerJoinedRoom`
- `PlayerLeftRoom`
- `RoomStarted`
- `SpawnZoneSelected`
- `MatchStarted`

## 监听哪些事件

- `（基本不监听，主动管理房间生命周期）`

## 数据存哪里

活跃房间列表、每个房间的玩家、配置、状态

## 当前代码位置

- `server/src/room-store.ts（待迁入）`
- `server/src/bots/bot-manager.ts`

## 后续工作

S6 期间把 room-store.ts 迁入本目录 + 加入战区选择功能。
