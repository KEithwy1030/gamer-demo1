import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

const packageJson = readText("package.json");
const devScript = readText("scripts/dev.mjs");
const protocol = readText("docs/agent/MANUAL_PLAYTEST_PROTOCOL_2026-05-18.md");
const audit = readText("docs/agent/DEMO1_COMPLETION_AUDIT_2026-05-18.md");

assert.match(
  packageJson,
  /"playtest:manual":\s*"node scripts\/dev\.mjs --manual-playtest"/,
  "package.json should expose the resource-managed manual playtest entrypoint"
);
assert.match(devScript, /process\.argv\.includes\("--manual-playtest"\)/, "dev launcher should recognize manual playtest mode");
assert.match(devScript, /20 \* 60 \* 1000/, "manual playtest mode should auto-stop after 20 minutes");
assert.match(devScript, /stopAll\(0\)/, "manual playtest auto-stop should clean child process trees");
assert.match(devScript, /http:\/\/localhost:5173\//, "manual playtest mode should print the browser URL");
assert.match(
  devScript,
  /docs\/agent\/MANUAL_PLAYTEST_PROTOCOL_2026-05-18\.md/,
  "manual playtest mode should print the protocol path"
);
assert.match(protocol, /npm run playtest:manual/, "manual protocol should use the resource-managed entrypoint");
assert.match(protocol, /auto-stops after 20 minutes/, "manual protocol should document the auto-stop guard");
assert.match(audit, /`playtest:manual`/, "completion audit should name the manual playtest entrypoint");
assert.match(audit, /resource-managed entrypoint/, "completion audit should record the resource hygiene reason");

console.log("validate-manual-playtest-entrypoint: ok");

function readText(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, "utf8");
}
