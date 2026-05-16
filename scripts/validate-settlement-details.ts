import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

const sharedSource = readText("shared/src/types/game.ts");
const serviceSource = readText("server/src/extract/service.ts");
const overlaySource = readText("client/src/results/ResultsOverlay.ts");

assert.match(sharedSource, /extractedItemDetails\?: SettlementItemDetail\[\]/, "settlement payload should carry extracted item detail arrays");
assert.match(sharedSource, /lostItemDetails\?: SettlementItemDetail\[\]/, "settlement payload should carry lost item detail arrays");
assert.match(serviceSource, /extractedItemDetails: extractedItems\.details/, "success settlement should expose extracted item details");
assert.match(serviceSource, /retainedItemDetails: extractedItems\.details/, "success settlement should mirror extracted item details for post-run stash handling");
assert.match(serviceSource, /lostItemDetails: lostItems\.details/, "failure settlement should expose lost item details");
assert.match(overlaySource, /results-item-card__value/, "results overlay should render value-aware loot cards");

console.log("validate-settlement-details: ok");

function readText(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, "utf8");
}
