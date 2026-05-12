import type { AttackRequestPayload, BotDifficulty, CombatEventPayload, SkillCastPayload, Vector2 } from "@gamer/shared";
import { openChest } from "../chests/chest-manager.js";
import { startPlayerExtract } from "../extract/index.js";
import { InventoryService } from "../inventory/service.js";
import { MATCH_MAP_HEIGHT, MATCH_MAP_WIDTH } from "../internal-constants.js";
import { doesSegmentRequireSafeCrossing, getBestSafeCrossing, getNearestContestedChestZone, getSquadSpawnZone, getStarterChestZone, isPointInsideRiverHazard } from "../match-layout.js";
import { handlePlayerAttack as handleMonsterPlayerAttack, handlePlayerSkill as handleMonsterPlayerSkill } from "../monsters/monster-manager.js";
import { resolvePlayerAttack, resolvePlayerSkillCast, type PlayerDeathPayload } from "../combat/combat-service.js";
import type { ChestOpenedPayload, ExtractProgressPayload, LootPickedPayload, RuntimeContext, RuntimeMonster, RuntimePlayer } from "../types.js";

interface BotDifficultyProfile {
  aggroRange: number;
  fleeHpRatio: number;
  decisionMs: number;
  skillChance: number;
  extractChance: number;
  skillCooldownMs: number;
  monsterPressureRange: number;
}

interface ExtractPressureIntent {
  enemy?: RuntimePlayer;
  point?: Vector2;
}

export interface BotTickResult {
  combatEvents: CombatEventPayload[];
  playerDeaths: PlayerDeathPayload[];
  extractProgressEvents: ExtractProgressPayload[];
  chestOpenedEvents: ChestOpenedPayload[];
  lootPickedEvents: LootPickedPayload[];
  monsterStateChanged: boolean;
  playerStateChanged: boolean;
}

const BOT_PROFILE: Record<BotDifficulty, BotDifficultyProfile> = {
  easy: { aggroRange: 320, fleeHpRatio: 0.22, decisionMs: 760, skillChance: 0.08, extractChance: 0.36, skillCooldownMs: 11_000, monsterPressureRange: 260 },
  normal: { aggroRange: 450, fleeHpRatio: 0.3, decisionMs: 560, skillChance: 0.16, extractChance: 0.54, skillCooldownMs: 9_000, monsterPressureRange: 340 },
  hard: { aggroRange: 620, fleeHpRatio: 0.4, decisionMs: 380, skillChance: 0.24, extractChance: 0.72, skillCooldownMs: 8_500, monsterPressureRange: 430 }
};

const OPENING_LEASH_DISTANCE = 1500;
const OPENING_VISION_RANGE = 1200;
const OPENING_RELEASE_MS = 30_000;
const EXTRACT_PRESSURE_PLAYER_RADIUS = 380;
const EXTRACT_PRESSURE_STAGING_DISTANCE = 54;
const BOT_SCAVENGE_VISION_RANGE = 420;
const BOT_SCAVENGE_INTERACT_RANGE = 86;
const BOT_CARGO_EXTRACT_BONUS = 0.12;
const BOT_PRESSURE_CARGO_THRESHOLD = 2;
const BOT_PRESSURE_MONSTER_THRESHOLD = 1;
const BOT_RETREAT_RESET_MS = 2400;

const botInventoryService = new InventoryService();

export function tickBots(context: RuntimeContext, now = Date.now()): BotTickResult {
  const result: BotTickResult = {
    combatEvents: [],
    playerDeaths: [],
    extractProgressEvents: [],
    chestOpenedEvents: [],
    lootPickedEvents: [],
    monsterStateChanged: false,
    playerStateChanged: false
  };

  if (process.env.BOT_AI_DISABLED === "true") {
    return result;
  }

  const bots = [...context.room.players.values()].filter((player) => player.isBot);
  for (const bot of bots) {
    if (!bot.state || !bot.state.isAlive || bot.extract?.settledAt) {
      continue;
    }

    const profile = BOT_PROFILE[bot.botDifficulty ?? context.room.botDifficulty ?? "normal"];
    if (!bot.botNextDecisionAt || now >= bot.botNextDecisionAt) {
      chooseBotIntent(context, bot, profile, now);
      bot.botNextDecisionAt = now + profile.decisionMs + Math.floor(Math.random() * 120);
    }

    const didAct = tryBotAction(context, bot, profile, result, now);
    if (didAct) {
      result.playerStateChanged = true;
    }
  }

  return result;
}

