import {
  GAME_CANVAS_SELECTOR,
  distance,
  findSelfPosition,
  getHookSnapshot,
  sendHookMove
} from "../browser-session.mjs";
import { bootSandboxMatch } from "./boot-sandbox.mjs";

export async function runSandboxSmoke(context) {
  const {
    page,
    appUrl,
    addCheckpoint,
    addFinding,
    note,
    screenshot
  } = context;

  await bootSandboxMatch({ page, appUrl });

  const bootShot = await screenshot("01-sandbox-start.png");
  const bootSnapshot = await getHookSnapshot(page);
  const startPos = findSelfPosition(bootSnapshot);
  if (bootSnapshot.hooksType !== "object" || !startPos) {
    addFinding({
      severity: "P0",
      scope: "tool",
      title: "Sandbox hooks or self position unavailable",
      detail: `hooksType=${bootSnapshot.hooksType}; selfPlayerId=${bootSnapshot.selfPlayerId ?? "null"}`,
      checkpointId: "boot",
      evidence: { screenshot: bootShot }
    });
    addCheckpoint("boot", "Booted sandbox and found controllable player", "fail", { screenshot: bootShot });
    return;
  }
  addCheckpoint("boot", "Booted sandbox and found controllable player", "pass", {
    screenshot: bootShot,
    selfPlayerId: bootSnapshot.selfPlayerId,
    startPos
  });
  note("sandbox booted", { selfPlayerId: bootSnapshot.selfPlayerId, startPos });

  await page.locator(GAME_CANVAS_SELECTOR).first().click({ position: { x: 800, y: 450 }, force: true });
  await sendHookMove(page, { x: 1, y: 0 }, 800);
  const afterMoveSnapshot = await getHookSnapshot(page);
  const afterMovePos = findSelfPosition(afterMoveSnapshot);
  const movementShot = await screenshot("02-after-hook-move.png");
  const movedDistance = distance(startPos, afterMovePos);

  if (movedDistance < 18) {
    addFinding({
      severity: "P1",
      scope: "game",
      title: "Player did not move under test hook control",
      detail: `Expected sandbox movement after hook input, but distance was ${movedDistance.toFixed(1)}px.`,
      checkpointId: "movement",
      evidence: { screenshot: movementShot, startPos, afterMovePos }
    });
    addCheckpoint("movement", "Moved player with the game test hook", "fail", {
      screenshot: movementShot,
      startPos,
      afterMovePos,
      movedDistance
    });
    return;
  }

  addCheckpoint("movement", "Moved player with the game test hook", "pass", {
    screenshot: movementShot,
    startPos,
    afterMovePos,
    movedDistance: Number(movedDistance.toFixed(1))
  });
  note("movement observed", { afterMovePos, movedDistance: Number(movedDistance.toFixed(1)) });
}
