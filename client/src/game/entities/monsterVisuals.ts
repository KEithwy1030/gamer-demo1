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

export const MONSTER_ASSET_CONTRACTS: Record<MonsterState["type"], MonsterAssetContract> = {
  normal: {
    textureKey: "monster_normal_sheet",
    assetPath: "assets/generated/image2_processed/monsters/monster_normal_sheet_4x4.png",
    frameWidth: 314,
    frameHeight: 314,
    columns: 4,
    rows: 4,
    displaySize: 112,
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
    displaySize: 124,
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
    displaySize: 170,
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

