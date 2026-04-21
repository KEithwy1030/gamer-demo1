# Open Loops

## 1. Client Runtime Still Has TS-vs-JS Drift Risk

- Symptom:
  The client entry is `main.ts`, but many extensionless imports can still resolve into checked-in `.js` siblings.
- Confirmed facts:
  - `client/src/` currently contains 24 `.ts` files and 24 same-basename `.js` files
  - `main.ts` imports `./app`, `./network`, `./results`, and `./scenes` without extensions
  - `client/vite.config.ts` currently only sets host/port and does not pin `.ts/.tsx` ahead of `.js/.jsx`
- Next step:
  Decide whether to remove the sibling JS layer, explicitly configure resolution, or make the JS mirror an intentional generated artifact.
- Blocking reason:
  Until this is settled, "TS changed but runtime did not" remains a credible failure mode.

## 2. Shared Consumption Is Split Between Client And Server

- Symptom:
  `shared/` is supposed to be the common contract layer, but client and server consume different surfaces.
- Confirmed facts:
  - server source imports `../../shared/dist/**` and `../../../shared/dist/**`
  - client source imports both `../../../shared/src/**` and `@gamer/shared`
  - `@gamer/shared` itself exports `dist/index.js`
- Next step:
  Normalize both sides onto one contract-consumption path before further gameplay changes.
- Blocking reason:
  Contract edits can appear correct in one runtime and stale in the other.

## 3. Mobile Joystick Needs Real-Device Revalidation After Server Tick Fix

- Symptom:
  The strongest evidence-backed acceleration root cause has been fixed at the server authority layer, but live phone validation is still needed before this can be treated as closed.
- Confirmed facts:
  - `server/src/index.ts` no longer applies player movement directly inside `PlayerInputMove`
  - `server/src/room-store.ts` now stores the latest normalized input vector and applies movement on the fixed player sync tick
  - a direct `RoomStore` verification produced equal cumulative movement for steady input and noisy multi-update-per-tick input over `20` ticks at `50ms`
- Next step:
  Revalidate on a real mobile device that turning while holding the joystick no longer increases effective move speed.
- Blocking reason:
  The authority-layer bug is closed by measurement, but touch-path feel still needs browser/device proof.

## 4. Frontend Return-To-Lobby Still Needs Explicit Revalidation

- Symptom:
  The backend gameplay loop is covered by automation, but the user-visible browser flow after settlement is not fully revalidated.
- Confirmed facts:
  - `scripts/test-loop.mjs` passes the backend main loop through settlement
  - prior notes still report incomplete manual verification for the post-settlement lobby recovery path
- Next step:
  Run a browser-visible dual-client/manual check for settlement -> return to lobby -> next match readiness.
- Blocking reason:
  Automation covers backend flow, not the full UI transition.

## 5. Frontend Multi-Platform Acceptance Still Needs Real Browser Proof

- Symptom:
  The active frontend path has been cleaned up for inventory entry, backpack grid rendering, and mobile tap targets, but those changes are only build-verified so far.
- Confirmed facts:
  - `client/src/ui/InventoryPanel.{js,ts}` now renders backpack cells from `inventory.width * inventory.height`
  - backpack items are now positioned by `x/y` instead of raw array order
  - `.inventory-mobile-toggle` now avoids the combat button area and uses a top-center mobile position instead of competing with the lower-right action cluster
  - desktop tooltip hover now keeps the tooltip alive while moving from slot to tooltip and prefers side-by-side placement near the hovered slot
  - desktop tooltip DOM now mounts to `document.body` instead of staying under the transformed `.inventory-panel`, which was the root cause of the apparent lower-right drift
  - desktop tooltip switching now uses a short hover-intent delay so brushing over an adjacent slot while moving toward the current detail card does not instantly replace it
  - mobile backpack layout now keeps true column count with horizontal scrolling rather than compressing `10` columns into sub-44px cells
- Next step:
  Revalidate on desktop and phone that inventory open/close, slot tapping, tooltip anchoring/visibility, launcher placement, and slot placement all match the real server inventory state.
- Blocking reason:
  Build success does not confirm touch usability or visual correctness.

## 6. Obstacles Are Still Visual-Only

- Symptom:
  The scene has obstacle presentation, but obstacle authority is still not part of movement validation.
- Confirmed facts:
  - current project memory still treats obstacles as readability aids rather than collision truth
- Next step:
  Decide the collision authority model and implement it without breaking current room flow.
- Blocking reason:
  This touches gameplay correctness, not just presentation.

## 7. Live Feel Validation Is Still Missing In Key Areas

- Symptom:
  Several gameplay values exist in code, but their real in-room feel is not yet closed.
- Confirmed facts:
  - weapon reach is currently sword `116`, blade `128`, spear `180`
  - extract opens at `180s` and channels for `5s`
  - monsters currently spawn as `40` normals plus `3` elites, leave corpses for `10s`, and respawn after `60s`
  - inventory is currently `10 x 6`, not a larger grid experiment from historical notes
- Next step:
  Revalidate pacing, readability, and usability in a live room before treating these values as accepted design.
- Blocking reason:
  Compile/build success does not answer whether the current numbers feel correct.
