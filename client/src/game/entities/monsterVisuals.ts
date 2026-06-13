import type { MonsterState } from "@gamer/shared";

export type MonsterAction = "idle" | "move" | "attack" | "charge" | "hurt" | "death";
export type MonsterFacing = "down" | "left" | "right" | "up";

export const MONSTER_FACINGS = ["down", "left", "right", "up"] as const;

export interface MonsterActionFrames {
  idle: number[];
  move: number[];
  attack: number[];
  charge: number[];
  hurt: number[];
  death: number[];
}

export interface MonsterAssetContract {
  textureKey: string;
  assetPath: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  displaySize: number;
  directionalCoverage: "full" | "fallback-only";
  actions: MonsterActionFrames;
  directionalActions?: Record<MonsterFacing, MonsterActionFrames>;
  frameRates: Record<MonsterAction, number>;
}

export interface MonsterVisualProfile {
  displaySize: number;
  shadow: { width: number; height: number; y: number; alpha: number };
  threatAura: { width: number; height: number; y: number };
  telegraphRing: { width: number; height: number; y: number };
  impactFlash: { width: number; height: number; y: number };
  labelOffsetY: number;
  hpY: number;
  crownY: number;
  hpWidth: number;
}

const MONSTER_VISUAL_PROFILES: Record<MonsterState["type"], MonsterVisualProfile> = {
  basic: {
    displaySize: 114,
    shadow: { width: 88, height: 26, y: 47, alpha: 0.72 },
    threatAura: { width: 114, height: 68, y: 21 },
    telegraphRing: { width: 125, height: 125, y: 21 },
    impactFlash: { width: 94, height: 114, y: 10 },
    labelOffsetY: 78,
    hpY: -75,
    crownY: -130,
    hpWidth: 101
  },
  normal: {
    displaySize: 114,
    shadow: { width: 88, height: 26, y: 47, alpha: 0.72 },
    threatAura: { width: 114, height: 68, y: 21 },
    telegraphRing: { width: 125, height: 125, y: 21 },
    impactFlash: { width: 94, height: 114, y: 10 },
    labelOffsetY: 78,
    hpY: -75,
    crownY: -130,
    hpWidth: 101
  },
  skirmisher: {
    displaySize: 108,
    shadow: { width: 82, height: 24, y: 44, alpha: 0.68 },
    threatAura: { width: 108, height: 62, y: 18 },
    telegraphRing: { width: 120, height: 120, y: 18 },
    impactFlash: { width: 90, height: 108, y: 8 },
    labelOffsetY: 74,
    hpY: -72,
    crownY: -126,
    hpWidth: 92
  },
  elite: {
    displaySize: 130,
    shadow: { width: 100, height: 29, y: 49, alpha: 0.78 },
    threatAura: { width: 133, height: 83, y: 23 },
    telegraphRing: { width: 145, height: 145, y: 23 },
    impactFlash: { width: 98, height: 120, y: 10 },
    labelOffsetY: 93,
    hpY: -88,
    crownY: -145,
    hpWidth: 85
  },
  brute: {
    displaySize: 142,
    shadow: { width: 110, height: 32, y: 54, alpha: 0.8 },
    threatAura: { width: 142, height: 92, y: 26 },
    telegraphRing: { width: 154, height: 154, y: 26 },
    impactFlash: { width: 108, height: 134, y: 11 },
    labelOffsetY: 96,
    hpY: -90,
    crownY: -142,
    hpWidth: 104
  },
  archer: {
    displaySize: 112,
    shadow: { width: 84, height: 25, y: 45, alpha: 0.7 },
    threatAura: { width: 112, height: 66, y: 20 },
    telegraphRing: { width: 124, height: 124, y: 20 },
    impactFlash: { width: 92, height: 110, y: 9 },
    labelOffsetY: 76,
    hpY: -74,
    crownY: -128,
    hpWidth: 96
  },
  boss: {
    displaySize: 260,
    shadow: { width: 212, height: 59, y: 94, alpha: 0.9 },
    threatAura: { width: 286, height: 191, y: 39 },
    telegraphRing: { width: 312, height: 312, y: 38 },
    impactFlash: { width: 208, height: 243, y: 17 },
    labelOffsetY: 182,
    hpY: -191,
    crownY: -277,
    hpWidth: 186
  }
};


// 冷月规格焊接动作图（3x2，帧序固定 0待机/1走A/2走B/3抬手/4出手/5受击）。
// 单朝向：图默认朝屏幕左，MonsterMarker 仅在朝右时 flipX（同 PlayerMarker shouldFlip 规则）。
// 三张图覆盖 7 个逻辑类型：ghoul=基础群体, butcher=精英重型, colossus=boss。
const MONSTER_SHEET_ACTIONS = {
  idle: [0],
  move: [1, 0, 2, 0],
  attack: [3, 4],
  charge: [3, 4],
  hurt: [5],
  death: [5]
} as const;
const MONSTER_SHEET_RATES = { idle: 3, move: 7, attack: 9, charge: 9, hurt: 6, death: 1 } as const;

