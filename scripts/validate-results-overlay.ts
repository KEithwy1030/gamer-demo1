import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

const source = readText("client/src/results/ResultsOverlay.ts");
const styles = readText("client/src/styles/results.css");
const extractService = readText("server/src/extract/service.ts");

assert.match(source, /SettlementItemDetail/, "results overlay should accept settlement item detail payloads");
assert.match(source, /replaceItems\(itemsList, settlement\.result === "success" \? settlement\.extractedItemDetails \?\? \[\] : settlement\.lostItemDetails \?\? \[\]\)/, "results overlay should render extracted or lost item details rather than raw names");
assert.match(source, /results-item-card__icon/, "results overlay should render structured loot cards");
assert.match(source, /formatItemValue\(item\)/, "results overlay should surface value metadata on loot cards");
assert.match(source, /buildPlaytestNote\(latestSettlement\)/, "results overlay should expose a copyable playtest note for manual release-feel sessions");
assert.match(source, /复制测评记录/, "results overlay should surface a playtest note copy action");

assert.match(styles, /\.results-items-list \{[\s\S]*grid-template-columns:\s*repeat\(auto-fit, minmax\(170px, 1fr\)\);/s, "results overlay cards should use a responsive grid");
assert.match(styles, /\.results-item-card \{[\s\S]*grid-template-columns:\s*28px minmax\(0, 1fr\) auto;/s, "results loot cards should keep icon, body, and value lanes stable");
assert.match(styles, /url\("\/assets\/generated\/lobby-black-market-backdrop\.png"\)/, "results overlay should reuse the generated camp backdrop");
assert.match(styles, /@media \(max-width: 560px\) \{[\s\S]*\.results-card \{[\s\S]*max-height:\s*calc\(100dvh - 24px\);[\s\S]*overflow-y:\s*auto;/s, "mobile results card should stay scrollable within the viewport");
assert.match(styles, /@media \(max-width: 560px\) \{[\s\S]*\.results-items-list \{[\s\S]*grid-template-columns:\s*1fr;/s, "mobile results loot list should collapse to one column");
assert.match(styles, /@media \(max-width: 560px\) \{[\s\S]*\.results-actions \{[\s\S]*flex-direction:\s*column;/s, "mobile results actions should stack vertically");

assert.match(extractService, /extractedItemDetails: extractedItems\.details/, "server settlement should expose extracted item details");
assert.match(extractService, /lostItemDetails: lostItems\.details/, "server failure settlement should expose lost item details");
assert.match(extractService, /kind: normalizeSettlementItemKind\(item\.kind\)/, "server settlement should normalize item kinds for UI");

console.log("validate-results-overlay: ok");

function readText(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, "utf8");
}
