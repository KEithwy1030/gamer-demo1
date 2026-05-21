import type { SkillId } from "../types/combat";
import type { WeaponType } from "../types/game";

export interface SkillDefinition {
  id: SkillId;
  cooldownMs: number;
  windupMs: number;
  dashDistancePx?: number;
  dashSpeedScale?: number;
}

export const PRIMARY_SKILL_BY_WEAPON: Record<WeaponType, SkillId> = {
  sword: "sword_dashSlash",
  blade: "blade_sweep",
  spear: "spear_heavyThrust"
};

export const SKILLS_BY_WEAPON: Record<WeaponType, [SkillId, SkillId, SkillId]> = {
  sword: ["sword_dashSlash", "sword_bladeFlurry", "sword_shadowStep"],
  blade: ["blade_sweep", "blade_guard", "blade_overpower"],
  spear: ["spear_heavyThrust", "spear_warCry", "spear_draggingStrike"]
};

export const SKILL_DEFINITIONS: Record<SkillId, SkillDefinition> = {
  sword_dashSlash: { id: "sword_dashSlash", cooldownMs: 6000, windupMs: 0, dashDistancePx: 64, dashSpeedScale: 0.85 },
  sword_bladeFlurry: { id: "sword_bladeFlurry", cooldownMs: 10000, windupMs: 0 },
  sword_shadowStep: { id: "sword_shadowStep", cooldownMs: 12000, windupMs: 0 },
  blade_sweep: { id: "blade_sweep", cooldownMs: 7000, windupMs: 0 },
  blade_guard: { id: "blade_guard", cooldownMs: 12000, windupMs: 0 },
  blade_overpower: { id: "blade_overpower", cooldownMs: 10000, windupMs: 0 },
  spear_heavyThrust: { id: "spear_heavyThrust", cooldownMs: 8000, windupMs: 450 },
  spear_warCry: { id: "spear_warCry", cooldownMs: 12000, windupMs: 0 },
  spear_draggingStrike: { id: "spear_draggingStrike", cooldownMs: 9000, windupMs: 0 },
  common_dodge: { id: "common_dodge", cooldownMs: 5000, windupMs: 0 }
};

export function getSkillCooldownMs(skillId: SkillId): number {
  return SKILL_DEFINITIONS[skillId].cooldownMs;
}

export function getSkillWindupMs(skillId: SkillId): number {
  return SKILL_DEFINITIONS[skillId].windupMs;
}
