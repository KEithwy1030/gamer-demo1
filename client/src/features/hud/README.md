# HUD（客户端）

> 这是流荒之路的"HUD（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

重构

## 负责什么

血条、技能图标 + 冷却、击杀提示、阶段倒计时、目标信息、迷雾警告。

## 监听哪些事件

- `（几乎所有事件——血条、击杀提示、目标信息、阶段倒计时等都需要监听）`

## 数据存哪里

HUD UI 状态、各种倒计时残留

## 当前代码位置

- `client/src/scenes/gameScene/hudOverlay.ts`
