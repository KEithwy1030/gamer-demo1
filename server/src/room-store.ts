import type {
  CreateRoomPayload,
  JoinRoomPayload,
  LobbyPlayer,
  MatchLayout,
  MatchStartedPayload,
  PlayerState,
  RoomSummary,
  SetCapacityPayload,
  SquadId,
  Vector2
} from "@gamer/shared";
import {
  DEFAULT_ROOM_CAPACITY,
  DEFAULT_WEAPON_TYPE,
  MATCH_DURATION_SEC,
  MATCH_MAP_HEIGHT,
  MATCH_MAP_WIDTH,
  PLAYER_BASE_HP,
  PLAYER_BASE_MOVE_SPEED,
  SQUAD_COUNT,
  SQUAD_SIZE
} from "./internal-constants.js";
import { setPlayerBaseStats, syncPlayerCombatState } from "./combat/player-effects.js";
import { buildMatchLayout, getSquadSpawnZone } from "./match-layout.js";
import type {
  MatchStartContext,
  RoomStateEnvelope,
  RuntimeContext,
  RuntimePlayer,
  RuntimeRoom,
  SocketSession
} from "./types.js";

function sanitizePlayerName(playerName: string): string {
  const trimmed = playerName.trim();
  return trimmed === "" ? "Player" : trimmed.slice(0, 24);
}

const PLACE_WORDS = [
  "SOUTH",
  "NORTH",
  "WEST",
  "ASH",
  "OLD",
  "BRIDGE",
  "WILD",
  "MIST",
  "STONE",
  "LONG"
] as const;

const BOT_SQUADS = ["bot_alpha", "bot_beta", "bot_gamma"] as const satisfies readonly SquadId[];
type BotSquadId = typeof BOT_SQUADS[number];
const ACTIVE_MATCH_SQUADS = ["player", "bot_alpha"] as const satisfies readonly SquadId[];
const ACTIVE_BOT_SQUADS = ["bot_alpha"] as const satisfies readonly BotSquadId[];
const BOT_NAMES: Record<BotSquadId, string[]> = {
  bot_alpha: ["Alpha-01", "Alpha-02", "Alpha-03", "Alpha-04", "Alpha-05"],
  bot_beta: ["Beta-01", "Beta-02", "Beta-03", "Beta-04"],
  bot_gamma: ["Gamma-01", "Gamma-02", "Gamma-03", "Gamma-04"]
};
const FORMATION_OFFSETS: Array<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: -170, y: 120 },
  { x: 170, y: 120 },
  { x: 0, y: 240 },
  { x: -170, y: 360 },
  { x: 170, y: 360 }
];

function normalizeRoomCode(code: string): string {
  return code
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.\uFF0E\u3002\u30FB\u8DEF]/g, "\u8DEF")
    .toUpperCase();
}

function cloneDirection(direction?: Vector2): Vector2 {
  return direction ? { x: direction.x, y: direction.y } : { x: 0, y: 1 };
}

function buildLobbyPlayer(player: RuntimePlayer): LobbyPlayer {
  return {
    id: player.id,
    name: player.name,
    isHost: player.isHost,
    ready: player.ready,
    socketId: player.socketId,
    squadId: player.squadId,
    isBot: player.isBot
  };
}

function buildPlayerState(player: RuntimePlayer): PlayerState {
  if (!player.state) {
    throw new Error(`Missing runtime state for player ${player.id}`);
  }

  syncPlayerCombatState(player);

    return {
      ...player.state,
      direction: cloneDirection(player.state.direction),
      statusEffects: player.state.statusEffects.map((effect) => ({ ...effect })),
      killsPlayers: player.combat?.killsPlayers ?? player.state.killsPlayers,
      killsMonsters: player.state.killsMonsters,
      squadId: player.squadId,
    squadType: player.squadType,
    isBot: player.isBot
  };
}

export class RoomStore {
  private readonly rooms = new Map<string, RuntimeRoom>();

