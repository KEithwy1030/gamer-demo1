import crypto from "node:crypto";
import type { MatchLayoutSpawnZone } from "@gamer/shared";
import { ITEM_DEFINITIONS } from "@gamer/shared";
import { MATCH_MAP_HEIGHT, MATCH_MAP_WIDTH } from "./internal-constants.js";
import type { DropState, InventoryItem, RuntimeMonster, RuntimePlayer, RuntimeRoom } from "./types.js";

export type DevRoomPreset = "boss" | "extract" | "inventory";

const ENABLE_TEST_HOOKS = process.env.ENABLE_TEST_HOOKS === "1";
const BOSS_LOCK_CHASE_DISTANCE = 220;
const EXTRACT_START_INSET_MIN = 10;
const EXTRACT_START_INSET_MAX = 16;
const EXTRACT_ENTRY_MARGIN = 24;
const EXTRACT_OFFSET_Y = 18;
const INVENTORY_DROP_OFFSET_X = 56;
const INVENTORY_DROP_OFFSET_Y = 10;
const DEV_PRESET_SAFETY_MS = 18_000;
const DEV_PRESET_THREAT_CLEAR_RADIUS = 720;
const DEV_PRESET_THREAT_RELOCATE_DISTANCE = 960;
const DEV_EXTRACT_CHANNEL_DURATION_MS = 9_000;

export function resolveEnabledDevRoomPreset(value: unknown): DevRoomPreset | undefined {
  if (!ENABLE_TEST_HOOKS) {
    return undefined;
  }

  return value === "boss" || value === "extract" || value === "inventory"
    ? value
    : undefined;
}

export function applyDevRoomPreset(room: RuntimeRoom, preset: DevRoomPreset): void {
  const player = [...room.players.values()].find((entry) => !entry.isBot && entry.state);
  if (!player?.state || !room.matchLayout) {
    return;
  }

  switch (preset) {
    case "boss":
      applyBossPreset(room, player);
      break;
    case "extract":
      applyExtractPreset(room, player);
      break;
    case "inventory":
      applyInventoryPreset(room, player);
      break;
  }
}

function applyBossPreset(room: RuntimeRoom, player: RuntimePlayer): void {
  const boss = [...(room.monsters?.values() ?? [])].find((monster) => monster.type === "boss" && monster.isAlive);
  if (!boss || !player.state) {
    return;
  }

  const now = Date.now();
  const anchor = getPointAtDistanceFromAnchor(boss, BOSS_LOCK_CHASE_DISTANCE);
  placePlayer(player, anchor.x, anchor.y, normalizeDirection({ x: boss.x - anchor.x, y: boss.y - anchor.y }));
  stabilizePlayer(player);
  boss.spawnX = boss.x;
  boss.spawnY = boss.y;
  boss.patrolX = boss.x;
  boss.patrolY = boss.y;
  boss.aggroRange = 0;
  boss.moveSpeed = 0;
  boss.targetPlayerId = undefined;
  boss.behaviorPhase = "idle";
  boss.phaseEndsAt = undefined;
  boss.skillState = undefined;
  boss.skillEndsAt = undefined;
  boss.windupTargetId = undefined;
  boss.chargeTargetX = undefined;
  boss.chargeTargetY = undefined;
  boss.nextAttackAt = Math.max(boss.nextAttackAt ?? 0, now + DEV_PRESET_SAFETY_MS);
  boss.nextSmashAt = Math.max(boss.nextSmashAt ?? 0, now + DEV_PRESET_SAFETY_MS);
  boss.nextChargeAt = Math.max(boss.nextChargeAt ?? 0, now + DEV_PRESET_SAFETY_MS);

  stabilizeNearbyThreats(room, player.state, DEV_PRESET_THREAT_CLEAR_RADIUS, now, boss.id);
  delayBots(room, now);
}

function applyExtractPreset(room: RuntimeRoom, player: RuntimePlayer): void {
  const layout = room.matchLayout;
  const extractZone = layout?.extractZones[0];
  if (!extractZone || !player.state) {
    return;
  }

  const now = Date.now();
  extractZone.channelDurationMs = Math.max(extractZone.channelDurationMs ?? 0, DEV_EXTRACT_CHANNEL_DURATION_MS);
  if (room.extract?.zones?.[0] && room.extract.zones[0].zoneId === extractZone.zoneId) {
    room.extract.zones[0].channelDurationMs = extractZone.channelDurationMs;
  }
  const point = getExtractStagingPoint(extractZone);

  placePlayer(player, point.x, point.y, normalizeDirection({ x: extractZone.x - point.x, y: extractZone.y - point.y }));
  stabilizePlayer(player);
  stabilizeNearbyThreats(room, extractZone, DEV_PRESET_THREAT_CLEAR_RADIUS, now);
  delayBots(room, now);
}

