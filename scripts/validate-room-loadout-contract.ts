import { RoomStore } from "../server/src/room-store.ts";
import { InventoryService } from "../server/src/inventory/service.ts";
import type { InventorySnapshotPayload } from "@gamer/shared";
import type { SocketSession } from "../server/src/types.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeLoadout(): InventorySnapshotPayload {
  return {
    inventory: {
      width: 10,
      height: 20,
      items: [{
        instanceId: "contract-idol",
        definitionId: "treasure_small_idol",
        kind: "treasure",
        rarity: "common",
        name: "Contract Idol",
        x: 0,
        y: 0
      }]
    },
    equipment: {
      weapon: {
        instanceId: "contract-sword",
        definitionId: "starter_sword",
        kind: "weapon",
        rarity: "common",
        name: "Contract Sword"
      }
    }
  };
}

function main(): void {
  const roomStore = new RoomStore();
  const inventoryService = new InventoryService();
  const hostSession: SocketSession = {
    socketId: "socket-host",
    playerId: "host-player",
    playerName: "Host"
  };
  const joinSession: SocketSession = {
    socketId: "socket-join",
    playerId: "join-player",
    playerName: "Join"
  };

  const loadout = makeLoadout();
  const created = roomStore.createRoom({ playerName: "Host", botDifficulty: "easy", loadout }, hostSession);
  roomStore.joinRoom({ code: created.room.code, playerName: "Join" }, joinSession);
  const started = roomStore.startMatch(hostSession, { botDifficulty: "easy", loadout });

  assert(started.roomState.players.length === 2, "started roomState should expose only human lobby players");
  assert(started.roomState.players.every((player) => !player.isBot), "started roomState should not leak bots");
  assert(started.matchPayloadByPlayerId.has(hostSession.playerId), "host should have a match payload");
  assert(started.matchPayloadByPlayerId.has(joinSession.playerId), "joined human should have a match payload");
  assert(started.matchPayloadByPlayerId.size === started.room.players.size, "room store should prepare payloads for every runtime player");

  const hostPayload = started.matchPayloadByPlayerId.get(hostSession.playerId);
  assert(hostPayload, "host should receive match:started payload");
  assert(hostPayload.room.players.length === started.roomState.capacity, "match payload should include full runtime roster");
  assert(hostPayload.room.players.filter((player) => player.squadId === "player").length === 2, "player squad should contain both humans");
  assert(hostPayload.room.players.some((player) => player.isBot && player.squadId !== "player"), "match payload should include bot opposition outside player squad");

  inventoryService.initializeRoom(started.room);
  const host = started.room.players.get(hostSession.playerId);
  assert(host?.inventory?.equipment.weapon?.instanceId === "contract-sword", "host equipment loadout should preserve weapon instance id");
  assert(host.inventory.items.some((entry) => entry.item.instanceId === "contract-idol"), "host inventory loadout should preserve backpack item instance id");

  const bot = [...started.room.players.values()].find((player) => player.isBot);
  assert(bot?.inventory?.equipment.weapon, "bot runtime inventory should receive default weapon");

  console.log("[room-loadout-contract] PASS lobby/match roster and loadout snapshot contract");
}

main();
