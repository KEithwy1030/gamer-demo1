import { InventoryService } from "../server/src/inventory/service.ts";
import type { InventorySnapshotPayload } from "@gamer/shared";
import type { RuntimePlayer, RuntimeRoom } from "../server/src/types.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function expectThrow(action: () => void, expectedMessage: string): void {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(expectedMessage), `expected error to include \"${expectedMessage}\", got \"${message}\"`);
    return;
  }
  throw new Error(`expected error containing \"${expectedMessage}\"`);
}

function makeLoadout(): InventorySnapshotPayload {
  return {
    inventory: {
      width: 10,
      height: 6,
      items: [
        {
          instanceId: "grid-a",
          definitionId: "treasure_small_idol",
          kind: "treasure",
          rarity: "common",
          name: "Grid A",
          x: 0,
          y: 0
        },
        {
          instanceId: "grid-b",
          definitionId: "gold_pouch",
          kind: "gold",
          rarity: "common",
          name: "Grid B",
          x: 1,
          y: 0
        },
        {
          instanceId: "head-pack",
          definitionId: "armor_head_common",
          kind: "armor",
          rarity: "common",
          name: "Pack Hood",
          x: 2,
          y: 0
        },
        {
          instanceId: "chest-pack",
          definitionId: "armor_chest_common",
          kind: "armor",
          rarity: "common",
          name: "Pack Chest",
          x: 4,
          y: 0
        }
      ]
    },
    equipment: {
      weapon: {
        instanceId: "equipped-weapon",
        definitionId: "starter_sword",
        kind: "weapon",
        rarity: "common",
        name: "Starter Sword"
      },
      head: {
        instanceId: "head-equipped",
        definitionId: "leather_hood",
        kind: "armor",
        rarity: "common",
        name: "Equipped Hood"
      }
    }
  };
}

function makePlayer(loadout: InventorySnapshotPayload): RuntimePlayer {
  return {
    id: "player-1",
    name: "Verifier",
    socketId: "socket-1",
    joinedAt: Date.now(),
    squadId: "player",
    squadType: "human",
    isBot: false,
    pendingLoadout: loadout,
    state: {
      id: "player-1",
      name: "Verifier",
      x: 320,
      y: 320,
      direction: { x: 1, y: 0 },
      hp: 100,
      maxHp: 100,
      weaponType: "sword",
      isAlive: true,
      moveSpeed: 280,
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
    }
  } as RuntimePlayer;
}

function makeRoom(player: RuntimePlayer): RuntimeRoom {
  return {
    code: "ROOM01",
    hostPlayerId: player.id,
    botDifficulty: "easy",
    capacity: 1,
    status: "playing",
    createdAt: Date.now(),
    players: new Map([[player.id, player]]),
    drops: new Map()
  } as RuntimeRoom;
}

function getGridEntry(room: RuntimeRoom, itemInstanceId: string) {
  return room.players.get("player-1")!.inventory!.items.find((entry) => entry.item.instanceId === itemInstanceId);
}

function getEquipment(room: RuntimeRoom, slot: keyof RuntimeRoom["players"] extends never ? never : "weapon" | "head" | "chest" | "hands" | "shoes") {
  return room.players.get("player-1")!.inventory!.equipment[slot];
}

function assertUniqueInstances(room: RuntimeRoom, expectedIds: string[]): void {
  const ids = [
    ...room.players.get("player-1")!.inventory!.items.map((entry) => entry.item.instanceId),
    ...Object.values(room.players.get("player-1")!.inventory!.equipment).flatMap((item) => item ? [item.instanceId] : [])
  ];
  assert(ids.length === new Set(ids).size, `instance ids should stay unique: ${ids.join(", ")}`);
  assert(ids.length === expectedIds.length, `expected ${expectedIds.length} total instances, got ${ids.length}`);
  expectedIds.forEach((id) => assert(ids.includes(id), `missing instance ${id}`));
}

function main(): void {
  const service = new InventoryService();

  {
    const player = makePlayer(makeLoadout());
    const room = makeRoom(player);
    service.initializePlayer(player);
    service.move(room, player.id, {
      itemInstanceId: "grid-a",
      targetArea: "grid",
      x: 1,
      y: 0,
      swapItemInstanceId: "grid-b"
    });

    assert(getGridEntry(room, "grid-a")?.x === 1 && getGridEntry(room, "grid-a")?.y === 0, "grid-a should move into grid-b slot");
    assert(getGridEntry(room, "grid-b")?.x === 0 && getGridEntry(room, "grid-b")?.y === 0, "grid-b should swap into grid-a slot");
    assertUniqueInstances(room, ["grid-a", "grid-b", "head-pack", "chest-pack", "equipped-weapon", "head-equipped", player.inventory!.items.find((entry) => entry.item.templateId === "extract_torch")!.item.instanceId]);
  }

  {
    const player = makePlayer(makeLoadout());
    const room = makeRoom(player);
    service.initializePlayer(player);
    service.move(room, player.id, {
      itemInstanceId: "head-pack",
      targetArea: "equipment",
      slot: "head",
      swapItemInstanceId: "head-equipped"
    });

    assert(getEquipment(room, "head")?.instanceId === "head-pack", "backpack head item should equip into head slot");
    const swapped = getGridEntry(room, "head-equipped");
    assert(Boolean(swapped), "equipped head item should return to backpack");
    assertUniqueInstances(room, ["grid-a", "grid-b", "head-pack", "chest-pack", "equipped-weapon", "head-equipped", player.inventory!.items.find((entry) => entry.item.templateId === "extract_torch")!.item.instanceId]);
  }

  {
    const player = makePlayer(makeLoadout());
    const room = makeRoom(player);
    service.initializePlayer(player);
    service.move(room, player.id, {
      itemInstanceId: "head-equipped",
      targetArea: "grid",
      x: 7,
      y: 2
    });

    const unequipped = getGridEntry(room, "head-equipped");
    assert(unequipped?.x === 7 && unequipped?.y === 2, "equipped item should move into requested backpack slot");
    assert(!getEquipment(room, "head"), "head slot should be empty after equipment to backpack move");
  }

  {
    const player = makePlayer(makeLoadout());
    const room = makeRoom(player);
    service.initializePlayer(player);
    expectThrow(() => service.move(room, player.id, {
      itemInstanceId: "grid-a",
      targetArea: "grid",
      x: 2,
      y: 0
    }), "Inventory is full.");
  }

  {
    const player = makePlayer(makeLoadout());
    const room = makeRoom(player);
    service.initializePlayer(player);
    expectThrow(() => service.move(room, player.id, {
      itemInstanceId: "chest-pack",
      targetArea: "grid",
      x: 9,
      y: 5
    }), "Inventory is full.");
  }

  console.log("[inventory-drag-contract] PASS move/swap/reject/equipment contract");
}

main();
