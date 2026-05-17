import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

const sharedSource = readText("shared/src/types/game.ts");
const serviceSource = readText("server/src/extract/service.ts");
const profileSource = readText("server/src/profile-store.ts");
const lobbySource = readText("client/src/ui/lobbyView.ts");
const overlaySource = readText("client/src/results/ResultsOverlay.ts");

assert.match(sharedSource, /extractedItemDetails\?: SettlementItemDetail\[\]/, "settlement payload should carry extracted item detail arrays");
assert.match(sharedSource, /lostItemDetails\?: SettlementItemDetail\[\]/, "settlement payload should carry lost item detail arrays");
assert.match(serviceSource, /extractedItemDetails: extractedItems\.details/, "success settlement should expose extracted item details");
assert.match(serviceSource, /retainedItemDetails: extractedItems\.details/, "success settlement should mirror extracted item details for post-run stash handling");
assert.match(serviceSource, /lostItemDetails: lostItems\.details/, "failure settlement should expose lost item details");
assert.match(profileSource, /itemDetails: settlement\.result === "success" \? settlement\.extractedItemDetails : settlement\.lostItemDetails/, "profile lastRun should retain item detail payloads");
assert.match(lobbySource, /formatLastRunValueSummary\(state\.profile\.lastRun\)/, "lobby should render a total last-run value summary");
assert.match(lobbySource, /buildLastRunItemChips\(state\.profile\.lastRun\)/, "lobby should render last-run item details when available");
assert.match(lobbySource, /getItemPresentation\(item\)\.displayName/, "lobby recent-run chips should reuse item presentation names");
assert.match(lobbySource, /run-build/, "lobby should render the build tag on the recent-run card");
assert.match(lobbySource, /Build: \$\{getBuildCommit\(\)\}/, "lobby should show the current build tag text");
assert.match(lobbySource, /buildPlaytestNote\(this\.latestPlaytestSettlement\)/, "lobby should reuse the playtest note export for the recent-run copy action");
assert.match(lobbySource, /buildManualPlaytestTemplate\(\)/, "lobby should copy a build-stamped manual playtest template before any last run exists");
assert.doesNotMatch(lobbySource, /runPlaytestCopy\.disabled = !this\.latestPlaytestSettlement/, "lobby should not block pre-run manual playtest template capture");
assert.match(overlaySource, /results-item-card__value/, "results overlay should render value-aware loot cards");
assert.match(overlaySource, /presentation\.displayName/, "results overlay item cards should use presentation names instead of raw settlement names");
assert.match(overlaySource, /formatPressurePhase\(settlement\.survivedSeconds\)/, "playtest note should preserve the run's pressure phase from settlement data");
assert.match(overlaySource, /sumSettlementItemValue\(settlement\.result === "success" \? settlement\.extractedItemDetails : settlement\.lostItemDetails\)/, "playtest note should include item-value evidence for greed decisions");
assert.match(overlaySource, /Next run prompt: \$\{nextRunPrompt\}/, "playtest note should preserve the visible replay prompt");
assert.match(overlaySource, /export function buildManualPlaytestTemplate/, "results note helpers should export a pre-run manual playtest template");

console.log("validate-settlement-details: ok");

function readText(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, "utf8");
}
