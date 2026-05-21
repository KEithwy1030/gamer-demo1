# 消耗品 / 工具板块（客户端）

> 这是流荒之路的"消耗品 / 工具板块（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

新独立

## 负责什么

消耗品图标 + 使用动画 + 火把的视觉效果（持火状态）+ 保险箱 UI（打开 / 放入 / 取出）。

## 监听哪些事件

- `ItemUsed`
- `BeaconLit`
- `ItemDepositedInSafe`
- `ItemWithdrawnFromSafe`

## 数据存哪里

消耗品 UI 状态、保险箱面板状态

## 当前代码位置

（新独立板块）