function chooseBotIntent(context: RuntimeContext, bot: RuntimePlayer, profile: BotDifficultyProfile, now: number): void {
  const botState = bot.state!;
  const hpRatio = botState.maxHp > 0 ? botState.hp / botState.maxHp : 0;
  const extractZones = context.room.extract?.zones ?? [];
  const nearestOpenExtract = extractZones.filter((zone) => zone.isOpen).sort((a, b) => distance(botState, a) - distance(botState, b))[0];
  const hasCargo = hasBackpackCargo(bot);
  const cargoCount = getBackpackCargoCount(bot);
  const monsterThreat = findNearestMonster(context, bot, profile.monsterPressureRange);
  const shouldRetreat = hpRatio <= profile.fleeHpRatio || (hasCargo && hpRatio <= profile.fleeHpRatio + 0.08);

  const extractPressure = resolveExtractPressureIntent(context, bot, hpRatio);
  if (extractPressure?.enemy?.state) {
    bot.botGoal = shouldRetreat ? "retreat" : "hunt";
    bot.botTargetPlayerId = extractPressure.enemy.id;
    bot.botTargetDropId = undefined;
    bot.botPatrolPoint = undefined;
    bot.moveInput = bot.botGoal === "retreat"
      ? directionAway(botState, extractPressure.enemy.state)
      : getTravelDirection(context, botState, extractPressure.enemy.state);
    return;
  }

  if (extractPressure?.point) {
    bot.botGoal = "patrol";
    bot.botTargetPlayerId = undefined;
    bot.botTargetDropId = undefined;
    bot.botPatrolPoint = extractPressure.point;
    bot.moveInput = getTravelDirection(context, botState, extractPressure.point);
    return;
  }

  if (nearestOpenExtract && (shouldRetreat || cargoCount >= BOT_PRESSURE_CARGO_THRESHOLD || Math.random() < Math.min(0.92, profile.extractChance + (hasCargo ? BOT_CARGO_EXTRACT_BONUS : 0)))) {
    bot.botGoal = "extract";
    bot.botTargetPlayerId = undefined;
    bot.botTargetDropId = undefined;
    bot.botPatrolPoint = { x: nearestOpenExtract.x, y: nearestOpenExtract.y };
    bot.moveInput = getTravelDirection(context, botState, bot.botPatrolPoint);
    return;
  }

  const scavengeTarget = shouldRetreat ? undefined : findVisibleScavengeTarget(context, bot);
  if (scavengeTarget) {
    bot.botGoal = "loot";
    bot.botTargetPlayerId = undefined;
    bot.botTargetDropId = scavengeTarget.kind === "drop" ? scavengeTarget.id : undefined;
    bot.botPatrolPoint = { x: scavengeTarget.x, y: scavengeTarget.y };
    bot.moveInput = getTravelDirection(context, botState, bot.botPatrolPoint);
    return;
  }

  const openingLocked = isOpeningLocked(context, bot, now);
  const enemy = openingLocked
    ? findOpeningEnemy(context, bot)
    : findNearestEnemyPlayer(context, bot, profile.aggroRange);

  if (enemy?.state) {
    bot.botGoal = shouldRetreat ? "retreat" : "hunt";
    bot.botTargetPlayerId = enemy.id;
    bot.botTargetDropId = undefined;
    bot.botPatrolPoint = undefined;
    bot.moveInput = bot.botGoal === "retreat" ? directionAway(botState, enemy.state) : getTravelDirection(context, botState, enemy.state);
    return;
  }

  const monster = shouldRetreat
    ? undefined
    : findNearestMonster(context, bot, openingLocked ? Math.min(profile.aggroRange, 520) : profile.aggroRange * 0.72);
  if (monster) {
    bot.botGoal = "hunt";
    bot.botTargetPlayerId = monster.id;
    bot.botTargetDropId = undefined;
    bot.botPatrolPoint = undefined;
    bot.moveInput = getTravelDirection(context, botState, monster);
    return;
  }

  if (nearestOpenExtract && (shouldRetreat || (hasCargo && monsterThreat && cargoCount >= BOT_PRESSURE_MONSTER_THRESHOLD))) {
    bot.botGoal = "extract";
    bot.botTargetPlayerId = undefined;
    bot.botTargetDropId = undefined;
    bot.botPatrolPoint = { x: nearestOpenExtract.x, y: nearestOpenExtract.y };
    bot.moveInput = getTravelDirection(context, botState, bot.botPatrolPoint);
    return;
  }

  const point = resolveOpeningPatrolPoint(context, bot, now) ?? randomPatrolPoint();
  bot.botGoal = "patrol";
  bot.botTargetPlayerId = undefined;
  bot.botTargetDropId = undefined;
  bot.botPatrolPoint = point;
  bot.moveInput = getTravelDirection(context, botState, point);
}

