# 架构评估 · 2026-05-21

**评估者**：Claude Opus 4.7（1M context）
**评估范围**：当前 `feat-frontend-optimization` 分支
**用户真实诉求**：诊断"声音不对、手感不对、撤离按钮挡住"这类反复出现的"打补丁循环"是否有结构性根因，给出"先动哪一刀 + 30 小时怎么走"。
**纪律**：不改代码、不 push、不跑自测。

---

## 1. 现状地图

### 1.1 整体拓扑（事实层）

```
SERVER                                       CLIENT
─────────────────────────────                ─────────────────────────────
                                              ┌─── feedbackFx (625L) ── VFX
domain managers                ◀── socket ──▶ ├─── interactions (748L) ── chest+extract UI
  monster-manager (2096L) ──┐   io.to(...)     ├─── hudOverlay (1018L) ── HUD
  chest-manager  (603L)  ──┤   .emit(...)      ├─── monsterSkillFx
  combat-service (657L)  ──┼─▶  index.ts ◀──── createGameClient (850L) ──▶ GameScene (1181L)
  bot-manager    (726L)  ──┤   (1105L)         │  ▲                        │
  extract/service(760L)  ──┤   128 emit         │  audio.play() 直通       │
  inventory/srv  (900L)  ──┤   call sites       │  logEvent() 写盘 sink    │
  spawn-director (268L)  ──┘                    │                          ▼
                                                socket.on()                 inputBridge / lockAssist
                                                30+ handlers                / miasmaPipeline
```

四个事实：
- **server/index.ts 有 128 处 `io.to(...).emit`**（实际证据：grep -c）。每条 domain action 都要在 index.ts 手工 fanout 出 N 条 socket 消息。
- **server domain manager 返回"异构 result bag"**：`tickMonsters` 返回 9 类事件（monsters/combatEvents/monsterKills/projectileSpawns/projectileHits/projectileDespawns/spawnPhaseChanged/musicModeEvents/playerStateChanged），index.ts 手工解包逐条 emit。`tickBots` 类似（7 类）。
- **client/createGameClient.ts 是镜像 god-orchestrator**：30+ 个 `socket.on(...)` 监听器，每个回调里手写 `logEvent + audio.play + getScene().xxx + options.callback` 的组合。GameScene 不是 god-file 而是事实上的**事件 fanout 中转站**——它被 createGameClient 通过 init data 注入回调，再 fanout 给 feedbackFx/hudOverlay/interactions 等子模块。
- **没有 domain event 契约层**：`shared/protocol/events.ts` 是 46 行字符串常量册，**没有 payload schema**。payload 类型散落在 `shared/types/*.ts` 和 `socketClient.ts` 的 callback 签名里。`runtimeLog.logEvent` 是单向写盘 sink，**不是事件总线**（没有 subscribe API）。

### 1.2 同一事实的多重观测点（耦合证据）

**事实"宝箱被打开了"被四套消费者各自处理**：
- audio：`createGameClient.ts:407-418` 在 `onChestProgress` 里追踪 `chestOpeningCuePlayed: Set<string>` 决定何时播 `chest` 音
- VFX：`interactions.ts:81-118` 监听 `subscribeChestOpened` 做爆裂动画 + loot 弹出
- HUD：`hudOverlay.ts`（1018L）独立维护 chest 进度条
- runtime：`inventory.setChestProgress` 写 runtime store；`logEvent("CHEST", ...)` 写盘

每一份消费者各自从 socket / runtime / scene 里把"宝箱状态"挖出来。任何一份延迟、漏判、状态不同步，就是一条 `fix(audio|chest|settlement)` commit。

**事实"怪物开始 windup"被两个地方各自从 polling 状态里推断**：
- `GameScene.syncMonsters` (line 920-929)：比较 `prev/current monster.windingUpAttackUntil`，触发 `onAudioCue("charge-up")` 或 `"thud"`
- `createGameClient.applyMonsters` (line 117-156)：同样的 prev/current 比较，写 `logEvent("COMBAT", "monster.windup_started", ...)`

