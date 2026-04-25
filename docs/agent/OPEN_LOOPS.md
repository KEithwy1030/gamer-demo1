# Open Loops

## 0. Codex In-Game Visual Pass Needs Design Review And Second-Viewport Proof

- Symptom:
  The clean visual/HUD branch now has a second HUD framework pass and browser proof, but it is still a branch candidate rather than an accepted final art direction.
- Confirmed facts:
  - branch `codex/in-game-visual-hud-pass` was created from `master` to keep the stable old frontend untouched
  - the pass is limited to in-match presentation and does not continue the lobby overhaul
  - `client/public/assets/wasteland-ground.png` remains checked in from the Image 2 art test, but `GameScene` no longer uses it as the active ground texture
  - the active ground returned to procedural `ground_pixel` so visual terrain does not imply missing collision authority
  - the active HUD now uses left player status, right match status, bottom action-order, first-state-safe sync order, and restyled touch controls
  - browser verification passed for lobby create -> start match -> gameplay view on `2026-04-25`
  - screenshots are saved at `artifacts/visual-hud-pass-gameplay-final.png` and `artifacts/visual-hud-pass-inventory-final.png`
  - refreshed desktop HUD screenshot is saved at `artifacts/hud-framework-pass-gameplay-desktop.png`
- Next step:
  Get user design acceptance on the current tactical-wasteland HUD direction, then validate real-device mobile touch viewport separately.
- Blocking reason:
  The branch is technically integrated, but final visual quality depends on user taste plus viewport-specific readability.

## 1. Client Runtime Still Has TS-vs-JS Drift Risk, But It Is Now Reduced

- Symptom:
  The client entry is `main.ts`, but many extensionless imports can still resolve into checked-in `.js` siblings.
- Confirmed facts:
  - `client/src/` currently contains 24 `.ts` files and 24 same-basename `.js` files
  - `main.ts` imports `./app`, `./network`, `./results`, and `./scenes` without extensions
  - `client/vite.config.ts` now pins resolution to `.ts/.tsx` before `.js/.jsx`, which lowers the chance of authored TS being silently bypassed during Vite dev/build resolution
- Next step:
  Decide whether to remove the sibling JS layer, explicitly generate it, or formally keep it as an intentional artifact with one documented rebuild path.
- Blocking reason:
  Runtime drift is less likely than before, but duplicate files still create maintenance and review ambiguity.

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

## 4. Frontend Return-To-Lobby Still Needs Explicit Browser Revalidation

- Symptom:
  The backend gameplay loop is now proven by automation, but the user-visible browser flow after settlement is not fully revalidated.
- Confirmed facts:
  - `node scripts/test-loop.mjs` passed on `2026-04-22` through create room, join, match start, kill, loot, extract open, extract channel, and settlement
  - browser verification has been repeated for lobby load, room creation, and entering an in-match scene from the active Web client
  - the missing browser proof is still the settlement overlay -> return to lobby -> next-match readiness path
- Next step:
  Run a browser-visible Web check for settlement -> return to lobby -> next match readiness.
- Blocking reason:
  Backend flow is closed, but the final browser-visible transition still lacks explicit proof.

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

## 6. Web Minimap Needs Real Browser Revalidation

- Symptom:
  The new minimap implementation is build-verified, but it still needs a real browser pass to confirm left-top placement, fog readability, and player marker behavior during exploration.
- Confirmed facts:
  - `client/src/ui/Minimap.{js,ts}` now owns a low-resolution discovery grid and only paints explored cells plus the local player dot
  - `client/src/scenes/GameScene.{js,ts}` now instantiates that minimap only for non-touch sessions and feeds it world bounds plus the smoothed self-marker position
  - the minimap intentionally does not render monsters, drops, or full terrain detail
- Next step:
  Revalidate on Web that the minimap sits cleanly in the top-left HUD region, the explored area expands as the player moves, and no full-map information leaks.
- Blocking reason:
  Build success does not confirm final readability or viewport fit.

## 7. Obstacles Are Still Visual-Only

- Symptom:
  The scene has obstacle presentation, but obstacle authority is still not part of movement validation.
- Confirmed facts:
  - current project memory still treats obstacles as readability aids rather than collision truth
