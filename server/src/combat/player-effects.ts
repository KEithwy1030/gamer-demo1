import type {
  PendingBasicAttackModifier,
  RuntimeCombatState,
  RuntimePlayer,
  RuntimePlayerBaseStats,
  RuntimeTimedCombatModifier
} from "../types.js";

export interface CombatModifierTotals {
  attackDamageMultiplier: number;
  damageReductionBonus: number;
  moveSpeedMultiplier: number;
}

export function ensureCombatState(player: RuntimePlayer): RuntimeCombatState {
  player.combat ??= {
    lastCastAtBySkillId: {},
    activeModifiers: []
  };

  player.combat.activeModifiers ??= [];
  return player.combat;
}

export function setPlayerBaseStats(
  player: RuntimePlayer,
  baseStats: RuntimePlayerBaseStats,
  now = Date.now()
): void {
  player.baseStats = { ...baseStats };
  syncPlayerCombatState(player, now);
}

export function syncPlayerCombatState(
  player: RuntimePlayer,
  now = Date.now()
): CombatModifierTotals {
  const state = player.state;
  if (!state) {
    return emptyTotals();
  }

  const combatState = ensureCombatState(player);
  combatState.activeModifiers = combatState.activeModifiers.filter((modifier) => modifier.expiresAt > now);

  const baseStats = player.baseStats ?? {
    maxHp: state.maxHp,
    weaponType: state.weaponType,
    moveSpeed: state.moveSpeed,
    attackPower: state.attackPower,
    attackSpeed: state.attackSpeed,
    critRate: state.critRate,
    damageReduction: state.damageReduction
  };
  player.baseStats = { ...baseStats };

  const totals = combatState.activeModifiers.reduce<CombatModifierTotals>((sum, modifier) => ({
    attackDamageMultiplier: sum.attackDamageMultiplier + (modifier.attackDamageMultiplier ?? 0),
    damageReductionBonus: sum.damageReductionBonus + (modifier.damageReductionBonus ?? 0),
    moveSpeedMultiplier: sum.moveSpeedMultiplier + (modifier.moveSpeedMultiplier ?? 0)
  }), emptyTotals());

  state.maxHp = baseStats.maxHp;
  state.weaponType = baseStats.weaponType;
  state.attackPower = baseStats.attackPower;
  state.attackSpeed = baseStats.attackSpeed;
  state.critRate = baseStats.critRate;
  state.damageReduction = clamp(baseStats.damageReduction + totals.damageReductionBonus, 0, 0.9);
  state.moveSpeed = Math.max(0, Math.round(baseStats.moveSpeed * Math.max(0, 1 + totals.moveSpeedMultiplier)));
  state.hp = Math.min(state.hp, state.maxHp);

  return totals;
}

export function addTimedModifier(
  player: RuntimePlayer,
  modifier: RuntimeTimedCombatModifier,
  now = Date.now()
): void {
  const combatState = ensureCombatState(player);
  combatState.activeModifiers.push(modifier);
  syncPlayerCombatState(player, now);
}

export function setPendingBasicAttack(
  player: RuntimePlayer,
  modifier: PendingBasicAttackModifier
): void {
  const combatState = ensureCombatState(player);
  combatState.pendingBasicAttack = modifier;
}

export function consumePendingBasicAttack(player: RuntimePlayer): PendingBasicAttackModifier | undefined {
  const combatState = ensureCombatState(player);
  const modifier = combatState.pendingBasicAttack;
  combatState.pendingBasicAttack = undefined;
  return modifier;
}

export function scaleOutgoingDamage(
  player: RuntimePlayer,
  baseDamage: number,
  now = Date.now()
): number {
  const totals = syncPlayerCombatState(player, now);
  return Math.max(1, Math.round(baseDamage * (1 + totals.attackDamageMultiplier)));
}

function emptyTotals(): CombatModifierTotals {
  return {
    attackDamageMultiplier: 0,
    damageReductionBonus: 0,
    moveSpeedMultiplier: 0
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
