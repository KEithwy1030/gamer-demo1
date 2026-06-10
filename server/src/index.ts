import "dotenv/config";
import http from "node:http";
import cors from "cors";
import express from "express";
import type {
  AttackRequestPayload,
  CombatEventPayload,
  CreateMarketListingPayload,
  CreateRoomPayload,
  JoinRoomPayload,
  MatchStartedPayload,
  ProfileMovePayload,
  ProfilePatchPayload,
  PlayerInputMovePayload,
  RoomErrorPayload,
  RoomStartPayload,
  SetCapacityPayload,
  SystemSellMarketPayload,
  UpdateMarketListingPayload,
  SkillCastPayload
} from "@gamer/shared";
import {
  SocketEvent
} from "@gamer/shared";
import { Server } from "socket.io";
import {
  resolvePlayerAttack,
  resolvePlayerSkillCast,
  tickPlayerCombatEffects
} from "./combat/combat-service.js";
import { applyEnvironmentalDamage } from "./combat/player-effects.js";
import { tickBots, type BotTickResult } from "./bots/bot-manager.js";
import { serverConfig } from "./config.js";
import { getCorpseFogState } from "./corpse-fog.js";
import {
  SERVER_MONSTER_SYNC_HZ
} from "./internal-constants.js";
import {
  advanceExtractState,
  initializeExtractState,
  startPlayerExtract
} from "./extract/index.js";
import { processExtractInterruptsFromEvents } from "./extract/listeners.js";
import { getRiverHazardAtPoint, isPointInsideSafeCrossing } from "./match-layout.js";
import { InventoryService } from "./inventory/index.js";
import {
  handlePlayerAttack as handleMonsterPlayerAttack,
  handlePlayerSkill as handleMonsterPlayerSkill,
  listMonsterStates,
  spawnInitialMonsters,
  tickMonsters
} from "./monsters/monster-manager.js";
import { RoomStore } from "./room-store.js";
import { MarketStore } from "./market-store.js";
import { ProfileStore } from "./profile-store.js";
import {
  listChests,
  spawnChests,
  startChestOpening,
  tickChestOpenings
} from "./chests/chest-manager.js";
import { processChestInterruptsFromEvents, processChestPhaseEvents } from "./chests/listeners.js";
import { DevLogService } from "./dev/devLog.js";
import { createDevLogRouter } from "./dev/devLogRoutes.js";
import { applyDevRoomPreset, resolveEnabledDevRoomPreset } from "./dev-test-hooks.js";
import { emitDomain, flushEvents } from "./event-bus/index.js";
import type {
  ChestOpenedPayload,
  GameSocket,
  MatchSettlementEnvelope,
  PlayerDropItemPayload,
  PlayerEquipItemPayload,
  PlayerMoveItemPayload,
  PlayerOpenChestPayload,
  PlayerUnequipItemPayload,
  PlayerPickupPayload,
  PlayerUseItemPayload,
  RuntimeContext,
  RuntimePlayer,
  RuntimeRoom,
  SocketSession
} from "./types.js";

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(
  cors({
    origin: serverConfig.corsOrigin,
    credentials: true
  })
);

const devLogService = new DevLogService({
  enabled: serverConfig.devLogEnabled,
  retentionHours: serverConfig.devLogRetentionHours,
  maxTotalMb: serverConfig.devLogMaxTotalMb
});

if (serverConfig.devLogEnabled) {
  app.use("/__devlog", createDevLogRouter(devLogService));
  devLogService.startRetentionSweepLoop();
}

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    rooms: "in-memory"
  });
});

app.get("/profiles/:profileId", (request, response) => {
  try {
    response.json(profileStore.get(request.params.profileId));
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "Failed to load profile." });
  }
});

app.patch("/profiles/:profileId", (request, response) => {
  try {
    response.json(profileStore.patch(request.params.profileId, request.body as ProfilePatchPayload));
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "Failed to patch profile." });
  }
});

app.post("/profiles/:profileId/items/move", (request, response) => {
  try {
    response.json(profileStore.move(request.params.profileId, request.body as ProfileMovePayload));
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "Failed to move profile item." });
  }
});

app.post("/profiles/:profileId/backpack-upgrade", (request, response) => {
  try {
    response.json(profileStore.upgradeBackpack(request.params.profileId));
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "Failed to upgrade backpack." });
  }
});

app.get("/market/listings", (request, response) => {
  const playerId = String(request.query.playerId ?? "").trim();
  if (!playerId) {
    response.status(400).json({ message: "playerId is required." });
    return;
  }

  response.json({ listings: marketStore.list(playerId) });
});