- Next step:
  Decide the collision authority model and implement it without breaking current room flow.
- Blocking reason:
  This touches gameplay correctness, not just presentation.

## 8. Live Feel Validation Is Still Missing In Key Areas

- Symptom:
  Several gameplay values exist in code, but their real in-room feel is not yet closed.
- Confirmed facts:
  - weapon reach is currently sword `116`, blade `128`, spear `180`
  - weapon Q skills have been reworked and need fresh feel validation against the current balance:
    - sword uses a dash-path hit model
    - blade uses a trigger-time fan sweep
    - spear keeps the only guaranteed critical payoff
  - extract opens at `180s` and channels for `5s`
  - monsters currently spawn as `40` normals plus `3` elites, leave corpses for `10s`, and respawn after `60s`
  - inventory is currently `10 x 6`, not a larger grid experiment from historical notes
- Next step:
  Revalidate pacing, readability, and usability in a live room before treating these values as accepted design.
- Blocking reason:
  Compile/build success does not answer whether the current numbers feel correct.

## 9. Web Item Presentation Still Needs Real Browser Acceptance

- Symptom:
  Inventory item readability and translation cleanup are now code-complete, but the result still needs a browser pass to confirm the new icon-plus-badge visual language is clear in dense grids.
- Confirmed facts:
  - `client/src/ui/itemPresentation.{js,ts}` now centralizes item naming, badge/category lookup, and static icon glyph selection
  - `client/src/ui/InventoryPanel.{js,ts}` no longer falls back to the first character of `item.name`; each filled slot now renders an icon layer plus a category badge
  - `client/src/results/ResultsOverlay.{js,ts}` now displays Chinese settlement labels and translates extracted item names before rendering
  - `client/src/ui/lobbyView.{js,ts}` cleared the remaining obvious English control labels in the current lobby shell
  - `server/src/inventory/catalog.ts`, `shared/src/data/items.ts`, and `shared/src/data/weapons.ts` now use aligned Chinese-facing item/weapon names for the active data sets
- Next step:
  Revalidate on Web that inventory slots are readable at a glance, category distinction is obvious, settlement item names are fully localized, and the current lobby copy no longer leaks obvious English placeholders.
- Blocking reason:
  Build success confirms integration, not final readability.

## 10. Claude Design Lobby Replacement Still Needs Browser Acceptance

- Symptom:
  The lobby shell has been reworked to follow the imported Claude Design layout, but it still needs a browser pass to judge fidelity against the provided design language instead of only compile/build proof.
- Confirmed facts:
  - `client/src/ui/lobbyView.{js,ts}` now renders a topbar, left squad panel, center deploy hero, right summary stack, and footer ticker that map to the imported `gamer.zip` hall structure
  - only `create/join/leave/capacity/start` remain wired to the real lobby runtime; undeveloped hall modules stay disabled
  - `client/src/styles/lobby.css` now uses the imported Claude Design CSS as the visual base with small project-specific additions for disabled states and banners
  - `client/index.html` now loads the original hall font stack, and both mock/real room creation now emit Claude-style place-name room codes such as `南岭·42`
- Next step:
  Revalidate in the browser that the current lobby now preserves the imported room-code flavor, font character, and above-the-fold composition instead of only the broad layout.
- Blocking reason:
  Build success does not answer the user's fidelity concern about whether the hall still looks like the imported design.


## 11. Restored World Backdrop Needs Real Browser Acceptance

- Symptom:
  The map no longer compiles down to a flat green sheet, but the restored backdrop/detail density still needs a real in-match browser check to confirm it now feels materially better than the regressed version.
- Confirmed facts:
  - `client/src/scenes/GameScene.{ts,js}` once again rebuilds a backdrop chain with plaza, dirt/path patches, obstacle props, region labels, beacon visuals, and frame lines
  - `ground_pixel` texture generation now includes noise speckles instead of a single flat fill
  - `client/src/ui/gameplayTheme.{ts,js}` now centralizes the active HUD/minimap panel palette and font stacks
- Next step:
  Enter a real Web match and judge whether the terrain/detail layer is back above the previous baseline and whether the HUD/minimap now feel like the same family as the lobby.
- Blocking reason:
  Build success confirms integration, not the final subjective gameplay feel.