  createRoom(payload: CreateRoomPayload, session: SocketSession): RuntimeContext {
    const code = this.generateRoomCode();
    const roomKey = normalizeRoomCode(code);
    const room: RuntimeRoom = {
      code,
      hostPlayerId: session.playerId,
      capacity: DEFAULT_ROOM_CAPACITY,
      status: "waiting",
      createdAt: Date.now(),
      botDifficulty: payload.botDifficulty ?? "normal",
      players: new Map()
    };

    room.players.set(session.playerId, {
      id: session.playerId,
      socketId: session.socketId,
      name: sanitizePlayerName(payload.playerName),
      isHost: true,
      ready: true,
      squadId: "player",
      squadType: "human",
      isBot: false,
      joinedAt: Date.now(),
      pendingLoadout: payload.loadout
    });

    this.rooms.set(roomKey, room);
    session.roomCode = code;
    return this.toRuntimeContext(room);
  }

  joinRoom(payload: JoinRoomPayload, session: SocketSession): RuntimeContext {
    const room = this.getRoomByCode(payload.code);

    if (room.status !== "waiting") {
      throw new Error("Match already started.");
    }

    if (room.players.size >= room.capacity) {
      throw new Error("Room is full.");
    }

    if (room.players.has(session.playerId)) {
      session.roomCode = room.code;
      return this.toRuntimeContext(room);
    }

    room.players.set(session.playerId, {
      id: session.playerId,
      socketId: session.socketId,
      name: sanitizePlayerName(payload.playerName),
      isHost: false,
      ready: true,
      squadId: "player",
      squadType: "human",
      isBot: false,
      joinedAt: Date.now(),
      pendingLoadout: payload.loadout
    });

    session.roomCode = room.code;
    return this.toRuntimeContext(room);
  }

  leaveCurrentRoom(session: SocketSession): RuntimeContext | undefined {
    const room = this.getRoomBySession(session);
    if (!room) {
      return undefined;
    }

    room.players.delete(session.playerId);
    session.roomCode = undefined;

    if (room.players.size === 0) {
      this.disposeRoom(room.code);
      return undefined;
    }

    if (room.hostPlayerId === session.playerId) {
      const nextHost = room.players.values().next().value as RuntimePlayer;
      room.hostPlayerId = nextHost.id;
      nextHost.isHost = true;
    }

    return this.toRuntimeContext(room);
  }

  setCapacity(payload: SetCapacityPayload, session: SocketSession, min: number, max: number): RuntimeContext {
    const room = this.getRoomForHost(session, payload.code);

    if (room.status !== "waiting") {
      throw new Error("Cannot update capacity after match start.");
    }

    const nextCapacity = Math.max(min, Math.min(max, payload.capacity));
    if (nextCapacity < room.players.size) {
      throw new Error("Capacity cannot be below current player count.");
    }

    room.capacity = nextCapacity;
    return this.toRuntimeContext(room);
  }

  startMatch(
    session: SocketSession,
    options?: {
      botDifficulty?: RuntimeRoom["botDifficulty"];
      loadout?: RuntimePlayer["pendingLoadout"];
    }
  ): MatchStartContext {
    const room = this.getRoomForHost(session);

    if (room.status !== "waiting") {
      throw new Error("Match already started.");
    }

    if (room.players.size === 0) {
      throw new Error("Cannot start an empty room.");
    }

    room.botDifficulty = options?.botDifficulty ?? room.botDifficulty;
    const hostPlayer = room.players.get(session.playerId);
    if (hostPlayer && options?.loadout) {
      hostPlayer.pendingLoadout = options.loadout;
    }
    room.status = "started";
    room.startedAt = Date.now();
    this.fillBotSquads(room);
    room.matchLayout = buildMatchLayout({
      roomCode: room.code,
      startedAt: room.startedAt,
      squadIds: [...ACTIVE_MATCH_SQUADS]
    });
    this.assignInitialStates(room);

    const roomState = this.toRoomState(room);
    const matchPayloadByPlayerId = new Map<string, MatchStartedPayload>();
    const players = this.getPlayerStatesFromRoom(room);

    for (const player of room.players.values()) {
      matchPayloadByPlayerId.set(player.id, {
        room: {
          code: room.code,
          startedAt: room.startedAt,
          width: MATCH_MAP_WIDTH,
          height: MATCH_MAP_HEIGHT,
          players: players.map((state) => ({
            ...state,
            isLocalPlayer: state.id === player.id
          })),
          layout: cloneLayout(room.matchLayout)
        },
        selfPlayerId: player.id
      });
    }

    return {
      room,
      roomState,
      matchPayloadByPlayerId
    };
  }