app.post("/market/settle", (request, response) => {
  try {
    const playerId = String(request.body?.playerId ?? "").trim();
    response.status(200).json(marketStore.settle(playerId));
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "Failed to settle listings." });
  }
});

app.post("/market/listings", (request, response) => {
  try {
    const payload = request.body as CreateMarketListingPayload;
    response.status(201).json(marketStore.create(payload));
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "Failed to create listing." });
  }
});

app.post("/market/system-sell", (request, response) => {
  try {
    const payload = request.body as SystemSellMarketPayload;
    response.status(200).json(marketStore.sellToSystem(payload));
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "Failed to sell item." });
  }
});

app.patch("/market/listings/:listingId", (request, response) => {
  try {
    const payload = request.body as UpdateMarketListingPayload;
    response.json(marketStore.update(request.params.listingId, payload));
  } catch (error) {
    response.status(404).json({ message: error instanceof Error ? error.message : "Failed to update listing." });
  }
});

app.delete("/market/listings/:listingId", (request, response) => {
  try {
    const playerId = String(request.query.playerId ?? "").trim();
    marketStore.cancel(playerId, request.params.listingId);
    response.status(204).end();
  } catch (error) {
    response.status(404).json({ message: error instanceof Error ? error.message : "Failed to cancel listing." });
  }
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

const profileStore = new ProfileStore();
const roomStore = new RoomStore();
const inventoryService = new InventoryService();
const marketStore = new MarketStore(profileStore);
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
  emitStateDrops(roomCode, context.room);
}

function emitInventoryUpdate(socketId: string, payload: ReturnType<InventoryService["buildInventoryUpdate"]>): void {
  io.to(socketId).emit(SocketEvent.InventoryUpdate, payload);
}

function emitStateDrops(roomCode: string, room: RuntimeRoom): void {
  io.to(roomCode).emit(SocketEvent.StateDrops, inventoryService.listDrops(room));
}

function emitStatePlayers(roomCode: string, room: RuntimeRoom): void {
  io.to(roomCode).emit(SocketEvent.StatePlayers, roomStore.listPlayerStates(room));
}

function emitStateMonsters(roomCode: string, monsters: ReturnType<typeof listMonsterStates>): void {
  io.to(roomCode).emit(SocketEvent.StateMonsters, monsters);
}

function emitMatchTimer(roomCode: string): void {
  io.to(roomCode).emit(SocketEvent.MatchTimer, roomStore.getRemainingSeconds(roomCode));
}

function emitMatchStarted(socketId: string, payload: MatchStartedPayload): void {
  io.to(socketId).emit(SocketEvent.MatchStarted, payload);
}

function emitChestsInit(roomCode: string, chests: ReturnType<typeof listChests>): void {
  io.to(roomCode).emit(SocketEvent.ChestsInit, chests);
}

function emitPlayerAttack(roomCode: string, payload: { playerId: string; attackId: string; targetId?: string }): void {
  io.to(roomCode).emit(CombatSocketEvent.PlayerAttack, payload);
}

function emitMusicMode(roomCode: string, mode: "lobby" | "calm" | "skirmish" | "danger" | "extract_pressure" | "death" | "victory"): void {
  const context = roomStore.getRoomByCodeSnapshot(roomCode);
  emitDomain(context.room, {
    type: "MusicModeChanged",
    payload: {
      mode,
      ts: Date.now()
    }
  });
  flushRoomEvents(context.room);
}

function emitSettlement(roomCode: string, payload: MatchSettlementEnvelope): void {
  const context = roomStore.getRoomByCodeSnapshot(roomCode);
  const player = context.room.players.get(payload.playerId);
  persistSettlement(player, payload.settlement);
  if (player?.socketId) {
    io.to(player.socketId).emit(SocketEvent.MatchSettlement, payload);
    return;
  }

  io.to(roomCode).emit(SocketEvent.MatchSettlement, payload);
}

function persistSettlement(
  player: RuntimePlayer | undefined,
  settlement: MatchSettlementEnvelope["settlement"]
): void {
  if (!player || player.isBot || !player.profileId || player.profileSettlementApplied) {
    return;
  }

  profileStore.settleRun(player.profileId, settlement, player.inventory);
  player.profileSettlementApplied = true;
}

function applyProfileLoadouts(room: RuntimeRoom): void {
  for (const player of room.players.values()) {
    if (player.isBot || !player.profileId) {
      continue;
    }
    player.pendingLoadout = profileStore.buildLoadout(player.profileId, player.name);
  }
}

function emitBotTickResult(roomCode: string, result: BotTickResult): void {
  const context = roomStore.getRoomByCodeSnapshot(roomCode);

  for (const death of result.playerDeaths) {
    emitPlayerDiedDomain(context.room, death);
  }
}

function flushRoomEvents(room: RuntimeRoom): void {
  processChestPhaseEvents(room);
  processExtractInterruptsFromEvents(room);
  processChestInterruptsFromEvents(room);
  flushEvents(room, io);
}

function emitPlayerDiedDomain(
  room: RuntimeRoom,
  death: { playerId: string; killerId?: string },
  fallbackReason = "killed"
): void {
  const player = room.players.get(death.playerId);
  emitDomain(room, {
    type: "PlayerDied",
    payload: {
      playerId: death.playerId,
      killerId: death.killerId,
      reason: player?.deathReason ?? fallbackReason
    }
  });
}

function emitPlayerDamagedDomain(room: RuntimeRoom, event: CombatEventPayload): void {
  if (event.amount <= 0) {
    return;
  }

  emitDomain(room, {
    type: "PlayerDamaged",
    payload: {
      attackerId: event.attackerId,
      targetId: event.targetId,
      amount: event.amount,
      critMultiplier: event.critMultiplier,
      damageType: event.damageType,
      interruptsExtract: event.interruptsExtract ?? true
    }
  });
}

function applyRiverHazardTick(roomCode: string, now = Date.now()): void {
  const context = roomStore.getRoomByCodeSnapshot(roomCode);
  const layout = context.room.matchLayout;
  if (!layout) {
    return;
  }

  const combatEvents: CombatEventPayload[] = [];
  const deaths: Array<{ playerId: string; killerId: string; roomCode: string; timestamp: number }> = [];

  for (const player of context.room.players.values()) {
    const state = player.state;
    if (!state?.isAlive) {
      continue;
    }

    const inCrossing = isPointInsideSafeCrossing(layout, state.x, state.y);
    const hazard = getRiverHazardAtPoint(layout, state.x, state.y);

    if (!hazard || inCrossing) {
      continue;
    }

    const lastDamageAt = player.lastRiverDamageAt ?? 0;
    if (now - lastDamageAt < hazard.tickIntervalMs) {
      continue;
    }

    player.lastRiverDamageAt = now;
    const event = applyEnvironmentalDamage(player, hazard.damagePerTick, hazard.hazardId, now);
    if (!event) {
      continue;
    }

    combatEvents.push(event);
    if (!event.targetAlive) {
      player.deathReason = "riverHazard";
      deaths.push({
        playerId: player.id,
        killerId: hazard.hazardId,
        roomCode,
        timestamp: now
      });
    }
  }

  for (const event of combatEvents) {
    emitPlayerDamagedDomain(context.room, event);
  }

  for (const death of deaths) {
    emitPlayerDiedDomain(context.room, death, "riverHazard");
  }
}

function applyCorpseFogTick(roomCode: string, now = Date.now()): Array<{ playerId: string; killerId: string; roomCode: string; timestamp: number }> {
  const context = roomStore.getRoomByCodeSnapshot(roomCode);
  const room = context.room;
  if (!room.startedAt) {
    return [];
  }

  const fogState = getCorpseFogState(room.startedAt, now);
  if (fogState.damagePerSecond <= 0) {
    return [];
  }

  const deaths: Array<{ playerId: string; killerId: string; roomCode: string; timestamp: number }> = [];
  const combatEvents: CombatEventPayload[] = [];
  for (const player of room.players.values()) {
    if (!player.state?.isAlive || player.extract?.settledAt) {
      continue;
    }

    const lastDamageAt = player.lastCorpseFogDamageAt ?? 0;
    if (now - lastDamageAt < 1000) {
      continue;
    }

    player.lastCorpseFogDamageAt = now;
    const event = applyEnvironmentalDamage(player, fogState.damagePerSecond, "corpse_fog", now);
    if (event) {
      combatEvents.push(event);
    }
    if (!player.state.isAlive) {
      player.deathReason = "corpseFog";
      deaths.push({
        playerId: player.id,
        killerId: "corpse_fog",
        roomCode,
        timestamp: now
      });
    }
  }

  for (const event of combatEvents) {
    emitPlayerDamagedDomain(room, event);
  }

  return deaths;
}

function applyExtractUpdate(roomCode: string): boolean {
  const context = roomStore.getRoomByCodeSnapshot(roomCode);
  const result = advanceExtractState(context.room);

  for (const success of result.successEvents) {
    void success;
    emitMusicMode(roomCode, "victory");
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
    emitInventoryUpdate(player.socketId, result.inventoryUpdate);
  }

  if (hasDropChanges) {
    emitStateDrops(roomCode, context.room);
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

      applyRiverHazardTick(roomCode);
      const fogDeaths = applyCorpseFogTick(roomCode);
      for (const death of fogDeaths) {
        emitPlayerDiedDomain(context.room, death, "corpseFog");
      }
      const effectResult = tickPlayerCombatEffects(context.room);
      for (const death of effectResult.deaths) {
        emitPlayerDiedDomain(context.room, death);
      }
      const botResult = tickBots(context);
      emitBotTickResult(roomCode, botResult);
      const chestTick = tickChestOpenings(context.room);
      for (const playerId of chestTick.inventoryUpdatedPlayerIds) {
        const chestPlayer = context.room.players.get(playerId);
        if (chestPlayer?.socketId) {
          emitInventoryUpdate(chestPlayer.socketId, inventoryService.buildInventoryUpdate(chestPlayer));
        }
      }
      if (chestTick.dropsChanged || chestTick.openedEvents.length > 0 || botResult.chestOpenedEvents.length > 0 || botResult.lootPickedEvents.length > 0) {
        emitStateDrops(roomCode, context.room);
      }
      if (botResult.monsterStateChanged) {
        emitStateMonsters(roomCode, listMonsterStates(context.room));
        emitStateDrops(roomCode, context.room);
      }
      flushDeathDrops(roomCode);
      const shouldCloseRoom = applyExtractUpdate(roomCode);
      emitStatePlayers(roomCode, context.room);
      flushRoomEvents(context.room);

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

      emitMatchTimer(roomCode);
      flushRoomEvents(context.room);
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
      emitStateMonsters(roomCode, result.monsters);

      for (const event of result.combatEvents) {
        if (!event.targetAlive) {
          emitPlayerDiedDomain(context.room, {
            playerId: event.targetId,
            killerId: event.attackerId
          });
          emitMusicMode(roomCode, "death");
          setTimeout(() => {
            try {
              emitMusicMode(roomCode, "calm");
            } catch {
              // Room may already be disposed.
            }
          }, 2000);
        }
      }

      if (result.playerStateChanged) {
        flushDeathDrops(roomCode);
        const shouldCloseRoom = applyExtractUpdate(roomCode);
        emitStatePlayers(roomCode, context.room);
        emitStateDrops(roomCode, context.room);

        if (shouldCloseRoom) {
          stopPlayerSyncLoop(roomCode);
          stopMatchTimerLoop(roomCode);
          stopMonsterSyncLoop(roomCode);
        }
      }
      flushRoomEvents(context.room);
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
      session.profileId = payload.profileId;
      const context = roomStore.createRoom(payload, session);
      ensureSocketInRoom(socket, context.room.code);
      emitRoomState(context.room.code, context);
      emitMusicMode(context.room.code, "lobby");
      flushRoomEvents(context.room);
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to create room.");
    }
  });

  socket.on(SocketEvent.RoomJoin, (payload: JoinRoomPayload) => {
    try {
      const session = buildSession(socket);
      session.playerName = payload.playerName.trim() || "Player";
      session.profileId = payload.profileId;
      const context = roomStore.joinRoom(payload, session);
      ensureSocketInRoom(socket, context.room.code);
      emitRoomState(context.room.code, context);
      emitMusicMode(context.room.code, "lobby");
      flushRoomEvents(context.room);
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
        flushRoomEvents(context.room);
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
      flushRoomEvents(context.room);
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to update room capacity.");
    }
  });

  socket.on(SocketEvent.RoomStart, (payload?: RoomStartPayload) => {
    try {
      const session = buildSession(socket);
      if (payload?.profileId) {
        session.profileId = payload.profileId;
      }
      const context = roomStore.startMatch(session, payload);
      applyProfileLoadouts(context.room);
      inventoryService.initializeRoom(context.room);
      initializeExtractState(context.room);
      spawnInitialMonsters(context.room);
      spawnChests(context.room);
      const devRoomPreset = resolveEnabledDevRoomPreset(payload?.devRoomPreset);
      if (devRoomPreset) {
        applyDevRoomPreset(context.room, devRoomPreset);
        context.matchPayloadByPlayerId = roomStore.buildMatchPayloadByPlayerId(context.room);
      }
      io.to(context.room.code).emit(SocketEvent.RoomState, context.roomState);
      startPlayerSyncLoop(context.room.code);
      startMatchTimerLoop(context.room.code);
      startMonsterSyncLoop(context.room.code);

      for (const player of context.room.players.values()) {
        const payload = context.matchPayloadByPlayerId.get(player.id);
        if (!payload) {
          continue;
        }

        emitMatchStarted(player.socketId, payload);
        emitInventoryUpdate(player.socketId, inventoryService.buildInventoryUpdate(player));
      }

      emitStatePlayers(context.room.code, context.room);
      emitStateDrops(context.room.code, context.room);
      emitStateMonsters(context.room.code, listMonsterStates(context.room));
      emitMatchTimer(context.room.code);
      const chests = listChests(context.room);
      emitChestsInit(context.room.code, chests);
      const openExtractZoneIds = (context.room.extract?.zones ?? [])
        .filter((zone) => zone.isOpen)
        .map((zone) => zone.zoneId);
      if (openExtractZoneIds.length > 0) {
        emitDomain(context.room, {
          type: "ExtractOpened",
          payload: {
            zoneIds: openExtractZoneIds,
            pressure: context.room.extract?.activePressure ? "active" : "open"
          }
        });
      }
      flushRoomEvents(context.room);
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to start match.");
    }
  });

  socket.on(SocketEvent.PlayerInputMove, (payload: PlayerInputMovePayload) => {
    try {
      const session = buildSession(socket);
      roomStore.setPlayerMoveInput(session, payload.direction);
      if (session.roomCode) {
        flushRoomEvents(roomStore.getRoomByCodeSnapshot(session.roomCode).room);
      }
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
      emitInventoryUpdate(socket.id, result.inventoryUpdate);
      emitStateDrops(session.roomCode, context.room);
      flushRoomEvents(context.room);
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
      emitInventoryUpdate(socket.id, result.inventoryUpdate);
      emitStatePlayers(session.roomCode, updatedContext.room);
      flushRoomEvents(updatedContext.room);
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
      emitInventoryUpdate(socket.id, result.inventoryUpdate);
      emitStatePlayers(session.roomCode, updatedContext.room);
      flushRoomEvents(updatedContext.room);
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
      emitInventoryUpdate(socket.id, result.inventoryUpdate);
      emitStateDrops(session.roomCode, context.room);
      emitStatePlayers(session.roomCode, context.room);
      flushRoomEvents(context.room);
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to drop item.");
    }
  });

  socket.on(SocketEvent.PlayerMoveItem, (payload: PlayerMoveItemPayload) => {
    try {
      const session = buildSession(socket);
      if (!session.roomCode) {
        throw new Error("Player is not currently in a room.");
      }

      const context = roomStore.getRoomByCodeSnapshot(session.roomCode);
      const result = inventoryService.move(context.room, session.playerId, payload);
      const updatedContext = roomStore.getRoomByCodeSnapshot(session.roomCode);
      emitInventoryUpdate(socket.id, result.inventoryUpdate);
      emitStatePlayers(session.roomCode, updatedContext.room);
      flushRoomEvents(updatedContext.room);
    } catch (error) {
      emitRoomError(socket, error instanceof Error ? error.message : "Failed to move item.");
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
      emitInventoryUpdate(socket.id, result.inventoryUpdate);
      emitStatePlayers(session.roomCode, context.room);
      flushRoomEvents(context.room);
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

      emitPlayerAttack(roomCode, {
        playerId: session.playerId,
        attackId: payload.attackId,
        targetId: payload.targetId
      });

      for (const death of resolution.deaths) {
        emitPlayerDiedDomain(context.room, death);
      }

      if (monsterOutcome) {
        emitStateMonsters(roomCode, monsterOutcome.monsters);
      }

      flushDeathDrops(roomCode);
      emitDrops(roomCode);
      const shouldCloseRoom = applyExtractUpdate(roomCode);
      emitStatePlayers(roomCode, context.room);
      flushRoomEvents(context.room);

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

      for (const death of resolution.deaths) {
        emitPlayerDiedDomain(context.room, death);
      }

      if (monsterOutcome) {
        emitStateMonsters(roomCode, monsterOutcome.monsters);
      }

      flushDeathDrops(roomCode);
      emitDrops(roomCode);
      const shouldCloseRoom = applyExtractUpdate(roomCode);
      emitStatePlayers(roomCode, context.room);
      flushRoomEvents(context.room);

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
      startPlayerExtract(context.room, session.playerId);
      flushRoomEvents(context.room);
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

      const progress = startChestOpening(
        context.room,
        session.playerId,
        payload.chestId
      );
      void progress;
      flushRoomEvents(context.room);
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
      flushRoomEvents(context.room);
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