function applyInventoryPreset(room: RuntimeRoom, player: RuntimePlayer): void {
  const layout = room.matchLayout;
  const spawnZone = layout ? getPlayerSpawnZone(layout.squadSpawns, player.squadId) : undefined;
  const spawnX = player.state?.x ?? spawnZone?.anchorX ?? MATCH_MAP_WIDTH / 2;
  const spawnY = player.state?.y ?? spawnZone?.anchorY ?? MATCH_MAP_HEIGHT / 2;
  placePlayer(player, spawnX, spawnY, spawnZone?.facing ?? { x: 0, y: 1 });

  room.drops ??= new Map<string, DropState>();
  const drop = buildDrop({
    templateId: "health_potion",
    x: spawnX + INVENTORY_DROP_OFFSET_X,
    y: spawnY + INVENTORY_DROP_OFFSET_Y
  });
  room.drops.set(drop.id, drop);
}

function getPointAtDistanceFromAnchor(anchor: { x: number; y: number }, distance: number): { x: number; y: number } {
  const candidates = [
    { x: anchor.x, y: anchor.y - distance },
    { x: anchor.x - distance, y: anchor.y },
    { x: anchor.x + distance, y: anchor.y },
    { x: anchor.x, y: anchor.y + distance }
  ];
  return candidates.find((point) => (
    point.x >= 96
    && point.x <= MATCH_MAP_WIDTH - 96
    && point.y >= 96
    && point.y <= MATCH_MAP_HEIGHT - 96
  )) ?? {
    x: clamp(Math.round(anchor.x), 96, MATCH_MAP_WIDTH - 96),
    y: clamp(Math.round(anchor.y - distance), 96, MATCH_MAP_HEIGHT - 96)
  };
}

function getExtractStagingPoint(extractZone: { x: number; y: number; radius: number }): { x: number; y: number } {
  const startRadius = getExtractStartRadius(extractZone.radius);
  return {
    x: clamp(Math.round(extractZone.x + startRadius - EXTRACT_ENTRY_MARGIN), 64, MATCH_MAP_WIDTH - 64),
    y: clamp(Math.round(extractZone.y + EXTRACT_OFFSET_Y), 64, MATCH_MAP_HEIGHT - 64)
  };
}

function getExtractStartRadius(zoneRadius: number): number {
  const inset = Math.min(EXTRACT_START_INSET_MAX, Math.max(EXTRACT_START_INSET_MIN, zoneRadius * 0.15));
  return Math.max(24, zoneRadius - inset);
}

function stabilizePlayer(player: RuntimePlayer): void {
  if (!player.state) {
    return;
  }

  player.state.maxHp = Math.max(player.state.maxHp, 240);
  player.state.hp = player.state.maxHp;
  player.attackCooldownEndsAt = undefined;
  player.lastCorpseFogDamageAt = undefined;
  player.lastRiverDamageAt = undefined;
}

function stabilizeNearbyThreats(
  room: RuntimeRoom,
  anchor: { x: number; y: number },
  radius: number,
  now: number,
  keepMonsterId?: string
): void {
  for (const monster of room.monsters?.values() ?? []) {
    const shouldKeep = monster.id === keepMonsterId;
    if (!monster.isAlive || (shouldKeep && monster.type === "boss")) {
      delayMonster(monster, now);
      continue;
    }

    if (Math.hypot(monster.x - anchor.x, monster.y - anchor.y) <= radius) {
      relocateMonsterAway(monster, anchor);
    }
    delayMonster(monster, now);
  }
}

function relocateMonsterAway(monster: RuntimeMonster, anchor: { x: number; y: number }): void {
  const direction = normalizeDirection({
    x: monster.x - anchor.x,
    y: monster.y - anchor.y
  });
  const fallbackDirection = direction.x === 0 && direction.y === 0 ? { x: 1, y: 0 } : direction;
  const candidates = [
    fallbackDirection,
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ].map((entry) => ({
    x: clamp(Math.round(anchor.x + entry.x * DEV_PRESET_THREAT_RELOCATE_DISTANCE), 96, MATCH_MAP_WIDTH - 96),
    y: clamp(Math.round(anchor.y + entry.y * DEV_PRESET_THREAT_RELOCATE_DISTANCE), 96, MATCH_MAP_HEIGHT - 96)
  })).sort((left, right) => (
    Math.hypot(right.x - anchor.x, right.y - anchor.y)
    - Math.hypot(left.x - anchor.x, left.y - anchor.y)
  ));
  const destination = candidates[0] ?? {
    x: clamp(Math.round(anchor.x + DEV_PRESET_THREAT_RELOCATE_DISTANCE), 96, MATCH_MAP_WIDTH - 96),
    y: clamp(Math.round(anchor.y), 96, MATCH_MAP_HEIGHT - 96)
  };

  monster.x = destination.x;
  monster.y = destination.y;
  monster.spawnX = destination.x;
  monster.spawnY = destination.y;
  monster.patrolX = destination.x;
  monster.patrolY = destination.y;
}