**同一离散事实在客户端被独立挖了两次**。如果只改一处，另一处会漂。这是用户感受到的"打补丁循环"的活样本。

### 1.3 三个最 hot 的耦合点（带具体引用）

**耦合点 A · server/index.ts:305-322 `emitExtractInterruptForCombatEvent`**
跨域桥接器：combat 事件 → 调 extract-service 检查中断 → emit ExtractProgress；同时调 chest-manager 检查中断 → emit ChestProgress。被 5+ 个 combat emit 站点显式调用（player attack、bot tick、river hazard tick、corpse fog tick、monster tick、skill cast）。**新增任何造成伤害的路径都必须人工记得调用这个桥接器**，否则 extract/chest 不会中断。这是"靠纪律维持的隐性契约"的典型。

**耦合点 B · client/createGameClient.ts:115-194 `setInventory + setCombatResult + onPlayerAttack`**
三个 handler 各自混合 `logEvent + audio.play + getScene().xxx + options.onXxx` 四种副作用。`setInventory` 里硬编码"如果新捡到东西就播 pickup 音 + 显示 toast"——这意味着 audio/UI 的触发逻辑住在 client orchestrator 而不是各自的领域里。同样的 audio.play 在 `onChestProgress` 里维护一个 `Set<chestId>` 做去重——audio 状态机被打散到多个 socket handler 里。

**耦合点 C · client/scenes/GameScene.ts + createGameClient.ts 双重 windup 推断**
同上节 1.2 — 同一事实在两处从 polling 状态 diff 出来，下游用途不同（audio vs devlog），没有任何机制保证两处一致。

---

## 2. 病根诊断（按证据强度）

### 2.1 **没有"事件契约层"——既不在 server 内、也不在 wire 上、也不在 client 内**【最强】
- 证据：`shared/protocol/events.ts` 46 行只有 string ID；server 用 result bag 解包；client 用 socket handler 散写回调；audio bug 全是"消费者不知道上游生命周期"——`fix(audio): trigger chest cue on rummage start, not chest empty` (4e3ae6e)、`fix(audio): cap attack swing to single short play` (10ddaab)、`fix(audio,settlement): hurt min-interval lockout` (cd910b3)。
- 失败样本：双重 windup 推断（GameScene.syncMonsters vs createGameClient.applyMonsters）——纯粹是因为没有"MonsterWindupStarted"这个一等公民事件。

### 2.2 **god-orchestrator 在两端的中心**【强】
- 证据：`server/index.ts` 1105 行 + 128 个 emit；`createGameClient.ts` 850 行 + 30+ socket.on；`GameScene.ts` 1181 行兼任 view + input + fanout + spectate HUD。
- 失败样本：`cb0db1b fix(chests): buffer init until scene ready and assert 16 spawns` —— scene 还没准备好但 socket 已经 push chests 数据。这是 fanout 顺序问题，不是 chest 逻辑问题。

### 2.3 **VFX 没有独立家**【中】
- 证据：`client/src/effects/` 目录只有 39 行的 `hitFlash.ts` 一个孤儿；近三个 `feat(vfx)` 提交（6df55cc/83bdc09/9def6e9）全部塞进 `feedbackFx.ts`(625L) 和 `interactions.ts`(748L)。`interactions.ts` 既管 chest 也管 extract 也管 VFX。
- 失败样本：要给"撤离时怪物 windup"加视觉反馈，需要改 GameScene + feedbackFx + interactions 三个文件。

### 2.4 **domain 类型漂到根 / 共享文件**【中】
- 证据：`server/types.ts` 547 行装 8 个域的 Runtime types（Chest、Monster、Player、Combat、Extract、Projectile、Music、Room）；`shared/types/monsters.ts` 同文件混 MusicMode + SpawnPhase + MonsterProjectile + MonsterArchetypeState。
- 影响：每加一个 domain 字段都要去这两个根文件改，归属感缺失。

