# Godot Segment 01 Asset Manifest

共同约束：owner 为 Segment 01 Builder；目标相机为 55 度正交斜视；主光左上、影子右下；显示尺寸以剪影清晰为先。现有 image2 资产的原始 prompt/negative prompt 未随处理后文件保存，因此标为 unknown，不伪造；商用前统一补 provenance/license 审查。

| ID | 玩家时刻 / 用途 | Source | Runtime | 状态 | 生成与修改 | Provenance / License | Expiry / Replacement brief |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ground-moonlit | 入场第一眼 / 地表材质 | `client/public/assets/generated/medieval-battlefield-ground-cpa-image2-20260501.png` | `godot/assets/environment/runtime/moonlit_ground.png` | candidate | image2；prompt unknown；运行时用于真实 PlaneMesh | 仓库内生成资产；license review pending | Go Gate；替换为同俯角、可平铺、冷蓝灰无方向接缝地表 |
| ruin-structures | 路线与遮挡 / 桥、拱门、木障 | `client/public/assets/generated/image2_processed/atlases/atlas_world_structures_3x3.png` | `godot/assets/environment/runtime/ruin_structures_3x3.png` | candidate | image2 processed atlas；prompt unknown | 仓库内生成资产；license review pending | Go Gate；拆成独立 source/runtime，校准每件脚点与碰撞 |
| scavenger-sword | 移动与第一刀 / 玩家四向动作 | `client/public/assets/generated/image2_processed/characters/unit_player_sword_sheet_8x4.png` | `godot/assets/characters/runtime/player_sword_8x4.png` | candidate | image2 processed action sheet；prompt unknown | 仓库内生成资产；license review pending | Go Gate；逐帧统一脚底、补 hurt/death 专帧 |
| ghoul | 风险遭遇 / 普通怪动作 | `client/public/assets/generated/image2_processed/monsters/monster_normal_sheet_4x4.png` | `godot/assets/characters/runtime/monster_normal_4x4.png` | candidate | image2 processed action sheet；prompt unknown | 仓库内生成资产；license review pending | Go Gate；重绘为与玩家同像素密度的四向完整动作表 |
| chest-closed | 搜刮目标 / 关闭宝箱 | `client/public/assets/generated/image2_processed/items/loot_chest_closed.png` | `godot/assets/items/runtime/chest_closed.png` | candidate | image2 processed；prompt unknown | 仓库内生成资产；license review pending | Go Gate；同一镜头重绘开/闭配对并裁紧透明边 |
| chest-open | 开箱反馈 / 打开宝箱 | `client/public/assets/generated/image2_processed/items/loot_chest_open.png` | `godot/assets/items/runtime/chest_open.png` | candidate | image2 processed；prompt unknown | 仓库内生成资产；license review pending | Go Gate；同上 |
| relic-icon | loot choice / 古银圣像 | `client/public/assets/generated/image2_processed/items/icon_treasure_small_idol_v2.png` | `godot/assets/items/runtime/relic_idol.png` | candidate | image2 processed；prompt unknown | 仓库内生成资产；license review pending | Go Gate；确认 UI 尺寸下轮廓并完成 commercial review |
| attack-whoosh | 第一刀挥砍 | `client/public/assets/audio/attack_whoosh.wav` | `godot/assets/audio/runtime/attack_whoosh.wav` | candidate | existing audio；source notes unavailable | 仓库内资产；license review pending | 音频阶段；替换为冷兵器短促低频挥砍 |
| hit-flesh | 怪物受击 | `client/public/assets/audio/hit_flesh.wav` | `godot/assets/audio/runtime/hit_flesh.wav` | candidate | existing audio；source notes unavailable | 仓库内资产；license review pending | 音频阶段；去削波并准备 3 个随机变体 |
| chest-open-sfx | 开箱完成 | `client/public/assets/audio/chest_open.wav` | `godot/assets/audio/runtime/chest_open.wav` | candidate | existing audio；source notes unavailable | 仓库内资产；license review pending | 音频阶段；与奖励 sting 分层 |
| loot-confirm | 确认携带价值 | `client/public/assets/audio/pickup_coin.wav` | `godot/assets/audio/runtime/loot_confirm.wav` | candidate | existing audio；source notes unavailable | 仓库内资产；license review pending | 音频阶段；按装备/带走/放弃制作不同确认 cue |
