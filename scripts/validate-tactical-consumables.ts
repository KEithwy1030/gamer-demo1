import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ITEM_DEFINITIONS } from "@gamer/shared";
import { getItemPresentation } from "../client/src/ui/itemPresentation.ts";
import { addTimedModifier, applyEnvironmentalDamage } from "../server/src/combat/player-effects.js";
import { InventoryService } from "../server/src/inventory/service.js";
import { buildInventoryItem } from "../server/src/loot/loot-manager.js";
import type { InventoryItem, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();
const repoRoot = fileURLToPath(new URL("../", import.meta.url));

validateDefinitions();
validateBandageCleanse();
validateStimulantBoost();
validateMiasmaTonicMitigation();

console.log("validate-tactical-consumables: ok");

function validateDefinitions(): void {
  const seenAssetPaths = new Set<string>();
  for (const id of ["coagulant_bandage", "rust_stimulant", "miasma_tonic"]) {
    const definition = ITEM_DEFINITIONS[id];
    assert.ok(definition, `${id} definition should exist`);
    assert.equal(definition.category, "consumable", `${id} should be a consumable`);
    const item = buildInventoryItem(id, "elite");
    assert.ok(item, `${id} should build into a runtime inventory item`);
    assert.equal(item?.kind, "consumable", `${id} runtime kind should stay consumable`);
    assert.ok((item?.consumableEffects?.length ?? 0) > 0, `${id} should carry tactical effects`);

    const presentation = getItemPresentation({ definitionId: id });
    const assetPath = /src="([^"]+)"/.exec(presentation.iconSvg)?.[1];
    assert.ok(assetPath, `${id} should render with a bitmap inventory icon`);
    assert.notEqual(
      assetPath,
      "assets/generated/image2_processed/items/icon_health_potion_v2.png",
      `${id} should not reuse the generic health potion icon`
    );
    assert.ok(!seenAssetPaths.has(assetPath), `${id} should have a distinct tactical consumable icon`);
    seenAssetPaths.add(assetPath);
    assert.ok(
      existsSync(path.join(repoRoot, "client", "public", ...assetPath.split("/"))),
      `${id} icon asset should exist on disk: ${assetPath}`
    );
  }
}

function validateBandageCleanse(): void {
  const { room, player, item } = createConsumableScenario("coagulant_bandage");
  player.state!.hp = 60;
  addTimedModifier(player, {
    sourceId: "test-bleed",
    type: "bleed",
    expiresAt: now + 4000,
    magnitude: 2,
    damageSourceId: "bleed-source",
    bleedDamagePerTick: 2,
    bleedTickIntervalMs: 500
  }, now);

  assert.ok(player.state?.statusEffects?.some((effect) => effect.type === "bleed"), "setup should apply bleed");
  const result = new InventoryService().useItem(room, player.id, item.instanceId);

  assert.equal(result.inventoryUpdate.inventory.items.length, 0, "used bandage should leave the backpack");
  assert.equal(player.state?.hp, 70, "bandage should provide a small emergency heal");
  assert.equal(player.state?.statusEffects?.some((effect) => effect.type === "bleed"), false, "bandage should cleanse bleed");
}

function validateStimulantBoost(): void {
  const { room, player, item } = createConsumableScenario("rust_stimulant");
  const beforeSpeed = player.state!.moveSpeed;

  new InventoryService().useItem(room, player.id, item.instanceId);

  assert.ok(player.state!.moveSpeed > beforeSpeed, "stimulant should increase movement speed");
  assert.ok(
    player.state!.statusEffects?.some((effect) => effect.type === "moveSpeedBoost" && effect.sourceId === "rust_stimulant"),
    "stimulant should be visible as a timed move-speed status"
  );
}

function validateMiasmaTonicMitigation(): void {
  const { room, player, item } = createConsumableScenario("miasma_tonic");

  new InventoryService().useItem(room, player.id, item.instanceId);
  const event = applyEnvironmentalDamage(player, 10, "corpseFog", now + 1);

  assert.ok(player.state!.damageReduction >= 0.35, "miasma tonic should add temporary damage reduction");
  assert.equal(event?.amount, 7, "miasma tonic should mitigate corpse-fog/environment damage");
  assert.ok(
    player.state!.statusEffects?.some((effect) => effect.type === "damageReduction" && effect.sourceId === "miasma_tonic"),
    "miasma tonic should be visible as a timed damage-reduction status"
  );
}

function createConsumableScenario(templateId: string): { room: RuntimeRoom; player: RuntimePlayer; item: InventoryItem } {
  const room = createRoom();
  const player = createPlayer("tester");
  const item = buildInventoryItem(templateId, "elite");
  assert.ok(item, `${templateId} should build`);
  player.inventory!.items.push({ item, x: 0, y: 0 });
  room.players.set(player.id, player);
  return { room, player, item };
}

function createRoom(): RuntimeRoom {
  return {
    code: "CONS",
    hostPlayerId: "tester",
    botDifficulty: "normal",
    capacity: 2,
    status: "started",
    createdAt: now,
    startedAt: now,
    players: new Map()
  };
}

function createPlayer(id: string): RuntimePlayer {
  return {
    id,
    name: id,
    socketId: id,
    isHost: true,
    ready: true,
    joinedAt: now,
    squadId: "player",
    squadType: "human",
    isBot: false,
    state: {
      id,
      name: id,
      x: 400,
      y: 400,
      direction: { x: 1, y: 0 },
      hp: 100,
      maxHp: 100,
      weaponType: "sword",
      isAlive: true,
      moveSpeed: 300,
      attackPower: 0,
      attackSpeed: 0,
      critRate: 0,
      dodgeRate: 0,
      damageReduction: 0,
      statusEffects: [],
      killsPlayers: 0,
      killsMonsters: 0,
      squadId: "player",
      squadType: "human",
      isBot: false
    },
    baseStats: {
      maxHp: 100,
      weaponType: "sword",
      moveSpeed: 300,
      attackPower: 0,
      attackSpeed: 0,
      critRate: 0,
      dodgeRate: 0,
      damageReduction: 0
    },
    combat: {
      lastCastAtBySkillId: {},
      activeModifiers: [],
      pendingCombatEvents: [],
      lastAttackAt: now - 5000
    },
    inventory: {
      width: 10,
      height: 6,
      items: [],
      equipment: {}
    }
  };
}
