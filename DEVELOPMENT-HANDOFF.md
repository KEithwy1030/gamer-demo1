# 流荒之路当前开发交接

> 状态日期：2026-07-22
>
> 当前决定：**暂停开发**
>
> 接管要求：未来 agent 先读本文件，再按“恢复开发”执行；不要重新做全仓摸底、完成度审计或技术选型。

## 1. 一句话状态

《流荒之路》已有较完整的 Phaser/Node 搜打撤工程与领域系统，但玩家体验仍处于早期；当前主线正在用 Godot 验证真正的 2.5D 客户端方向。首个 Godot 废墟遭遇切片已完成 Builder 候选和后台工程验证，**尚未合并、尚未通过 VM 功能验收与体验验收，当前结论为 `NEEDS_REVIEW`，不是可接受版本**。

暂停期间不要继续实现、修缺陷、合并候选、创建 checkpoint 或启动前台测试。

## 2. 真源与恢复锚点

| 项目 | 当前真相 |
| --- | --- |
| 主仓库 | `E:\CursorData\godot\games\ExilesRun` |
| 主分支 | `master` |
| 暂停时产品开发基线 | `2b4df416b0f2e4d7ec9a878d38728bb509b2d15e` (`Rebuild game development and test rules`)；本交接提交仅在其上增加文档 |
| Godot 实验分支 | `experiment/godot-segment-01` |
| Godot 候选 HEAD | `a7914a63a91b44b61778844ad88ebbd9b780b0bf` (`feat(godot): build first 2.5D ruin encounter`) |
| 远端 | `origin/master` 保存规则、暂停基线与本交接；`origin/experiment/godot-segment-01` 保存 Godot 候选 |
| Godot worktree | `E:\CursorData\godot\games\ExilesRun-worktrees\godot-segment-01` |
| 当前阶段决定 | `NEEDS_REVIEW`（独立 QA 已列出三个退回 Builder 的问题） |
| 合并状态 | Godot 候选未合并进 `master`；Phaser 客户端仍是可运行 Baseline |

未来若 worktree 不存在，不要重做候选，直接从远端恢复：

```powershell
git fetch origin --prune
git worktree add 'E:\CursorData\godot\games\ExilesRun-worktrees\godot-segment-01' experiment/godot-segment-01
```

如果本地实验分支也不存在：

```powershell
git branch experiment/godot-segment-01 origin/experiment/godot-segment-01
git worktree add 'E:\CursorData\godot\games\ExilesRun-worktrees\godot-segment-01' experiment/godot-segment-01
```

## 3. 产品与技术方向已经确定

- 游戏是 8-15 分钟一局的中世纪末世硬核轻量化 PvPvE 搜打撤，核心循环为“搜 -> 打 -> 撤 -> 卖”，核心情绪为搬砖快感、紧张和贪婪。
- 玩家是依靠装备求生的拾荒者，不是高速操作英雄；死亡、撤离、黑市和永久档案承接真实得失。
- 客户端目标是**真实 2.5D 斜视空间**：固定约 50-60 度正交相机、XZ 移动平面、真实高度/碰撞/遮挡和统一脚底锚点。平面 2D 加 `setDepth(y)` 不再可接受。
- Godot 是当前候选客户端方向，用来提升空间、动作、遮挡、音频与原生游戏 UI；不是为了换引擎而逐文件翻译 TypeScript。
- Node.js 权威服务端、shared 领域合同、档案经济、黑市和已有搜打撤规则应保留。Godot 通过 Go Gate 前不得删除 Phaser，也不得扩展成全量迁移。
- 冷月写实美术方向已经由 owner 确定：冷蓝灰、低饱和、左上主光、右下阴影、约 55 度斜视、屏幕尺寸下剪影优先。不要重新发起美术方向探索。

这些决定的细节真源依次为：`AGENTS.md`、`docs/QUALITY-BAR.md`、`docs/REFACTOR-GUIDE.md` 第一部分、`PITCH.md`，以及实验分支中的 Godot 合同。旧审计只能解释历史，不能覆盖这些当前决定。

## 4. 为什么转向当前工作方式

此前开发把项目当成软件工程：大量精力用于架构、合同、全绿测试、日志与缺陷修复。结果是系统完成度较高，但画面、动作、打击反馈、奖励仪式和继续游玩动机没有同步提升。“没有 bug”不能证明游戏好玩或开发有效。

因此当前规则已经重建：

- 第一目标是 Player Promise 和可观察 Delta，不是全仓测试全绿。
- 默认投入玩家可感知 Creation；只有 P0/P1 能打断当前阶段。
- 非平凡增量由 Producer、唯一 Builder、独立 QA、Experience Reviewer 分工。
- 后台测试优先、隔离 VM 第二；宿主机前台/Godot GUI/真实输入必须获得用户当次明确租约。
- agent 完成所有可完成的测试，只有真实主观或硬件 Human Gate 才请求用户。

