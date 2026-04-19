import type { WeaponDefinition } from "../types/combat";

export const WEAPON_DEFINITIONS: Record<string, WeaponDefinition> = {
  sword: {
    type: "sword",
    name: "Sword",
    attackPower: 10,
    attacksPerSecond: 1.5,
    range: 116
  },
  blade: {
    type: "blade",
    name: "Blade",
    attackPower: 15,
    attacksPerSecond: 1,
    range: 128
  },
  spear: {
    type: "spear",
    name: "Spear",
    attackPower: 20,
    attacksPerSecond: 0.5,
    range: 180
  }
};
