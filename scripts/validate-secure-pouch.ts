import assert from "node:assert/strict";
import { InventoryService } from "../server/src/inventory/service.ts";
import type { RuntimePlayer, RuntimeRoom } from "../server/src/types.ts";

/**
 * 保险袋契约：
 * 1. 物品可以从背包移入保险袋（1x2，放不下要报错）
 * 2. 死亡时背包+装备掉落，保险袋物品不掉落
 * 3. 死亡后保险袋物品仍在玩家身上（快照包含）
 * 4. 保险袋物品可以取回背包
 */

const service = new InventoryService();

function makeRoom(): RuntimeRoom {
  return {
    code: "POUCH",
    startedAt: Date.now(),
    players: new Map(),
    monsters: new Map(),
    drops: new Map()
  } as unknown as RuntimeRoom;
}

function makePlayer(id: string): RuntimePlayer {
  return {
    id,
    profileId: `profile-${id}`,
    displayName: id,
    squadId: "player",
    state: {
      id,
      x: 2400,
      y: 2400,
      isAlive: true,
      hp: 100,
      maxHp: 100
    }
  } as unknown as RuntimePlayer;
}

const room = makeRoom();
const player = makePlayer("scavenger");
room.players.set(player.id, player);

service.initializePlayer(player);
const inventory = player.inventory!;

// 放一个 1x1 小件（主教印戒类比：直接构造一个 1x1 宝物）和一个普通物品
const smallTreasure = {
  instanceId: "pouch-treasure-1",
  templateId: "bishops_signet",
  name: "主教印戒",
  rarity: "rare" as const,
  kind: "treasure" as const,
  width: 1,
  height: 1,
  goldValue: 0,
  treasureValue: 70,
  affixes: []
};
const backpackFiller = {
  instanceId: "backpack-filler-1",
  templateId: "gold_pouch",
  name: "金币袋",
  rarity: "common" as const,
  kind: "currency" as const,
  width: 1,
  height: 1,
  goldValue: 40,
  treasureValue: 0,
  affixes: []
};

inventory.items.push({ item: smallTreasure, x: 0, y: 0 });
inventory.items.push({ item: backpackFiller, x: 2, y: 0 });

// 1. 移入保险袋
service.move(room, player.id, {
  itemInstanceId: "pouch-treasure-1",
  targetArea: "securePouch"
});
assert.equal(inventory.securePouch?.length, 1, "pouch should hold the secured item");
assert.ok(
  !inventory.items.some((entry) => entry.item.instanceId === "pouch-treasure-1"),
  "secured item should leave the backpack grid"
);

// 1b. 放不下的大件要报错（处刑大剑 1x4 塞不进 1x2）
const oversized = {
  instanceId: "oversized-1",
  templateId: "executioner_greatsword",
  name: "处刑大剑",
  rarity: "epic" as const,
  kind: "weapon" as const,
  width: 1,
  height: 4,
  equipmentSlot: "weapon" as const,
  goldValue: 130,
  treasureValue: 0,
  affixes: []
};
inventory.items.push({ item: oversized, x: 4, y: 0 });
assert.throws(
  () => service.move(room, player.id, { itemInstanceId: "oversized-1", targetArea: "securePouch" }),
  /Secure pouch/,
  "oversized item should be rejected by the pouch"
);

// 2. 死亡：背包+装备掉落，保险袋不掉
player.state!.isAlive = false;
const deathResult = service.handleDeath(room, player.id);
assert.ok(deathResult, "handleDeath should run once");

const dropInstanceIds = [...room.drops!.values()].map((drop) => drop.item.instanceId);
assert.ok(dropInstanceIds.includes("backpack-filler-1"), "backpack item should drop on death");
assert.ok(dropInstanceIds.includes("oversized-1"), "oversized backpack item should drop on death");
assert.ok(!dropInstanceIds.includes("pouch-treasure-1"), "secured item must NOT drop on death");

// 3. 死亡后快照仍包含保险袋物品
const update = service.buildInventoryUpdate(player);
assert.equal(update.inventory.securePouch?.length, 1, "post-death snapshot should still contain the secured item");
assert.equal(update.inventory.items.length, 0, "post-death backpack should be empty");

// 4. 复活后可以取回（移回背包）
player.state!.isAlive = true;
service.move(room, player.id, {
  itemInstanceId: "pouch-treasure-1",
  targetArea: "grid"
});
assert.equal(inventory.securePouch?.length, 0, "pouch should be empty after retrieval");
assert.ok(
  inventory.items.some((entry) => entry.item.instanceId === "pouch-treasure-1"),
  "retrieved item should return to the backpack grid"
);

console.log("[secure-pouch] PASS secure pouch stores small items, survives death drops, and releases items back to the grid");
