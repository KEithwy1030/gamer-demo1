import http from "node:http";
import cors from "cors";
import express from "express";
import {
  SocketEvent
} from "../../shared/dist/protocol/events.js";
import type {
  AttackRequestPayload,
  SkillCastPayload
} from "../../shared/dist/types/combat.js";
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  RoomErrorPayload,
  SetCapacityPayload
} from "../../shared/dist/types/lobby.js";
import type { PlayerInputMovePayload } from "../../shared/dist/types/game.js";
import { Server } from "socket.io";
import {
  resolvePlayerAttack,
  resolvePlayerSkillCast
} from "./combat/combat-service.js";
import { serverConfig } from "./config.js";
import {
  EXTRACT_CHANNEL_DURATION_MS,
  EXTRACT_CENTER_RADIUS,
  SERVER_MONSTER_SYNC_HZ
} from "./internal-constants.js";
import {
  advanceExtractState,
  initializeExtractState,
  interruptPlayerExtract,
  startPlayerExtract
} from "./extract/index.js";
import { InventoryService } from "./inventory/index.js";
import {
  handlePlayerAttack as handleMonsterPlayerAttack,
  handlePlayerSkill as handleMonsterPlayerSkill,
  listMonsterStates,
  spawnInitialMonsters,
  tickMonsters
} from "./monsters/monster-manager.js";
import { RoomStore } from "./room-store.js";
import { listChests, openChest, spawnChests } from "./chests/chest-manager.js";
import type {
  ChestOpenedPayload,
  GameSocket,
  MatchSettlementEnvelope,
  PlayerDropItemPayload,
  PlayerEquipItemPayload,
  PlayerOpenChestPayload,
  PlayerUnequipItemPayload,
  PlayerPickupPayload,
  PlayerUseItemPayload,
  RoomStartPayload,
  RuntimeContext,
  SocketSession
} from "./types.js";

const app = express();
app.use(
  cors({
    origin: serverConfig.corsOrigin,
    credentials: true
  })
);

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    rooms: "in-memory"
  });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: serverConfig.corsOrigin,
    credentials: true
  },
  transports: ["websocket", "polling"],
  pingInterval: serverConfig.socketPingIntervalMs,
  pingTimeout: serverConfig.socketPingTimeoutMs,
  connectTimeout: serverConfig.socketConnectTimeoutMs
});

const roomStore = new RoomStore();
const inventoryService = new InventoryService();
const CombatSocketEvent = {
  PlayerAttack: "player:attack",
  PlayerCastSkill: "player:castSkill",
  CombatResult: "combat:result",
  PlayerDied: "player:died"
} as const;

function buildSession(socket: GameSocket): SocketSession {
  const existing = socket.data.session;
  if (existing) {
    existing.socketId = socket.id;
    return existing;
  }

  const session: SocketSession = {
    socketId: socket.id,
    playerId: socket.id,
    profileId: socket.id,
    playerName: "Player"
  };
  socket.data.session = session;
  return session;
}

function emitRoomState(roomCode: string, context: RuntimeContext): void {
  io.to(roomCode).emit(SocketEvent.RoomState, context.roomState);
}

function emitRoomError(socket: GameSocket, message: string): void {
  const payload: RoomErrorPayload = { message };
  socket.emit(SocketEvent.RoomError, payload);
}

function emitDrops(roomCode: string): void {
  const context = roomStore.getRoomByCodeSnapshot(roomCode);
  io.to(roomCode).emit(SocketEvent.StateDrops, inventoryService.listDrops(context.room));
}

function emitSettlement(roomCode: string, payload: MatchSettlementEnvelope): void {
  io.to(roomCode).emit(SocketEvent.MatchSettlement, payload);
}

