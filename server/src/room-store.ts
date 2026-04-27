import type {
  CreateRoomPayload,
  JoinRoomPayload,
  LobbyPlayer,
  RoomSummary,
  SetCapacityPayload
} from "../../shared/dist/types/lobby.js";
import type {
  MatchStartedPayload,
  PlayerState,
  Vector2
} from "../../shared/dist/types/game.js";
import { findHazardZoneAtPosition } from "../../shared/dist/data/mapLayout.js";
import {
  DEFAULT_ROOM_CAPACITY,
  DEFAULT_WEAPON_TYPE,
  MATCH_DURATION_SEC,
  MATCH_MAP_HEIGHT,
  MATCH_MAP_WIDTH,
  PLAYER_BASE_HP,
  PLAYER_BASE_MOVE_SPEED,
  SPAWN_RING_RADIUS
} from "./internal-constants.js";
import { setPlayerBaseStats, syncPlayerCombatState } from "./combat/player-effects.js";
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
  "南岭",
  "北坞",
  "西浮",
  "灰湾",
  "旧港",
  "朔桥",
  "荒岗",
  "雾泽",
  "石堡",
  "长汀"
] as const;
const HAZARD_TICK_MS = 500;

function normalizeRoomCode(code: string): string {
  return code.trim().replace(/\s+/g, "").replace(/[.\uFF0E\u3002\u30FB路]/g, "·").toUpperCase();
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
    socketId: player.socketId
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
    killsPlayers: player.combat?.killsPlayers ?? player.state.killsPlayers,
    killsMonsters: player.state.killsMonsters
  };
}

export class RoomStore {
  private readonly rooms = new Map<string, RuntimeRoom>();