function tryBotAction(
  context: RuntimeContext,
  bot: RuntimePlayer,
  profile: BotDifficultyProfile,
  result: BotTickResult,
  now: number
): boolean {
  if (!bot.state) {
    return false;
  }

  if (bot.botGoal === "retreat" && bot.botLastRetreatAt && now - bot.botLastRetreatAt > BOT_RETREAT_RESET_MS) {
    bot.botGoal = "patrol";
  }

  const extractZones = context.room.extract?.zones ?? [];
  if (bot.botGoal === "extract") {
    const zone = extractZones.filter((entry) => entry.isOpen).sort((a, b) => distance(bot.state!, a) - distance(bot.state!, b))[0];
    if (zone && distance(bot.state, zone) <= zone.radius * 0.75) {
      try {
        const extractResult = startPlayerExtract(context.room, bot.id, now);
        result.extractProgressEvents.push(...extractResult.progressEvents);
        bot.moveInput = { x: 0, y: 0 };
        return true;
      } catch {
        return false;
      }
    }
  }

  if (bot.botGoal === "loot") {
    const didScavenge = tryBotScavenge(context, bot, result);
    if (didScavenge) {
      return true;
    }
  }

  const enemy = findNearestEnemyPlayer(context, bot, 190);
  if (enemy) {
    return useBotPlayerAttack(context, bot, enemy, profile, result);
  }

  const monster = findNearestMonster(context, bot, 190);
  if (monster) {
    return useBotMonsterAttack(context, bot, profile, result);
  }

  return false;
}

function tryBotScavenge(
  context: RuntimeContext,
  bot: RuntimePlayer,
  result: BotTickResult
): boolean {
  if (!bot.state) {
    return false;
  }

  const chest = [...(context.room.chests?.values() ?? [])]
    .filter((entry) => !entry.isOpen)
    .map((entry) => ({ entry, distance: distance(bot.state!, entry) }))
    .filter((entry) => entry.distance <= BOT_SCAVENGE_INTERACT_RANGE)
    .sort((a, b) => a.distance - b.distance)[0]?.entry;

  if (chest) {
    try {
      const { loot } = openChest(context.room, bot.id, chest.id, bot.state.x, bot.state.y);
      result.chestOpenedEvents.push({
        chestId: chest.id,
        playerId: bot.id,
        loot
      });
      result.playerStateChanged = true;
      return true;
    } catch {
      // Ignore failed opportunistic loot attempts; next decision will pick a new goal.
    }
  }

  const drop = [...(context.room.drops?.values() ?? [])]
    .map((entry) => ({ entry, distance: distance(bot.state!, entry) }))
    .filter((entry) => entry.distance <= BOT_SCAVENGE_INTERACT_RANGE)
    .sort((a, b) => a.distance - b.distance)[0]?.entry;

  if (drop) {
    try {
      const pickup = botInventoryService.pickup(context.room, bot.id, drop.id);
      if (pickup.lootPicked) {
        result.lootPickedEvents.push(pickup.lootPicked);
      }
      result.playerStateChanged = true;
      return true;
    } catch {
      // Full inventory or stale drop; continue with combat/patrol behavior.
    }
  }

  return false;
}

