import type { MonsterState, PlayerState, RoomRuntimeSnapshot, WorldDrop, MatchLayout, MatchLayoutExtractZone } from "@gamer/shared";

export interface MatchInventoryItem {
  instanceId: string;
  definitionId: string;
  name: string;
  kind?: string;
  rarity?: string;
  tags?: string[];
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  slot?: string;
  equipmentSlot?: string;
  healAmount?: number;
  affixes?: Array<{ key: string; value: number }>;
  modifiers?: Partial<{
    attackPower: number;
    attackSpeed: number;
    maxHp: number;
    moveSpeed: number;
    damageReduction: number;
    critRate: number;
    critDamage: number;
    hpRegen: number;
    dodgeRate: number;
  }>;
}

export interface MatchInventoryState {
  width: number;
  height: number;
  items: MatchInventoryItem[];
  equipment: Partial<Record<string, MatchInventoryItem>>;
}

export interface MatchBootstrap {
  selfPlayerId: string;
  snapshot: RoomRuntimeSnapshot;
}

export interface MatchViewState {
  code: string;
  width: number;
  height: number;
  startedAt: number;
  selfPlayerId: string | null;
  players: PlayerState[];
  monsters: MonsterState[];
  drops: WorldDrop[];
  secondsRemaining: number | null;
  inventory: MatchInventoryState | null;
  lastCombatText: string | null;
  layout: MatchLayout | null;
}

type Listener = (state: MatchViewState) => void;

const DEFAULT_WORLD_SIZE = 4800;

export class MatchRuntimeStore {
  private state: MatchViewState = {
    code: "",
    width: DEFAULT_WORLD_SIZE,
    height: DEFAULT_WORLD_SIZE,
    startedAt: 0,
    selfPlayerId: null,
    players: [],
    monsters: [],
    drops: [],
    secondsRemaining: null,
    inventory: null,
    lastCombatText: null,
    layout: null
  };

  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  setBootstrap(bootstrap: MatchBootstrap): void {
    this.state = {
      ...this.state,
      code: bootstrap.snapshot.code,
      width: bootstrap.snapshot.width || DEFAULT_WORLD_SIZE,
      height: bootstrap.snapshot.height || DEFAULT_WORLD_SIZE,
      startedAt: bootstrap.snapshot.startedAt,
      selfPlayerId: bootstrap.selfPlayerId,
      players: bootstrap.snapshot.players.slice(),
      monsters: [],
      drops: [],
      inventory: null,
      lastCombatText: null,
      layout: bootstrap.snapshot.layout ? cloneLayout(bootstrap.snapshot.layout) : null
    };
    this.emit();
  }

  updatePlayers(players: PlayerState[]): void {
    this.state = { ...this.state, players: players.slice() };
    this.emit();
  }

  updateMonsters(monsters: MonsterState[]): void {
    this.state = { ...this.state, monsters: monsters.slice() };
    this.emit();
  }

  updateDrops(drops: WorldDrop[]): void {
    this.state = { ...this.state, drops: drops.slice() };
    this.emit();
  }

  setTimer(secondsRemaining: number): void {
    this.state = { ...this.state, secondsRemaining };
    this.emit();
  }

  setInventory(inventory: MatchInventoryState): void {
    this.state = { ...this.state, inventory: cloneInventory(inventory) };
    this.emit();
  }

  setCombatText(text: string | null): void {
    this.state = { ...this.state, lastCombatText: text };
    this.emit();
  }

  getState(): MatchViewState {
    return {
      ...this.state,
      players: this.state.players.slice(),
      monsters: this.state.monsters.slice(),
      drops: this.state.drops.slice(),
      inventory: this.state.inventory ? cloneInventory(this.state.inventory) : null,
      layout: this.state.layout ? cloneLayout(this.state.layout) : null
    };
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function cloneInventory(inventory: MatchInventoryState): MatchInventoryState {
  const equipment: Partial<Record<string, MatchInventoryItem>> = {};

  for (const [slot, item] of Object.entries(inventory.equipment)) {
    if (item) {
      equipment[slot] = { ...item };
    }
  }

  return {
    width: inventory.width,
    height: inventory.height,
    items: inventory.items.map((item) => ({ ...item })),
    equipment
  };
}

function cloneLayout(layout: MatchLayout): MatchLayout {
  return {
    templateId: layout.templateId,
    squadSpawns: layout.squadSpawns.map((entry) => ({ ...entry, facing: { ...entry.facing } })),
    extractZones: layout.extractZones.map((entry: MatchLayoutExtractZone) => ({ ...entry })),
    chestZones: layout.chestZones.map((entry) => ({ ...entry })),
    safeZones: layout.safeZones.map((entry) => ({ ...entry })),
    riverHazards: layout.riverHazards.map((entry) => ({ ...entry })),
    safeCrossings: layout.safeCrossings.map((entry) => ({ ...entry })),
    obstacleZones: (layout.obstacleZones ?? []).map((entry) => ({ ...entry })),
    landmarks: (layout.landmarks ?? []).map((entry) => ({ ...entry }))
  };
}
