import {
  GAME_CANVAS_SELECTOR,
  distance,
  findSelfPosition,
  getHookSnapshot,
  getRenderSnapshot,
  sendHookMove,
  sleep,
  waitForEventAfter
} from "../browser-session.mjs";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bootSandboxMatch } from "./boot-sandbox.mjs";

const INTERACT_KEY = "e";
const MIN_MOVE_DISTANCE = 18;
const CHEST_PROMPT_SAFE_RANGE = 48;
const CANVAS_REVIEW_TEXTURE_KEYS = new Set(["world_decor", "world_structures"]);
const CANVAS_REVIEW_MIN_OBJECT_AREA = 9_000;

export async function runFirstThreeMinutes(context) {
  const {
    page,
    appUrl,
    addCheckpoint,
    addFinding,
    note,
    screenshot,
    writeImageDataUrl,
    writeJson
  } = context;

  const { matchStarted } = await bootSandboxMatch({ page, appUrl });

  const firstGlanceShot = await screenshot("01-first-glance.png");
  const firstSnapshot = await getHookSnapshot(page);
  const spawnPos = findSelfPosition(firstSnapshot);
  const devPanel = await page.evaluate(() => {
    const panel = document.getElementById("gamer-dev-log-panel");
    return {
      exists: Boolean(panel),
      text: panel instanceof HTMLElement ? panel.innerText : null
    };
  });

  if (devPanel.exists) {
    addFinding({
      severity: "P1",
      scope: "game",
      title: "Player screen shows a dev log panel",
      detail: "The quality bar requires no dev elements on the player screen. The first actionable game screen exposes #gamer-dev-log-panel.",
      checkpointId: "first-glance",
      evidence: { screenshot: firstGlanceShot, devPanel }
    });
    addCheckpoint("first-glance", "First actionable screen has no visible dev overlay", "fail", {
      screenshot: firstGlanceShot,
      devPanel
    });
    return;
  }

  if (firstSnapshot.hooksType !== "object" || !spawnPos) {
    addFinding({
      severity: "P0",
      scope: "tool",
      title: "Sandbox hooks or self position unavailable",
      detail: `hooksType=${firstSnapshot.hooksType}; selfPlayerId=${firstSnapshot.selfPlayerId ?? "null"}`,
      checkpointId: "boot",
      evidence: { screenshot: firstGlanceShot }
    });
    addCheckpoint("boot", "Booted sandbox and found controllable player", "fail", {
      screenshot: firstGlanceShot,
      selfPlayerId: firstSnapshot.selfPlayerId,
      spawnPos
    });
    return;
  }

  addCheckpoint("first-glance", "First actionable screen has no visible dev overlay", "pass", {
    screenshot: firstGlanceShot,
    selfPlayerId: firstSnapshot.selfPlayerId,
    spawnPos
  });
  note("first actionable screen captured", {
    selfPlayerId: firstSnapshot.selfPlayerId,
    spawnPos
  });

  const sandboxProbe = await probeSandboxPreset(page);
  const sandboxProbePath = writeJson("sandbox-probe.json", sandboxProbe);
  if (sandboxProbe.aliveMonsterCount !== 1 || sandboxProbe.chestCount < 1) {
    addFinding({
      severity: "P0",
      scope: "tool",
      title: "Sandbox preset is not deterministic enough for core experience testing",
      detail: `Expected 1 dummy monster and at least 1 chest, got aliveMonsterCount=${sandboxProbe.aliveMonsterCount}, chestCount=${sandboxProbe.chestCount}.`,
      checkpointId: "sandbox-fixture",
      evidence: { probe: sandboxProbePath, screenshot: firstGlanceShot }
    });
    addCheckpoint("sandbox-fixture", "Sandbox fixture exposes one dummy and a chest", "fail", {
      probe: sandboxProbePath
    });
    return;
  }
  addCheckpoint("sandbox-fixture", "Sandbox fixture exposes one dummy and a chest", "pass", {
    probe: sandboxProbePath
  });

  await sendHookMove(page, { x: 1, y: 0 }, 700);
  const afterMoveSnapshot = await getHookSnapshot(page);
  const afterMovePos = findSelfPosition(afterMoveSnapshot);
  const moveShot = await screenshot("02-move-response.png");
  const movedDistance = distance(spawnPos, afterMovePos);
  if (movedDistance < MIN_MOVE_DISTANCE) {
    addFinding({
      severity: "P1",
      scope: "game",
      title: "Player does not visibly respond to movement input",
      detail: `Expected movement distance >= ${MIN_MOVE_DISTANCE}px, got ${movedDistance.toFixed(1)}px.`,
      checkpointId: "movement",
      evidence: { screenshot: moveShot, spawnPos, afterMovePos }
    });
    addCheckpoint("movement", "Player responds to movement input", "fail", {
      screenshot: moveShot,
      spawnPos,
      afterMovePos,
      movedDistance: Number(movedDistance.toFixed(1))
    });
    return;
  }
  addCheckpoint("movement", "Player responds to movement input", "pass", {
    screenshot: moveShot,
    spawnPos,
    afterMovePos,
    movedDistance: Number(movedDistance.toFixed(1))
  });

  await clearNearbyPickupPrompts(page);

  const chestPos = sandboxProbe.firstChest;
  const beforeChestPath = await screenshot("03-before-chest.png");
  const preChestDomOverlayProbe = await readDomOverlayProbe(page);
  const preChestDomOverlayProbePath = writeJson("pre-chest-dom-overlay-probe.json", preChestDomOverlayProbe);
  const preChestCanvasProbe = await readCanvasObjectProbe(page);
  const preChestCanvasProbePath = writeJson("pre-chest-canvas-object-probe.json", preChestCanvasProbe);
  if (preChestDomOverlayProbe.blockingOverlayCount > 0) {
    addFinding({
      severity: "P1",
      scope: "game",
      title: "DOM UI blocks the playfield before the first chest",
      detail: `Observed ${preChestDomOverlayProbe.blockingOverlayCount} visible DOM overlay(s) crossing the central playfield before the first chest interaction.`,
      checkpointId: "pre-chest-dom-overlays",
      evidence: { probe: preChestDomOverlayProbePath, screenshot: beforeChestPath }
    });
    addCheckpoint("pre-chest-dom-overlays", "Default play flow keeps blocking DOM overlays off the playfield", "fail", {
      probe: preChestDomOverlayProbePath,
      screenshot: beforeChestPath,
      blockingOverlays: preChestDomOverlayProbe.blockingOverlays
    });
  } else {
    addCheckpoint("pre-chest-dom-overlays", "Default play flow keeps blocking DOM overlays off the playfield", "pass", {
      probe: preChestDomOverlayProbePath,
      screenshot: beforeChestPath
    });
  }
  if (preChestCanvasProbe.suspiciousObjectCount > 0) {
    addFinding({
      severity: "P2",
      scope: "game",
      title: "World art overlaps the pickup feedback review band before the first chest",
      detail: `Observed ${preChestCanvasProbe.suspiciousObjectCount} large world-art object(s) crossing the lower-center pickup feedback review band before the first chest interaction.`,
      checkpointId: "pre-chest-canvas-objects",
      evidence: { probe: preChestCanvasProbePath, screenshot: beforeChestPath }
    });
    addCheckpoint("pre-chest-canvas-objects", "Lower-center pickup feedback band is free of large world-art clutter before the first chest", "fail", {
      probe: preChestCanvasProbePath,
      screenshot: beforeChestPath,
      suspiciousObjects: preChestCanvasProbe.suspiciousObjects
    });
  } else {
    addCheckpoint("pre-chest-canvas-objects", "Lower-center pickup feedback band is free of large world-art clutter before the first chest", "pass", {
      probe: preChestCanvasProbePath,
      screenshot: beforeChestPath
    });
  }
  const chestAudioBaseline = readDevLogSnapshot();
  const chestResult = await openSandboxChest(page, chestPos, matchStarted.ts);
  if (!chestResult.opened) {
    const failedShot = await screenshot("04-chest-failed.png");
    addFinding({
      severity: "P1",
      scope: "game",
      title: "First chest interaction does not complete",
      detail: chestResult.detail,
      checkpointId: "first-chest",
      evidence: {
        before: beforeChestPath,
        after: failedShot,
        chestPos,
        attempts: chestResult.attempts
      }
    });
    addCheckpoint("first-chest", "First chest can be opened from the player flow", "fail", {
      before: beforeChestPath,
      after: failedShot,
      chestPos,
      attempts: chestResult.attempts
    });
    return;
  }
  await sleep(450);
  const chestOpenedShot = await screenshot("04-chest-opened.png");
  const chestPromptProbe = await readVisibleOpenPromptProbe(page);
  const chestPromptProbePath = writeJson("chest-prompt-probe.json", chestPromptProbe);
  const chestDomOverlayProbe = await readDomOverlayProbe(page);
  const chestDomOverlayProbePath = writeJson("chest-dom-overlay-probe.json", chestDomOverlayProbe);
  const chestCanvasProbe = await readCanvasObjectProbe(page);
  const chestCanvasProbePath = writeJson("chest-canvas-object-probe.json", chestCanvasProbe);
  const chestAudioProbe = analyzeChestAudioSince(chestAudioBaseline);
  const chestAudioProbePath = writeJson("chest-audio-probe.json", chestAudioProbe);
  const lootSummary = summarizeLootFromOpenEvent(chestResult.openEvent);
  addCheckpoint("first-chest", "First chest can be opened from the player flow", "pass", {
    before: beforeChestPath,
    screenshot: chestOpenedShot,
    chestPos,
    openEvent: summarizeEvent(chestResult.openEvent),
    loot: lootSummary,
    promptProbe: chestPromptProbePath,
    domOverlayProbe: chestDomOverlayProbePath,
    canvasObjectProbe: chestCanvasProbePath
  });
  if (chestPromptProbe.visibleOpenPromptCount > 0) {
    addFinding({
      severity: "P1",
      scope: "game",
      title: "First chest leaves the open prompt visible after opening",
      detail: `Observed ${chestPromptProbe.visibleOpenPromptCount} visible text object(s) containing 开箱 after the first chest opened.`,
      checkpointId: "first-chest-prompt",
      evidence: { probe: chestPromptProbePath, screenshot: chestOpenedShot }
    });
    addCheckpoint("first-chest-prompt", "First chest clears the open prompt after opening", "fail", {
      probe: chestPromptProbePath,
      screenshot: chestOpenedShot,
      visibleOpenPrompts: chestPromptProbe.visibleOpenPrompts
    });
  } else {
    addCheckpoint("first-chest-prompt", "First chest clears the open prompt after opening", "pass", {
      probe: chestPromptProbePath,
      screenshot: chestOpenedShot
    });
  }
  if (chestDomOverlayProbe.blockingOverlayCount > 0) {
    addFinding({
      severity: "P1",
      scope: "game",
      title: "DOM UI blocks the playfield after the first chest opens",
      detail: `Observed ${chestDomOverlayProbe.blockingOverlayCount} visible DOM overlay(s) crossing the central playfield after the chest opened.`,
      checkpointId: "first-chest-dom-overlays",
      evidence: { probe: chestDomOverlayProbePath, screenshot: chestOpenedShot }
    });
    addCheckpoint("first-chest-dom-overlays", "First chest reward feedback does not leave blocking DOM overlays", "fail", {
      probe: chestDomOverlayProbePath,
      screenshot: chestOpenedShot,
      blockingOverlays: chestDomOverlayProbe.blockingOverlays
    });
  } else {
    addCheckpoint("first-chest-dom-overlays", "First chest reward feedback does not leave blocking DOM overlays", "pass", {
      probe: chestDomOverlayProbePath,
      screenshot: chestOpenedShot
    });
  }
  if (chestCanvasProbe.suspiciousObjectCount > 0) {
    addFinding({
      severity: "P2",
      scope: "game",
      title: "World art overlaps the pickup feedback review band after the first chest opens",
      detail: `Observed ${chestCanvasProbe.suspiciousObjectCount} large world-art object(s) crossing the lower-center pickup feedback review band after the first chest opened.`,
      checkpointId: "first-chest-canvas-objects",
      evidence: { probe: chestCanvasProbePath, screenshot: chestOpenedShot }
    });
    addCheckpoint("first-chest-canvas-objects", "First chest reward feedback band is free of large world-art clutter", "fail", {
      probe: chestCanvasProbePath,
      screenshot: chestOpenedShot,
      suspiciousObjects: chestCanvasProbe.suspiciousObjects
    });
  } else {
    addCheckpoint("first-chest-canvas-objects", "First chest reward feedback band is free of large world-art clutter", "pass", {
      probe: chestCanvasProbePath,
      screenshot: chestOpenedShot
    });
  }
  if (!chestAudioProbe.available) {
    addFinding({
      severity: "P2",
      scope: "tool",
      title: "First chest audio evidence is unavailable",
      detail: `Agent-player could not read ${chestAudioProbe.path}; the first chest cannot be audio-checked from devlog evidence.`,
      checkpointId: "first-chest-audio",
      evidence: { probe: chestAudioProbePath, screenshot: chestOpenedShot }
    });
    addCheckpoint("first-chest-audio", "First chest emits file-backed rummage audio", "fail", {
      probe: chestAudioProbePath,
      screenshot: chestOpenedShot
    });
  } else if (chestAudioProbe.rummageTick.total === 0) {
    addFinding({
      severity: "P2",
      scope: "game",
      title: "First chest rummage has no tick audio evidence",
      detail: "The chest opened, but no rummage-tick audio.play event appeared in the devlog window for this interaction.",
      checkpointId: "first-chest-audio",
      evidence: { probe: chestAudioProbePath, screenshot: chestOpenedShot }
    });
    addCheckpoint("first-chest-audio", "First chest emits file-backed rummage audio", "fail", {
      probe: chestAudioProbePath,
      screenshot: chestOpenedShot
    });
  } else if (!chestAudioProbe.rummageTick.allHaveFiles) {
    addFinding({
      severity: "P1",
      scope: "game",
      title: "First chest rummage audio falls back to a missing-file cue",
      detail: `Observed ${chestAudioProbe.rummageTick.missingFile} rummage-tick plays with hasFile!=yes during the first chest interaction.`,
      checkpointId: "first-chest-audio",
      evidence: { probe: chestAudioProbePath, screenshot: chestOpenedShot }
    });
    addCheckpoint("first-chest-audio", "First chest emits file-backed rummage audio", "fail", {
      probe: chestAudioProbePath,
      screenshot: chestOpenedShot,
      rummageTick: chestAudioProbe.rummageTick
    });
  } else {
    addCheckpoint("first-chest-audio", "First chest emits file-backed rummage audio", "pass", {
      probe: chestAudioProbePath,
      rummageTick: chestAudioProbe.rummageTick,
      chestCue: chestAudioProbe.chestCue,
      pickupCue: chestAudioProbe.pickupCue
    });
  }
  note("first chest opened", {
    chestPos,
    openEvent: summarizeEvent(chestResult.openEvent),
    loot: lootSummary,
    chestAudio: chestAudioProbe.summary
  });

  const combatResult = await hitSandboxDummy(page, sandboxProbe.firstMonster, matchStarted.ts, writeImageDataUrl);
  if (!combatResult.hit) {
    const combatFailedShot = await screenshot("05-combat-failed.png");
    const hitFramesPath = writeJson("hit-frame-sequence.json", {
      hit: false,
      attempts: combatResult.attempts,
      capture: combatResult.capture,
      frames: combatResult.frames ?? []
    });
    addFinding({
      severity: "P1",
      scope: "game",
      title: "First attack does not produce a dummy hit",
      detail: combatResult.detail,
      checkpointId: "first-hit",
      evidence: {
        screenshot: combatFailedShot,
        monster: sandboxProbe.firstMonster,
        attempts: combatResult.attempts,
        frameSequence: hitFramesPath,
        savedFrames: combatResult.frames ?? []
      }
    });
    addCheckpoint("first-hit", "First attack produces combat hit feedback evidence", "fail", {
      screenshot: combatFailedShot,
      monster: sandboxProbe.firstMonster,
      attempts: combatResult.attempts,
      frames: hitFramesPath,
      screenshots: combatResult.frames?.map((frame) => frame.path).filter(Boolean) ?? []
    });
    return;
  }

  const hitFramesPath = writeJson("hit-frame-sequence.json", {
    hit: true,
    hitEvent: summarizeEvent(combatResult.hitEvent),
    attempts: combatResult.attempts,
    capture: combatResult.capture,
    frames: combatResult.frames
  });
  addCheckpoint("first-hit", "First attack produces combat hit feedback evidence", "pass", {
    hitEvent: summarizeEvent(combatResult.hitEvent),
    frames: hitFramesPath,
    frameCount: combatResult.frames.length,
    maxVisualDelta: maxVisualDelta(combatResult.frames),
    screenshots: combatResult.frames.map((frame) => frame.path)
  });
  note("first hit observed", {
    hitEvent: summarizeEvent(combatResult.hitEvent),
    frameCount: combatResult.frames.length,
    maxVisualDelta: maxVisualDelta(combatResult.frames),
    capture: combatResult.capture
  });

  const muteState = await page.evaluate(() => {
    const button = document.querySelector(".audio-mute-toggle");
    if (!(button instanceof HTMLElement)) return { exists: false, mutedAfterClick: null };
    button.click();
    return {
      exists: true,
      mutedAfterClick: button.classList.contains("audio-mute-toggle--muted")
    };
  });
  const muteShot = await screenshot("06-muted.png");
  if (!muteState.exists || !muteState.mutedAfterClick) {
    addFinding({
      severity: "P2",
      scope: "game",
      title: "Audio mute control is missing or does not toggle",
      detail: `Mute probe returned ${JSON.stringify(muteState)}.`,
      checkpointId: "audio-control",
      evidence: { screenshot: muteShot, muteState }
    });
    addCheckpoint("audio-control", "Audio mute control toggles", "fail", {
      screenshot: muteShot,
      muteState
    });
    return;
  }
  addCheckpoint("audio-control", "Audio mute control toggles", "pass", {
    screenshot: muteShot,
    muteState
  });

  writeJson("human-review-checklist.json", {
    scenario: "first-three-minutes",
    items: [
      "01-first-glance.png should read as a moonlit ruined world, not a dev/test screen.",
      "02-move-response.png should show clear player position change without visual jitter.",
      "04-chest-opened.png should make the first chest result obvious and should not leave the open prompt over the chest.",
      "chest-prompt-probe.json should show visibleOpenPromptCount=0 after the chest opens.",
      "pre-chest-dom-overlay-probe.json and chest-dom-overlay-probe.json should show blockingOverlayCount=0, including mobile touch-control layers.",
      "pre-chest-canvas-object-probe.json and chest-canvas-object-probe.json should show suspiciousObjectCount=0 so world art does not sit under pickup feedback.",
      "chest-audio-probe.json should show rummage-tick with hasFile=yes.",
      "05-hit-feedback-*.jpg should include pre-attack and post-hit continuous frames with a readable hit moment.",
      "06-muted.png should not cover the playfield with heavy UI."
    ]
  });
}