function applyExtractUpdate(roomCode: string): boolean {
  const context = roomStore.getRoomByCodeSnapshot(roomCode);
  const result = advanceExtractState(context.room);

  if (result.opened) {
    io.to(roomCode).emit(SocketEvent.ExtractOpened, result.opened);
  }

  for (const progress of result.progressEvents) {
    io.to(roomCode).emit(SocketEvent.ExtractProgress, progress);
  }

  for (const success of result.successEvents) {
    io.to(roomCode).emit(SocketEvent.ExtractSuccess, success);
  }

  for (const settlement of result.settlementEvents) {
    emitSettlement(roomCode, settlement);
  }

  return result.shouldCloseRoom;
}

function flushDeathDrops(roomCode: string): void {
  const context = roomStore.getRoomByCodeSnapshot(roomCode);
  let hasDropChanges = false;

  for (const player of context.room.players.values()) {
    if (!player.state || player.state.isAlive) {
      if (player.deathLootDropped) {
        player.deathLootDropped = false;
      }
      continue;
    }

    const result = inventoryService.handleDeath(context.room, player.id);
    if (!result) {
      continue;
    }

    hasDropChanges = true;
    io.to(player.socketId).emit(SocketEvent.InventoryUpdate, result.inventoryUpdate);
  }

  if (hasDropChanges) {
    io.to(roomCode).emit(SocketEvent.StateDrops, inventoryService.listDrops(context.room));
  }
}

function ensureSocketInRoom(socket: GameSocket, nextRoomCode: string): void {
  const session = buildSession(socket);
  if (session.roomCode && session.roomCode !== nextRoomCode) {
    socket.leave(session.roomCode);
  }

  socket.join(nextRoomCode);
}

function stopPlayerSyncLoop(roomCode: string): void {
  roomStore.setPlayerSyncInterval(roomCode, undefined);
}

function stopMatchTimerLoop(roomCode: string): void {
  roomStore.setMatchTimerInterval(roomCode, undefined);
}

function stopMonsterSyncLoop(roomCode: string): void {
  try {
    const context = roomStore.getRoomByCodeSnapshot(roomCode);
    if (context.room.monsterSyncInterval) {
      clearInterval(context.room.monsterSyncInterval);
      context.room.monsterSyncInterval = undefined;
    }
  } catch {
    // Room already disposed.
  }
}

function startPlayerSyncLoop(roomCode: string): void {
  const tickMs = Math.max(50, Math.floor(1000 / Math.max(serverConfig.playerSyncHz, 1)));
  const interval = setInterval(() => {
    try {
      const context = roomStore.advancePlayerMovement(roomCode, tickMs);
      if (context.room.status !== "started") {
        return;
      }

      flushDeathDrops(roomCode);
      const shouldCloseRoom = applyExtractUpdate(roomCode);
      io.to(roomCode).emit(
        SocketEvent.StatePlayers,
        roomStore.listPlayerStates(context.room)
      );

      if (shouldCloseRoom) {
        stopPlayerSyncLoop(roomCode);
        stopMatchTimerLoop(roomCode);
        stopMonsterSyncLoop(roomCode);
      }
    } catch {
      stopPlayerSyncLoop(roomCode);
    }
  }, tickMs);

  roomStore.setPlayerSyncInterval(roomCode, interval);
}

function startMatchTimerLoop(roomCode: string): void {
  const interval = setInterval(() => {
    try {
      const context = roomStore.getRoomByCodeSnapshot(roomCode);
      if (context.room.status !== "started") {
        return;
      }

      io.to(roomCode).emit(SocketEvent.MatchTimer, roomStore.getRemainingSeconds(roomCode));
    } catch {
      stopMatchTimerLoop(roomCode);
    }
  }, 1000);

  roomStore.setMatchTimerInterval(roomCode, interval);
}

