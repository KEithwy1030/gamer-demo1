import {
  PRIMARY_SKILL_BY_WEAPON,
  SKILLS_BY_WEAPON,
  getSkillCooldownMs,
  getSkillWindupMs,
  type SkillId,
  type WeaponType
} from "@gamer/shared";
import type { MatchViewState } from "../../game";

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
  return getSkillCooldownMs(skillId);
}

export function getPrimarySkillWindupMs(skillId: SkillId): number {
  return getSkillWindupMs(skillId);
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
