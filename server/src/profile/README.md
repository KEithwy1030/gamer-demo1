# 玩家档案 / 账号

> 这是流荒之路的"玩家档案 / 账号"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

已有

## 负责什么

- 玩家长期数据（金币、累计撤离次数、累计带出珍品价值、统计）
- 背包容量等级（永久升级，由背包系统读取）
- 玩家身份 ID
- 跨局的装备保留（保险箱里带回来的）

## 不负责什么

- 注册 / 登录 / 找回密码（未来扩展，真正上线时再加）

## 发出哪些事件

- `ProfileLoaded`
- `ProfileSaved`
- `BackpackCapacityUpgraded`

## 监听哪些事件

- `ExtractSucceeded`
- `MatchSettled`

## 数据存哪里

玩家档案文件（未来是数据库）

## 当前代码位置

- `server/src/profile-store.ts（待迁入）`

## 后续工作

S6 期间把 profile-store.ts 迁入本目录 + 实现累计触发背包升级。