  getRoomStateBySession(session: SocketSession): RoomStateEnvelope | undefined {
    const room = this.getRoomBySession(session);
    return room ? this.toRoomState(room) : undefined;
  }

  getPlayerStates(roomCode: string): PlayerState[] {
    const room = this.getRoomByCode(roomCode);
    return this.getPlayerStatesFromRoom(room);
  }

  setPlayerMoveInput(session: SocketSession, direction: Vector2): RuntimeContext {
    const room = this.getRequiredRoomBySession(session);
    const player = room.players.get(session.playerId);

    if (!player?.state) {
      throw new Error("Player is not active in the current match.");
    }

    syncPlayerCombatState(player);
    const directionMagnitude = getDirectionMagnitude(direction);
    const normalizedDirection = normalizeDirection(direction);
    player.moveInput = {
      x: normalizedDirection.x * directionMagnitude,
      y: normalizedDirection.y * directionMagnitude
    };

    if (directionMagnitude === 0) {
      return this.toRuntimeContext(room);
    }

    player.state.direction = normalizedDirection;

    return this.toRuntimeContext(room);
  }

  advancePlayerMovement(roomCode: string, tickMs: number): RuntimeContext {
    const room = this.getRoomByCode(roomCode);

    for (const player of room.players.values()) {
      if (!player.state?.isAlive) {
        player.moveInput = { x: 0, y: 0 };
        continue;
      }

      syncPlayerCombatState(player);

      const moveInput = player.moveInput ?? { x: 0, y: 0 };
      const directionMagnitude = getDirectionMagnitude(moveInput);
      if (directionMagnitude === 0) {
        continue;
      }

      const normalizedDirection = normalizeDirection(moveInput);
      const moveStep = (player.state.moveSpeed * tickMs / 1000) * directionMagnitude;
      player.state.direction = normalizedDirection;
      player.state.x = clamp(player.state.x + normalizedDirection.x * moveStep, 24, MATCH_MAP_WIDTH - 24);
      player.state.y = clamp(player.state.y + normalizedDirection.y * moveStep, 24, MATCH_MAP_HEIGHT - 24);
    }

    return this.toRuntimeContext(room);
  }

  getRemainingSeconds(roomCode: string): number {
    const room = this.getRoomByCode(roomCode);
    if (!room.startedAt) {
      return MATCH_DURATION_SEC;
    }

    const elapsedSeconds = Math.floor((Date.now() - room.startedAt) / 1000);
    return Math.max(0, MATCH_DURATION_SEC - elapsedSeconds);
  }

  listPlayerStates(room: RuntimeRoom): PlayerState[] {
    return this.getPlayerStatesFromRoom(room);
  }

  getRoomByCodeSnapshot(roomCode: string): RuntimeContext {
    const room = this.getRoomByCode(roomCode);
    return this.toRuntimeContext(room);
  }

  setPlayerSyncInterval(roomCode: string, interval: NodeJS.Timeout | undefined): void {
    const room = this.rooms.get(normalizeRoomCode(roomCode));
    if (!room) return;
    if (room.playerSyncInterval) clearInterval(room.playerSyncInterval);
    room.playerSyncInterval = interval;
  }