function useBotPlayerAttack(
  context: RuntimeContext,
  bot: RuntimePlayer,
  enemy: RuntimePlayer,
  profile: BotDifficultyProfile,
  result: BotTickResult
): boolean {
  if (!bot.state || !enemy.state) {
    return false;
  }

  bot.state.direction = directionTo(bot.state, enemy.state);
  if (bot.botGoal === "retreat") {
    bot.botLastRetreatAt = Date.now();
  }
  try {
    if (canBotUseSkill(bot, profile) && Math.random() < profile.skillChance) {
      const skillPayload: SkillCastPayload = { skillId: resolveBotSkill(bot) };
      const skillResult = resolvePlayerSkillCast(context.room, bot.id, skillPayload);
      bot.botLastSkillAt = Date.now();
      result.combatEvents.push(...skillResult.combatEvents);
      result.playerDeaths.push(...skillResult.deaths);
      return skillResult.combatEvents.length > 0 || skillResult.deaths.length > 0;
    }

    const attackPayload: AttackRequestPayload = { attackId: `bot_attack_${bot.id}_${Date.now()}` };
    const attackResult = resolvePlayerAttack(context.room, bot.id, attackPayload);
    result.combatEvents.push(...attackResult.combatEvents);
    result.playerDeaths.push(...attackResult.deaths);
    return attackResult.combatEvents.length > 0 || attackResult.deaths.length > 0;
  } catch {
    return false;
  }
}

function useBotMonsterAttack(
  context: RuntimeContext,
  bot: RuntimePlayer,
  profile: BotDifficultyProfile,
  result: BotTickResult
): boolean {
  try {
    if (canBotUseSkill(bot, profile) && Math.random() < profile.skillChance) {
      const skillPayload: SkillCastPayload = { skillId: resolveBotSkill(bot) };
      const skillResult = handleMonsterPlayerSkill(context, bot.id, skillPayload);
      if (skillResult) {
        bot.botLastSkillAt = Date.now();
        result.combatEvents.push(...skillResult.combatEvents);
        result.monsterStateChanged = true;
        return true;
      }
    }

    const attackPayload: AttackRequestPayload = { attackId: `bot_attack_${bot.id}_${Date.now()}` };
    const attackResult = handleMonsterPlayerAttack(context, bot.id, attackPayload);
    if (!attackResult?.combat) return false;
    result.combatEvents.push(attackResult.combat);
    result.monsterStateChanged = true;
    return true;
  } catch {
    return false;
  }
}

function resolveBotSkill(bot: RuntimePlayer): SkillCastPayload["skillId"] {
  switch (bot.state?.weaponType) {
    case "blade": return "blade_sweep";
    case "spear": return "spear_heavyThrust";
    case "sword":
    default: return "sword_dashSlash";
  }
}

function isOpeningLocked(context: RuntimeContext, bot: RuntimePlayer, now: number): boolean {
  if (!bot.state || !bot.botHomeAnchor) {
    return false;
  }

  if (!context.room.startedAt) {
    return true;
  }

  if (now - context.room.startedAt >= OPENING_RELEASE_MS) {
    return false;
  }

  const enemy = findNearestEnemyPlayer(context, bot, OPENING_VISION_RANGE);
  if (enemy?.state) {
    return false;
  }

  const contested = resolveOpeningPatrolPoint(context, bot, now);
  if (contested && distance(bot.state, contested) < 220) {
    return false;
  }

  return true;
}

function resolveOpeningPatrolPoint(context: RuntimeContext, bot: RuntimePlayer, now: number): Vector2 | undefined {
  const layout = context.room.matchLayout;
  if (!layout || !bot.botHomeAnchor) {
    return undefined;
  }

  const ownSquadZone = getSquadSpawnZone(layout, bot.squadId);
  const starter = getStarterChestZone(layout, bot.squadId);
  const contested = getNearestContestedChestZone(layout, bot.botHomeAnchor);

  if (bot.squadId === "player") {
    const human = [...context.room.players.values()]
      .filter((player) => player.squadId === "player" && !player.isBot && player.state?.isAlive)
      .sort((a, b) => distance(bot.state!, a.state!) - distance(bot.state!, b.state!))[0];
    if (human?.state && distance(bot.state!, { x: ownSquadZone.anchorX, y: ownSquadZone.anchorY }) < ownSquadZone.safeRadius + 120) {
      return { x: human.state.x, y: human.state.y };
    }
  }

  if (starter && distance(bot.state!, starter) > 120 && distance(bot.state!, { x: ownSquadZone.anchorX, y: ownSquadZone.anchorY }) <= ownSquadZone.safeRadius + 180) {
    bot.botOpeningStage = "starter";
    return { x: starter.x, y: starter.y };
  }

  bot.botOpeningStage = "contested";
  if (contested) {
    return { x: contested.x, y: contested.y };
  }

  return { x: ownSquadZone.anchorX, y: ownSquadZone.anchorY };
}

