# 黑市 / 交易

> 这是流荒之路的"黑市 / 交易"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

已有

## 负责什么

- 装备和珍品挂单
- 系统贱价回收
- 模拟买家成交（Demo 1）
- 未来：真实玩家间挂单交易
- 杀神武器等特殊装备的交易支持

## 不负责什么

- 商业化 / 真实货币支付（不做技术系统，运营手动充值）
- 物品本身的属性定义（在装备 / 消耗品系统里）

## 发出哪些事件

- `ListingCreated`
- `ListingSold`
- `ListingCancelled`
- `ListingExpired`

## 监听哪些事件

- `（基本不监听，被 UI 触发）`

## 数据存哪里

活跃挂单列表、历史成交记录

## 当前代码位置

- `server/src/market-store.ts（待迁入）`

## 后续工作

S6 期间把 market-store.ts 迁入本目录。