async function clearNearbyPickupPrompts(page) {
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press(INTERACT_KEY);
    await sleep(260);
  }
}

async function openSandboxChest(page, chestPos, afterTs) {
  const attempts = [];
  try {
    await walkToChestInteractRange(page, chestPos);
  } catch (error) {
    return {
      opened: false,
      attempts,
      detail: `Could not navigate to the sandbox chest: ${formatError(error)}`
    };
  }

  let started = null;
  for (let attempt = 0; attempt < 6 && !started; attempt += 1) {
    const promptProbe = await readVisibleOpenPromptProbe(page);
    await page.keyboard.press(INTERACT_KEY);
    try {
      started = await waitForEventAfter(page, ["chest:progress", "domain:ChestRummageStarted"], afterTs, 1_800);
    } catch {
      const selfPos = await readSelfPosition(page);
      attempts.push({
        attempt,
        selfPos,
        chestDistance: selfPos ? Number(distance(selfPos, chestPos).toFixed(1)) : null,
        visibleOpenPromptCount: promptProbe.visibleOpenPromptCount,
        visibleOpenPrompts: promptProbe.visibleOpenPrompts
      });
      await walkToChestInteractRange(page, chestPos).catch(() => {});
    }
  }

  if (!started) {
    return {
      opened: false,
      attempts,
      detail: "Chest rummage never started after repeated interact attempts."
    };
  }

  try {
    const openEvent = await waitForEventAfter(page, ["chest:opened", "domain:ChestOpened"], started.ts, 20_000);
    return { opened: true, attempts, startEvent: started, openEvent };
  } catch (error) {
    return {
      opened: false,
      attempts,
      detail: `Chest rummage started but no opened event arrived: ${formatError(error)}`
    };
  }
}