function startMonsterSyncLoop(roomCode: string): void {
  stopMonsterSyncLoop(roomCode);

  const interval = setInterval(() => {
    try {
      const context = roomStore.getRoomByCodeSnapshot(roomCode);
      if (context.room.status !== "started") {
        return;
      }

      const result = tickMonsters(context);
      io.to(roomCode).emit(SocketEvent.StateMonsters, result.monsters);

      for (const event of result.combatEvents) {
        const interruption = interruptPlayerExtract(context.room, event.targetId, "damaged");
        if (interruption) {
          io.to(roomCode).emit(SocketEvent.ExtractProgress, interruption);
        }
        io.to(roomCode).emit(CombatSocketEvent.CombatResult, event);
        if (!event.targetAlive) {
          io.to(roomCode).emit(CombatSocketEvent.PlayerDied, {
            playerId: event.targetId,
            killerId: event.attackerId
          });
        }
      }

      if (result.playerStateChanged) {
        flushDeathDrops(roomCode);
        const shouldCloseRoom = applyExtractUpdate(roomCode);
        io.to(roomCode).emit(
          SocketEvent.StatePlayers,
          roomStore.listPlayerStates(context.room)
        );
        io.to(roomCode).emit(SocketEvent.StateDrops, inventoryService.listDrops(context.room));

        if (shouldCloseRoom) {
          stopPlayerSyncLoop(roomCode);
          stopMatchTimerLoop(roomCode);
          stopMonsterSyncLoop(roomCode);
        }
      }
    } catch {
      stopMonsterSyncLoop(roomCode);
    }
  }, Math.max(50, Math.floor(1000 / Math.max(SERVER_MONSTER_SYNC_HZ, 1))));

  const context = roomStore.getRoomByCodeSnapshot(roomCode);
  context.room.monsterSyncInterval = interval;
}

