export const ROOM_CODE_LENGTH = 6;
export const DEFAULT_ROOM_CAPACITY = 6;
export const MIN_ROOM_CAPACITY = 1;
export const MAX_ROOM_CAPACITY = 6;
export const MAP_WIDTH = 4800;
export const MAP_HEIGHT = 4800;
export const PLAYER_BASE_SPEED = 300;
export const SERVER_PLAYER_SYNC_HZ = 20;
export const MATCH_DURATION_SEC = 18 * 60;
export const EXTRACT_OPEN_SEC = 8 * 60;
export const CORPSE_FOG_COUNTERATTACK_SEC = 6 * 60;
export const CORPSE_FOG_INTENSIFIED_SEC = 13 * 60;
export const CORPSE_FOG_MAX_PRESSURE_SEC = 18 * 60;
export const CORPSE_FOG_TIMELINE_OVERRIDE_SEC = 0;
export const SQUAD_COUNT = 2;
export const SQUAD_SIZE = 3;

/** 商人信誉等级：卖出累计金额达到 minRep 解锁。sellRatio 是系统急售价相对基准价的倍率加成。 */
export interface MerchantRepTier {
  name: string;
  minRep: number;
  /** 系统急售价 = 基准估价 * baseSellRatio * sellRatio */
  sellRatio: number;
}

export const MERCHANT_REP_TIERS: MerchantRepTier[] = [
  { name: "生面孔", minRep: 0, sellRatio: 1 },
  { name: "熟客", minRep: 800, sellRatio: 1.06 },
  { name: "贵客", minRep: 3000, sellRatio: 1.12 },
  { name: "黑市之友", minRep: 9000, sellRatio: 1.2 }
];

export function resolveMerchantRepTier(rep: number): MerchantRepTier {
  let current = MERCHANT_REP_TIERS[0]!;
  for (const tier of MERCHANT_REP_TIERS) {
    if (rep >= tier.minRep) {
      current = tier;
    }
  }
  return current;
}

export function nextMerchantRepTier(rep: number): MerchantRepTier | undefined {
  return MERCHANT_REP_TIERS.find((tier) => tier.minRep > rep);
}

/** 背包扩容：金币购买的永久升级（铁则 A 允许的搬砖成果之一）。目标行数 → 金币价格。 */
export const BACKPACK_BASE_ROWS = 6;
export const BACKPACK_MAX_ROWS = 8;
export const BACKPACK_UPGRADE_COSTS: Record<number, number> = {
  7: 1500,
  8: 5000
};

export function backpackUpgradeCost(currentRows: number): number | undefined {
  return BACKPACK_UPGRADE_COSTS[currentRows + 1];
}