async function walkToChestInteractRange(page, chestPos) {
  const approachPoints = [
    { x: chestPos.x, y: chestPos.y - 42 },
    { x: chestPos.x - 42, y: chestPos.y },
    { x: chestPos.x + 42, y: chestPos.y },
    { x: chestPos.x, y: chestPos.y + 42 },
    { x: chestPos.x - 32, y: chestPos.y - 32 },
    { x: chestPos.x + 32, y: chestPos.y - 32 }
  ];

  const current = await readSelfPosition(page);
  const ordered = current
    ? [...approachPoints].sort((left, right) => distance(current, left) - distance(current, right))
    : approachPoints;

  let lastError = null;
  for (const point of ordered) {
    try {
      const reached = await walkTo(page, point.x, point.y, 5_000, {
        acceptableDistance: 14,
        stopWhen: (pos) => distance(pos, chestPos) <= CHEST_PROMPT_SAFE_RANGE
      });
      if (distance(reached, chestPos) <= CHEST_PROMPT_SAFE_RANGE) {
        return reached;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`could not reach chest interact range; lastError=${formatError(lastError)}`);
}

async function hitSandboxDummy(page, monsterPos, afterTs, writeImageDataUrl) {
  const canvas = page.locator(GAME_CANVAS_SELECTOR).first();
  const attempts = [];
  const attackAt = async () => {
    const pos = await readSelfPosition(page);
    if (!pos) return null;
    const dx = monsterPos.x - pos.x;
    const dy = monsterPos.y - pos.y;
    const mag = Math.max(1, Math.hypot(dx, dy));
    await canvas.click({
      position: {
        x: Math.round(800 + (dx / mag) * 110),
        y: Math.round(450 + (dy / mag) * 110)
      },
      force: true
    }).catch(() => {});
    return pos;
  };

  let hitEvent = null;
  let lastCapture = null;
  for (let attempt = 0; attempt < 8 && !hitEvent; attempt += 1) {
    await walkTo(page, monsterPos.x - 90, monsterPos.y).catch(() => {});
    const capturePromise = captureCanvasFrames(page, {
      maxFrames: 48,
      everyNthFrame: 1,
      quality: 0.74,
      sampleWidth: 80,
      sampleHeight: 45,
      maxCaptureMs: 2_200
    });
    await sleep(80);
    const attemptAfterTs = Date.now() - 50;
    const attackPos = await attackAt();
    attempts.push({ attempt, attackPos });
    const eventPromise = waitForEventAfter(
      page,
      ["domain:MonsterDamaged"],
      Math.max(afterTs, attemptAfterTs),
      1_500
    ).catch(() => null);
    const [capture, event] = await Promise.all([capturePromise, eventPromise]);
    lastCapture = { attempt, capture };
    if (event) hitEvent = event;
  }

  if (!hitEvent) {
    const frames = lastCapture
      ? persistCapturedFrames(lastCapture.capture, writeImageDataUrl, "05-hit-feedback-failed")
      : [];
    return {
      hit: false,
      attempts,
      frames,
      capture: summarizeCapture(lastCapture?.capture ?? null),
      detail: "MonsterDamaged never appeared while attacking the sandbox dummy."
    };
  }

  const frames = persistCapturedFrames(lastCapture.capture, writeImageDataUrl, "05-hit-feedback");
  return { hit: true, attempts, hitEvent, frames, capture: summarizeCapture(lastCapture.capture) };
}

async function captureCanvasFrames(page, options) {
  return page.evaluate(({ selector, maxFrames, everyNthFrame, quality, sampleWidth, sampleHeight, maxCaptureMs }) => {
    return new Promise((resolveCapture) => {
      const canvasEl = document.querySelector(selector);
      if (!(canvasEl instanceof HTMLCanvasElement)) {
        resolveCapture({ error: `Canvas not found for selector ${selector}`, frames: [] });
        return;
      }

      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = sampleWidth;
      sampleCanvas.height = sampleHeight;
      const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
      const startedAt = performance.now();
      const frames = [];
      let previousPixels = null;
      let tick = 0;
      let done = false;
      const finish = (finishReason) => {
        if (done) return;
        done = true;
        resolveCapture({ finishReason, frames });
      };
      const timeoutId = window.setTimeout(() => finish("timeout"), maxCaptureMs);

      const grab = () => {
        if (done) return;
        tick += 1;
        if (tick % everyNthFrame === 0) {
          const elapsedMs = Math.round(performance.now() - startedAt);
          const frame = { elapsedMs, dataUrl: null, visualDelta: null, averageLuma: null, error: null };
          try {
            if (sampleContext) {
              sampleContext.drawImage(canvasEl, 0, 0, sampleWidth, sampleHeight);
              const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
              let lumaTotal = 0;
              let diffTotal = 0;
              for (let index = 0; index < pixels.length; index += 4) {
                const luma = (pixels[index] * 0.2126) + (pixels[index + 1] * 0.7152) + (pixels[index + 2] * 0.0722);
                lumaTotal += luma;
                if (previousPixels) {
                  diffTotal += Math.abs(pixels[index] - previousPixels[index]);
                  diffTotal += Math.abs(pixels[index + 1] - previousPixels[index + 1]);
                  diffTotal += Math.abs(pixels[index + 2] - previousPixels[index + 2]);
                }
              }
              frame.averageLuma = Number((lumaTotal / (pixels.length / 4)).toFixed(2));
              frame.visualDelta = previousPixels
                ? Number((diffTotal / ((pixels.length / 4) * 3)).toFixed(2))
                : 0;
              previousPixels = new Uint8ClampedArray(pixels);
            }
            frame.dataUrl = canvasEl.toDataURL("image/jpeg", quality);
          } catch (error) {
            frame.error = error instanceof Error ? error.message : String(error);
          }
          frames.push(frame);
        }
        if (frames.length >= maxFrames) {
          window.clearTimeout(timeoutId);
          finish("maxFrames");
          return;
        }
        requestAnimationFrame(grab);
      };
      requestAnimationFrame(grab);
    });
  }, {
    selector: GAME_CANVAS_SELECTOR,
    maxFrames: options.maxFrames,
    everyNthFrame: options.everyNthFrame,
    quality: options.quality,
    sampleWidth: options.sampleWidth,
    sampleHeight: options.sampleHeight,
    maxCaptureMs: options.maxCaptureMs
  });
}

function persistCapturedFrames(capture, writeImageDataUrl, baseName) {
  return (capture.frames ?? []).map((frame, index) => {
    const frameNo = String(index + 1).padStart(2, "0");
    const meta = {
      index: index + 1,
      elapsedMs: frame.elapsedMs ?? null,
      visualDelta: frame.visualDelta ?? null,
      averageLuma: frame.averageLuma ?? null
    };
    if (!frame.dataUrl) {
      return { ...meta, path: null, error: frame.error ?? "missing dataUrl" };
    }
    return {
      ...meta,
      path: writeImageDataUrl(`${baseName}-${frameNo}.jpg`, frame.dataUrl)
    };
  });
}

function summarizeCapture(capture) {
  if (!capture) return null;
  return {
    finishReason: capture.finishReason ?? null,
    frameCount: capture.frames?.length ?? 0,
    maxVisualDelta: maxVisualDelta(capture.frames ?? [])
  };
}

function maxVisualDelta(frames) {
  return Number(Math.max(0, ...frames.map((frame) => Number(frame.visualDelta ?? 0))).toFixed(2));
}

async function walkTo(page, targetX, targetY, timeoutMs = 15_000, options = {}) {
  const acceptableDistance = options.acceptableDistance ?? 20;
  const started = Date.now();
  let last = null;
  let stallCount = 0;
  while (Date.now() - started < timeoutMs) {
    const pos = await readSelfPosition(page);
    if (!pos) {
      await sleep(150);
      continue;
    }
    const dx = targetX - pos.x;
    const dy = targetY - pos.y;
    const dist = Math.hypot(dx, dy);
    if (options.stopWhen?.(pos)) {
      return pos;
    }
    if (dist <= acceptableDistance) {
      return pos;
    }
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 6) {
      stallCount += 1;
      const sidestep = Math.abs(dx) >= Math.abs(dy)
        ? { x: 0, y: stallCount % 2 === 0 ? 1 : -1 }
        : { x: stallCount % 2 === 0 ? 1 : -1, y: 0 };
      await sendHookMove(page, sidestep, 320);
    }
    last = pos;
    const burstMs = Math.max(60, Math.min(400, Math.round((dist / 300) * 1000) - 40));
    await sendHookMove(page, { x: dx / dist, y: dy / dist }, burstMs);
  }
  throw new Error(`walkTo timed out heading to ${targetX},${targetY}`);
}

async function readSelfPosition(page) {
  const snapshot = await getHookSnapshot(page);
  return findSelfPosition(snapshot);
}

async function probeSandboxPreset(page) {
  const chests = await page.evaluate(() => {
    const event = (window.__AGENT_PLAYER_EVENTS__ ?? []).find((entry) => entry.name === "chests:init");
    if (!Array.isArray(event?.payload)) return [];
    return event.payload.map((chest) => ({
      id: chest.id ?? null,
      x: Math.round(chest.x),
      y: Math.round(chest.y)
    }));
  });
  const monsters = await page.evaluate(() => {
    const states = (window.__AGENT_PLAYER_EVENTS__ ?? [])
      .filter((entry) => entry.name === "state:monsters")
      .map((entry) => entry.payload);
    const latest = states[states.length - 1];
    if (!Array.isArray(latest)) return [];
    return latest.map((monster) => ({
      id: monster.id ?? null,
      x: Math.round(monster.x),
      y: Math.round(monster.y),
      isAlive: Boolean(monster.isAlive)
    }));
  });
  const aliveMonsters = monsters.filter((monster) => monster.isAlive);
  return {
    chestCount: chests.length,
    firstChest: chests[0] ?? null,
    monsterCount: monsters.length,
    aliveMonsterCount: aliveMonsters.length,
    firstMonster: aliveMonsters[0] ?? null
  };
}

function summarizeEvent(event) {
  if (!event) return null;
  return {
    name: event.name,
    ts: event.ts,
    payload: event.payload ?? null
  };
}

async function readVisibleOpenPromptProbe(page) {
  const renderSnapshot = await page.evaluate(() => window.__P0B_TEST_HOOKS__?.getRenderSnapshot?.() ?? null);
  const visibleTexts = Array.isArray(renderSnapshot?.visibleTexts) ? renderSnapshot.visibleTexts : [];
  const visibleOpenPrompts = visibleTexts.filter((entry) => (
    typeof entry?.text === "string" && entry.text.includes("开箱")
  ));
  return {
    available: Boolean(renderSnapshot),
    visibleTextCount: visibleTexts.length,
    visibleOpenPromptCount: visibleOpenPrompts.length,
    visibleOpenPrompts,
    sample: visibleTexts.slice(0, 20)
  };
}

async function readCanvasObjectProbe(page) {
  const renderSnapshot = await getRenderSnapshot(page);
  const camera = renderSnapshot?.camera ?? {
    width: 1920,
    height: 1080,
    zoom: null,
    worldView: null
  };
  const viewport = {
    width: Number(camera.width) || 1920,
    height: Number(camera.height) || 1080
  };
  const reviewBand = {
    left: Math.round(viewport.width * 0.36),
    top: Math.round(viewport.height * 0.54),
    right: Math.round(viewport.width * 0.64),
    bottom: Math.round(viewport.height * 0.92)
  };
  const objects = Array.isArray(renderSnapshot?.visibleObjects) ? renderSnapshot.visibleObjects : [];
  const reviewTextureObjects = objects
    .filter((object) => CANVAS_REVIEW_TEXTURE_KEYS.has(object?.textureKey))
    .map((object) => summarizeCanvasObject(object, reviewBand))
    .filter(Boolean)
    .sort((left, right) => right.intersectionArea - left.intersectionArea);
  const suspiciousObjects = reviewTextureObjects.filter((object) => {
    const minIntersectionArea = Math.min(6_000, Math.max(2_500, object.area * 0.2));
    return object.depth <= -20
      && object.inheritedAlpha > 0.1
      && object.area >= CANVAS_REVIEW_MIN_OBJECT_AREA
      && object.intersectionArea >= minIntersectionArea;
  });

  return {
    available: Boolean(renderSnapshot),
    camera,
    reviewBand,
    objectCount: objects.length,
    reviewTextureObjectCount: reviewTextureObjects.length,
    suspiciousObjectCount: suspiciousObjects.length,
    suspiciousObjects: suspiciousObjects.slice(0, 24),
    reviewTextureSample: reviewTextureObjects.slice(0, 80)
  };
}

async function readDomOverlayProbe(page) {
  return await page.evaluate(() => {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    const centralPlayfield = {
      left: viewport.width * 0.25,
      top: viewport.height * 0.18,
      right: viewport.width * 0.75,
      bottom: viewport.height * 0.84
    };
    const selectors = [
      ".inventory-panel",
      ".inventory-tooltip",
      ".inventory-item",
      ".inventory-item-icon",
      ".inventory-item-name",
      ".inventory-item-badge",
      ".inventory-drag-ghost",
      ".inventory-grid-drop-preview",
      ".inventory-backpack-items",
      ".inventory-pouch-items",
      ".results-overlay",
      "#gamer-dev-log-panel",
      ".mobile-action-cluster",
      ".mobile-action-button",
      ".mobile-joystick",
      ".audio-mute-toggle"
    ];
    const minimumBlockingArea = Math.max(8_000, viewport.width * viewport.height * 0.008);

    const overlays = Array.from(document.querySelectorAll(selectors.join(",")))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const backdropFilter = style.backdropFilter || style.webkitBackdropFilter || "none";
        const selector = selectors.find((candidate) => element.matches(candidate)) ?? element.tagName.toLowerCase();
        const text = element instanceof HTMLElement ? compactText(element.innerText) : "";
        const backgroundPainted = alphaFromColor(style.backgroundColor) > 0.03
          || (style.backgroundImage && style.backgroundImage !== "none");
        const borderPainted = borderSidePainted(style, "Top")
          || borderSidePainted(style, "Right")
          || borderSidePainted(style, "Bottom")
          || borderSidePainted(style, "Left");
        const shadowPainted = Boolean(style.boxShadow && style.boxShadow !== "none")
          || Boolean(backdropFilter && backdropFilter !== "none");
        const textPainted = text.length > 0 && alphaFromColor(style.color) > 0.03;
        const visuallyPainted = backgroundPainted || borderPainted || shadowPainted || textPainted;
        const interactive = style.pointerEvents !== "none";
        const visible = element instanceof HTMLElement
          && !element.hidden
          && style.display !== "none"
          && style.visibility !== "hidden"
          && Number(style.opacity || "1") > 0.01
          && rect.width > 1
          && rect.height > 1;
        const intersection = rectIntersection(rect, centralPlayfield);
        const intersectionArea = intersection.width * intersection.height;
        const className = element instanceof HTMLElement ? element.className : "";
        const isCollapsedInventory = element.matches(".inventory-panel")
          && element.classList.contains("inventory-panel--collapsed");
        const hasBlockingPresence = visuallyPainted || interactive;
        const largeMobileActionContainer = element.matches(".mobile-action-cluster")
          && rect.width * rect.height >= minimumBlockingArea;
        const crossesCentralPlayfield = intersectionArea >= minimumBlockingArea;
        const blocksPlayfield = visible
          && !isCollapsedInventory
          && hasBlockingPresence
          && (crossesCentralPlayfield || largeMobileActionContainer);

        return {
          selector,
          className: typeof className === "string" ? className : "",
          hidden: element instanceof HTMLElement ? element.hidden : false,
          visible,
          visuallyPainted,
          interactive,
          blocksPlayfield,
          rect: rectToObject(rect),
          centralIntersection: intersection,
          centralIntersectionArea: Math.round(intersectionArea),
          computedStyle: {
            pointerEvents: style.pointerEvents,
            opacity: style.opacity,
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage === "none" ? "none" : style.backgroundImage.slice(0, 180),
            boxShadow: style.boxShadow === "none" ? "none" : style.boxShadow.slice(0, 180),
            backdropFilter: backdropFilter === "none" ? "none" : backdropFilter.slice(0, 180)
          },
          text
        };
      });

    const blockingOverlays = overlays.filter((overlay) => overlay.blocksPlayfield);
    return {
      viewport,
      centralPlayfield,
      minimumBlockingArea: Math.round(minimumBlockingArea),
      overlayCount: overlays.length,
      visibleOverlayCount: overlays.filter((overlay) => overlay.visible).length,
      blockingOverlayCount: blockingOverlays.length,
      blockingOverlays,
      overlays
    };

    function rectToObject(rect) {
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    }

    function rectIntersection(rect, bounds) {
      const left = Math.max(rect.left, bounds.left);
      const top = Math.max(rect.top, bounds.top);
      const right = Math.min(rect.right, bounds.right);
      const bottom = Math.min(rect.bottom, bounds.bottom);
      return {
        left: Math.round(left),
        top: Math.round(top),
        right: Math.round(right),
        bottom: Math.round(bottom),
        width: Math.max(0, Math.round(right - left)),
        height: Math.max(0, Math.round(bottom - top))
      };
    }

    function compactText(value) {
      return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
    }

    function borderSidePainted(style, side) {
      const width = Number.parseFloat(style[`border${side}Width`] || "0");
      const lineStyle = style[`border${side}Style`];
      const color = style[`border${side}Color`];
      return width > 0 && lineStyle !== "none" && alphaFromColor(color) > 0.03;
    }

    function alphaFromColor(value) {
      const color = String(value ?? "").trim().toLowerCase();
      if (!color || color === "transparent") return 0;
      const rgba = color.match(/^rgba?\(([^)]+)\)$/);
      if (!rgba) return 1;
      const parts = rgba[1].split(",").map((part) => part.trim());
      if (parts.length < 4) return 1;
      const alpha = Number.parseFloat(parts[3]);
      return Number.isFinite(alpha) ? alpha : 1;
    }
  });
}

