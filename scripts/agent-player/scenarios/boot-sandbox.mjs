import { GAME_CANVAS_SELECTOR, sleep, waitForEventAfter } from "../browser-session.mjs";

export async function bootSandboxMatch({ page, appUrl }) {
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
  const matchStarted = await Promise.all([
    waitForEventAfter(page, "match:started", roomState.ts, 20_000),
    page.locator("button.btn-primary").first().click()
  ]).then(([entry]) => entry);
  await page.locator(GAME_CANVAS_SELECTOR).first().waitFor({ state: "visible", timeout: 20_000 });
  await sleep(1_200);

  return { roomState, matchStarted };
}
