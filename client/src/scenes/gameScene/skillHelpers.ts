import type { SkillId, WeaponType } from "@gamer/shared";
import type { MatchViewState } from "../../game";

export function resolvePrimarySkill(state: MatchViewState | null): SkillId | null {
  return resolveSkillSlots(state)[0] ?? null;
}

export function resolveSkillSlots(state: MatchViewState | null): SkillId[] {
  const self = state?.players.find((player) => player.id === state.selfPlayerId);
  if (self?.weaponType === "sword") return ["sword_dashSlash", "sword_bladeFlurry", "sword_shadowStep"];
  if (self?.weaponType === "blade") return ["blade_sweep", "blade_guard", "blade_overpower"];
  if (self?.weaponType === "spear") return ["spear_heavyThrust", "spear_warCry", "spear_draggingStrike"];
  return [];
}

export function getPrimarySkillCooldownMs(skillId: SkillId): number {
  switch (skillId) {
    case "sword_dashSlash":
      return 6000;
    case "sword_bladeFlurry":
      return 10000;
    case "sword_shadowStep":
      return 12000;
    case "blade_sweep":
      return 7000;
    case "blade_guard":
      return 12000;
    case "blade_overpower":
      return 10000;
    case "spear_heavyThrust":
      return 8000;
    case "spear_warCry":
      return 12000;
    case "spear_draggingStrike":
      return 9000;
    default:
      return 4000;
  }
}

export function getPrimarySkillWindupMs(skillId: SkillId): number {
  return skillId === "spear_heavyThrust" ? 500 : 0;
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
      return "拖枪";
    default:
      return "技能";
  }
}

export function getWeaponLabel(weaponType: WeaponType | undefined): string {
  switch (weaponType) {
    case "sword":
      return "剑";
    case "blade":
      return "刀";
    case "spear":
      return "枪";
    default:
      return "未知";
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
