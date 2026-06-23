import assert from "node:assert/strict";
import {
  classifyOutcome,
  createAgentPlayerSummary,
  toMarkdownReport
} from "./agent-player/report.mjs";
import { analyzeFacingSamples } from "./agent-player/facing-analysis.mjs";

const baseSummary = createAgentPlayerSummary({
  runId: "contract-run",
  scenario: "sandbox-smoke",
  artifactDir: "E:/CursorData/gamer/.codex-artifacts/agent-player/contract-run",
  appUrl: "http://127.0.0.1:5302/?devRoomPreset=sandbox&p0bTestHooks=1"
});

baseSummary.checkpoints.push(
  {
    id: "boot",
    label: "Booted into sandbox",
    status: "pass",
    evidence: { screenshot: "01-boot.png" }
  },
  {
    id: "movement",
    label: "Player moved under test hook control",
    status: "pass",
    evidence: { before: { x: 100, y: 100 }, after: { x: 140, y: 100 } }
  }
);

let outcome = classifyOutcome(baseSummary);
assert.equal(outcome.result, "pass");
assert.equal(outcome.failureScope, null);
assert.equal(outcome.maxSeverity, null);

baseSummary.findings.push({
  severity: "P1",
  scope: "game",
  title: "Chest interaction never starts",
  detail: "The player is next to the sandbox chest but no chest progress event appears.",
  checkpointId: "chest",
  evidence: {
    screenshot: "02-before-chest.png",
    lastEvents: ["state:players", "state:chests"]
  }
});

outcome = classifyOutcome(baseSummary);
assert.equal(outcome.result, "fail");
assert.equal(outcome.failureScope, "game");
assert.equal(outcome.maxSeverity, "P1");

baseSummary.findings.push({
  severity: "P0",
  scope: "tool",
  title: "Browser automation lost the page",
  detail: "Playwright page closed before any game evidence could be captured.",
  checkpointId: "boot",
  evidence: {}
});

outcome = classifyOutcome(baseSummary);
assert.equal(outcome.result, "fail");
assert.equal(outcome.failureScope, "tool");
assert.equal(outcome.maxSeverity, "P0");

const markdown = toMarkdownReport(baseSummary);
assert.match(markdown, /Agent Player Report/);
assert.match(markdown, /Chest interaction never starts/);
assert.match(markdown, /Browser automation lost the page/);
assert.match(markdown, /failureScope: tool/);

const stableFacing = analyzeFacingSamples([
  { elapsedMs: 0, self: { cardinal: "down", flipX: false, state: "IDLE", animKey: "scavenger-sword-idle-down" } },
  { elapsedMs: 340, self: { cardinal: "right", flipX: true, state: "MOVE", animKey: "scavenger-sword-walk-side" } },
  { elapsedMs: 410, self: { cardinal: "right", flipX: true, state: "MOVE", animKey: "scavenger-sword-walk-side" } },
  { elapsedMs: 480, self: { cardinal: "right", flipX: true, state: "MOVE", animKey: "scavenger-sword-walk-side" } }
], { expectedCardinal: "right", expectedFlipX: true, initialGraceMs: 300, minSamples: 3 });
assert.equal(stableFacing.pass, true);
assert.equal(stableFacing.violations.length, 0);

const jitterFacing = analyzeFacingSamples([
  { elapsedMs: 350, self: { cardinal: "right", flipX: true, state: "MOVE", animKey: "scavenger-sword-walk-side" } },
  { elapsedMs: 420, self: { cardinal: "left", flipX: false, state: "MOVE", animKey: "scavenger-sword-walk-side" } },
  { elapsedMs: 490, self: { cardinal: "right", flipX: false, state: "MOVE", animKey: "scavenger-sword-walk-side" } }
], { expectedCardinal: "right", expectedFlipX: true, initialGraceMs: 300, minSamples: 3 });
assert.equal(jitterFacing.pass, false);
assert.equal(jitterFacing.violations.length, 2);
assert.deepEqual(jitterFacing.uniqueCardinals, ["left", "right"]);
assert.equal(jitterFacing.flipTransitions, 1);

const staleAttackStateWalking = analyzeFacingSamples([
  { elapsedMs: 350, self: { cardinal: "right", flipX: true, state: "ATTACK", actionLocked: false, animKey: "scavenger-sword-walk-side" } },
  { elapsedMs: 420, self: { cardinal: "right", flipX: true, state: "ATTACK", actionLocked: false, animKey: "scavenger-sword-walk-side" } },
  { elapsedMs: 490, self: { cardinal: "right", flipX: true, state: "ATTACK", actionLocked: false, animKey: "scavenger-sword-walk-side" } }
], { expectedCardinal: "right", expectedFlipX: true, initialGraceMs: 300, minSamples: 3 });
assert.equal(staleAttackStateWalking.pass, true);
assert.equal(staleAttackStateWalking.consideredSamples, 3);

console.log("validate-agent-player-report: ok");
