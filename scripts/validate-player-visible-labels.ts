import assert from "node:assert/strict";
import type { MonsterState, MonsterType } from "@gamer/shared";
import { getMonsterLabel } from "../client/src/game/entities/monsterReadability";

const baseMonster = (type: MonsterType, overrides: Partial<MonsterState> = {}): MonsterState => ({
  id: `${type}-contract`,
  type,
  x: 0,
  y: 0,
  hp: 45,
  maxHp: 45,
  isAlive: true,
  behaviorPhase: "idle",
  ...overrides
});

for (const type of ["basic", "normal"] as const) {
  assert.equal(
    getMonsterLabel(baseMonster(type)),
    "",
    `${type} monsters should not show a permanent debug/prototype label`
  );
  assert.equal(
    getMonsterLabel(baseMonster(type, { behaviorPhase: "windup" })),
    "",
    `${type} windup readability should use telegraph geometry, not an ATTACK text label`
  );
}

assert.notEqual(
  getMonsterLabel(baseMonster("elite", { eliteRole: "sentinel" })),
  "",
  "elite tier labels are still allowed for role readability"
);
assert.notEqual(
  getMonsterLabel(baseMonster("boss")),
  "",
  "boss tier labels are still allowed for encounter readability"
);

for (const type of ["basic", "normal"] as const) {
  const labels = [
    getMonsterLabel(baseMonster(type)),
    getMonsterLabel(baseMonster(type, { behaviorPhase: "windup" }))
  ];
  assert.equal(labels.some((label) => /MONSTER|ATTACK/.test(label)), false, `${type} labels must not leak English debug text`);
}

console.log("validate-player-visible-labels: ok");
