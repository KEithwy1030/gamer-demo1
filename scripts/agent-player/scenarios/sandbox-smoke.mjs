import {
  GAME_CANVAS_SELECTOR,
  distance,
  findSelfPosition,
  getHookSnapshot,
  sendHookMove,
  sleep,
  waitForEventAfter
} from "../browser-session.mjs";

export async function runSandboxSmoke(context) {
  const {
    page,
    appUrl,
    addCheckpoint,
    addFinding,
    note,
    screenshot
  } = context;

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("input.code-input").first().fill(`Agent${Date.now().toString().slice(-5)}`);
  await page.locator("button.btn-primary").first().click();

  await page.locator("button.code-go").first().waitFor({ state: "visible", timeout: 20_000 });
  const roomState = await Promise.all([
    waitForEventAfter(page, "room:state", 0, 12_000),
    page.locator("button.code-go").first().click()
  ]).then(([entry]) => entry);

  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
  await Promise.all([
    waitForEventAfter(page, "match:started", roomState.ts, 20_000),
    page.locator("button.btn-primary").first().click()
  ]);
  await page.locator(GAME_CANVAS_SELECTOR).first().waitFor({ state: "visible", timeout: 20_000 });
  await sleep(1_200);

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