## 5. Phaser/Node Baseline 状态

`master@2b4df41` 仍是主线与 Godot 匿名 A/B 的 Baseline：

- 技术栈：Phaser 3 + Vite 客户端、Node.js + Express + Socket.IO 服务端、shared 协议/数据。
- 已有领域能力包括权威战斗、掉落、死亡全损、背包、撤离、结算、档案、黑市、尸毒压力，以及大量对应合同和验证脚本。
- 历史上已经做过 HUD、冷月分级、接地影、角色四向素材、打击反馈和前三分钟自动化证据；这些不能被直接当作当前体验合格证明。
- `docs/QUALITY-BAR.md` 中“作为软件工程约七八成、作为游戏不到两成”是继续排期时更可靠的判断。不要根据系统列表推断游戏接近完成。
- `docs/agent/*2026-05-18.md` 和 `docs/ARCHITECTURE_ASSESSMENT_2026-05-21.md` 是历史审计，按需查证即可，不需要重新通读或重演。

## 6. 当前 Godot Segment 01 候选

阶段名：`Godot Segment 01 - 第一段废墟搜刮遭遇`。

玩家节拍：从废墟南缘出发，WASD 穿过拱门，接近并击杀守箱食尸怪，按 `E` 开箱，以 `1/2/3` 在装备、带走、放弃间选择，随后看见下一路线。

候选已经实现：

- 独立 `godot/` Godot 4.7.1 项目。
- `Node3D` 世界、`CharacterBody3D` 玩家/怪物、`StaticBody3D` 结构与碰撞。
- XZ 平面移动、真实 Y 高度关系、约 55 度正交 `Camera3D` 和深度缓冲。
- 玩家四向 idle/walk/attack 基础表现；怪物接敌、攻击前摇、受击和死亡。
- 守怪解锁宝箱、装备/带走/放弃三种结果、下一路线标记和克制 HUD。
- Master / Music / Ambience / SFX / UI 总线及四个代表性音频 cue。
- 11 个既有 runtime 资产的 source/runtime 登记；本阶段没有新生成 AI 图片。
- Godot 迁移边界、Goal Card、环境记录和资产清单。

实验分支上的关键文件：

- `docs/design/GODOT_SEGMENT_01.md`
- `docs/migration/GODOT_MIGRATION_BOUNDARY.md`
- `docs/production/GODOT_ENVIRONMENT.md`
- `docs/production/ASSET_MANIFEST.md`
- `godot/scenes/segment_01.tscn`
- `godot/scripts/segment_01.gd`
- `godot/scripts/segment_player.gd`
- `godot/scripts/segment_monster.gd`
- `godot/scripts/segment_chest.gd`
- `godot/tests/segment_contract_test.gd`

明确不在本候选范围：完整地图、Socket.IO/Node 接入、六人联机、大厅、黑市、档案、完整背包、移动端、全武器/怪物、完整音频阶段和导出打包。

## 7. 已验证与未验证

### 已由后台验证

- Godot `4.7.1.stable.official.a13da4feb` 可用。
- headless 导入退出码为 0，未报告 Warning/Error。
- 真实主场景合同为 `38/38`，退出码为 0；销毁场景后没有资源占用/泄漏报告。
- 场景结构包含正交相机、3D body/collision、XZ physics 移动、战斗、怪物前摇、死亡、宝箱、三种选择、End 状态和音频总线。
- runtime 资产与源资产 SHA-256 对应，且均有真实脚本引用。
- Engineering Floor：`PASS`。

后台复验命令（只在恢复开发后运行）：

```powershell
$godot = 'E:\CursorData\godot\tools\Godot\4.7.1-stable\Godot_v4.7.1-stable_win64_console.exe'
& $godot --headless --editor --path 'E:\CursorData\godot\games\ExilesRun-worktrees\godot-segment-01\godot' --quit
& $godot --headless --path 'E:\CursorData\godot\games\ExilesRun-worktrees\godot-segment-01\godot' --script res://tests/segment_contract_test.gd
```

### 尚未通过

- Functional Gate：`NEEDS_REVIEW`。合同没有以真实连续路径完成整个 Canonical Path。
- Experience Gate：`NEEDS_REVIEW`。没有 VM 录像/连续帧，不能评分。
- Delta Gate：`NEEDS_REVIEW`。尚未完成与 Phaser Baseline 的匿名 A/B。
- 主观音色/混音舒适度、长期键鼠手感和代表性宿主 GPU 性能尚未测试；这些是后期 Human Gate，不是当前立即请求用户的理由。

## 8. 独立 QA 退回的三个决定性问题

恢复开发后，只把候选退回同一 Builder 解决以下三项；不要借机清理 P2/P3 或扩充系统。