function summarizeCanvasObject(object, reviewBand) {
  const rect = object?.screenRect;
  if (!rect || typeof rect.width !== "number" || typeof rect.height !== "number") {
    return null;
  }
  const intersection = rectIntersection(rect, reviewBand);
  const area = Math.max(0, Math.round(rect.width * rect.height));
  return {
    type: object.type ?? null,
    name: object.name ?? "",
    textureKey: object.textureKey ?? null,
    frameName: object.frameName ?? null,
    depth: Number(object.depth ?? 0),
    inheritedAlpha: Number(object.inheritedAlpha ?? object.alpha ?? 1),
    alpha: Number(object.alpha ?? 1),
    x: object.x ?? null,
    y: object.y ?? null,
    displayWidth: object.displayWidth ?? null,
    displayHeight: object.displayHeight ?? null,
    worldRect: object.worldRect ?? null,
    screenRect: rect,
    area,
    reviewBandIntersection: intersection,
    intersectionArea: rectArea(intersection),
    parentType: object.parentType ?? null,
    childCount: object.childCount ?? 0
  };
}

function rectIntersection(rect, bounds) {
  const left = Math.max(rect.left, bounds.left);
  const top = Math.max(rect.top, bounds.top);
  const right = Math.min(rect.right, bounds.right);
  const bottom = Math.min(rect.bottom, bounds.bottom);
  return {
    left: Math.round(left),
    top: Math.round(top),
    right: Math.round(right),
    bottom: Math.round(bottom),
    width: Math.max(0, Math.round(right - left)),
    height: Math.max(0, Math.round(bottom - top))
  };
}