### 2.5 **缺少自动测试覆盖**【弱】
- 证据：全项目唯一的 `*.test.ts` 是 `spawn-director.test.ts`。其余依靠 `validate:*` 脚本（启动真实服务跑契约校验）。
- 影响：架构重构的回归网很薄；改 bus 之类大动作必须靠 playtest 验收，不能靠单元测试预防回归。

---

## 3. First Cut 设计

### 3.1 一刀——**Shared 端的 `DomainEvent` 契约层 + 两端的事件总线**

> 注：上 session 推荐"domain event bus"。我独立验证后**收窄了切点**：单纯在 client 加一个 mitt bus 只解决 1/3 问题——server 端的 result-bag fanout 和 wire 上的 payload-less ID 表都还在。**真正的 linchpin 是 `shared/` 端的事件契约**——同一个事实在 server tick output / socket wire / client consumer 三个地方都需要相同 schema，shared 是它们的交点。

具体构造：

1. **`shared/src/protocol/domainEvents.ts`**：定义 `DomainEvent` discriminated union，约 14 类事件（清单见 3.2），每类一个 typed payload schema。
2. **server 端**：`RuntimeRoom` 加 `events: DomainEvent[]` 队列。`tickMonsters/tickBots/tickChestOpenings/advanceExtractState` 等 tick 函数**不再返回 result bag**，而是 `room.events.push({...})`。在每个 tick 后调一次 `flushEvents(room, io)`——这是 server/index.ts 唯一保留的 fanout 点，机械地把 DomainEvent 映射到 socket event。
3. **client 端**：`clientEventBus = mitt<DomainEventMap>()`。`createGameClient` 的 30+ `socket.on()` 收敛成 `socket.onAny((name, payload) => clientEventBus.emit(name, payload))`。audio / VFX / HUD / scene 各自从 bus 订阅自己关心的事件，不再被 createGameClient 通过 init data 注回调。

### 3.2 Event Schema 草案（14 个一等公民事件）

| Event | Payload (关键字段) | Emit | Subscribe |
|---|---|---|---|
| `PhaseStarted` | `phase, atRunSeconds` | spawn-director | music, HUD, monster-mgr, devlog |
| `MonsterSpawned` | `monsterId, type, x, y` | monster-mgr | client view, devlog |
| `MonsterWindupStarted` | `monsterId, type, kind, windupMs, targetId?` | monster-mgr | **audio(charge-up), VFX(telegraph), devlog** |
| `MonsterKilled` | `monsterId, tier, x, y, killerPlayerId` | combat-svc | VFX, HUD, audio, loot-mgr, devlog |
| `PlayerDamaged` | `attackerId, targetId, amount, critMultiplier, damageType, interruptsExtract` | combat-svc / env | VFX, audio, extract-svc, chest-mgr, devlog |
| `PlayerDied` | `playerId, killerId, reason` | combat / env | VFX, audio, music, inventory, settlement |
| `ChestRummageStarted` | `chestId, playerId, lane, totalItems, noiseRadius` | chest-mgr | audio, VFX, HUD, monster-mgr(aggro), devlog |
| `ChestRummageTicked` | `chestId, itemsDispensed, remainingMs` | chest-mgr | VFX(noise pulse), HUD |
| `ChestRummageInterrupted` | `chestId, playerId, reason` | chest-mgr | audio(warning), VFX, HUD |
| `ChestOpened` | `chestId, playerId, loot` | chest-mgr | VFX(open burst), audio, HUD |
| `LootPickedUp` | `playerId, dropId, item` | inventory-svc | VFX(toast), audio, HUD |
| `ExtractOpened` | `zones, carrier?, squadStatus?` | extract-svc | HUD, music, VFX |
| `ExtractChannelStarted/Ticked/Interrupted` | `playerId, zoneId, remainingMs, reason?, pressure?` | extract-svc | HUD, audio, VFX |
| `ExtractSucceeded` | `playerId, zoneId, settlement` | extract-svc | music, audio, settlement |
| `MatchSettled` | `playerId, result, reason?, payload` | settlement | UI modal, audio |

