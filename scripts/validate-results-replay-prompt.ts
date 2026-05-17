import assert from "node:assert/strict";
import { buildNextRunPrompt } from "../client/src/results/replayPrompt.ts";
import type { SettlementPayload } from "@gamer/shared";

assert.match(
  buildNextRunPrompt(makeSettlement({
    result: "success",
    reason: "extracted",
    profileGoldDelta: 420,
    extractedItemDetails: [makeItem("treasure_cursed_reliquary", 0, 420)]
  })),
  /黑市.*争夺箱/,
  "high-value extraction should push the player toward market payoff and contested resources"
);

assert.match(
  buildNextRunPrompt(makeSettlement({
    result: "success",
    reason: "extracted",
    survivedSeconds: 560,
    profileGoldDelta: 120
  })),
  /多贪一个资源点.*12 分钟前撤离/,
  "late successful extraction should encourage a greedier but bounded next route"
);

assert.match(
  buildNextRunPrompt(makeSettlement({
    result: "failure",
    reason: "corpseFog",
    survivedSeconds: 735,
    loadoutLost: true
  })),
  /8 分钟.*尸毒抗性药/,
  "corpse-fog failure should teach earlier extraction timing and miasma tonic use"
);

assert.match(
  buildNextRunPrompt(makeSettlement({
    result: "failure",
    reason: "killed",
    loadoutLost: true
  })),
  /轻装进场.*止血.*复仇/,
  "killed-with-loss failure should create a recovery and revenge objective"
);

assert.match(
  buildNextRunPrompt(makeSettlement({
    result: "failure",
    reason: "timeout",
    survivedSeconds: 180
  })),
  /搜索和撤离/,
  "low-information failure should point back to the core search/extract loop"
);

console.log("validate-results-replay-prompt: ok");

function makeSettlement(overrides: Partial<SettlementPayload>): SettlementPayload {
  return {
    result: "success",
    reason: "extracted",
    survivedSeconds: 300,
    playerKills: 0,
    monsterKills: 0,
    extractedItems: [],
    lostItems: [],
    extractedGold: 0,
    extractedTreasureValue: 0,
    profileGoldDelta: 0,
    loadoutLost: false,
    ...overrides
  };
}

function makeItem(definitionId: string, goldValue: number, treasureValue: number) {
  return {
    instanceId: `${definitionId}-instance`,
    definitionId,
    kind: "treasure" as const,
    rarity: "rare" as const,
    name: definitionId,
    goldValue,
    treasureValue
  };
}
