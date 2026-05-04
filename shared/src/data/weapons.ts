import type { WeaponDefinition } from "../types/combat";

export const WEAPON_DEFINITIONS: Record<string, WeaponDefinition> = {
  sword: {
    type: "sword",
    name: "长剑",
    attackPower: 10,
    attacksPerSecond: 0.84,
    range: 116
  },
  blade: {
    type: "blade",
    name: "弯刃",
    attackPower: 15,
    attacksPerSecond: 0.6,
    range: 128
  },
  spear: {
    type: "spear",
    name: "长矛",
    attackPower: 20,
    attacksPerSecond: 0.36,
    range: 180
  }
};