function monsterSheet(textureKey: string, assetPath: string, displaySize: number): MonsterAssetContract {
  return {
    textureKey,
    assetPath,
    frameWidth: 300,
    frameHeight: 300,
    columns: 3,
    rows: 2,
    displaySize,
    directionalCoverage: "fallback-only",
    actions: { ...MONSTER_SHEET_ACTIONS } as unknown as MonsterAssetContract["actions"],
    frameRates: { ...MONSTER_SHEET_RATES } as unknown as MonsterAssetContract["frameRates"]
  };
}

const GHOUL = "assets/generated/image2_processed/monsters/ghoul-hound_3x2.png";
const BUTCHER = "assets/generated/image2_processed/monsters/butcher_3x2.png";
const COLOSSUS = "assets/generated/image2_processed/monsters/colossus_3x2.png";

export const MONSTER_ASSET_CONTRACTS: Record<MonsterState["type"], MonsterAssetContract> = {
  basic: monsterSheet("monster_ghoul", GHOUL, MONSTER_VISUAL_PROFILES.basic.displaySize),
  normal: monsterSheet("monster_ghoul", GHOUL, MONSTER_VISUAL_PROFILES.normal.displaySize),
  skirmisher: monsterSheet("monster_ghoul", GHOUL, MONSTER_VISUAL_PROFILES.skirmisher.displaySize),
  archer: monsterSheet("monster_ghoul", GHOUL, MONSTER_VISUAL_PROFILES.archer.displaySize),
  elite: monsterSheet("monster_butcher", BUTCHER, MONSTER_VISUAL_PROFILES.elite.displaySize),
  brute: monsterSheet("monster_butcher", BUTCHER, MONSTER_VISUAL_PROFILES.brute.displaySize),
  boss: monsterSheet("monster_colossus", COLOSSUS, MONSTER_VISUAL_PROFILES.boss.displaySize)
};

export function getMonsterAssetContract(type: MonsterState["type"]): MonsterAssetContract {
  return MONSTER_ASSET_CONTRACTS[type];
}

export function getMonsterTextureKey(type: MonsterState["type"]): string {
  return getMonsterAssetContract(type).textureKey;
}

export function getMonsterDisplaySize(type: MonsterState["type"]): number {
  return getMonsterAssetContract(type).displaySize;
}

export function getMonsterVisualProfile(type: MonsterState["type"]): MonsterVisualProfile {
  return MONSTER_VISUAL_PROFILES[type];
}

export function getMonsterActionFrames(type: MonsterState["type"], action: MonsterAction): number[] {
  return getMonsterAssetContract(type).actions[action];
}

export function hasMonsterDirectionalCoverage(type: MonsterState["type"]): boolean {
  return getMonsterAssetContract(type).directionalCoverage === "full";
}

export function getMonsterDirectionalActionFrames(
  type: MonsterState["type"],
  action: MonsterAction,
  facing: MonsterFacing
): number[] {
  const contract = getMonsterAssetContract(type);
  return contract.directionalActions?.[facing]?.[action] ?? contract.actions[action];
}

export function getMonsterActionFrameRate(type: MonsterState["type"], action: MonsterAction): number {
  return getMonsterAssetContract(type).frameRates[action];
}

export function getMonsterCorpseFrame(type: MonsterState["type"]): number {
  const deathFrames = getMonsterActionFrames(type, "death");
  return deathFrames[deathFrames.length - 1] ?? 0;
}

export function getMonsterAction(monster: MonsterState, options?: { isRecentlyHit?: boolean }): MonsterAction {
  if (!monster.isAlive) {
    return "death";
  }
  if (options?.isRecentlyHit) {
    return "hurt";
  }
  if (monster.skillState === "charge" || monster.behaviorPhase === "charge") {
    return "charge";
  }
  if (monster.skillState === "smash" || monster.behaviorPhase === "windup") {
    return "attack";
  }
  if (monster.behaviorPhase === "hunt" || monster.behaviorPhase === "recover") {
    return "move";
  }
  return "idle";
}

export function getMonsterAnimationKey(
  type: MonsterState["type"],
  action: MonsterAction,
  facing?: MonsterFacing
): string {
  if (facing && hasMonsterDirectionalCoverage(type)) {
    return `monster-${type}-${action}-${facing}`;
  }
  return `monster-${type}-${action}`;
}