  setMatchTimerInterval(roomCode: string, interval: NodeJS.Timeout | undefined): void {
    const room = this.rooms.get(normalizeRoomCode(roomCode));
    if (!room) return;
    if (room.matchTimerInterval) clearInterval(room.matchTimerInterval);
    room.matchTimerInterval = interval;
  }

  private assignInitialStates(room: RuntimeRoom): void {
    if (!room.matchLayout) {
      throw new Error("Missing match layout on room start.");
    }

    for (const squadId of ACTIVE_MATCH_SQUADS) {
      const zone = getSquadSpawnZone(room.matchLayout, squadId);
      const squadPlayers = [...room.players.values()]
        .filter((player) => player.squadId === squadId)
        .sort((a, b) => {
          const aHuman = a.isBot ? 1 : 0;
          const bHuman = b.isBot ? 1 : 0;
          if (aHuman !== bHuman) return aHuman - bHuman;
          return a.joinedAt - b.joinedAt;
        });

      squadPlayers.forEach((player, index) => {
        const offset = FORMATION_OFFSETS[index] ?? FORMATION_OFFSETS[FORMATION_OFFSETS.length - 1];
        const rotated = rotateOffset(offset, zone.facing);
        const x = clamp(Math.round(zone.anchorX + rotated.x), 24, MATCH_MAP_WIDTH - 24);
        const y = clamp(Math.round(zone.anchorY + rotated.y), 24, MATCH_MAP_HEIGHT - 24);

        player.state = {
          id: player.id,
          name: player.name,
          x,
          y,
          direction: cloneDirection(zone.facing),
          hp: PLAYER_BASE_HP,
          maxHp: PLAYER_BASE_HP,
          weaponType: DEFAULT_WEAPON_TYPE,
          isAlive: true,
          moveSpeed: PLAYER_BASE_MOVE_SPEED,
          attackPower: 0,
          attackSpeed: 0,
          critRate: 0,
          dodgeRate: 0,
          damageReduction: 0,
          statusEffects: [],
          killsPlayers: 0,
          killsMonsters: 0,
          squadId: player.squadId,
          squadType: player.squadType,
          isBot: player.isBot
        };
        player.moveInput = { x: 0, y: 0 };
        player.botHomeAnchor = { x: zone.anchorX, y: zone.anchorY };
        player.botOpeningStage = "staging";
        player.botOpeningReleasedAt = undefined;
        setPlayerBaseStats(player, {
          maxHp: PLAYER_BASE_HP,
          weaponType: DEFAULT_WEAPON_TYPE,
          moveSpeed: PLAYER_BASE_MOVE_SPEED,
          attackPower: 0,
          attackSpeed: 0,
          critRate: 0,
          dodgeRate: 0,
          damageReduction: 0
        }, room.startedAt ?? Date.now());
      });
    }
  }

  private getPlayerStatesFromRoom(room: RuntimeRoom): PlayerState[] {
    return [...room.players.values()]
      .filter((player) => Boolean(player.state))
      .map((player) => buildPlayerState(player));
  }

  private toRuntimeContext(room: RuntimeRoom): RuntimeContext {
    return { room, roomState: this.toRoomState(room) };
  }

  private toRoomState(room: RuntimeRoom): RoomStateEnvelope {
    return {
      code: room.code,
      capacity: room.capacity,
      humanCapacity: room.capacity,
      squadCount: SQUAD_COUNT,
      botDifficulty: room.botDifficulty,
      status: room.status,
      players: [...room.players.values()]
        .filter((player) => !player.isBot)
        .map((player) => buildLobbyPlayer(player)),
      hostPlayerId: room.hostPlayerId
    };
  }

  private getRoomForHost(session: SocketSession, roomCode?: string): RuntimeRoom {
    const room = roomCode ? this.getRoomByCode(roomCode) : this.getRequiredRoomBySession(session);
    if (room.hostPlayerId !== session.playerId) {
      throw new Error("Only the host can perform this action.");
    }
    return room;
  }

