import type { SkillId, WeaponType } from "@gamer/shared";
import type { MatchViewState } from "../../game";

export function resolvePrimarySkill(state: MatchViewState | null): SkillId | null {
  const self = state?.players.find((player) => player.id === state.selfPlayerId);
  if (self?.weaponType === "sword") return "sword_dashSlash";
  if (self?.weaponType === "blade") return "blade_sweep";
  if (self?.weaponType === "spear") return "spear_heavyThrust";
  return null;
}

export function getPrimarySkillCooldownMs(skillId: SkillId): number {
  switch (skillId) {
    case "sword_dashSlash":
    case "blade_sweep":
      return 4000;
    case "spear_heavyThrust":
      return 5000;
    default:
      return 3000;
  }
}

export function getPrimarySkillWindupMs(skillId: SkillId): number {
  return skillId === "spear_heavyThrust" ? 500 : 0;
}

export function getPrimarySkillLabel(skillId: SkillId): string {
  switch (skillId) {
    case "sword_dashSlash":
      return "突进斩";
    case "blade_sweep":
      return "横扫";
    case "spear_heavyThrust":
      return "重击";
    default:
      return "技能";
  }
}

export function getWeaponLabel(weaponType: WeaponType | undefined): string {
  switch (weaponType) {
    case "sword":
      return "铁剑";
    case "blade":
      return "战刃";
    case "spear":
      return "猎矛";
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