function attachRoomHandlers(socket: GameSocket): void {
  socket.on(SocketEvent.RoomCreate, (payload: CreateRoomPayload) => {
    try {
      const session = buildSession(socket);
      session.playerName = payload.playerName.trim() || "Player";
      const context = roomStore.createRoom(payload, session);
      ensureSocketInRoom(socket, context.room.code);
      emitRoomState(context.room.code, context);
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to create room.");
    }
  });

  socket.on(SocketEvent.RoomJoin, (payload: JoinRoomPayload) => {
    try {
      const session = buildSession(socket);
      session.playerName = payload.playerName.trim() || "Player";
      const context = roomStore.joinRoom(payload, session);
      ensureSocketInRoom(socket, context.room.code);
      emitRoomState(context.room.code, context);
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to join room.");
    }
  });

  socket.on(SocketEvent.RoomLeave, () => {
    try {
      const session = buildSession(socket);
      const previousRoomCode = session.roomCode;
      const context = roomStore.leaveCurrentRoom(session);
      if (previousRoomCode) {
        socket.leave(previousRoomCode);
      }
      if (context) {
        emitRoomState(context.room.code, context);
      } else if (previousRoomCode) {
        stopPlayerSyncLoop(previousRoomCode);
        stopMatchTimerLoop(previousRoomCode);
        stopMonsterSyncLoop(previousRoomCode);
      }
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to leave room.");
    }
  });

  socket.on(SocketEvent.RoomSetCapacity, (payload: SetCapacityPayload) => {
    try {
      const session = buildSession(socket);
      const context = roomStore.setCapacity(
        payload,
        session,
        serverConfig.minRoomCapacity,
        serverConfig.maxRoomCapacity
      );
      emitRoomState(context.room.code, context);
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to update room capacity.");
    }
  });

  socket.on(SocketEvent.RoomStart, (_payload?: RoomStartPayload) => {
    try {
      const session = buildSession(socket);
      const context = roomStore.startMatch(session);
      inventoryService.initializeRoom(context.room);
      initializeExtractState(context.room);
      spawnInitialMonsters(context.room);
      spawnChests(context.room);
      io.to(context.room.code).emit(SocketEvent.RoomState, context.roomState);
      startPlayerSyncLoop(context.room.code);
      startMatchTimerLoop(context.room.code);
      startMonsterSyncLoop(context.room.code);

      for (const player of context.room.players.values()) {
        const payload = context.matchPayloadByPlayerId.get(player.id);
        if (!payload) {
          continue;
        }

        io.to(player.socketId).emit(SocketEvent.MatchStarted, payload);
        io.to(player.socketId).emit(
          SocketEvent.InventoryUpdate,
          inventoryService.buildInventoryUpdate(player)
        );
      }

      io.to(context.room.code).emit(
        SocketEvent.StatePlayers,
        roomStore.listPlayerStates(context.room)
      );
      io.to(context.room.code).emit(
        SocketEvent.StateDrops,
        inventoryService.listDrops(context.room)
      );
      io.to(context.room.code).emit(
        SocketEvent.StateMonsters,
        listMonsterStates(context.room)
      );
      io.to(context.room.code).emit(
        SocketEvent.MatchTimer,
        roomStore.getRemainingSeconds(context.room.code)
      );
      io.to(context.room.code).emit(
        SocketEvent.ChestsInit,
        listChests(context.room)
      );
      if (context.room.extract?.isOpen) {
        io.to(context.room.code).emit(SocketEvent.ExtractOpened, {
          roomCode: context.room.code,
          x: context.room.extract.centerX,
          y: context.room.extract.centerY,
          radius: EXTRACT_CENTER_RADIUS,
          channelDurationMs: EXTRACT_CHANNEL_DURATION_MS
        });
      }
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to start match.");
    }
  });

  socket.on(SocketEvent.PlayerInputMove, (payload: PlayerInputMovePayload) => {
    try {
      const session = buildSession(socket);
      roomStore.setPlayerMoveInput(session, payload.direction);
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to move player.");
    }
  });

  socket.on(SocketEvent.PlayerPickup, (payload: PlayerPickupPayload) => {
    try {
      const session = buildSession(socket);
      if (!session.roomCode) {
        throw new Error("Player is not currently in a room.");
      }

      const context = roomStore.getRoomByCodeSnapshot(session.roomCode);
      const result = inventoryService.pickup(context.room, session.playerId, payload.dropId);
      io.to(socket.id).emit(SocketEvent.InventoryUpdate, result.inventoryUpdate);
      if (result.lootPicked) {
        io.to(session.roomCode).emit(SocketEvent.LootPicked, result.lootPicked);
      }
      io.to(session.roomCode).emit(SocketEvent.StateDrops, result.drops);
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to pick up loot.");
    }
  });

  socket.on(SocketEvent.PlayerEquipItem, (payload: PlayerEquipItemPayload) => {
    try {
      const session = buildSession(socket);
      if (!session.roomCode) {
        throw new Error("Player is not currently in a room.");
      }

      const context = roomStore.getRoomByCodeSnapshot(session.roomCode);
      const result = inventoryService.equip(context.room, session.playerId, payload.itemInstanceId);
      const updatedContext = roomStore.getRoomByCodeSnapshot(session.roomCode);
      io.to(socket.id).emit(SocketEvent.InventoryUpdate, result.inventoryUpdate);
      io.to(session.roomCode).emit(
        SocketEvent.StatePlayers,
        roomStore.listPlayerStates(updatedContext.room)
      );
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to equip item.");
    }
  });

  socket.on(SocketEvent.PlayerUnequipItem, (payload: PlayerUnequipItemPayload) => {
    try {
      const session = buildSession(socket);
      if (!session.roomCode) {
        throw new Error("Player is not currently in a room.");
      }

      const context = roomStore.getRoomByCodeSnapshot(session.roomCode);
      const result = inventoryService.unequip(context.room, session.playerId, payload.itemInstanceId);
      const updatedContext = roomStore.getRoomByCodeSnapshot(session.roomCode);
      io.to(socket.id).emit(SocketEvent.InventoryUpdate, result.inventoryUpdate);
      io.to(session.roomCode).emit(
        SocketEvent.StatePlayers,
        roomStore.listPlayerStates(updatedContext.room)
      );
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to unequip item.");
    }
  });

  socket.on(SocketEvent.PlayerDropItem, (payload: PlayerDropItemPayload) => {
    try {
      const session = buildSession(socket);
      if (!session.roomCode) {
        throw new Error("Player is not currently in a room.");
      }

      const context = roomStore.getRoomByCodeSnapshot(session.roomCode);
      const result = inventoryService.dropItem(context.room, session.playerId, payload.itemInstanceId);
      io.to(socket.id).emit(SocketEvent.InventoryUpdate, result.inventoryUpdate);
      io.to(session.roomCode).emit(SocketEvent.StateDrops, result.drops);
      io.to(session.roomCode).emit(SocketEvent.StatePlayers, roomStore.listPlayerStates(context.room));
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to drop item.");
    }
  });

  socket.on(SocketEvent.PlayerUseItem, (payload: PlayerUseItemPayload) => {
    try {
      const session = buildSession(socket);
      if (!session.roomCode) {
        throw new Error("Player is not currently in a room.");
      }

      const context = roomStore.getRoomByCodeSnapshot(session.roomCode);
      const result = inventoryService.useItem(context.room, session.playerId, payload.itemInstanceId);
      io.to(socket.id).emit(SocketEvent.InventoryUpdate, result.inventoryUpdate);
      io.to(session.roomCode).emit(SocketEvent.StatePlayers, roomStore.listPlayerStates(context.room));
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to use item.");
    }
  });

  socket.on(CombatSocketEvent.PlayerAttack, (payload: AttackRequestPayload) => {
    try {
      const session = buildSession(socket);
      const roomCode = session.roomCode;
      if (!roomCode) {
        throw new Error("Player is not currently in a room.");
      }

      const context = roomStore.getRoomByCodeSnapshot(roomCode);
      const resolution = resolvePlayerAttack(context.room, session.playerId, payload);
      const monsterOutcome = handleMonsterPlayerAttack(context, session.playerId, payload);

      // Broadcast the attack event to all clients in the room to trigger VFX
      io.to(roomCode).emit(CombatSocketEvent.PlayerAttack, {
        playerId: session.playerId,
        attackId: payload.attackId
      });

      for (const event of resolution.combatEvents) {
        const interruption = interruptPlayerExtract(context.room, event.targetId, "damaged");
        if (interruption) {
          io.to(roomCode).emit(SocketEvent.ExtractProgress, interruption);
        }
        io.to(roomCode).emit(CombatSocketEvent.CombatResult, event);
      }

      for (const death of resolution.deaths) {
        io.to(roomCode).emit(CombatSocketEvent.PlayerDied, death);
      }

      if (monsterOutcome?.combat) {
        io.to(roomCode).emit(CombatSocketEvent.CombatResult, monsterOutcome.combat);
      }

      if (monsterOutcome) {
        io.to(roomCode).emit(SocketEvent.StateMonsters, monsterOutcome.monsters);
        if (monsterOutcome.spawnedDrops.length > 0) {
          io.to(roomCode).emit(SocketEvent.LootSpawned, monsterOutcome.spawnedDrops);
        }
      }

      flushDeathDrops(roomCode);
      emitDrops(roomCode);
      const shouldCloseRoom = applyExtractUpdate(roomCode);
      io.to(roomCode).emit(
        SocketEvent.StatePlayers,
        roomStore.listPlayerStates(context.room)
      );

      if (shouldCloseRoom) {
        stopPlayerSyncLoop(roomCode);
        stopMatchTimerLoop(roomCode);
        stopMonsterSyncLoop(roomCode);
      }
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to process attack.");
    }
  });

  socket.on(CombatSocketEvent.PlayerCastSkill, (payload: SkillCastPayload) => {
    try {
      const session = buildSession(socket);
      const roomCode = session.roomCode;
      if (!roomCode) {
        throw new Error("Player is not currently in a room.");
      }

      const context = roomStore.getRoomByCodeSnapshot(roomCode);
      const skillOriginState = context.room.players.get(session.playerId)?.state
        ? {
          x: context.room.players.get(session.playerId)!.state!.x,
          y: context.room.players.get(session.playerId)!.state!.y,
          direction: { ...context.room.players.get(session.playerId)!.state!.direction }
        }
        : undefined;
      const resolution = resolvePlayerSkillCast(context.room, session.playerId, payload);
      const monsterOutcome = handleMonsterPlayerSkill(context, session.playerId, payload, skillOriginState);

      for (const event of resolution.combatEvents) {
        const interruption = interruptPlayerExtract(context.room, event.targetId, "damaged");
        if (interruption) {
          io.to(roomCode).emit(SocketEvent.ExtractProgress, interruption);
        }
        io.to(roomCode).emit(CombatSocketEvent.CombatResult, event);
      }

      for (const death of resolution.deaths) {
        io.to(roomCode).emit(CombatSocketEvent.PlayerDied, death);
      }

      if (monsterOutcome) {
        for (const event of monsterOutcome.combatEvents) {
          io.to(roomCode).emit(CombatSocketEvent.CombatResult, event);
        }
        io.to(roomCode).emit(SocketEvent.StateMonsters, monsterOutcome.monsters);
        if (monsterOutcome.spawnedDrops.length > 0) {
          io.to(roomCode).emit(SocketEvent.LootSpawned, monsterOutcome.spawnedDrops);
        }
      }

      flushDeathDrops(roomCode);
      emitDrops(roomCode);
      const shouldCloseRoom = applyExtractUpdate(roomCode);
      io.to(roomCode).emit(
        SocketEvent.StatePlayers,
        roomStore.listPlayerStates(context.room)
      );

      if (shouldCloseRoom) {
        stopPlayerSyncLoop(roomCode);
        stopMatchTimerLoop(roomCode);
        stopMonsterSyncLoop(roomCode);
      }
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to cast skill.");
    }
  });

  socket.on(SocketEvent.PlayerStartExtract, () => {
    try {
      const session = buildSession(socket);
      const roomCode = session.roomCode;
      if (!roomCode) {
        throw new Error("Player is not currently in a room.");
      }

      const context = roomStore.getRoomByCodeSnapshot(roomCode);
      const result = startPlayerExtract(context.room, session.playerId);

      if (result.opened) {
        io.to(roomCode).emit(SocketEvent.ExtractOpened, result.opened);
      }

      for (const progress of result.progressEvents) {
        io.to(roomCode).emit(SocketEvent.ExtractProgress, progress);
      }
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to start extract.");
    }
  });

  socket.on(SocketEvent.PlayerOpenChest, (payload: PlayerOpenChestPayload) => {
    try {
      const session = buildSession(socket);
      const roomCode = session.roomCode;
      if (!roomCode) {
        throw new Error("Player is not currently in a room.");
      }

      const context = roomStore.getRoomByCodeSnapshot(roomCode);
      const player = context.room.players.get(session.playerId);
      if (!player?.state) {
        throw new Error("Player is not active in the current match.");
      }

      if (!player.state.isAlive) {
        throw new Error("Dead players cannot open chests.");
      }

      const { loot } = openChest(
        context.room,
        session.playerId,
        payload.chestId,
        player.state.x,
        player.state.y
      );

      const inventoryUpdate = inventoryService.addItemsToInventory(context.room, session.playerId, loot);

      const chestOpenedPayload: ChestOpenedPayload = {
        chestId: payload.chestId,
        playerId: session.playerId,
        loot
      };

      io.to(roomCode).emit(SocketEvent.ChestOpened, chestOpenedPayload);
      io.to(socket.id).emit(SocketEvent.InventoryUpdate, inventoryUpdate);
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to open chest.");
    }
  });

  socket.on("disconnect", () => {
    const session = buildSession(socket);
    const previousRoomCode = session.roomCode;
    const context = roomStore.leaveCurrentRoom(session);
    if (previousRoomCode && context) {
      emitRoomState(context.room.code, context);
    } else if (previousRoomCode) {
      stopPlayerSyncLoop(previousRoomCode);
      stopMatchTimerLoop(previousRoomCode);
      stopMonsterSyncLoop(previousRoomCode);
    }
  });
}

io.on("connection", (socket) => {
  const gameSocket = socket as GameSocket;
  buildSession(gameSocket);
  attachRoomHandlers(gameSocket);
});

httpServer.listen(serverConfig.port, serverConfig.host, () => {
  console.log(
    `[server] listening on http://${serverConfig.host}:${serverConfig.port}`
  );
});