  private getRequiredRoomBySession(session: SocketSession): RuntimeRoom {
    const room = this.getRoomBySession(session);
    if (!room) {
      throw new Error("Player is not currently in a room.");
    }
    return room;
  }

  private getRoomBySession(session: SocketSession): RuntimeRoom | undefined {
    return session.roomCode ? this.rooms.get(normalizeRoomCode(session.roomCode)) : undefined;
  }

  private getRoomByCode(code: string): RuntimeRoom {
    const room = this.rooms.get(normalizeRoomCode(code));
    if (!room) {
      throw new Error("Room not found.");
    }
    return room;
  }

  private disposeRoom(roomCode: string): void {
    const roomKey = normalizeRoomCode(roomCode);
    const room = this.rooms.get(roomKey);
    if (!room) return;
    if (room.playerSyncInterval) clearInterval(room.playerSyncInterval);
    if (room.matchTimerInterval) clearInterval(room.matchTimerInterval);
    if (room.monsterSyncInterval) clearInterval(room.monsterSyncInterval);
    this.rooms.delete(roomKey);
  }

  private generateRoomCode(): string {
    let code = "";
    do {
      const place = PLACE_WORDS[Math.floor(Math.random() * PLACE_WORDS.length)];
      const number = String(Math.floor(Math.random() * 100)).padStart(2, "0");
      code = `${place}\u8DEF${number}`;
    } while (this.rooms.has(normalizeRoomCode(code)));
    return code;
  }

  private fillBotSquads(room: RuntimeRoom): void {
    const humanCount = [...room.players.values()].filter((player) => !player.isBot).length;
    let botsToAdd = Math.max(0, room.capacity - humanCount);

    for (const squadId of ACTIVE_BOT_SQUADS) {
      const currentCount = [...room.players.values()].filter((player) => player.squadId === squadId).length;
      for (let index = currentCount; botsToAdd > 0; index += 1) {
        const id = `bot_${squadId}_${index + 1}`;
        if (room.players.has(id)) continue;
        room.players.set(id, {
          id,
          socketId: id,
          name: BOT_NAMES[squadId][index] ?? `${squadId}-${index + 1}`,
          isHost: false,
          ready: true,
          joinedAt: Date.now(),
          squadId,
          squadType: "bot",
          isBot: true,
          botDifficulty: room.botDifficulty
        });
        botsToAdd -= 1;
      }
    }
  }
}

function cloneLayout(layout: MatchLayout | undefined): MatchLayout {
  if (!layout) {
    throw new Error("Missing match layout.");
  }
  return {
    templateId: layout.templateId,
    squadSpawns: layout.squadSpawns.map((entry) => ({ ...entry, facing: { ...entry.facing } })),
    extractZones: layout.extractZones.map((entry) => ({ ...entry })),
    chestZones: layout.chestZones.map((entry) => ({ ...entry })),
    safeZones: layout.safeZones.map((entry) => ({ ...entry })),
    riverHazards: layout.riverHazards.map((entry) => ({ ...entry })),
    safeCrossings: layout.safeCrossings.map((entry) => ({ ...entry }))
  };
}

function rotateOffset(offset: { x: number; y: number }, facing: Vector2): Vector2 {
  const forward = normalizeDirection(facing);
  const right = { x: forward.y, y: -forward.x };
  return {
    x: right.x * offset.x + forward.x * offset.y,
    y: right.y * offset.x + forward.y * offset.y
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeDirection(direction: Vector2): Vector2 {
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y)) {
    return { x: 0, y: 0 };
  }
  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  return { x: direction.x / length, y: direction.y / length };
}

function getDirectionMagnitude(direction: Vector2): number {
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y)) {
    return 0;
  }
  return clamp(Math.hypot(direction.x, direction.y), 0, 1);
}
