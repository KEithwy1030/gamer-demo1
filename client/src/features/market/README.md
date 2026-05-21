# 黑市界面板块

> 这是流荒之路的"黑市界面板块"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

已有

## 负责什么

挂单 UI、买卖 UI、价格输入、列表查看。

## 监听哪些事件

- `ListingCreated`
- `ListingSold`
- `ListingCancelled`

## 数据存哪里

黑市 UI 状态

## 当前代码位置

- `client/src/ui/marketView.ts`
