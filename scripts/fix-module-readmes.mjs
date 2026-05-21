#!/usr/bin/env node
/**
 * fix-module-readmes.mjs
 *
 * S2 阶段 Codex 把中文 README 写成 `?` 字符的修复脚本。
 *
 * 策略：用 Node 的 fs.writeFileSync (utf-8 编码默认无 BOM) 来重新生成 51 个 README。
 * 内容直接内嵌——不依赖 REFACTOR-GUIDE.md 解析（避免解析错误）。
 *
 * 运行：
 *   node scripts/fix-module-readmes.mjs
 *
 * 验收：grep -l 含 ??? 的 README 文件应该输出空（没有破坏的 README 了）。
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ""), "..");

// 通用顶部声明，所有 README 共享
function header(title, role) {
  return `# ${title}

> 这是流荒之路的"${title}"板块。
> 整体架构见 \`docs/REFACTOR-GUIDE.md\`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

${role}
`;
}

// 活跃板块完整身份证模板
function fullProfile({ title, role, responsibilities, notResponsibilities, emitsEvents, listensEvents, dataStore, currentFiles, nextSteps }) {
  return `${header(title, role)}
## 负责什么

${responsibilities.map((r) => `- ${r}`).join("\n")}

## 不负责什么

${notResponsibilities.map((r) => `- ${r}`).join("\n")}

## 发出哪些事件

${emitsEvents.map((e) => `- \`${e}\``).join("\n")}

## 监听哪些事件

${listensEvents.map((e) => `- \`${e}\``).join("\n")}

## 数据存哪里

${dataStore}

## 当前代码位置

${currentFiles.length > 0 ? currentFiles.map((f) => `- \`${f}\``).join("\n") : "（暂无，新独立板块）"}

## 后续工作

${nextSteps}
`;
}

// 预留板块简短模板
function reservedProfile({ title, futureResponsibility, futureEvents, activationCondition }) {
  return `${header(title, "🔮 预留 - 当前没有代码")}
## 未来负责

${futureResponsibility}

## 未来事件

${futureEvents.length > 0 ? futureEvents.map((e) => `- \`${e}\``).join("\n") : "（待定）"}

## 何时激活

${activationCondition}
`;
}

// 客户端展示层模板
function clientSupport({ title, role, responsibility, listensEvents, dataStore, currentFiles }) {
  return `${header(title, role)}
## 负责什么

${responsibility}

## 监听哪些事件

${listensEvents.length > 0 ? listensEvents.map((e) => `- \`${e}\``).join("\n") : "（按需订阅）"}

## 数据存哪里

${dataStore}

## 当前代码位置

${currentFiles.length > 0 ? currentFiles.map((f) => `- \`${f}\``).join("\n") : "（新独立板块）"}
`;
}

const READMES = {};

// ============================================================
// 服务端 23 板块
// ============================================================

READMES["server/src/combat/README.md"] = fullProfile({
  title: "战斗系统",
  role: "重构",
  responsibilities: [
    "玩家普攻、技能、闪避的判定",
    "伤害计算（基础伤害 → 装备加成 → 暴击 → 减伤 → 最终伤害）",
    "玩家死亡判定",
    "攻击范围、攻击间隔、技能 CD"
  ],
  notResponsibilities: [
    "怪物对玩家的攻击（在怪物系统里）",
    "装备词条加成的计算（在装备系统里）",
    "状态效果的持续逻辑（在状态效果系统里）",
    "战斗特殊机制如杀神武器、流血叠加（在战斗深度系统里）"
  ],
  emitsEvents: ["PlayerAttacked", "PlayerSkillCast", "PlayerDodged", "PlayerDamaged", "PlayerCriticalHit", "PlayerDied"],
  listensEvents: ["ItemEquipped", "ItemUnequipped", "PlayerStatsRecomputed", "StatusEffectApplied", "StatusEffectExpired", "EnvironmentDamageDealt"],
  dataStore: "每个玩家的战斗运行时状态（hp、cooldown、最后攻击时间、buff 列表）",
  currentFiles: ["server/src/combat/combat-service.ts", "server/src/combat/player-effects.ts"],
  nextSteps: "S3 已加入 PlayerDamaged 域事件入队。S5 关闭旧通路时迁移其余事件。"
});

READMES["server/src/combat-depth/README.md"] = fullProfile({
  title: "战斗深度系统",
  role: "新增预留（含杀神武器机制）",
  responsibilities: [
    "杀神武器机制（主动技能 + 长 CD + 锁死其他装备槽 + 仅对玩家有效）",
    "流血叠加致死机制",
    "环境击杀检测（推入河流 / 引怪 / 利用迷雾）",
    "未来扩展：任何符合铁则 B 的「小概率高回报」机制"
  ],
  notResponsibilities: [
    "任何让操作完全压过装备的机制（违反铁则 B）",
    "任何高速位移类技能",
    "背刺判定 / 弱点部位（俯视角 2.5D 不适合，已永久排除）"
  ],
  emitsEvents: ["SlayerSkillCharging", "SlayerSkillTriggered", "BleedStackedToLethal", "EnvironmentKillRegistered"],
  listensEvents: ["PlayerAttacked", "PlayerDamaged", "ItemEquipped"],
  dataStore: "每个玩家的流血层数、杀神技能 CD 状态",
  currentFiles: [],
  nextSteps: "Demo 1 后期实测后定杀神武器具体数值（暴击概率、CD、掉落率）。"
});

READMES["server/src/status-effects/README.md"] = fullProfile({
  title: "状态效果系统",
  role: "新独立",
  responsibilities: [
    "6 种基础状态（减速 / 流血 / 减伤 / 加攻 / 加攻速 / 加移速）的施加、持续、到期",
    "状态效果的层数管理（如流血叠加）",
    "状态效果的来源跟踪（哪个装备 / 技能 / 消耗品 来的）"
  ],
  notResponsibilities: [
    "状态效果造成的实际伤害（这是战斗系统的事）",
    "流血叠加致死的判定（在战斗深度系统里）"
  ],
  emitsEvents: ["StatusEffectApplied", "StatusEffectExpired"],
  listensEvents: ["PlayerAttacked", "PlayerSkillCast", "ItemUsed", "ItemEquipped"],
  dataStore: "每个玩家的活跃状态列表",
  currentFiles: ["server/src/combat/player-effects.ts（待迁入）"],
  nextSteps: "后续步骤把 combat/player-effects.ts 里的状态效果逻辑迁入本板块。"
});

READMES["server/src/monsters/README.md"] = fullProfile({
  title: "怪物系统",
  role: "重构",
  responsibilities: [
    "怪物生成（出生、节奏、位置选择）",
    "怪物 AI（巡逻、追击、攻击、技能、撤退）",
    "怪物攻击玩家的伤害计算",
    "怪物的蓄力 / 暴怒等行为状态",
    "怪物的投射物（弓箭怪的箭）"
  ],
  notResponsibilities: [
    "怪物掉落物的生成（在背包系统里，监听 MonsterKilled 决定掉什么）",
    "玩家攻击怪物的伤害计算（在战斗系统里）"
  ],
  emitsEvents: ["MonsterSpawned", "MonsterWindupStarted", "MonsterAttacked", "MonsterEnragedStarted", "MonsterKilled", "MonsterProjectileSpawned", "MonsterProjectileHit", "MonsterProjectileDespawned", "PhaseStarted"],
  listensEvents: ["PlayerDamaged", "ChestRummageStarted", "PlayerDied"],
  dataStore: "怪物列表（runtime）、spawn 定义、阶段状态",
  currentFiles: ["server/src/monsters/monster-manager.ts", "server/src/monsters/projectile-manager.ts", "server/src/spawn/spawn-director.ts"],
  nextSteps: "S3 已加入 MonsterSpawned / MonsterKilled 入队。S5 关闭旧通路时迁移其余事件（含客户端推断的 MonsterWindupStarted / MonsterEnragedStarted）。"
});

READMES["server/src/chests/README.md"] = fullProfile({
  title: "宝箱系统",
  role: "重构",
  responsibilities: [
    "宝箱出生位置和分布（按分区地图的规则）",
    "宝箱状态（关闭 / 翻找中 / 已开 / 被中断）",
    "翻找进度和节奏（每 1.2 秒掉一件物品）",
    "宝箱掉落物的随机内容（按掉落表）",
    "掉落表的时间梯度：游戏后期掉落质量提升（激励玩家在尸毒反噬期多停留）",
    "宝箱噪音机制（contested 宝箱招怪）"
  ],
  notResponsibilities: [
    "玩家拾取宝箱掉落物的入包逻辑（背包系统里）",
    "宝箱噪音吸引怪物的怪物 AI 反应（怪物系统里监听 ChestRummageStarted）"
  ],
  emitsEvents: ["ChestRummageStarted", "ChestRummageTicked", "ChestRummageInterrupted", "ChestOpened"],
  listensEvents: ["PlayerDamaged", "PlayerDied", "PhaseStarted"],
  dataStore: "宝箱列表、每个宝箱的状态、当前翻找者、当前对局的阶段掉落权重",
  currentFiles: ["server/src/chests/chest-manager.ts"],
  nextSteps: "S3 已加入 ChestRummageStarted / ChestOpened 入队。S5 时关闭旧通路。"
});

READMES["server/src/extract/README.md"] = fullProfile({
  title: "撤离系统",
  role: "重构",
  responsibilities: [
    "撤离点的位置（每张地图 2-3 个，分布在中央区域）",
    "撤离点的开放时机（第 8 分钟）",
    "火把点燃机制：玩家必须找到火把 → 带回某个撤离点 → 点燃 → 该撤离点才能使用",
    "玩家撤离读条（5 秒）",
    "撤离读条期间玩家可在撤离区内移动（不必站立不动），但离开撤离区会打断",
    "撤离压力机制（点燃的撤离点对所有玩家可见，会吸引争夺）",
    "撤离成功的判定和结算触发"
  ],
  notResponsibilities: [
    "撤离结算（在结算系统里，监听 ExtractSucceeded）",
    "撤离后的物品保留逻辑（背包系统 + 消耗品/工具系统的保险箱）",
    "火把本身的物品逻辑（在消耗品 / 工具系统里）"
  ],
  emitsEvents: ["BeaconLit", "ExtractOpened", "ExtractChannelStarted", "ExtractChannelTicked", "ExtractChannelInterrupted", "ExtractSucceeded"],
  listensEvents: ["BeaconLit（来自消耗品/工具系统）", "PlayerDamaged", "PlayerDied"],
  dataStore: "撤离区状态（每个撤离点是否点燃）、每个玩家的撤离进度、压力状态",
  currentFiles: ["server/src/extract/service.ts", "server/src/extract/index.ts"],
  nextSteps: "S3 已加入 ExtractOpened / ExtractSucceeded 入队。S6 时调整为 2-3 个撤离点 + 火把点燃机制 + 撤离可移动。"
});

READMES["server/src/environment/README.md"] = fullProfile({
  title: "环境系统",
  role: "新独立",
  responsibilities: [
    "尸毒迷雾的阶段切换（蔓延期 / 反噬期 / 加剧期）",
    "尸毒迷雾的反噬伤害",
    "河流伤害（站在尸河里持续掉血）",
    "未来的其他环境危险（毒区、火区等）"
  ],
  notResponsibilities: [
    "视野收窄效果（这是客户端视野系统的事，监听 FogPhaseChanged）"
  ],
  emitsEvents: ["EnvironmentDamageDealt", "FogPhaseChanged"],
  listensEvents: ["（几乎不监听，自己跑 tick）"],
  dataStore: "当前迷雾阶段、河流位置（从分区地图读）",
  currentFiles: ["server/src/corpse-fog.ts（待迁入）"],
  nextSteps: "S6 调整尸毒反噬时间（提前开始 + 总持续延长）。把 corpse-fog.ts 迁入本目录。"
});

READMES["server/src/map-zones/README.md"] = fullProfile({
  title: "分区地图系统",
  role: "新独立（合并 关卡布局 + 多地图管理）",
  responsibilities: [
    "一张大地图（9600×9600 或更大）分成 4-6 个有显著主题差异的战区",
    "每个战区的特征定义（怪物密度、掉落质量、地形危险、宝箱密度）",
    "玩家在大厅选择出生战区（不同战区 → 不同难度）",
    "撤离点位置（2-3 个，分布在中央）",
    "地图静态布局（出生点、安全区、河流、宝箱位置）"
  ],
  notResponsibilities: [
    "怪物的具体生成行为（怪物系统）",
    "宝箱的具体掉落内容（宝箱系统）",
    "河流的实际伤害判定（环境系统）"
  ],
  emitsEvents: ["（几乎不主动发，被其他板块在初始化时读取）"],
  listensEvents: ["（不监听）"],
  dataStore: "地图模板、战区配置、撤离点位置（静态数据）",
  currentFiles: ["server/src/match-layout.ts（待迁入）"],
  nextSteps: "S6 期间定义 4-6 个战区主题草案（焚烧场 / 骑士墓地 / 尸毒沼泽 / 营房废墟 / 中央战场）。"
});

READMES["server/src/inventory/README.md"] = fullProfile({
  title: "背包系统（含永久升级）",
  role: "重构",
  responsibilities: [
    "背包的格子系统（初始 10×6，可永久升级）",
    "物品形状（剑 1×3、枪 1×4 等）和放置校验",
    "拾取、丢弃、移动物品",
    "玩家死亡后的全部掉落（除保险箱内物品）",
    "怪物 / 宝箱掉落物的生成（监听 MonsterKilled / ChestRummageTicked）",
    "塔科夫式持久化：累计撤离次数 / 累计带出珍品价值触发背包容量永久升级"
  ],
  notResponsibilities: [
    "装备穿戴和属性计算（在装备系统里）",
    "消耗品的实际效果（在消耗品系统里）",
    "保险箱内物品的保留逻辑（在消耗品 / 工具系统里）"
  ],
  emitsEvents: ["LootSpawned", "LootPickedUp", "ItemDropped", "InventoryChanged", "BackpackCapacityUpgraded"],
  listensEvents: ["MonsterKilled", "ChestRummageTicked", "PlayerDied", "ExtractSucceeded"],
  dataStore: "每个玩家的背包格子状态、地面掉落物列表",
  currentFiles: ["server/src/inventory/service.ts", "server/src/inventory/index.ts", "server/src/inventory/catalog.ts", "server/src/loot/loot-manager.ts"],
  nextSteps: "S5/S6 期间实现背包容量永久升级机制（按累计撤离次数 / 累计珍品价值）。"
});

READMES["server/src/equipment/README.md"] = fullProfile({
  title: "装备 + 属性计算 + 装备被动",
  role: "新独立",
  responsibilities: [
    "装备穿戴和卸下",
    "5 个装备槽（武器 / 头 / 胸 / 手 / 鞋）",
    "装备品质（白 / 绿 / 蓝 / 紫 / 金）",
    "装备词条池和词条计算",
    "装备被动效果（回血加快、CD 缩短、搜集变快等——按铁则 A，所有被动都依附装备）",
    "特殊装备类型：包括杀神武器等有特殊约束的装备",
    "玩家最终属性的总计算（基础 + 所有装备词条 + 所有装备被动）"
  ],
  notResponsibilities: [
    "装备从哪里来（背包系统）",
    "装备的实际战斗加成执行（战斗系统读取本板块的「最终属性」）",
    "杀神武器技能的具体判定（在战斗深度系统里）"
  ],
  emitsEvents: ["ItemEquipped", "ItemUnequipped", "PlayerStatsRecomputed", "SpecialEquipmentSlotsLocked"],
  listensEvents: ["LootPickedUp"],
  dataStore: "每个玩家的当前装备、最终属性快照、特殊装备状态",
  currentFiles: ["server/src/combat/player-effects.ts（部分待迁入）"],
  nextSteps: "S5/S6 期间从战斗系统拆出装备属性计算逻辑到本板块。"
});

READMES["server/src/consumables/README.md"] = fullProfile({
  title: "消耗品 / 工具系统（含火把、保险箱）",
  role: "新独立",
  responsibilities: [
    "消耗品定义（药品 / 绷带 / 兴奋剂 / 尸毒抗性药）",
    "工具类道具：火把（撤离点火工具）、保险箱（局内特殊容器）",
    "消耗品使用判定（在背包里激活）",
    "消耗品效果（恢复 hp、施加 buff、点燃归营火）",
    "保险箱机制：玩家带入对局的特殊容器，放入物品后死亡不丢失",
    "未来扩展：烟雾弹、信号弹、陷阱"
  ],
  notResponsibilities: [
    "消耗品造成的状态效果的持续逻辑（在状态效果系统里）",
    "火把点燃归营火后的撤离压力（在撤离系统里）"
  ],
  emitsEvents: ["ItemUsed", "BeaconLit", "ItemDepositedInSafe", "ItemWithdrawnFromSafe"],
  listensEvents: ["PlayerDied", "ExtractSucceeded"],
  dataStore: "消耗品定义、活跃工具状态、每个玩家保险箱内的物品列表",
  currentFiles: [],
  nextSteps: "S6 期间实现完整火把机制（地图掉落物 + 在撤离点激活）。"
});

READMES["server/src/profile/README.md"] = fullProfile({
  title: "玩家档案 / 账号",
  role: "已有",
  responsibilities: [
    "玩家长期数据（金币、累计撤离次数、累计带出珍品价值、统计）",
    "背包容量等级（永久升级，由背包系统读取）",
    "玩家身份 ID",
    "跨局的装备保留（保险箱里带回来的）"
  ],
  notResponsibilities: [
    "注册 / 登录 / 找回密码（未来扩展，真正上线时再加）"
  ],
  emitsEvents: ["ProfileLoaded", "ProfileSaved", "BackpackCapacityUpgraded"],
  listensEvents: ["ExtractSucceeded", "MatchSettled"],
  dataStore: "玩家档案文件（未来是数据库）",
  currentFiles: ["server/src/profile-store.ts（待迁入）"],
  nextSteps: "S6 期间把 profile-store.ts 迁入本目录 + 实现累计触发背包升级。"
});

READMES["server/src/rooms/README.md"] = fullProfile({
  title: "房间大厅",
  role: "已有",
  responsibilities: [
    "房间创建、加入、离开",
    "房主权限（设置人数、强制开始）",
    "Bot 填位规则（不足 6 人补 Bot）",
    "大厅 UI",
    "战区选择（玩家选择本局出生战区）"
  ],
  notResponsibilities: [
    "对局过程中的状态（在各业务板块里）",
    "玩家长期档案（在玩家档案系统里）"
  ],
  emitsEvents: ["RoomCreated", "PlayerJoinedRoom", "PlayerLeftRoom", "RoomStarted", "SpawnZoneSelected", "MatchStarted"],
  listensEvents: ["（基本不监听，主动管理房间生命周期）"],
  dataStore: "活跃房间列表、每个房间的玩家、配置、状态",
  currentFiles: ["server/src/room-store.ts（待迁入）", "server/src/bots/bot-manager.ts"],
  nextSteps: "S6 期间把 room-store.ts 迁入本目录 + 加入战区选择功能。"
});

READMES["server/src/market/README.md"] = fullProfile({
  title: "黑市 / 交易",
  role: "已有",
  responsibilities: [
    "装备和珍品挂单",
    "系统贱价回收",
    "模拟买家成交（Demo 1）",
    "未来：真实玩家间挂单交易",
    "杀神武器等特殊装备的交易支持"
  ],
  notResponsibilities: [
    "商业化 / 真实货币支付（不做技术系统，运营手动充值）",
    "物品本身的属性定义（在装备 / 消耗品系统里）"
  ],
  emitsEvents: ["ListingCreated", "ListingSold", "ListingCancelled", "ListingExpired"],
  listensEvents: ["（基本不监听，被 UI 触发）"],
  dataStore: "活跃挂单列表、历史成交记录",
  currentFiles: ["server/src/market-store.ts（待迁入）"],
  nextSteps: "S6 期间把 market-store.ts 迁入本目录。"
});

READMES["server/src/spectate/README.md"] = fullProfile({
  title: "观战板块",
  role: "已有需要重构",
  responsibilities: [
    "玩家死亡后切换为观战模式",
    "观战目标限制：只能观战同队队友",
    "玩家可独自退出当局（不影响其他队友）",
    "可等待队友撤离一起退出"
  ],
  notResponsibilities: [
    "录像 / 回放（不做）",
    "精彩集锦（不做）",
    "跨队观战（不做）"
  ],
  emitsEvents: ["SpectateStarted", "SpectateTargetChanged", "SpectateExited"],
  listensEvents: ["PlayerDied", "ExtractSucceeded"],
  dataStore: "每个观战中的玩家、当前观战目标",
  currentFiles: ["client/src/scenes/GameScene.ts（spectate HUD 部分，S4 拆出来）"],
  nextSteps: "S4 已把客户端 spectate HUD 拆到独立板块。服务端 spectate 板块未来若需要状态同步再加。"
});

// 服务端预留板块（8 个）
const SERVER_RESERVED = [
  {
    dir: "server/src/crafting",
    title: "打造 / 强化",
    futureResponsibility: "装备强化、词条改造、装备打造。",
    futureEvents: ["ItemCrafted", "ItemUpgraded", "ItemReforged"],
    activationCondition: "Demo 1 后期或正式版上线前激活。"
  },
  {
    dir: "server/src/matchmaking",
    title: "匹配系统",
    futureResponsibility: "快速匹配、排位、地区匹配。",
    futureEvents: ["MatchmakingQueued", "MatchmakingMatched"],
    activationCondition: "公测前激活。Demo 1 仍用房间码加入。"
  },
  {
    dir: "server/src/social",
    title: "社交 / 好友 / 组队",
    futureResponsibility: "好友列表、组队邀请、社交关系。",
    futureEvents: ["FriendAdded", "PartyInvited", "PartyJoined"],
    activationCondition: "公测前激活。"
  },
  {
    dir: "server/src/chat",
    title: "聊天",
    futureResponsibility: "房间内聊天、好友私聊、世界频道。",
    futureEvents: ["ChatMessageSent", "ChatMessageReceived"],
    activationCondition: "公测前激活。"
  },
  {
    dir: "server/src/quests",
    title: "任务 / 成就 / 赛季",
    futureResponsibility: "日常任务、成就解锁、赛季通行证。",
    futureEvents: ["QuestCompleted", "AchievementUnlocked", "SeasonPassUpdated"],
    activationCondition: "正式运营阶段激活。"
  },
  {
    dir: "server/src/notifications",
    title: "公告 / 邮件",
    futureResponsibility: "系统公告、邮件奖励、活动通知。",
    futureEvents: ["NotificationDelivered", "MailReceived"],
    activationCondition: "正式运营阶段激活。"
  },
  {
    dir: "server/src/anti-cheat",
    title: "反作弊",
    futureResponsibility: "异常行为检测、客户端校验、举报系统。架构基础（服务端权威）已经具备，本板块是上层。",
    futureEvents: ["SuspiciousBehaviorDetected", "PlayerReported"],
    activationCondition: "公测前激活。"
  },
  {
    dir: "server/src/analytics",
    title: "数据统计 / 上报",
    futureResponsibility: "玩家行为聚合、平衡数据分析、运营报表。与 runtimeLog 的区别：runtimeLog 是给开发用的（看 bug），数据统计是给运营用的（看趋势）。",
    futureEvents: ["MetricRecorded", "FunnelStepReached"],
    activationCondition: "正式运营阶段激活。"
  }
];

for (const r of SERVER_RESERVED) {
  READMES[`${r.dir}/README.md`] = reservedProfile({
    title: r.title,
    futureResponsibility: r.futureResponsibility,
    futureEvents: r.futureEvents,
    activationCondition: r.activationCondition
  });
}

// ============================================================
// 客户端业务板块（22 个）
// ============================================================

const CLIENT_BUSINESS_PROFILES = {
  "client/src/features/combat": {
    title: "战斗板块（客户端）",
    role: "重构",
    responsibility: "战斗音效（攻击声、受伤声、暴击声）+ 战斗特效（伤害数字、火花、击杀爆裂、屏幕震动、hit stop）+ 战斗输入（鼠标点击、技能键、闪避键）。",
    listensEvents: ["PlayerAttacked", "PlayerSkillCast", "PlayerDodged", "PlayerDamaged", "PlayerCriticalHit", "PlayerDied"],
    dataStore: "本板块 UI / VFX 状态（伤害飘字、屏幕震动残留时间等）",
    currentFiles: ["client/src/scenes/gameScene/feedbackFx.ts（VFX 部分将拆入）", "client/src/audio/gameAudio.ts（音效 controller 共用）"]
  },
  "client/src/features/combat-depth": {
    title: "战斗深度板块（客户端）",
    role: "新增预留",
    responsibility: "杀神武器的蓄力 VFX / 音效告警、流血叠加 UI 指示器、环境击杀提示。",
    listensEvents: ["SlayerSkillCharging", "SlayerSkillTriggered", "BleedStackedToLethal", "EnvironmentKillRegistered"],
    dataStore: "杀神蓄力动画状态、流血层数 UI 显示",
    currentFiles: []
  },
  "client/src/features/status-effects": {
    title: "状态效果板块（客户端）",
    role: "新独立",
    responsibility: "状态图标、buff / debuff UI 列表、状态持续时间显示。",
    listensEvents: ["StatusEffectApplied", "StatusEffectExpired"],
    dataStore: "当前活跃状态的 UI 状态",
    currentFiles: []
  },
  "client/src/features/monsters": {
    title: "怪物板块（客户端）",
    role: "重构",
    responsibility: "怪物渲染（外观、动画）+ 怪物特效（蓄力光圈、愤怒状态光效、死亡爆裂）+ 怪物音效（蓄力声、咆哮）。",
    listensEvents: ["MonsterSpawned", "MonsterWindupStarted", "MonsterEnragedStarted", "MonsterKilled", "MonsterAttacked", "MonsterProjectileSpawned", "MonsterProjectileHit"],
    dataStore: "怪物 marker 实例、动画状态",
    currentFiles: ["client/src/game/entities/MonsterMarker.ts", "client/src/scenes/gameScene/monsterSkillFx.ts"]
  },
  "client/src/features/chests": {
    title: "宝箱板块（客户端）",
    role: "重构",
    responsibility: "宝箱外观 + 宝箱音效（开箱声、翻找声、警报声）+ 宝箱特效（开箱光、噪音波纹、战利品弹出）+ 宝箱交互 UI（「按 E 翻找」提示、进度圈）。",
    listensEvents: ["ChestRummageStarted", "ChestRummageTicked", "ChestRummageInterrupted", "ChestOpened"],
    dataStore: "宝箱 UI 实例、翻找进度展示状态",
    currentFiles: ["client/src/scenes/gameScene/interactions.ts（chest 部分将拆入）"]
  },
  "client/src/features/extract": {
    title: "撤离板块（客户端）",
    role: "重构",
    responsibility: "撤离区域外观（中心火堆、光晕脉动）+ 撤离 UI（读条、倒计时、被打断警告）+ 撤离音效（点火、撤离成功、警报）+ 撤离特效（成功烟花、读条光环）。",
    listensEvents: ["BeaconLit", "ExtractOpened", "ExtractChannelStarted", "ExtractChannelTicked", "ExtractChannelInterrupted", "ExtractSucceeded"],
    dataStore: "撤离 UI 状态、读条进度展示",
    currentFiles: ["client/src/scenes/gameScene/interactions.ts（extract 部分将拆入）", "client/src/scenes/extractUiState.ts"]
  },
  "client/src/features/environment": {
    title: "环境板块（客户端）",
    role: "新独立",
    responsibility: "尸毒迷雾的视觉表现（屏幕雾气、颜色叠加）+ 河流警告 UI + 环境伤害飘字。",
    listensEvents: ["EnvironmentDamageDealt", "FogPhaseChanged"],
    dataStore: "迷雾叠加层、河流伤害 UI",
    currentFiles: ["client/src/scenes/gameScene/corpseFogVisualState.ts", "client/src/scenes/gameScene/miasmaPipeline.ts"]
  },
  "client/src/features/map-zones": {
    title: "分区地图板块（客户端）",
    role: "新独立",
    responsibility: "战区选择 UI（在大厅）+ 地图小地图（标注战区位置） + 战区切换提示。",
    listensEvents: ["SpawnZoneSelected", "PhaseStarted"],
    dataStore: "战区配置缓存（来自 shared）",
    currentFiles: []
  },
  "client/src/features/inventory": {
    title: "背包板块（客户端）",
    role: "重构",
    responsibility: "背包面板（10×6 起步、可升级容量）+ 拖拽逻辑 + 装备槽展示 + 拾取动画。",
    listensEvents: ["LootPickedUp", "LootSpawned", "ItemDropped", "InventoryChanged", "BackpackCapacityUpgraded"],
    dataStore: "背包 UI 状态、拖拽中的物品",
    currentFiles: ["client/src/ui/InventoryPanel.ts", "client/src/ui/inventoryDrag/shared.ts"]
  },
  "client/src/features/equipment": {
    title: "装备板块（客户端）",
    role: "新独立",
    responsibility: "装备槽 UI、属性面板、装备词条展示、特殊装备的视觉标识（如杀神武器装备时其他槽位锁定的视觉反馈）。",
    listensEvents: ["ItemEquipped", "ItemUnequipped", "PlayerStatsRecomputed", "SpecialEquipmentSlotsLocked"],
    dataStore: "装备槽 UI 状态、属性数值展示",
    currentFiles: []
  },
  "client/src/features/consumables": {
    title: "消耗品 / 工具板块（客户端）",
    role: "新独立",
    responsibility: "消耗品图标 + 使用动画 + 火把的视觉效果（持火状态）+ 保险箱 UI（打开 / 放入 / 取出）。",
    listensEvents: ["ItemUsed", "BeaconLit", "ItemDepositedInSafe", "ItemWithdrawnFromSafe"],
    dataStore: "消耗品 UI 状态、保险箱面板状态",
    currentFiles: []
  },
  "client/src/features/profile": {
    title: "玩家档案板块（客户端）",
    role: "已有",
    responsibility: "档案 UI（金币、累计撤离次数、累计带出珍品价值、背包等级）展示。",
    listensEvents: ["ProfileLoaded", "ProfileSaved", "BackpackCapacityUpgraded"],
    dataStore: "档案 UI 缓存",
    currentFiles: []
  },
  "client/src/features/lobby": {
    title: "大厅界面板块",
    role: "已有",
    responsibility: "大厅 UI、房间创建、加入界面、玩家列表、战区选择。",
    listensEvents: ["RoomCreated", "PlayerJoinedRoom", "PlayerLeftRoom", "MatchStarted"],
    dataStore: "大厅 UI 状态",
    currentFiles: ["client/src/ui/lobbyView.ts", "client/src/ui/lobbyBackground.ts", "client/src/network/createLobbyController.ts"]
  },
  "client/src/features/market": {
    title: "黑市界面板块",
    role: "已有",
    responsibility: "挂单 UI、买卖 UI、价格输入、列表查看。",
    listensEvents: ["ListingCreated", "ListingSold", "ListingCancelled"],
    dataStore: "黑市 UI 状态",
    currentFiles: ["client/src/ui/marketView.ts"]
  },
  "client/src/features/spectate": {
    title: "观战板块（客户端）",
    role: "已有需要重构",
    responsibility: "死亡后观战 UI、切换队友视角、退出当局按钮。",
    listensEvents: ["PlayerDied", "ExtractSucceeded", "SpectateTargetChanged"],
    dataStore: "观战 UI 状态、当前观战目标",
    currentFiles: ["client/src/scenes/GameScene.ts（spectate HUD 部分，S4 拆出来）"]
  }
};

for (const [dir, profile] of Object.entries(CLIENT_BUSINESS_PROFILES)) {
  READMES[`${dir}/README.md`] = clientSupport({
    title: profile.title,
    role: profile.role,
    responsibility: profile.responsibility,
    listensEvents: profile.listensEvents,
    dataStore: profile.dataStore,
    currentFiles: profile.currentFiles
  });
}

// 客户端预留板块（7 个）
const CLIENT_RESERVED = [
  { dir: "client/src/features/crafting", title: "打造 UI", futureResponsibility: "装备打造 / 强化界面。", futureEvents: ["ItemCrafted", "ItemUpgraded"], activationCondition: "服务端 crafting 板块激活时同步开始。" },
  { dir: "client/src/features/matchmaking", title: "匹配界面", futureResponsibility: "快速匹配 / 排位 UI。", futureEvents: ["MatchmakingQueued", "MatchmakingMatched"], activationCondition: "公测前激活。" },
  { dir: "client/src/features/social", title: "社交 UI", futureResponsibility: "好友列表、组队邀请界面。", futureEvents: ["FriendAdded", "PartyInvited"], activationCondition: "公测前激活。" },
  { dir: "client/src/features/chat", title: "聊天 UI", futureResponsibility: "聊天输入框、消息显示、频道切换。", futureEvents: ["ChatMessageReceived"], activationCondition: "公测前激活。" },
  { dir: "client/src/features/quests", title: "任务 / 成就 UI", futureResponsibility: "任务进度、成就解锁动画、赛季通行证 UI。", futureEvents: ["QuestCompleted", "AchievementUnlocked"], activationCondition: "正式运营阶段激活。" },
  { dir: "client/src/features/notifications", title: "公告 / 邮件 UI", futureResponsibility: "公告弹窗、邮件列表、附件领取。", futureEvents: ["NotificationDelivered", "MailReceived"], activationCondition: "正式运营阶段激活。" },
  { dir: "client/src/features/analytics", title: "数据统计客户端", futureResponsibility: "客户端 telemetry 上报、性能监控数据收集。", futureEvents: ["MetricRecorded"], activationCondition: "正式运营阶段激活。" }
];

for (const r of CLIENT_RESERVED) {
  READMES[`${r.dir}/README.md`] = reservedProfile({
    title: r.title,
    futureResponsibility: r.futureResponsibility,
    futureEvents: r.futureEvents,
    activationCondition: r.activationCondition
  });
}

// ============================================================
// 客户端独有辅助板块（6 个）
// ============================================================

const CLIENT_HELPERS = {
  "client/src/features/hud": {
    title: "HUD（客户端）",
    role: "重构",
    responsibility: "血条、技能图标 + 冷却、击杀提示、阶段倒计时、目标信息、迷雾警告。",
    listensEvents: ["（几乎所有事件——血条、击杀提示、目标信息、阶段倒计时等都需要监听）"],
    dataStore: "HUD UI 状态、各种倒计时残留",
    currentFiles: ["client/src/scenes/gameScene/hudOverlay.ts"]
  },
  "client/src/features/vision": {
    title: "视野系统（客户端）",
    role: "已有",
    responsibility: "尸毒迷雾的视野收窄效果、雾气 overlay。",
    listensEvents: ["FogPhaseChanged"],
    dataStore: "视野半径状态",
    currentFiles: ["client/src/scenes/gameScene/miasmaPipeline.ts"]
  },
  "client/src/features/camera": {
    title: "摄像机系统（客户端）",
    role: "已有",
    responsibility: "跟随玩家、屏幕震动、死亡视角切换。",
    listensEvents: ["PlayerDamaged", "PlayerDied", "MonsterKilled（elite/boss）", "PlayerSkillCast", "SlayerSkillTriggered"],
    dataStore: "摄像机震动状态",
    currentFiles: []
  },
  "client/src/features/music": {
    title: "音乐系统（客户端）",
    role: "新独立",
    responsibility: "背景音乐状态机（lobby / calm / skirmish / danger / extract_pressure / death / victory）。",
    listensEvents: ["PhaseStarted", "PlayerDied", "ExtractSucceeded", "ExtractChannelStarted", "BeaconLit", "MusicModeChanged"],
    dataStore: "当前 BGM 模式",
    currentFiles: []
  },
  "client/src/features/tutorial": {
    title: "教程 / 新手引导（客户端）",
    role: "新独立",
    responsibility: "新手引导流程、操作提示、首次进入战场的引导。",
    listensEvents: ["（玩家行为事件——移动、攻击、拾取、撤离）"],
    dataStore: "引导进度",
    currentFiles: []
  }
};

for (const [dir, profile] of Object.entries(CLIENT_HELPERS)) {
  READMES[`${dir}/README.md`] = clientSupport({
    title: profile.title,
    role: profile.role,
    responsibility: profile.responsibility,
    listensEvents: profile.listensEvents,
    dataStore: profile.dataStore,
    currentFiles: profile.currentFiles
  });
}

// 客户端独有预留板块
READMES["client/src/features/i18n/README.md"] = reservedProfile({
  title: "本地化 / 多语言",
  futureResponsibility: "文本翻译查找、多语言切换。",
  futureEvents: [],
  activationCondition: "出海前激活。"
});

// ============================================================
// 写入文件
// ============================================================

console.log(`Repairing ${Object.keys(READMES).length} README files...`);

let written = 0;
for (const [relPath, content] of Object.entries(READMES)) {
  const fullPath = path.join(ROOT, relPath);
  fs.writeFileSync(fullPath, content, "utf8");
  written += 1;
  console.log(`  wrote ${relPath} (${content.length} chars)`);
}

console.log(`\nDone. ${written} READMEs rewritten in UTF-8.`);
console.log(`\nVerify:  grep -l "???" server/src/*/README.md client/src/features/*/README.md`);
console.log(`Expected output: (empty)`);
