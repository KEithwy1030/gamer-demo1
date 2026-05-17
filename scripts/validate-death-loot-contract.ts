import assert from "node:assert/strict";
import { resolvePlayerAttack } from "../server/src/combat/combat-service.js";
import { InventoryService } from "../server/src/inventory/service.js";
import type { InventoryItem, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();
const inventoryService = new InventoryService();
const room = createRoom();
const scavenger = createPlayer("scavenger", {
  x: 100,
  y: 100,
  direction: { x: 1, y: 0 },
  squadId: "player",
  squadType: "human",
  isBot: false,
  attackPower: 0,
  hp: 40
});
const raider = createPlayer("raider", {
  x: 132,
  y: 100,
  direction: { x: -1, y: 0 },
  squadId: "bot_alpha",
  squadType: "bot",
  isBot: true,
  attackPower: 200,
  hp: 100
});

scavenger.inventory!.items.push(
  { item: makeTreasure("dead-treasure"), x: 0, y: 0 },
  { item: makeArmor("dead-helmet", "head"), x: 2, y: 0 }
);
scavenger.inventory!.equipment.chest = makeArmor("dead-chest", "chest");

room.players.set(scavenger.id, scavenger);
room.players.set(raider.id, raider);

const deathResult = resolvePlayerAttack(room, raider.id, {
  attackId: "death-loot-lethal-hit",
  targetId: scavenger.id,
  direction: { x: -1, y: 0 }
});

assert.equal(scavenger.state?.isAlive, false, "lethal enemy hit should kill the scavenger");
assert.equal(deathResult.deaths.length, 1, "lethal enemy hit should emit one player death");
assert.equal(deathResult.deaths[0]?.playerId, scavenger.id, "death payload should name the dead player");
assert.equal(deathResult.deaths[0]?.killerId, raider.id, "death payload should name the opposing killer");

const droppedItemIds = new Set([
  "dead-treasure",
  "dead-helmet",
  "dead-chest",
  "scavenger-weapon"
]);
const deathDropResult = inventoryService.handleDeath(room, scavenger.id);
assert.ok(deathDropResult, "death handling should produce a mutation result");
assert.equal(scavenger.deathLootDropped, true, "death handling should mark loot as dropped");
assert.equal(scavenger.inventory?.items.length, 0, "dead player backpack should be emptied");
assert.equal(Object.values(scavenger.inventory?.equipment ?? {}).filter(Boolean).length, 0, "dead player equipment should be emptied");

const deathDrops = [...(room.drops?.values() ?? [])].filter((drop) => drop.source === "player-death");
assert.equal(deathDrops.length, droppedItemIds.size, "all backpack and equipped items should become player-death drops");
for (const drop of deathDrops) {
  assert.equal(drop.ownerPlayerId, scavenger.id, "death drop should preserve original owner id");
  assert.ok(droppedItemIds.has(drop.item.instanceId), `unexpected dropped item ${drop.item.instanceId}`);
}

const targetDrop = deathDrops.find((drop) => drop.item.instanceId === "dead-treasure") ?? deathDrops[0]!;
raider.state!.x = targetDrop.x;
raider.state!.y = targetDrop.y;
const pickup = inventoryService.pickup(room, raider.id, targetDrop.id);

assert.equal(pickup.lootPicked?.playerId, raider.id, "opposing raider should receive loot picked event");
assert.equal(pickup.lootPicked?.dropId, targetDrop.id, "loot picked event should reference the death drop");
assert.equal(pickup.lootPicked?.item.instanceId, targetDrop.item.instanceId, "picked item should match the death drop item");
assert.ok(
  raider.inventory?.items.some((entry) => entry.item.instanceId === targetDrop.item.instanceId),
  "opposing raider inventory should contain the picked death loot"
);
assert.equal(room.drops?.has(targetDrop.id), false, "picked death drop should leave the world drop map");

console.log("[death-loot-contract] PASS enemy kill -> full death drop -> opposing pickup");

function createRoom(): RuntimeRoom {
  return {
    code: "DLOT",
    hostPlayerId: "scavenger",
    botDifficulty: "normal",
    capacity: 2,
    status: "started",
    createdAt: now,
    startedAt: now,
    players: new Map(),
    drops: new Map(),
    matchLayout: {
      templateId: "A",
      squadSpawns: [],
      extractZones: [],
      chestZones: [],
      safeZones: [],
      riverHazards: [],
      safeCrossings: []
    }
  };
}

function createPlayer(
  id: string,
  options: {
    x: number;
    y: number;
    direction: { x: number; y: number };
    squadId: RuntimePlayer["squadId"];
    squadType: RuntimePlayer["squadType"];
    isBot: boolean;
    attackPower: number;
    hp: number;
  }
): RuntimePlayer {
  return {
    id,
    name: id,
    socketId: id,
    isHost: id === "scavenger",
    ready: true,
    joinedAt: now,
    squadId: options.squadId,
    squadType: options.squadType,
    isBot: options.isBot,
    state: {
      id,
      name: id,
      x: options.x,
      y: options.y,
      direction: options.direction,
      hp: options.hp,
      maxHp: 100,
      weaponType: "sword",
      isAlive: true,
      moveSpeed: 300,
      attackPower: options.attackPower,
      attackSpeed: 0,
      critRate: 0,
      dodgeRate: 0,
      damageReduction: 0,
      statusEffects: [],
      killsPlayers: 0,
      killsMonsters: 0,
      squadId: options.squadId,
      squadType: options.squadType,
      isBot: options.isBot
    },
    combat: {
      lastCastAtBySkillId: {},
      activeModifiers: [],
      pendingCombatEvents: [],
      lastAttackAt: now - 5000
    },
    baseStats: {
      maxHp: 100,
      weaponType: "sword",
      moveSpeed: 300,
      attackPower: options.attackPower,
      attackSpeed: 0,
      critRate: 0,
      dodgeRate: 0,
      damageReduction: 0
    },
    attackCooldownEndsAt: 0,
    inventory: {
      width: 10,
      height: 6,
      items: [],
      equipment: {
        weapon: makeWeapon(`${id}-weapon`)
      }
    }
  };
}

function makeWeapon(instanceId: string): InventoryItem {
  return {
    instanceId,
    templateId: "weapon_sword_basic",
    name: "Rust Sword",
    kind: "weapon",
    width: 1,
    height: 3,
    equipmentSlot: "weapon",
    weaponType: "sword",
    goldValue: 12,
    treasureValue: 0,
    affixes: []
  };
}

function makeTreasure(instanceId: string): InventoryItem {
  return {
    instanceId,
    templateId: "treasure_medium_tablet",
    name: "Grave Tablet",
    kind: "treasure",
    width: 1,
    height: 2,
    goldValue: 100,
    treasureValue: 100,
    affixes: []
  };
}

function makeArmor(instanceId: string, slot: "head" | "chest"): InventoryItem {
  return {
    instanceId,
    templateId: slot === "head" ? "armor_head_leather" : "armor_chest_rust",
    name: slot === "head" ? "Leather Hood" : "Rust Chestguard",
    kind: "equipment",
    width: slot === "head" ? 2 : 2,
    height: slot === "head" ? 2 : 3,
    equipmentSlot: slot,
    goldValue: slot === "head" ? 24 : 46,
    treasureValue: 0,
    affixes: []
  };
}