function rectArea(rect) {
  return Math.max(0, Math.round((rect?.width ?? 0) * (rect?.height ?? 0)));
}

function readDevLogSnapshot() {
  const path = resolve(".devlog", "latest.jsonl");
  if (!existsSync(path)) {
    return {
      available: false,
      path,
      lineCount: 0,
      events: [],
      parseErrors: [{ line: 0, error: "missing" }]
    };
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const events = [];
  const parseErrors = [];
  lines.forEach((line, index) => {
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      parseErrors.push({
        line: index + 1,
        error: formatError(error)
      });
    }
  });

  return {
    available: true,
    path,
    lineCount: lines.length,
    events,
    parseErrors
  };
}

function analyzeChestAudioSince(snapshot) {
  const latest = readDevLogSnapshot();
  if (!latest.available) {
    return {
      available: false,
      path: latest.path,
      summary: "missing devlog",
      parseErrors: latest.parseErrors,
      rummageTick: emptyCueProbe(),
      chestCue: emptyCueProbe(),
      pickupCue: emptyCueProbe(),
      missingFileCues: []
    };
  }

  const startLine = latest.lineCount >= snapshot.lineCount ? snapshot.lineCount : 0;
  const events = latest.events.slice(startLine);
  const audioPlays = events.filter((entry) => entry?.category === "AUDIO" && entry?.event === "audio.play");
  const missingFileCues = unique(
    audioPlays
      .filter((entry) => entry?.data?.hasFile !== "yes")
      .map((entry) => entry?.data?.cue)
      .filter((cue) => typeof cue === "string")
  );
  const rummageTick = cueProbe(audioPlays, "rummage-tick");
  const chestCue = cueProbe(audioPlays, "chest");
  const pickupCue = cueProbe(audioPlays, "pickup");

  return {
    available: true,
    path: latest.path,
    fromLineExclusive: startLine,
    toLine: latest.lineCount,
    eventCount: events.length,
    audioPlayCount: audioPlays.length,
    parseErrors: latest.parseErrors,
    rummageTick,
    chestCue,
    pickupCue,
    missingFileCues,
    sample: audioPlays.slice(-20).map((entry) => ({
      t: entry.t ?? null,
      cue: entry?.data?.cue ?? null,
      muted: entry?.data?.muted ?? null,
      hasFile: entry?.data?.hasFile ?? null
    })),
    summary: `rummageTick=${rummageTick.total}, rummageTickMissingFile=${rummageTick.missingFile}, missingFileCues=${missingFileCues.join(",") || "none"}`
  };
}

