# 状态效果板块（客户端）

> 这是流荒之路的"状态效果板块（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

新独立

## 负责什么

状态图标、buff / debuff UI 列表、状态持续时间显示。

## 监听哪些事件

- `StatusEffectApplied`
- `StatusEffectExpired`

## 数据存哪里

当前活跃状态的 UI 状态

## 当前代码位置

（新独立板块）