function findOpeningEnemy(context: RuntimeContext, bot: RuntimePlayer): RuntimePlayer | undefined {
  if (!bot.state || !bot.botHomeAnchor) {
    return undefined;
  }

  return [...context.room.players.values()]
    .filter((player) => player.id !== bot.id && player.squadId !== bot.squadId && player.state?.isAlive)
    .filter((player) => distance(bot.botHomeAnchor!, player.state!) <= OPENING_LEASH_DISTANCE)
    .map((player) => ({ player, distance: distance(bot.state!, player.state!) }))
    .filter((entry) => entry.distance <= OPENING_VISION_RANGE)
    .sort((a, b) => a.distance - b.distance)[0]?.player;
}

function findNearestEnemyPlayer(context: RuntimeContext, bot: RuntimePlayer, maxDistance: number): RuntimePlayer | undefined {
  if (!bot.state) return undefined;
  return [...context.room.players.values()]
    .filter((player) => player.id !== bot.id && player.squadId !== bot.squadId && player.state?.isAlive)
    .map((player) => ({ player, distance: distance(bot.state!, player.state!) }))
    .filter((entry) => entry.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)[0]?.player;
}

function findNearestMonster(context: RuntimeContext, bot: RuntimePlayer, maxDistance: number): RuntimeMonster | undefined {
  if (!bot.state) return undefined;
  return [...(context.room.monsters?.values() ?? [])]
    .filter((monster) => monster.isAlive)
    .map((monster) => ({ monster, distance: distance(bot.state!, monster) }))
    .filter((entry) => entry.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)[0]?.monster;
}

function findVisibleScavengeTarget(
  context: RuntimeContext,
  bot: RuntimePlayer
): { kind: "chest" | "drop"; id: string; x: number; y: number; distance: number } | undefined {
  if (!bot.state) return undefined;

  const visibleChests = [...(context.room.chests?.values() ?? [])]
    .filter((chest) => !chest.isOpen)
    .map((chest) => ({ kind: "chest" as const, id: chest.id, x: chest.x, y: chest.y, distance: distance(bot.state!, chest) }))
    .filter((entry) => entry.distance <= BOT_SCAVENGE_VISION_RANGE);

  const visibleDrops = [...(context.room.drops?.values() ?? [])]
    .map((drop) => ({ kind: "drop" as const, id: drop.id, x: drop.x, y: drop.y, distance: distance(bot.state!, drop) }))
    .filter((entry) => entry.distance <= BOT_SCAVENGE_VISION_RANGE);

  return [...visibleChests, ...visibleDrops]
    .sort((a, b) => a.distance - b.distance)[0];
}

function hasBackpackCargo(bot: RuntimePlayer): boolean {
  return (bot.inventory?.items ?? []).some((entry) => (
    entry.item.treasureValue > 0
    || entry.item.goldValue > 0
    || entry.item.kind === "equipment"
    || entry.item.kind === "weapon"
    || entry.item.kind === "consumable"
  ));
}

function getBackpackCargoCount(bot: RuntimePlayer): number {
  return (bot.inventory?.items ?? []).filter((entry) => (
    entry.item.treasureValue > 0
    || entry.item.goldValue > 0
    || entry.item.kind === "equipment"
    || entry.item.kind === "weapon"
    || entry.item.kind === "consumable"
  )).length;
}

function canBotUseSkill(bot: RuntimePlayer, profile: BotDifficultyProfile): boolean {
  const now = Date.now();
  return !bot.botLastSkillAt || now - bot.botLastSkillAt >= profile.skillCooldownMs;
}

