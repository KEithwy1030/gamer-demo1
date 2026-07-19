# Godot Migration Boundary

日期：2026-07-19
候选分支：`experiment/godot-segment-01`

## 目的

Godot 候选用于证明《流荒之路》的空间、动作、遮挡、视听反馈和原生游戏 UI 能在真正 2.5D 中成立。它不是把 Phaser/TypeScript 逐文件翻译成 GDScript。

## 保留

- Node.js 权威服务端及战斗、掉落、死亡、撤离、结算事实。
- shared 中已验证的数值与领域合同。
- 档案经济、黑市和当前 Phaser 客户端，后者作为匿名 A/B Baseline。

## 当前候选边界

- `godot/` 是独立客户端实验；只实现 Segment 01 的单机受控节拍。
- 不接 Socket.IO，不迁移大厅、黑市、档案、完整背包和六人联机。
- 临时本地状态只服务切片验证，不得被误称为未来权威架构。
- Godot 未通过独立 QA、两名 Reviewer 和 Delta Gate 前，不删除旧客户端，也不扩大迁移。

## Go Gate

按项目 `AGENTS.md` 第 6、9 节执行。Builder 只提交候选与后台自检，不自行作出 `ACCEPT`。
