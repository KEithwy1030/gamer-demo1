import type {
  PendingBasicAttackModifier,
  RuntimeCombatState,
  RuntimePlayer,
  RuntimePlayerBaseStats,
  RuntimeTimedCombatModifier
} from "../types.js";

export interface CombatModifierTotals {
  attackDamageMultiplier: number;
  attackSpeedMultiplier: number;
  basicAttackBonusDamage: number;
  damageReductionBonus: number;
  moveSpeedMultiplier: number;
  dodgeRateBonus: number;
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
  applyBleedTicks(player, now);
  combatState.activeModifiers = combatState.activeModifiers.filter((modifier) => modifier.expiresAt > now);

  const baseStats = player.baseStats ?? {
    maxHp: state.maxHp,
    weaponType: state.weaponType,
    moveSpeed: state.moveSpeed,
    attackPower: state.attackPower,
    attackSpeed: state.attackSpeed,
    critRate: state.critRate,
    dodgeRate: state.dodgeRate,
    damageReduction: state.damageReduction
  };
  player.baseStats = { ...baseStats };

  const totals = combatState.activeModifiers.reduce<CombatModifierTotals>((sum, modifier) => ({
    attackDamageMultiplier: sum.attackDamageMultiplier + (modifier.attackDamageMultiplier ?? 0),
    attackSpeedMultiplier: sum.attackSpeedMultiplier + (modifier.attackSpeedMultiplier ?? 0),
    basicAttackBonusDamage: sum.basicAttackBonusDamage + (modifier.basicAttackBonusDamage ?? 0),
    damageReductionBonus: sum.damageReductionBonus + (modifier.damageReductionBonus ?? 0),
    moveSpeedMultiplier: sum.moveSpeedMultiplier + (modifier.moveSpeedMultiplier ?? 0),
    dodgeRateBonus: sum.dodgeRateBonus + (modifier.dodgeRateBonus ?? 0)
  }), emptyTotals());

  state.maxHp = baseStats.maxHp;
  state.weaponType = baseStats.weaponType;
  state.attackPower = Math.round(baseStats.attackPower * Math.max(0, 1 + totals.attackDamageMultiplier) * 100) / 100;
  state.attackSpeed = Math.max(0, baseStats.attackSpeed + totals.attackSpeedMultiplier);
  state.critRate = baseStats.critRate;
  state.dodgeRate = clamp(baseStats.dodgeRate + totals.dodgeRateBonus, 0, 0.75);
  state.damageReduction = clamp(baseStats.damageReduction + totals.damageReductionBonus, 0, 0.9);
  state.moveSpeed = Math.max(0, Math.round(baseStats.moveSpeed * Math.max(0, 1 + totals.moveSpeedMultiplier)));
  state.hp = Math.min(state.hp, state.maxHp);
  state.statusEffects = combatState.activeModifiers.map((modifier) => ({
    type: modifier.type,
    sourceId: modifier.sourceId,
    expiresAt: modifier.expiresAt,
    magnitude: modifier.magnitude
  }));

  return totals;
}

export function addTimedModifier(
  player: RuntimePlayer,
  modifier: RuntimeTimedCombatModifier,
  now = Date.now()
): void {
  const combatState = ensureCombatState(player);
  if (modifier.type === "bleed" && modifier.bleedTickIntervalMs && !modifier.nextBleedTickAt) {
    modifier.nextBleedTickAt = now + modifier.bleedTickIntervalMs;
  }
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

export function getBasicAttackBonusDamage(player: RuntimePlayer, now = Date.now()): number {
  const totals = syncPlayerCombatState(player, now);
  return totals.basicAttackBonusDamage;
}

export function getLastDamageSourceId(player: RuntimePlayer): string | undefined {
  return ensureCombatState(player).lastDamageSourceId;
}

export function applyEnvironmentalDamage(
  player: RuntimePlayer,
  amount: number,
  sourceId: string,
  now = Date.now()
): number {
  if (!player.state?.isAlive) {
    return 0;
  }

  syncPlayerCombatState(player, now);
  const mitigatedAmount = Math.max(1, Math.round(amount * (1 - player.state.damageReduction)));
  player.state.hp = Math.max(0, player.state.hp - mitigatedAmount);
  player.state.isAlive = player.state.hp > 0;
  ensureCombatState(player).lastDamageSourceId = sourceId;
  return mitigatedAmount;
}

function emptyTotals(): CombatModifierTotals {
  return {
    attackDamageMultiplier: 0,
    attackSpeedMultiplier: 0,
    basicAttackBonusDamage: 0,
    damageReductionBonus: 0,
    moveSpeedMultiplier: 0,
    dodgeRateBonus: 0
  };
}

function applyBleedTicks(player: RuntimePlayer, now: number): void {
  const state = player.state;
  if (!state?.isAlive) {
    return;
  }

  const combatState = ensureCombatState(player);
  for (const modifier of combatState.activeModifiers) {
    if (modifier.type !== "bleed" || !modifier.bleedDamagePerTick || !modifier.bleedTickIntervalMs) {
      continue;
    }

    modifier.nextBleedTickAt ??= now + modifier.bleedTickIntervalMs;
    while (state.isAlive && modifier.nextBleedTickAt <= now && modifier.expiresAt >= modifier.nextBleedTickAt) {
      state.hp = Math.max(0, state.hp - modifier.bleedDamagePerTick);
      state.isAlive = state.hp > 0;
      combatState.lastDamageSourceId = modifier.damageSourceId ?? modifier.sourceId;
      modifier.nextBleedTickAt += modifier.bleedTickIntervalMs;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