function resolveExtractPressureIntent(
  context: RuntimeContext,
  bot: RuntimePlayer,
  hpRatio: number
): ExtractPressureIntent | undefined {
  if (!bot.state || bot.squadId === "player") {
    return undefined;
  }

  const openZones = (context.room.extract?.zones ?? []).filter((zone) => zone.isOpen);
  if (openZones.length === 0) {
    return undefined;
  }

  const aliveHumans = [...context.room.players.values()]
    .filter((player) => player.id !== bot.id && !player.isBot && player.state?.isAlive);
  if (aliveHumans.length === 0) {
    return undefined;
  }

  const pressuredHuman = aliveHumans
    .map((player) => {
      const zone = openZones
        .filter((entry) => distance(player.state!, entry) <= entry.radius + EXTRACT_PRESSURE_PLAYER_RADIUS)
        .sort((a, b) => distance(player.state!, a) - distance(player.state!, b))[0];
      if (!zone) {
        return undefined;
      }

      return {
        player,
        zone,
        botDistance: distance(bot.state!, player.state!),
        zoneDistance: distance(player.state!, zone),
        isExtracting: player.extract?.zoneId === zone.zoneId && Boolean(player.extract?.completesAt)
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => {
      if (a.isExtracting !== b.isExtracting) {
        return a.isExtracting ? -1 : 1;
      }
      if (a.botDistance !== b.botDistance) {
        return a.botDistance - b.botDistance;
      }
      return a.zoneDistance - b.zoneDistance;
    })[0];

  if (pressuredHuman && hpRatio > 0.16) {
    return { enemy: pressuredHuman.player };
  }

  const pressureZone = openZones
    .map((zone) => ({
      zone,
      humanDistance: Math.min(...aliveHumans.map((player) => distance(player.state!, zone))),
      botDistance: distance(bot.state!, zone)
    }))
    .sort((a, b) => {
      if (a.humanDistance !== b.humanDistance) {
        return a.humanDistance - b.humanDistance;
      }
      return a.botDistance - b.botDistance;
    })[0]?.zone;

  return pressureZone
    ? { point: resolveExtractPressurePoint(bot, pressureZone) }
    : undefined;
}

function resolveExtractPressurePoint(bot: RuntimePlayer, zone: { zoneId: string; x: number; y: number; radius: number }): Vector2 {
  const angleSeed = [...`${bot.id}:${zone.zoneId}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const angle = (angleSeed % 360) * (Math.PI / 180);
  const ringDistance = zone.radius + EXTRACT_PRESSURE_STAGING_DISTANCE + ((angleSeed % 3) * 24);
  return {
    x: clamp(zone.x + Math.cos(angle) * ringDistance, 24, MATCH_MAP_WIDTH - 24),
    y: clamp(zone.y + Math.sin(angle) * ringDistance, 24, MATCH_MAP_HEIGHT - 24)
  };
}

function randomPatrolPoint(): Vector2 {
  return {
    x: 380 + Math.random() * (MATCH_MAP_WIDTH - 760),
    y: 380 + Math.random() * (MATCH_MAP_HEIGHT - 760)
  };
}

function directionTo(from: Vector2, to: Vector2): Vector2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length === 0 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length };
}

function directionAway(from: Vector2, to: Vector2): Vector2 {
  const direction = directionTo(from, to);
  return { x: -direction.x, y: -direction.y };
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getTravelDirection(context: RuntimeContext, from: Vector2, to: Vector2): Vector2 {
  const layout = context.room.matchLayout;
  if (!layout || layout.riverHazards.length === 0) {
    return directionTo(from, to);
  }

  const fromInRiver = isPointInsideRiverHazard(layout, from.x, from.y);
  const toInRiver = isPointInsideRiverHazard(layout, to.x, to.y);
  const crossesRiver = doesSegmentRequireSafeCrossing(layout, from, to);

  if (!fromInRiver && !toInRiver && !crossesRiver) {
    return directionTo(from, to);
  }

  const bridge = getBestSafeCrossing(layout, from, to);
  if (!bridge) {
    return directionTo(from, to);
  }

  const bridgeCenter = { x: bridge.x + (bridge.width / 2), y: bridge.y + (bridge.height / 2) };
  if (distance(from, bridgeCenter) > 96) {
    return directionTo(from, bridgeCenter);
  }

  return directionTo(from, to);
}