function cueProbe(audioPlays, cue) {
  const plays = audioPlays.filter((entry) => entry?.data?.cue === cue);
  const missingFile = plays.filter((entry) => entry?.data?.hasFile !== "yes").length;
  return {
    cue,
    total: plays.length,
    withFile: plays.length - missingFile,
    missingFile,
    allHaveFiles: plays.length > 0 && missingFile === 0
  };
}

function emptyCueProbe() {
  return {
    cue: null,
    total: 0,
    withFile: 0,
    missingFile: 0,
    allHaveFiles: false
  };
}

function unique(values) {
  return [...new Set(values)];
}

function summarizeLootFromOpenEvent(event) {
  const loot = Array.isArray(event?.payload?.loot)
    ? event.payload.loot
    : Array.isArray(event?.payload?.drops)
      ? event.payload.drops.map((drop) => drop?.item ?? drop)
      : [];
  return {
    count: loot.length,
    totalValue: loot.reduce((sum, item) => (
      sum + Math.max(0, item?.goldValue ?? 0) + Math.max(0, item?.treasureValue ?? 0)
    ), 0),
    items: loot.slice(0, 6).map((item) => ({
      definitionId: item?.templateId ?? item?.definitionId ?? null,
      name: item?.name ?? null,
      rarity: item?.rarity ?? null,
      goldValue: item?.goldValue ?? 0,
      treasureValue: item?.treasureValue ?? 0
    }))
  };
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