1. **视觉脚点仍会漂移（High）**

   `godot/scripts/segment_player.gd` 当前只保持 `Sprite3D.position` 不变，没有按每帧透明像素边界归一化视觉脚点。检查估计切帧会产生约 6.6-9.7 屏幕像素的竖向漂移。需要逐帧 foot-anchor 数据/偏移，并让合同验证真实视觉脚点，而不是只测节点位置。

2. **Canonical Path 测试走了捷径（Medium）**

   `godot/tests/segment_contract_test.gd` 只短暂移动，然后使用传送、禁用怪物、直接伤害和直接方法调用。应改为可重复的真实输入意图路径，验证移动、墙体阻挡、拱门通行、遭遇、攻击、开箱、选择和到达 End。

3. **玩家缺少可读的四向受击/死亡表现（Medium）**

   `godot/scripts/segment_player.gd` 受伤目前主要是 tint，死亡主要是状态切换。需要与四向合同一致的受击和死亡状态，确保玩家能看懂受伤和倒下，而不是只看数值变化。

碰撞、拱门通行、前后遮挡和动态脚点最终仍需 VM 渲染证据；节点存在不等于画面成立。

## 9. 恢复开发的固定顺序

未来用户明确要求恢复后，Producer 不需要重新分析“先做什么”，直接执行：

1. 核对本文件中的分支/HEAD、远端和 dirty state；读取 `AGENTS.md`、`docs/QUALITY-BAR.md`、`docs/REFACTOR-GUIDE.md` 第一部分，以及实验分支四份 Godot 合同。
2. 继续使用 `experiment/godot-segment-01` 和现有 worktree，指定唯一 Builder，只处理第 8 节三项。
3. Builder 提交并推送候选；后台重新执行导入和 Segment 合同。
4. 独立 QA 只读复验真实 Canonical Path 合同与三个退回项。
5. 后台通过后进入隔离 VM Gate。项目目前没有已分配的 ExilesRun VM；不得默认占用 `PayYourLife-TestVM`。先建立 `ExilesRun-TestVM`，或取得 owner 对复用 VM 及隔离方式的决定。
6. VM 由 agent 验证并保存连续证据：WASD 与墙/拱门碰撞、四向动画与脚点、结构前后遮挡、真实战斗和怪物前摇、开箱、`1/2/3` 选择、下一路线。
7. 两名隔离 Reviewer 对 Godot 与 Phaser 做匿名 A/B；各自至少 75/100、核心维度不低于 3/5，并确认可观察 Delta 后，Producer 才能决定是否接受 Godot 方向。
8. 只有 Go Gate `ACCEPT` 后，才讨论服务端接入和扩大迁移。不要提前做全地图、联机或大厅。

VM 后仍真正需要用户的 Human Gate：主观混音舒适度、长期物理输入手感、代表性本机硬件性能，以及 Godot 是否成为唯一客户端主线的最终产品决定。宿主前台测试必须另获当次明确授权。

## 10. 资产与视听后续边界

- 现有 11 个资产都是 `candidate`，不是 final；prompt/provenance 有缺失，商用前必须完成 license review。
- 生图能力应优先用于能改善路线、空间、动作和情绪的资产，不做装饰堆叠。生成图必须与 source、runtime、引用、锚点/碰撞和验证同一增量交付。
- 玩家动作表需要逐帧脚点校准并补 hurt/death；怪物需要同像素密度的完整四向动作；结构图集最终应拆为独立资产并校准碰撞。
- 动画/VFX/音频可以各自成为后续集中阶段，但必须围绕具体玩家节拍。当前 Segment 01 未通过前，不开启“全面音效/动效优化”。

## 11. 工作区卫生与禁止误操作

截至暂停时，主工作区存在不属于本阶段的修改/产物：

- `client/src/input/mobileControls.ts`
- `server/src/room-store.ts`
- 大量未跟踪 `.codex-artifacts/**`

它们属于用户或历史任务。不要回滚、删除、覆盖或纳入交接提交；不要使用 `git add -A`。恢复时重新运行 `git status --short --branch`，以实时输出为准。

不要做以下事情：

- 不要把 `a7914a6` 合并到 `master` 后再验收。
- 不要因 38/38 合同通过就宣布切片完成。
- 不要重新实现 Godot Segment 01，或回到平面 2D 路线。
- 不要先修全仓测试、历史 P2/P3 或做无玩家感知重构。
- 不要未经授权打开宿主 Godot GUI、注入键鼠或抢占前台焦点。
- 不要删除 Phaser Baseline、Node 服务端或现有领域合同。

## 12. 下一玩家可感知目标

下一目标不是“测试全绿”，而是：**玩家在同一段冷月废墟中四向移动时脚底稳定落地，能被墙挡住并穿过拱门；遭遇中受击和死亡清楚可读；随后用真实输入击杀守怪、开箱并作出有后果的选择。**

这个完整节拍由后台合同和 VM 连续画面共同证明。在此之前，项目保持暂停，当前候选保持 `NEEDS_REVIEW`。
