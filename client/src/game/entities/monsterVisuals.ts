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
    displaySize: 68,
    shadow: { width: 52, height: 15, y: 27, alpha: 0.72 },
    threatAura: { width: 68, height: 40, y: 12 },
    telegraphRing: { width: 72, height: 72, y: 12 },
    impactFlash: { width: 50, height: 60, y: 5 },
    labelOffsetY: 46,
    hpY: -44,
    crownY: -78,
    hpWidth: 44
  },
  elite: {
    displaySize: 82,
    shadow: { width: 64, height: 18, y: 31, alpha: 0.8 },
    threatAura: { width: 84, height: 52, y: 14 },
    telegraphRing: { width: 92, height: 92, y: 14 },
    impactFlash: { width: 62, height: 76, y: 6 },
    labelOffsetY: 58,
    hpY: -56,
    crownY: -92,
    hpWidth: 54
  },
  boss: {
    displaySize: 106,
    shadow: { width: 86, height: 24, y: 38, alpha: 0.93 },
    threatAura: { width: 116, height: 78, y: 16 },
    telegraphRing: { width: 126, height: 126, y: 15 },
    impactFlash: { width: 84, height: 98, y: 7 },
    labelOffsetY: 74,
    hpY: -78,
    crownY: -114,
    hpWidth: 76
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
      idle: [0, 1, 2, 1],
      move: [4, 5, 6, 7],
      attack: [8, 9],
      charge: [8, 9, 10],
      hurt: [10, 9],
      death: [11]
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
      idle: [0, 1, 2, 1],
      move: [4, 5, 6, 7],
      attack: [8, 9],
      charge: [8, 9, 10],
      hurt: [10, 9],
      death: [11]
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
      idle: [0, 1, 2, 3],
      move: [4, 5, 6, 7],
      attack: [8, 9],
      charge: [8, 9, 10, 11],
      hurt: [12, 13],
      death: [14, 15]
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