注：`MonsterProjectile{Spawn/Hit/Despawn}` 当前已经是 typed payload，并入 schema 但不动语义。`InventoryChanged` 当前 socket 已有，保留。

### 3.3 这一刀**不动**的东西

- GameScene 的 view 同步（`syncPlayers/syncMonsters/syncDrops`）——继续 polling 状态，没问题
- HUD layout（`hudOverlay.ts` 1018 行的视觉代码）——独立
- 怪物 AI / 宝箱 loot table / 战斗伤害数值——全部原样
- 现有 socket protocol 在过渡期内**保持线上兼容**：`flushEvents` 既 emit 新格式（`domain:event`）也 emit 旧格式（`combat:result` 等），客户端 createGameClient 的旧 handler 可以**和 bus 共存**直到 step 4
- inputBridge / lockAssist / miasmaPipeline——独立，不动
- shared/types/monsters.ts 的"杂物间"问题——**留到 First Cut 之后再清理**，不在本刀范围

### 3.4 完成后的可观测验收

1. `grep -c "io.to.*\.emit" server/src/index.ts` 应该从 **128 → < 30**（保留 lobby/room 类系统消息，domain 类全归 flushEvents）
2. `createGameClient.ts` 的 `subscriptions: Unsubscribe[]` 数组从 **20+ → 1**（只剩一条 `socket.onAny → bus.emit`）
3. `GameScene` 的 init data 接口去掉 `onAudioCue / applyHitFlash / subscribeChestsInit / subscribeChestOpened / subscribeChestProgress / onCombatResult / onPlayerAttack / onMonsterKilled`——这些都改为 audio/VFX 模块**自己**从 bus 订阅
4. **客户端 windup 推断的 diff 循环消失**：`GameScene.syncMonsters` 不再判断 `prevWindupUntil/currentWindupUntil` 触发 `onAudioCue`；`createGameClient.applyMonsters` 不再判断 `previous.windingUpAttackUntil/monster.windingUpAttackUntil` 写 logEvent。这两段代码删掉，由 server 在 monster-manager 显式 emit `MonsterWindupStarted` 替代。
5. 玩 5 分钟主线（开局→打怪→开宝箱→撤离）所有声音/VFX/HUD 行为**完全一致**——这是用户能感受的不变量

---

## 4. 路线分段（5 步，每步可独立中止）

