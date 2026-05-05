import crypto from "node:crypto";
import type { MatchLayoutSafeCrossing, MatchLayoutSpawnZone } from "@gamer/shared";
import { ITEM_DEFINITIONS } from "@gamer/shared";
import { MATCH_MAP_HEIGHT, MATCH_MAP_WIDTH } from "./internal-constants.js";
import { getBestSafeCrossing } from "./match-layout.js";
import type { DropState, InventoryItem, RuntimeMonster, RuntimePlayer, RuntimeRoom } from "./types.js";

export type DevRoomPreset = "boss" | "extract" | "inventory";

const ENABLE_TEST_HOOKS = process.env.ENABLE_TEST_HOOKS === "1";
const BOSS_SAFE_DISTANCE = 220;
const EXTRACT_OFFSET_X = -120;
const EXTRACT_OFFSET_Y = 18;
const INVENTORY_DROP_OFFSET_X = 56;
const INVENTORY_DROP_OFFSET_Y = 10;

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

  const anchor = getBossStagingPoint(boss);
  placePlayer(player, anchor.x, anchor.y, normalizeDirection({ x: boss.x - anchor.x, y: boss.y - anchor.y }));
  boss.targetPlayerId = undefined;
  boss.behaviorPhase = "idle";
  boss.phaseEndsAt = undefined;
  boss.skillState = undefined;
  boss.skillEndsAt = undefined;
  boss.windupTargetId = undefined;
  boss.chargeTargetX = undefined;
  boss.chargeTargetY = undefined;
  boss.nextAttackAt = Math.max(boss.nextAttackAt ?? 0, Date.now() + 1800);
  boss.nextSmashAt = Math.max(boss.nextSmashAt ?? 0, Date.now() + 1800);
  boss.nextChargeAt = Math.max(boss.nextChargeAt ?? 0, Date.now() + 1800);
}

function applyExtractPreset(room: RuntimeRoom, player: RuntimePlayer): void {
  const layout = room.matchLayout;
  const extractZone = layout?.extractZones[0];
  if (!extractZone || !player.state) {
    return;
  }

  const crossing = layout.safeCrossings.find((entry) => entry.crossingId === "bridge_extract")
    ?? getBestSafeCrossing(layout, { x: player.state.x, y: player.state.y }, extractZone)
    ?? layout.safeCrossings[0];
  const point = crossing ? getExtractStagingPoint(crossing) : {
    x: extractZone.x + EXTRACT_OFFSET_X,
    y: extractZone.y + EXTRACT_OFFSET_Y
  };

  placePlayer(player, point.x, point.y, normalizeDirection({ x: extractZone.x - point.x, y: extractZone.y - point.y }));
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

function getBossStagingPoint(boss: RuntimeMonster): { x: number; y: number } {
  const fallback = {
    x: clamp(boss.x, 96, MATCH_MAP_WIDTH - 96),
    y: clamp(boss.y - BOSS_SAFE_DISTANCE, 96, MATCH_MAP_HEIGHT - 96)
  };
  const bossFacing = normalizeDirection({ x: boss.x - boss.patrolX, y: boss.y - boss.patrolY });
  if (bossFacing.x === 0 && bossFacing.y === 0) {
    return fallback;
  }

  const offset = {
    x: -bossFacing.x * BOSS_SAFE_DISTANCE,
    y: -bossFacing.y * BOSS_SAFE_DISTANCE
  };
  return {
    x: clamp(Math.round(boss.x + offset.x), 96, MATCH_MAP_WIDTH - 96),
    y: clamp(Math.round(boss.y + offset.y), 96, MATCH_MAP_HEIGHT - 96)
  };
}

function getExtractStagingPoint(crossing: MatchLayoutSafeCrossing): { x: number; y: number } {
  return {
    x: clamp(Math.round(crossing.x + crossing.width / 2 + EXTRACT_OFFSET_X), 64, MATCH_MAP_WIDTH - 64),
    y: clamp(Math.round(crossing.y + crossing.height / 2 + EXTRACT_OFFSET_Y), 64, MATCH_MAP_HEIGHT - 64)
  };
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
