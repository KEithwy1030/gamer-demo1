# Godot Segment 01 - 第一段废墟搜刮遭遇

## Goal Card

- **Start**：玩家从废墟南缘出发，持基础剑、满生命、空背包。
- **End**：穿过有碰撞与遮挡的结构，完成一次怪物遭遇，打开宝箱，从装备/带走/放弃中作出选择，并看见下一路线。
- **Player Promise**：玩家在真实有高度的冷月废墟里稳定移动；第一只怪物让宝箱带有风险，箱中遗物迫使玩家立刻决定战力还是价值。
- **Canonical Path**：WASD 穿过拱门 -> 接近食尸怪 -> Space/鼠标左键攻击并击杀 -> E 开箱 -> 1/2/3 选择 -> 看见撤离方向。
- **Baseline**：`master@2b4df41` 的 Phaser sandbox / first-three-minutes 证据。
- **In Scope**：真实 3D 空间、正交斜视相机、玩家四向与攻击、单怪物前摇/受击/死亡、单宝箱、三种 loot choice、极简 HUD、代表性音频。
- **Out of Scope**：完整地图、Node 服务端接入、多人、大厅/黑市/档案、移动端、更多武器怪物、完整混音与打包导出。
- **Engineering Floor**：Godot 4.7.1 headless 导入无错误；真实主场景合同覆盖相机、3D 碰撞、移动、战斗、死亡、开箱、选择和 End 状态。
- **Experience Evidence**：VM 中录制完整 Canonical Path、四向连续帧、结构前后遮挡、第一刀、怪物前摇、开箱三选一和下一方向；与 Baseline 匿名 A/B。
- **Human Gate**：最终音色/混音舒适度、真实键鼠长期手感、代表性宿主 GPU 性能。它们需要真实设备和主观感知；本候选成熟前不请求。

## 2.5D Contract

- 世界移动平面为 XZ，Y 表示真实高度；地面、墙、拱门和宝箱使用 3D 碰撞。
- `Camera3D` 固定正交投影，俯角约 55 度；深度缓冲决定角色与结构的前后关系。
- 角色图层只控制视觉帧，`CharacterBody3D` 单独拥有移动根节点；没有 bob、网络插值或多个 tween 争夺根变换。
- 永久 HUD 只显示 HP、当前携带状态/价值和目标。交互提示位于对象附近，战利品选择只在开箱后短暂出现。
