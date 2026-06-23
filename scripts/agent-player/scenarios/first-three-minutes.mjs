import {
  GAME_CANVAS_SELECTOR,
  distance,
  findSelfPosition,
  getHookSnapshot,
  sendHookMove,
  sleep,
  waitForEventAfter
} from "../browser-session.mjs";
import { bootSandboxMatch } from "./boot-sandbox.mjs";

const INTERACT_KEY = "e";
const MIN_MOVE_DISTANCE = 18;

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
  addCheckpoint("first-chest", "First chest can be opened from the player flow", "pass", {
    before: beforeChestPath,
    screenshot: chestOpenedShot,
    chestPos,
    openEvent: summarizeEvent(chestResult.openEvent)
  });
  note("first chest opened", {
    chestPos,
    openEvent: summarizeEvent(chestResult.openEvent)
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
      "04-chest-opened.png should make the first chest result obvious.",
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
    await walkTo(page, chestPos.x, chestPos.y - 30);
  } catch (error) {
    return {
      opened: false,
      attempts,
      detail: `Could not navigate to the sandbox chest: ${formatError(error)}`
    };
  }

  let started = null;
  for (let attempt = 0; attempt < 6 && !started; attempt += 1) {
    await page.keyboard.press(INTERACT_KEY);
    try {
      started = await waitForEventAfter(page, ["chest:progress", "domain:ChestRummageStarted"], afterTs, 1_800);
    } catch {
      const selfPos = await readSelfPosition(page);
      attempts.push({ attempt, selfPos });
      await walkTo(page, chestPos.x, chestPos.y - 30).catch(() => {});
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

async function walkTo(page, targetX, targetY, timeoutMs = 15_000) {
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
    if (dist <= 20) {
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

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