function delayMonster(monster: RuntimeMonster, now: number): void {
  monster.targetPlayerId = undefined;
  monster.behaviorPhase = "idle";
  monster.phaseEndsAt = undefined;
  monster.skillState = undefined;
  monster.skillEndsAt = undefined;
  monster.windupTargetId = undefined;
  monster.chargeTargetX = undefined;
  monster.chargeTargetY = undefined;
  monster.nextAttackAt = Math.max(monster.nextAttackAt ?? 0, now + DEV_PRESET_SAFETY_MS);
  monster.nextSmashAt = Math.max(monster.nextSmashAt ?? 0, now + DEV_PRESET_SAFETY_MS);
  monster.nextChargeAt = Math.max(monster.nextChargeAt ?? 0, now + DEV_PRESET_SAFETY_MS);
  monster.idleUntil = now + DEV_PRESET_SAFETY_MS;
  monster.returningUntil = undefined;
}

function delayBots(room: RuntimeRoom, now: number): void {
  for (const bot of room.players.values()) {
    if (!bot.isBot || !bot.state) {
      continue;
    }

    const spawn = room.matchLayout ? getPlayerSpawnZone(room.matchLayout.squadSpawns, bot.squadId) : undefined;
    if (spawn) {
      placePlayer(bot, spawn.anchorX, spawn.anchorY, spawn.facing);
    }
    bot.botGoal = "patrol";
    bot.botNextDecisionAt = now + DEV_PRESET_SAFETY_MS;
    bot.botTargetPlayerId = undefined;
    bot.botTargetDropId = undefined;
    bot.botPatrolPoint = bot.state ? { x: bot.state.x, y: bot.state.y } : undefined;
    bot.moveInput = { x: 0, y: 0 };
    bot.attackCooldownEndsAt = now + DEV_PRESET_SAFETY_MS;
  }
}

function getPlayerSpawnZone(spawns: MatchLayoutSpawnZone[], squadId: RuntimePlayer["squadId"]): MatchLayoutSpawnZone | undefined {
  return spawns.find((entry) => entry.squadId === squadId);
}

function placePlayer(player: RuntimePlayer, x: number, y: number, direction: { x: number; y: number }): void {
  if (!player.state) {
    return;
  }

  player.state.x = clamp(Math.round(x), 24, MATCH_MAP_WIDTH - 24);
  player.state.y = clamp(Math.round(y), 24, MATCH_MAP_HEIGHT - 24);
  player.state.direction = direction.x === 0 && direction.y === 0 ? { x: 0, y: 1 } : direction;
  player.moveInput = { x: 0, y: 0 };
}

function buildDrop(options: { templateId: string; x: number; y: number }): DropState {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    item: buildInventoryItem(options.templateId),
    x: clamp(Math.round(options.x), 24, MATCH_MAP_WIDTH - 24),
    y: clamp(Math.round(options.y), 24, MATCH_MAP_HEIGHT - 24),
    source: "spawn"
  };
}

function buildInventoryItem(templateId: string): InventoryItem {
  const definition = ITEM_DEFINITIONS[templateId];
  if (!definition) {
    throw new Error(`Unknown test hook item template: ${templateId}`);
  }

  return {
    instanceId: crypto.randomUUID(),
    templateId: definition.id,
    name: definition.name,
    kind: definition.category === "armor"
      ? "equipment"
      : definition.category === "gold"
        ? "currency"
        : definition.category,
    rarity: definition.rarity,
    tags: definition.tags ? [...definition.tags] : undefined,
    width: definition.size.width,
    height: definition.size.height,
    equipmentSlot: definition.slot,
    weaponType: definition.weaponType,
    goldValue: definition.goldAmount ?? 0,
    treasureValue: definition.treasureValue ?? 0,
    healAmount: definition.healAmount,
    modifiers: definition.stats ? {
      maxHp: definition.stats.maxHpBonus,
      attackPower: definition.stats.attackPower,
      attackSpeed: definition.stats.attackSpeedBonus,
      critRate: definition.stats.critRate,
      critDamage: definition.stats.critDamage,
      moveSpeed: definition.stats.moveSpeedBonus,
      damageReduction: definition.stats.damageReduction,
      hpRegen: definition.stats.hpRegen,
      dodgeRate: definition.stats.dodgeRate
    } : undefined,
    affixes: []
  };
}

function normalizeDirection(direction: { x: number; y: number }): { x: number; y: number } {
  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: direction.x / length,
    y: direction.y / length
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
