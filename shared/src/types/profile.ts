import type { BotDifficulty, SettlementPayload } from "./game";
import type { EquipmentSlot, InventoryItemInstance, InventoryState } from "./inventory";

export interface ProfileRunSummary {
  result: SettlementPayload["result"];
  reason?: SettlementPayload["reason"];
  survivedSeconds: number;
  playerKills: number;
  monsterKills: number;
  goldDelta: number;
  items: string[];
}

export interface ProfileStashState {
  width: number;
  height: number;
  pages: InventoryState[];
}

export interface ProfileSnapshot {
  profileId: string;
  displayName: string;
  gold: number;
  inventory: InventoryState;
  equipment: Partial<Record<EquipmentSlot, InventoryItemInstance>>;
  stash: ProfileStashState;
  pendingReturn: {
    items: InventoryItemInstance[];
  } | null;
  lastRun: ProfileRunSummary | null;
  botDifficulty: BotDifficulty;
  version: number;
}

export interface ProfilePatchPayload {
  displayName?: string;
  gold?: number;
  botDifficulty?: BotDifficulty;
}

export interface ProfileMovePayload {
  itemInstanceId: string;
  targetArea: "grid" | "equipment" | "stash" | "discard";
  slot?: EquipmentSlot;
  pageIndex?: number;
  swapItemInstanceId?: string;
  x?: number;
  y?: number;
}
