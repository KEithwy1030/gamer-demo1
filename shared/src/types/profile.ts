import type { BotDifficulty, SettlementItemDetail, SettlementPayload } from "./game";
import type { EquipmentSlot, InventoryItemInstance, InventoryState } from "./inventory";

export interface ProfileRunSummary {
  result: SettlementPayload["result"];
  reason?: SettlementPayload["reason"];
  survivedSeconds: number;
  playerKills: number;
  monsterKills: number;
  goldDelta: number;
  items: string[];
  itemDetails?: SettlementItemDetail[];
}

export interface ProfileStashState {
  width: number;
  height: number;
  pages: InventoryState[];
}

/** 生涯累计统计：搬砖成果的展示面，不影响战斗力（铁则 A） */
export interface ProfileLifetimeStats {
  totalRuns: number;
  totalExtracts: number;
  totalDeaths: number;
  totalMonsterKills: number;
  totalPlayerKills: number;
  /** 累计正向收益（只累计赚到的，不抵扣亏损） */
  totalGoldEarned: number;
  /** 单局最高净收益 */
  bestRunValue: number;
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
  /** 商人信誉：累计卖出金额。决定系统收购价倍率（见 MERCHANT_REP_TIERS） */
  merchantRep: number;
  lifetimeStats: ProfileLifetimeStats;
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
