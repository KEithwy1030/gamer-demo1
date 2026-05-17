import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ITEM_DEFINITIONS } from "@gamer/shared";
import { getItemPresentation, translateItemName } from "../client/src/ui/itemPresentation.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const failures: string[] = [];

for (const [definitionId, definition] of Object.entries(ITEM_DEFINITIONS)) {
  const presentation = getItemPresentation({
    definitionId,
    name: definition.name,
    kind: definition.category,
    slot: definition.slot,
    rarity: definition.rarity
  });

  assert.notEqual(presentation.displayName, definitionId, `${definitionId} should not expose a raw definition id as its name`);
  if (presentation.variant === "misc") {
    failures.push(`${definitionId} (${definition.name}) uses generic misc presentation`);
  }
  assert.ok(presentation.shortLabel.length > 0, `${definitionId} should expose a compact badge`);
  assert.ok(presentation.detailLabel.length > 0, `${definitionId} should expose a readable detail label`);

  const assetPath = /src="([^"]+)"/.exec(presentation.iconSvg)?.[1];
  if (!assetPath) {
    failures.push(`${definitionId} (${definition.name}) uses glyph fallback`);
  } else {
    assert.ok(
      existsSync(path.join(repoRoot, "client", "public", ...assetPath.split("/"))),
      `${definitionId} icon asset should exist on disk: ${assetPath}`
    );
  }

  if (translateItemName(definitionId, definitionId) === definitionId) {
    failures.push(`${definitionId} (${definition.name}) does not translate by definition id`);
  }

}

assert.deepEqual(failures, [], `all catalog items should have bitmap presentation:\n${failures.join("\n")}`);

console.log("validate-item-presentation: ok");
