import { analyzeFacingSamples } from "../facing-analysis.mjs";
import {
  GAME_CANVAS_SELECTOR,
  distance,
  findSelfPosition,
  findSelfRenderMarker,
  getHookSnapshot,
  getRenderSnapshot,
  sampleSelfRenderDuringMove,
  setHookMove,
  sleep
} from "../browser-session.mjs";
import { bootSandboxMatch } from "./boot-sandbox.mjs";

const SAMPLE_INTERVAL_MS = 50;
const WALK_DURATION_MS = 2_400;
const INITIAL_GRACE_MS = 300;
const MIN_FACING_SAMPLES = 6;
const MIN_COVERED_MS = 1_800;

export async function runWalkFacingStability(context) {
  const {
    page,
    appUrl,
    addCheckpoint,
    addFinding,
    note,
    screenshot,
    writeJson
  } = context;

  await bootSandboxMatch({ page, appUrl });

  const bootSnapshot = await getHookSnapshot(page);
  const startPos = findSelfPosition(bootSnapshot);
  const startRender = await getRenderSnapshot(page);
  const startRenderSelf = findSelfRenderMarker(startRender);

  if (bootSnapshot.hooksType !== "object" || !startPos || !startRenderSelf) {
    const bootFailureShot = await screenshot("01-facing-boot-failure.png");
    addFinding({
      severity: "P0",
      scope: "tool",
      title: "Render-facing test hooks unavailable",
      detail: `hooksType=${bootSnapshot.hooksType}; selfPlayerId=${bootSnapshot.selfPlayerId ?? "null"}; renderSelf=${startRenderSelf ? "yes" : "no"}`,
      checkpointId: "boot",
      evidence: { screenshot: bootFailureShot }
    });
    addCheckpoint("boot", "Booted sandbox and found render-facing sample source", "fail", {
      screenshot: bootFailureShot,
      selfPlayerId: bootSnapshot.selfPlayerId,
      startPos
    });
    return;
  }

  addCheckpoint("boot", "Booted sandbox and found render-facing sample source", "pass", {
    selfPlayerId: bootSnapshot.selfPlayerId,
    startPos,
    renderSelf: summarizeRenderSelf(startRenderSelf)
  });
  note("walk-facing booted", {
    selfPlayerId: bootSnapshot.selfPlayerId,
    startPos,
    renderSelf: summarizeRenderSelf(startRenderSelf)
  });

  await page.locator(GAME_CANVAS_SELECTOR).first().click({ position: { x: 800, y: 450 }, force: true });
  await page.bringToFront();

  const rawSamples = await sampleSelfRenderDuringMove(page, { x: 1, y: 0 }, WALK_DURATION_MS, SAMPLE_INTERVAL_MS);
  const samples = rawSamples.map((sample) => ({
    ts: sample.ts,
    elapsedMs: sample.elapsedMs,
    self: sample.self ? summarizeRenderSelf(sample.self) : null
  }));
  await sleep(250);

  const afterMoveSnapshot = await getHookSnapshot(page);
  const afterMovePos = findSelfPosition(afterMoveSnapshot);
  const frameShots = await captureMotionFrames(page, screenshot);
  const afterShot = await screenshot("99-facing-after-stop.png");
  const movedDistance = distance(startPos, afterMovePos);
  const analysis = analyzeFacingSamples(samples, {
    expectedCardinal: "right",
    expectedFlipX: true,
    initialGraceMs: INITIAL_GRACE_MS,
    minSamples: MIN_FACING_SAMPLES,
    minCoveredMs: MIN_COVERED_MS
  });

  const samplesPath = writeJson("facing-samples.json", samples);
  const analysisPath = writeJson("facing-analysis.json", analysis);
  note("walk-facing analysis", {
    pass: analysis.pass,
    consideredSamples: analysis.consideredSamples,
    coveredMs: analysis.coveredMs,
    uniqueCardinals: analysis.uniqueCardinals,
    flipTransitions: analysis.flipTransitions,
    movedDistance: Number(movedDistance.toFixed(1))
  });

  if (movedDistance < 18) {
    addFinding({
      severity: "P1",
      scope: "game",
      title: "Player did not move during right-walk facing test",
      detail: `Expected controlled right movement before judging facing, but distance was ${movedDistance.toFixed(1)}px.`,
      checkpointId: "movement",
      evidence: { screenshot: afterShot, startPos, afterMovePos, samples: samplesPath }
    });
    addCheckpoint("movement", "Moved player right under hook control", "fail", {
      screenshot: afterShot,
      startPos,
      afterMovePos,
      movedDistance: Number(movedDistance.toFixed(1))
    });
    return;
  }

  addCheckpoint("movement", "Moved player right under hook control", "pass", {
    screenshot: afterShot,
    startPos,
    afterMovePos,
    movedDistance: Number(movedDistance.toFixed(1))
  });

  if (analysis.consideredSamples < MIN_FACING_SAMPLES || analysis.coveredMs < MIN_COVERED_MS) {
    addFinding({
      severity: "P0",
      scope: "tool",
      title: "Right-walk facing sampler produced too few usable samples",
      detail: `Expected at least ${MIN_FACING_SAMPLES} usable render samples over ${MIN_COVERED_MS}ms, but captured ${analysis.consideredSamples} over ${analysis.coveredMs}ms. This is a sampler failure, not proof of a game-facing bug.`,
      checkpointId: "facing-right",
      evidence: {
        analysis: analysisPath,
        samples: samplesPath,
        screenshots: frameShots,
        afterStop: afterShot
      }
    });
    addCheckpoint("facing-right", "Held right-walk render facing stays right", "fail", {
      analysis: analysisPath,
      samples: samplesPath,
      screenshots: frameShots,
      consideredSamples: analysis.consideredSamples,
      coveredMs: analysis.coveredMs
    });
    return;
  }

  if (!analysis.pass) {
    const firstViolation = analysis.violations[0];
    addFinding({
      severity: "P1",
      scope: "game",
      title: "Right-walk character facing is unstable",
      detail: `Expected cardinal=right and flipX=true after ${INITIAL_GRACE_MS}ms, but saw ${analysis.violations.length} violation(s). First violation: ${formatViolation(firstViolation)}.`,
      checkpointId: "facing-right",
      evidence: {
        analysis: analysisPath,
        samples: samplesPath,
        screenshots: frameShots,
        afterStop: afterShot
      }
    });
    addCheckpoint("facing-right", "Held right-walk render facing stays right", "fail", {
      analysis: analysisPath,
      samples: samplesPath,
      screenshots: frameShots,
      firstViolation
    });
    return;
  }

  addCheckpoint("facing-right", "Held right-walk render facing stays right", "pass", {
    analysis: analysisPath,
    samples: samplesPath,
    screenshots: frameShots,
    uniqueCardinals: analysis.uniqueCardinals,
    flipTransitions: analysis.flipTransitions,
    coveredMs: analysis.coveredMs,
    animKeys: analysis.animKeys
  });
}

