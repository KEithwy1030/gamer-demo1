import type { SkillId, WeaponType } from "@gamer/shared";
import type { MatchViewState } from "../../game";

const PRIMARY_SKILL_BY_WEAPON: Record<WeaponType, SkillId> = {
  sword: "sword_dashSlash",
  blade: "blade_sweep",
  spear: "spear_heavyThrust"
};

const SKILLS_BY_WEAPON: Record<WeaponType, [SkillId, SkillId, SkillId]> = {
  sword: ["sword_dashSlash", "sword_bladeFlurry", "sword_shadowStep"],
  blade: ["blade_sweep", "blade_guard", "blade_overpower"],
  spear: ["spear_heavyThrust", "spear_warCry", "spear_draggingStrike"]
};

const SKILL_COOLDOWNS_MS: Record<SkillId, number> = {
  sword_dashSlash: 6000,
  sword_bladeFlurry: 10000,
  sword_shadowStep: 12000,
  blade_sweep: 7000,
  blade_guard: 12000,
  blade_overpower: 10000,
  spear_heavyThrust: 8000,
  spear_warCry: 12000,
  spear_draggingStrike: 9000,
  common_dodge: 5000
};

export function resolvePrimarySkill(state: MatchViewState | null): SkillId | null {
  const self = state?.players.find((player) => player.id === state.selfPlayerId);
  return self?.weaponType ? PRIMARY_SKILL_BY_WEAPON[self.weaponType] : null;
}

export function resolveSkillBySlot(state: MatchViewState | null, slotIndex: number): SkillId | null {
  const self = state?.players.find((player) => player.id === state.selfPlayerId);
  if (!self?.weaponType) return null;
  return SKILLS_BY_WEAPON[self.weaponType][Math.max(0, Math.min(2, slotIndex))] ?? null;
}

export function getPrimarySkillCooldownMs(skillId: SkillId): number {
  return SKILL_COOLDOWNS_MS[skillId] ?? 3000;
}

export function getPrimarySkillWindupMs(skillId: SkillId): number {
  return skillId === "spear_heavyThrust" ? 450 : 0;
}

export function getPrimarySkillLabel(skillId: SkillId): string {
  switch (skillId) {
    case "sword_dashSlash":
      return "突进斩";
    case "sword_bladeFlurry":
      return "连斩";
    case "sword_shadowStep":
      return "闪身";
    case "blade_sweep":
      return "横扫";
    case "blade_guard":
      return "格挡";
    case "blade_overpower":
      return "强攻";
    case "spear_heavyThrust":
      return "重刺";
    case "spear_warCry":
      return "战吼";
    case "spear_draggingStrike":
      return "拖枪打击";
    case "common_dodge":
      return "翻滚";
  }
}

export function getWeaponLabel(weaponType: WeaponType | undefined): string {
  switch (weaponType) {
    case "sword":
      return "长剑";
    case "blade":
      return "战刀";
    case "spear":
      return "长枪";
    default:
      return "未识别";
  }
}

export function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
}

export function formatTenths(seconds: number): string {
  return Math.max(0, seconds).toFixed(1);
}