| 步骤 | 工作量 | 动什么 | **不动**什么 | 验收（observable） |
|---|---|---|---|---|
| **S1** | 4-6h | 新建 `shared/src/protocol/domainEvents.ts`：14 个事件的 discriminated union + payload schema。无任何消费者。 | 现有 `shared/protocol/events.ts`、所有 server/client 代码 | `npm run build` 三个 workspace 都通过；类型可被 import 但没人用 |
| **S2** | 6-8h | server 端：`RuntimeRoom.events: DomainEvent[]` 队列 + `flushEvents(room, io)`。挑 **monster + spawn + chest** 三个 tick 改为入队（**保留旧 result bag 并行**，双轨）。flushEvents 同时 emit 新旧两套 socket event。 | client 端、其他 tick（bot/extract/inventory）、socket wire 格式 | 玩 5 分钟主线游戏体验不变；`.devlog/latest.jsonl` 里出现新事件名（如 `domain:monster.killed`）；旧事件仍然出现 |
| **S3** | 6-8h | client 端：`clientEventBus`。audio + feedbackFx 改为**从 bus 订阅**，删除 createGameClient 里手写的 `audio.play(...)`/`getScene()?.handleXxx(...)` 调用（替换成 bus.on）。GameScene init data 去掉 audio/hitFlash 类回调（VFX/audio 自己订阅 bus）。 | server、HUD、interactions、socket wire | 5 分钟主线音效/VFX 完全一致；`createGameClient.ts` 行数 -250 以上；GameScene init data 接口窄一截 |
| **S4** | 4-6h | 把 2 个"客户端推断"提升为 server 一等事件：`MonsterWindupStarted` 和 `MonsterArchetypeChanged` 由 monster-manager 显式入队；删除 `GameScene.syncMonsters` 的 windup diff + `createGameClient.applyMonsters` 的 windup_started/archetype_state 推断。 | 其余 polling 同步（位置/HP 仍 polling）、result bag 旧通路 | windup 音效 / VFX 仍然触发；客户端两处 diff 循环代码消失（净删行 20+） |
| **S5** | 4-6h | 跨域 bridge 从手写迁到订阅：`extract-service.onDomain('PlayerDamaged', ...)` 替代 `emitExtractInterruptForCombatEvent` 在 5 个调用站点的手工调用。同理 chest-manager。**然后**移除 server 端旧 result bag 的并行通路（双轨合并为单轨）。 | 全部领域逻辑数值；HUD/UI | server/index.ts 单文件行数从 1105 → 预计 ~600；`emitExtractInterruptForCombatEvent` 这个名字消失；新增伤害路径**结构上**自动触发 extract/chest 中断 |

**累计工作量 24-34 小时**，落在用户给的 30 小时窗口里。

**每步独立可中止**：S1 完成停下，项目能正常跑（只是多了个没人用的类型文件）。S2 完成停下，双轨并行，旧链路还在。S3 完成停下，server 双轨 + client 单轨混用，能跑。S4 完成停下，跨域桥还是手工调，但客户端 diff 消失。S5 完成停下，正式收口。

---

## 附录 A · 待验证假设（独立判断的边界）

我在本次评估里没有验证、应当在 S1 之前花 30-60 分钟确认：

1. `shared/types/monsters.ts` 的"杂物间"问题是不是真的痒——MusicMode 和 SpawnPhase 在一个文件，行数只有 94，可能只是轻微归类问题；不一定要在本刀里处理。
2. `extract/service.ts` 内部是否已经有半个 event queue 雏形（760 行没全读）。如果有，S2 的 extract 部分可以直接复用。
3. `monster-manager.ts` 2096 行的 100+ magic constants 是否要在 S4 后单独切一刀——目前判断**不要**，否则任务膨胀。
4. 测试稀薄（只有 spawn-director.test.ts）——S2 改 tick 形态时建议补 2-3 个 vitest 单元测试覆盖 flushEvents，作为回归网；但不写入路线，按需。
5. server/types.ts 547 行的拆分——**留给 First Cut 之后**，本刀不动。

---

## 附录 B · 我没有照搬上 session 的什么

上 session 的"domain event bus"判断方向是对的，但我做了三点收窄/修正：

1. **切点收窄到 shared/**：上 session 的笔记暗示 client 端 bus 优先。我独立判断**问题的中心是 shared 端的事件契约**，不是 client 端的发射器。client bus 是必要但不是充分。
2. **明确 server 也要改**：上 session 没强调，但 server domain manager 的 result bag → index.ts 解包 → 128 emit 的 fanout 是镜像问题。仅改 client 留下一半病灶。
3. **VFX 不是独立优先级**：上 session 提到 `effects/` 是关键悬念。我读完确认 `effects/hitFlash.ts` 是 39 行孤儿，VFX 主体在 feedbackFx 里。VFX 没有独立家**是症状不是病根**——本刀后 VFX 自然有了订阅入口，再考虑要不要单独抽 effects/ 目录。

我同意上 session 的核心判断：domain event bus 优先于文件目录重排。但落到具体设计时，contract layer（shared 端）才是 First Cut 的锚点。
