# 大厅界面板块

> 这是流荒之路的"大厅界面板块"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

已有

## 负责什么

大厅 UI、房间创建、加入界面、玩家列表、战区选择。

## 监听哪些事件

- `RoomCreated`
- `PlayerJoinedRoom`
- `PlayerLeftRoom`
- `MatchStarted`

## 数据存哪里

大厅 UI 状态

## 当前代码位置

- `client/src/ui/lobbyView.ts`
- `client/src/ui/lobbyBackground.ts`
- `client/src/network/createLobbyController.ts`
