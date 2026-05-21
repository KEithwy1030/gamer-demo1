# 战斗深度系统

> 这是流荒之路的"战斗深度系统"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

新增预留（含杀神武器机制）

## 负责什么

- 杀神武器机制（主动技能 + 长 CD + 锁死其他装备槽 + 仅对玩家有效）
- 流血叠加致死机制
- 环境击杀检测（推入河流 / 引怪 / 利用迷雾）
- 未来扩展：任何符合铁则 B 的「小概率高回报」机制

## 不负责什么

- 任何让操作完全压过装备的机制（违反铁则 B）
- 任何高速位移类技能
- 背刺判定 / 弱点部位（俯视角 2.5D 不适合，已永久排除）

## 发出哪些事件

- `SlayerSkillCharging`
- `SlayerSkillTriggered`
- `BleedStackedToLethal`
- `EnvironmentKillRegistered`

## 监听哪些事件

- `PlayerAttacked`
- `PlayerDamaged`
- `ItemEquipped`

## 数据存哪里

每个玩家的流血层数、杀神技能 CD 状态

## 当前代码位置

（暂无，新独立板块）

## 后续工作

Demo 1 后期实测后定杀神武器具体数值（暴击概率、CD、掉落率）。
