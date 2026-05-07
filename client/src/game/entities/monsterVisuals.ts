import type { MonsterState } from "@gamer/shared";

export type MonsterAction = "idle" | "move" | "attack" | "charge" | "hurt" | "death";

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
  actions: MonsterActionFrames;
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
  normal: {
    displaySize: 34,
    shadow: { width: 26, height: 8, y: 14, alpha: 0.72 },
    threatAura: { width: 34, height: 20, y: 6 },
    telegraphRing: { width: 38, height: 38, y: 6 },
    impactFlash: { width: 28, height: 34, y: 3 },
    labelOffsetY: 24,
    hpY: -23,
    crownY: -40,
    hpWidth: 30
  },
  elite: {
    displaySize: 38,
    shadow: { width: 30, height: 9, y: 16, alpha: 0.78 },
    threatAura: { width: 40, height: 24, y: 7 },
    telegraphRing: { width: 44, height: 44, y: 7 },
    impactFlash: { width: 32, height: 38, y: 3 },
    labelOffsetY: 28,
    hpY: -27,
    crownY: -45,
    hpWidth: 33
  },
  boss: {
    displaySize: 45,
    shadow: { width: 38, height: 11, y: 18, alpha: 0.9 },
    threatAura: { width: 52, height: 34, y: 9 },
    telegraphRing: { width: 58, height: 58, y: 8 },
    impactFlash: { width: 40, height: 48, y: 4 },
    labelOffsetY: 33,
    hpY: -35,
    crownY: -54,
    hpWidth: 40
  }
};

export const MONSTER_ASSET_CONTRACTS: Record<MonsterState["type"], MonsterAssetContract> = {
  normal: {
    textureKey: "monster_normal_sheet",
    assetPath: "assets/generated/image2_processed/monsters/monster_normal_sheet_4x4.png",
    frameWidth: 314,
    frameHeight: 314,
    columns: 4,
    rows: 4,
    displaySize: MONSTER_VISUAL_PROFILES.normal.displaySize,
    actions: {
      idle: [0, 0, 1, 2, 1],
      move: [4, 5, 6, 7, 6, 5],
      attack: [8, 9, 10, 9],
      charge: [8, 9, 10, 9],
      hurt: [10, 9],
      death: [11]
    },
    frameRates: {
      idle: 4,
      move: 7,
      attack: 9,
      charge: 10,
      hurt: 11,
      death: 1
    }
  },
  elite: {
    textureKey: "monster_elite_sheet",
    assetPath: "assets/generated/image2_processed/monsters/monster_elite_sheet_4x4.png",
    frameWidth: 314,
    frameHeight: 314,
    columns: 4,
    rows: 4,
    displaySize: MONSTER_VISUAL_PROFILES.elite.displaySize,
    actions: {
      idle: [0, 1, 1, 2, 1],
      move: [4, 5, 6, 7, 6, 5],
      attack: [8, 9, 10, 9],
      charge: [8, 9, 10, 9],
      hurt: [10, 9],
      death: [11]
    },
    frameRates: {
      idle: 4,
      move: 7,
      attack: 8,
      charge: 9,
      hurt: 10,
      death: 1
    }
  },
  boss: {
    textureKey: "monster_boss_sheet",
    assetPath: "assets/generated/image2_processed/monsters/monster_boss_sheet_4x4.png",
    frameWidth: 314,
    frameHeight: 314,
    columns: 4,
    rows: 4,
    displaySize: MONSTER_VISUAL_PROFILES.boss.displaySize,
    actions: {
      idle: [0, 1, 2, 2, 1, 3],
      move: [4, 5, 6, 7, 6, 5],
      attack: [8, 9, 10, 9],
      charge: [8, 9, 10, 11],
      hurt: [12, 13],
      death: [14, 15]
    },
    frameRates: {
      idle: 4,
      move: 6,
      attack: 7,
      charge: 8,
      hurt: 9,
      death: 1
    }
  }
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

export function getMonsterAnimationKey(type: MonsterState["type"], action: MonsterAction): string {
  return `monster-${type}-${action}`;
}