function summarizeRenderSelf(marker) {
  return {
    id: marker.id,
    x: marker.x,
    y: marker.y,
    targetX: marker.targetX,
    targetY: marker.targetY,
    state: marker.state,
    cardinal: marker.cardinal,
    flipX: marker.flipX,
    textureKey: marker.textureKey,
    frameName: marker.frameName,
    animKey: marker.animKey,
    animPlaying: marker.animPlaying,
    actionLocked: marker.actionLocked,
    actionLockedRemainingMs: marker.actionLockedRemainingMs,
    bodyY: marker.bodyY,
    bodyAngle: marker.bodyAngle,
    rootAlpha: marker.rootAlpha,
    visible: marker.visible
  };
}

async function captureMotionFrames(page, screenshot) {
  const frameShots = [];
  await setHookMove(page, { x: 1, y: 0 });
  try {
    for (let index = 0; index < 3; index += 1) {
      await sleep(260);
      const frameIndex = String(index + 1).padStart(2, "0");
      frameShots.push(await screenshot(`facing-frame-${frameIndex}.jpg`));
    }
  } finally {
    await setHookMove(page, { x: 0, y: 0 });
  }
  await sleep(150);
  return frameShots;
}

function formatViolation(violation) {
  if (!violation) return "none";
  const elapsed = violation.elapsedMs === null ? "n/a" : `${violation.elapsedMs}ms`;
  return `${elapsed} ${violation.reasons.join(", ")}`;
}