  createRoom(payload: CreateRoomPayload, session: SocketSession): RuntimeContext {
    const code = this.generateRoomCode();
    const room: RuntimeRoom = {
      code,
      hostPlayerId: session.playerId,
      capacity: DEFAULT_ROOM_CAPACITY,
      status: "waiting",
      createdAt: Date.now(),
      players: new Map()
    };

    room.players.set(session.playerId, {
      id: session.playerId,
      profileId: session.profileId,
      socketId: session.socketId,
      name: sanitizePlayerName(payload.playerName),
      isHost: true,
      ready: true,
      joinedAt: Date.now()
    });

    this.rooms.set(code, room);
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
      profileId: session.profileId,
      socketId: session.socketId,
      name: sanitizePlayerName(payload.playerName),
      isHost: false,
      ready: true,
      joinedAt: Date.now()
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

  startMatch(session: SocketSession): MatchStartContext {
    const room = this.getRoomForHost(session);

    if (room.status !== "waiting") {
      throw new Error("Match already started.");
    }

    if (room.players.size === 0) {
      throw new Error("Cannot start an empty room.");
    }

    room.status = "started";
    room.startedAt = Date.now();
    this.assignInitialStates(room);

    const roomState = this.toRoomState(room);
    const matchPayloadByPlayerId = new Map<string, MatchStartedPayload>();

    for (const player of room.players.values()) {
      matchPayloadByPlayerId.set(player.id, {
        room: {
          code: room.code,
          startedAt: room.startedAt,
          width: MATCH_MAP_WIDTH,
          height: MATCH_MAP_HEIGHT,
          extract: room.extract ? {
            x: room.extract.centerX,
            y: room.extract.centerY,
            radius: room.extract.radius
          } : undefined,
          players: this.getPlayerStatesFromRoom(room)
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
    const now = Date.now();

    for (const player of room.players.values()) {
      if (!player.state?.isAlive) {
        player.moveInput = { x: 0, y: 0 };
        continue;
      }

      syncPlayerCombatState(player);

      const moveInput = player.moveInput ?? { x: 0, y: 0 };
      const directionMagnitude = getDirectionMagnitude(moveInput);
      if (directionMagnitude !== 0) {
        const normalizedDirection = normalizeDirection(moveInput);
        const moveStep = (player.state.moveSpeed * tickMs / 1000) * directionMagnitude;
        player.state.direction = normalizedDirection;
        player.state.x = clamp(
          player.state.x + normalizedDirection.x * moveStep,
          24,
          MATCH_MAP_WIDTH - 24
        );
        player.state.y = clamp(
          player.state.y + normalizedDirection.y * moveStep,
          24,
          MATCH_MAP_HEIGHT - 24
        );
      }

      const hazard = findHazardZoneAtPosition(MATCH_MAP_WIDTH, MATCH_MAP_HEIGHT, player.state.x, player.state.y);
      if (!hazard) {
        continue;
      }

      if (!player.lastHazardDamageAt || now - player.lastHazardDamageAt >= HAZARD_TICK_MS) {
        player.lastHazardDamageAt = now;
        const damage = Math.max(1, Math.round((hazard.dps * HAZARD_TICK_MS) / 1000));
        player.state.hp = Math.max(0, player.state.hp - damage);
        player.state.isAlive = player.state.hp > 0;
        if (!player.state.isAlive) {
          player.moveInput = { x: 0, y: 0 };
        }
      }
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
    const room = this.rooms.get(roomCode);
    if (!room) {
      return;
    }

    if (room.playerSyncInterval) {
      clearInterval(room.playerSyncInterval);
    }

    room.playerSyncInterval = interval;
  }

  setMatchTimerInterval(roomCode: string, interval: NodeJS.Timeout | undefined): void {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return;
    }

    if (room.matchTimerInterval) {
      clearInterval(room.matchTimerInterval);
    }

    room.matchTimerInterval = interval;
  }

  private assignInitialStates(room: RuntimeRoom): void {
    const players = [...room.players.values()];
    const centerX = MATCH_MAP_WIDTH / 2;
    const centerY = MATCH_MAP_HEIGHT / 2;

    players.forEach((player, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(players.length, 1);
      const x = centerX + Math.cos(angle) * SPAWN_RING_RADIUS;
      const y = centerY + Math.sin(angle) * SPAWN_RING_RADIUS;

      player.state = {
        id: player.id,
        name: player.name,
        x: Math.round(x),
        y: Math.round(y),
        direction: { x: 0, y: 1 },
        hp: PLAYER_BASE_HP,
        maxHp: PLAYER_BASE_HP,
        weaponType: DEFAULT_WEAPON_TYPE,
        isAlive: true,
        moveSpeed: PLAYER_BASE_MOVE_SPEED,
        attackPower: 0,
        attackSpeed: 0,
        critRate: 0,
        damageReduction: 0,
        killsPlayers: 0,
        killsMonsters: 0
      };
      player.moveInput = { x: 0, y: 0 };
      setPlayerBaseStats(player, {
        maxHp: PLAYER_BASE_HP,
        weaponType: DEFAULT_WEAPON_TYPE,
        moveSpeed: PLAYER_BASE_MOVE_SPEED,
        attackPower: 0,
        attackSpeed: 0,
        critRate: 0,
        damageReduction: 0
      }, room.startedAt ?? Date.now());
    });
  }

  private getPlayerStatesFromRoom(room: RuntimeRoom): PlayerState[] {
    return [...room.players.values()]
      .filter((player) => Boolean(player.state))
      .map((player) => buildPlayerState(player));
  }

  private toRuntimeContext(room: RuntimeRoom): RuntimeContext {
    return {
      room,
      roomState: this.toRoomState(room)
    };
  }

  private toRoomState(room: RuntimeRoom): RoomStateEnvelope {
    return {
      code: room.code,
      capacity: room.capacity,
      status: room.status,
      players: [...room.players.values()].map((player) => buildLobbyPlayer(player)),
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
    return session.roomCode ? this.rooms.get(session.roomCode) : undefined;
  }

  private getRoomByCode(code: string): RuntimeRoom {
    const room = this.rooms.get(normalizeRoomCode(code));
    if (!room) {
      throw new Error("Room not found.");
    }

    return room;
  }

  private disposeRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return;
    }

    if (room.playerSyncInterval) {
      clearInterval(room.playerSyncInterval);
    }

    if (room.matchTimerInterval) {
      clearInterval(room.matchTimerInterval);
    }

    this.rooms.delete(roomCode);
  }

  private generateRoomCode(): string {
    let code = "";

    do {
      const place = PLACE_WORDS[Math.floor(Math.random() * PLACE_WORDS.length)];
      const number = String(Math.floor(Math.random() * 100)).padStart(2, "0");
      code = `${place}·${number}`;
    } while (this.rooms.has(code));

    return code;
  }
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

  return {
    x: direction.x / length,
    y: direction.y / length
  };
}

function getDirectionMagnitude(direction: Vector2): number {
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y)) {
    return 0;
  }

  return clamp(Math.hypot(direction.x, direction.y), 0, 1);
}
