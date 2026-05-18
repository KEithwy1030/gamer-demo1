import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

const checks = [
  {
    path: "client/vite.config.ts",
    required: [/port:\s*5288/],
    forbidden: [/port:\s*5173/]
  },
  {
    path: "server/src/config.ts",
    required: [/DEFAULT_PORT\s*=\s*5289/],
    forbidden: [/DEFAULT_PORT\s*=\s*3000/]
  },
  {
    path: "client/src/network/serverUrl.ts",
    required: [/DEFAULT_SERVER_PORT\s*=\s*"5289"/],
    forbidden: [/DEFAULT_SERVER_PORT\s*=\s*"3000"/]
  },
  {
    path: "client/src/network/socketClient.ts",
    required: [/DEFAULT_SERVER_PORT\s*=\s*"5289"/],
    forbidden: [/DEFAULT_SERVER_PORT\s*=\s*"3000"/]
  },
  {
    path: "scripts/dev.mjs",
    required: [/GAMER_SERVER_PORT\s*\?\?\s*"5289"/, /GAMER_CLIENT_PORT\s*\?\?\s*"5288"/],
    forbidden: [/port:\s*5173/, /port:\s*3000/, /localhost:5173/, /localhost:3000/]
  },
  {
    path: "AGENTS.md",
    required: [/5288/, /5289/, /52XX/, /5173/],
    forbidden: [/localhost:5173/]
  },
  {
    path: "README.md",
    required: [/localhost:5288/, /localhost:5289/, /52XX/],
    forbidden: [/localhost:5173/, /localhost:3000/]
  }
];

for (const check of checks) {
  const text = readText(check.path);
  for (const pattern of check.required) {
    assert.match(text, pattern, `${check.path} should match required port policy pattern ${pattern}`);
  }
  for (const pattern of check.forbidden) {
    assert.doesNotMatch(text, pattern, `${check.path} should not contain forbidden port policy pattern ${pattern}`);
  }
}

console.log("validate-project-port-policy: ok");

function readText(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, "utf8");
}
