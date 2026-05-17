import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

const lobbyCss = readText("client/src/styles/lobby.css");
const resultsCss = readText("client/src/styles/results.css");

assert.match(lobbyCss, /@media \(max-width: 900px\)/, "lobby should define a dedicated narrow viewport layout");
assert.match(
  lobbyCss,
  /\.viewport-scale-frame \.stage \{[\s\S]*width:\s*980px;/,
  "mobile lobby should use a narrower design surface instead of shrinking the full desktop stage"
);
assert.match(
  lobbyCss,
  /\.viewport-scale-frame \.grid \{[\s\S]*grid-template-columns:\s*1fr;/,
  "mobile lobby should stack the main hall columns"
);
assert.match(
  lobbyCss,
  /\.viewport-scale-frame \.cta-row \{[\s\S]*flex-direction:\s*column;/,
  "mobile lobby should stack primary and secondary deployment actions"
);
assert.match(
  lobbyCss,
  /\.viewport-scale-frame \.market-layout,[\s\S]*\.viewport-scale-frame \.stash-layout \{[\s\S]*grid-template-columns:\s*1fr;/,
  "mobile lobby tabs should collapse stash and market layouts to one column"
);
assert.match(
  lobbyCss,
  /\.viewport-scale-frame \.ticker \{[\s\S]*position:\s*static;/,
  "mobile lobby ticker should stay in flow instead of covering the compact layout"
);

assert.match(resultsCss, /@media \(max-width: 560px\)/, "results overlay should define a dedicated narrow viewport layout");
assert.match(
  resultsCss,
  /\.results-card \{[\s\S]*max-height:\s*calc\(100dvh - 24px\);[\s\S]*overflow-y:\s*auto;/,
  "mobile results card should remain scrollable within the viewport"
);
assert.match(
  resultsCss,
  /\.results-items-list \{[\s\S]*grid-template-columns:\s*1fr;/,
  "mobile results loot cards should collapse to one column"
);
assert.match(
  resultsCss,
  /\.results-actions \{[\s\S]*flex-direction:\s*column;/,
  "mobile results actions should stack vertically"
);

console.log("validate-mobile-shell: ok");

function readText(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, "utf8");
}
