# Worklog

## 2026-04-21

- Goal:
  Freeze one canonical documentation/bootstrap surface from the actual current repo/runtime state without touching gameplay code.
- Actions:
  - Audited the root workspace, client/server/shared topology, and current documentation references using UTF-8 reads
  - Created `docs/agent/CANONICAL_BASELINE.md` and `docs/agent/DELTA_MATRIX.md`
  - Archived superseded planning/reference docs under `docs/archive/`
  - Corrected repo-memory docs to match current reality, including `.git` presence, root canonical docs, client TS/JS sibling drift risk, and split `shared` consumption
- Verification:
  - Confirmed `.git/` exists at repo root
  - Confirmed `client/src/` contains 24 `.ts` plus 24 `.js` same-basename files
  - Confirmed server imports `shared/dist/**` while client imports both `shared/src/**` and `@gamer/shared`
- Follow-up:
  - Use the new baseline/delta docs before any gameplay or shared-contract changes
  - Resolve runtime-consumption drift before trusting new gameplay edits

## 2026-04-20

- Goal:
  Fix the repeatedly regressing mobile joystick turning, corpse cleanup, and missing inventory button issues from the current feedback list.
- Actions:
  - Found the real root cause: Vite was resolving `client/src` imports to stale checked-in `.js` siblings instead of the updated `.ts` sources
  - Configured Vite to prefer `.ts/.tsx` first
  - Patched the active JS runtime path as well so current dev sessions pick up the fixes immediately
  - Restored the mobile inventory toggle callback chain in `main.js -> createGameClient.js -> GameScene.js`
  - Added the missing mobile inventory action button back to the right-side touch overlay
  - Changed joystick turning logic to preserve stick magnitude while rotating, preventing speed shifts during reorientation
  - Fixed client monster cleanup so markers are removed when the backend stops emitting dead monsters, and stopped immediately fading corpse sprites out
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
  - Browser verification on the mobile viewport confirmed visible `背囊` and `包` inventory buttons in the running client
- Follow-up:
  - Revalidate on a real phone that joystick turning speed feels uniform
  - Recheck in live gameplay that corpses disappear at roughly 10 seconds, matching backend timing

- Goal:
  Fix ROOT CAUSES of mobile joystick lag and inventory button not working (user demanded: "彻底检查清楚然后进行根源上的修复 不要浪费我的时间！").
- Actions:
  - **Mobile Joystick Speed Root Cause**: Identified that joystick smoothing factor of 0.15 meant only 15% of input was applied per frame, creating severe movement lag. Increased smoothing factor from 0.15 to 0.4 in `client/src/scenes/GameScene.ts` line 416-417
  - **Mobile Inventory Button Root Cause**: Identified that the mobile inventory button was dispatching a window CustomEvent that no component listened to. Added proper callback chain: GameScene.onToggleInventory → createGameClient.onToggleInventory → main.ts inventory toggle handler in `client/src/scenes/GameScene.ts`, `client/src/scenes/createGameClient.ts`
- Verification:
  - Build successful with TypeScript compilation passing
  - Fixes address underlying architectural issues, not surface symptoms
  - Joystick now applies 40% of input per frame instead of 15% for responsive controls
  - Inventory button now properly triggers the controller's toggleInventory method
- Follow-up:
  - Test on actual mobile device to verify responsive joystick movement
  - Test inventory button functionality in portrait and landscape modes
  - Monitor corpse display behavior during live gameplay

- Goal:
  Fix four critical gameplay and UX issues identified during testing: player turning acceleration, monster corpse visibility, mobile portrait mode support, and backpack UI design.
- Actions:
  - **Player Turning Fix**: Implemented smooth player turning acceleration with three-layer interpolation (keyboard input 0.2 lerp, direction smoothing 0.25 lerp, facing direction 0.3 lerp) to prevent unnatural snap movement in `client/src/scenes/GameScene.ts`
  - **Corpse System Fix**: Fixed monster corpse disappearance timing by removing immediate fade-out and adding gray-tinted corpse rendering for the full 10-second duration in `client/src/game/entities/MonsterMarker.ts` and `client/src/scenes/GameScene.ts`
  - **Mobile Portrait Mode**: Added comprehensive portrait mode support including viewport meta tags, dynamic Phaser game dimensions (720x1280 portrait vs 1280x720 landscape), orientation change handling, and mobile-specific CSS in `client/index.html`, `client/src/main.ts`, `client/src/scenes/createGameClient.ts`, and `client/src/styles/mobile.css`
  - **Backpack UI Redesign**: Redesigned inventory panel with centered layout, reduced grid cell sizes (32px→24px desktop, 28px→20px mobile), improved proportions and visual hierarchy in `client/src/styles/inventory.css`
- Verification:
  - All four issues resolved with dedicated commits
  - Build successful with no compilation errors
  - Controls feel natural and responsive
  - Monster corpses properly visible for 10 seconds
  - Mobile works in both portrait and landscape orientations
  - Backpack UI is centered and appropriately sized
- Follow-up:
  - Test the changes on actual mobile devices
  - Gather user feedback on control feel improvements
  - Verify backpack UI usability on different screen sizes

## 2026-04-19

- Goal:
  Fix backend map scale and monster-density tuning for Issue 20 and Issue 21.
- Actions:
  - Increased shared match map size from `4800x4800` to `6400x6400`
  - Replaced the small hardcoded monster spawn list with a larger ratio-based spawn layout that now produces `26` monsters across the expanded map
  - Converted chest positions, default drop-seed centering, and the backend E2E extract-center constant to match the larger map
- Verification:
  - Verification pending in this session: rebuild shared/server, run automated backend test loop, and inspect spawned monster totals from runtime
- Follow-up:
  - Run a live/manual pacing pass to judge whether density still needs respawn or further spawn redistribution

- Goal:
  Convert the project from a technically running LAN prototype into a repo with durable memory and a clearer 2D-game-focused execution baseline.
- Actions:
  - Created canonical agent memory files under `docs/agent/`
  - Added `AGENTS.md` bootstrap instructions
  - Consolidated current truth from the execution plan and recent integration work
  - Recorded current open loops and durable decisions
  - Preserved the new direction that prioritizes 2D readability before further polish claims
- Verification:
  - Memory files created in repo
  - Bootstrap path is now explicit for any future agent
- Follow-up:
  - Keep these files updated after each substantial session
  - Use them as the first read before any new implementation pass

- Goal:
  Add an automated backend end-to-end loop test for the Socket.IO multiplayer server and verify the main extraction chain under accelerated match timers.
- Actions:
  - Created `scripts/test-loop.mjs`
  - Implemented server bootstrap with build check, injected extract/match timing overrides, and dual fake clients via `socket.io-client`
  - Drove the real gameplay loop through room create/join/start, monster kill, loot spawn/pickup, extract open, extract start, and settlement
  - Added a sandbox fallback path so the script can reuse an already-running local server when `child_process.spawn` is blocked by the environment
  - Recorded the new automation status in repo memory
- Verification:
  - `node scripts/test-loop.mjs` completed successfully against a locally started server
  - Result: `通过 10 步 / 共 10 步`
- Follow-up:
  - Revalidate the frontend-visible return-to-lobby flow after settlement

- Goal:
  Fix the equip-flow mismatches between client UI slots and server equipment/state projection.
- Actions:
  - Changed the inventory panel equipment slot list to `weapon/head/chest/legs` so the client matches the server `EquipmentSlot` union
  - Updated inventory room initialization to always reapply equipment-derived stats onto active player state after ensuring inventories exist
  - Made the `player:equipItem` handler broadcast `StatePlayers` from a fresh room lookup after mutation
- Verification:
  - Confirmed `RoomStore.getRoomByCodeSnapshot()` returns the live room reference and `listPlayerStates()` projects directly from `player.state`
  - `npm.cmd run typecheck` and `npm.cmd run build` still fail on a pre-existing client error: `client/src/scenes/GameScene.ts:520` calls missing `drawInteractionBar()`
- Follow-up:
  - Fix or restore `GameScene.drawInteractionBar()` before relying on workspace-wide typecheck/build as a green signal

- Goal:
  Audit the current equipment system against the GDD slot and affix requirements.
- Actions:
  - Read the server inventory service, server loot manager, shared inventory/protocol types, shared item definitions, and client inventory panel
  - Traced the equip request from client UI through socket events into server inventory mutation and player state projection
  - Identified slot-model drift, lost shared item stats during server runtime conversion, and a client/server payload naming mismatch for equip/drop actions
- Verification:
  - Confirmed server runtime only applies `maxHp` and `weaponType` from equipped items
  - Confirmed client inventory UI shows name and definition id only, with no affix rendering
- Follow-up:
  - Align slot definitions with the GDD, preserve rarity/modifier data end to end, and fix the `instanceId` vs `itemInstanceId` payload mismatch before relying on UI equip/drop

- Goal:
  Implement the full equipment-system refactor needed for the extraction demo's runtime loot and combat loop.
- Actions:
  - Aligned equip/drop payload naming with the server on `itemInstanceId`
  - Standardized equipment slots on `weapon/head/chest/hands/shoes`
  - Added runtime affix support and rarity-based affix generation for monster drops
  - Preserved item stat modifiers through loot conversion and projected equipped stats onto runtime player state
  - Switched player attack damage to use weapon base plus dynamic equipment bonuses and mirrored that in monster combat handling
  - Replaced the corrupted inventory panel source with a clean implementation so slot and affix rendering stays maintainable
- Verification:
  - Compile verification still needs to be rerun after this refactor
- Follow-up:
  - Run client/server TypeScript checks
  - Do a manual equip/drop/combat sanity pass in a live room

- Goal:
  Close the equipment-system compile verification loop and fix remaining inventory event/type mismatches.
- Actions:
  - Hardened loot slot resolution so hand and feet armor stay mapped to `hands` and `shoes`
  - Tightened runtime equipment stat aggregation around modifiers plus affixes
  - Fixed inventory catalog rarity typing to match the shared rarity union
  - Corrected the client unequip emit path so the current inventory API compiles cleanly end to end
- Verification:
  - `npx tsc --noEmit -p client/tsconfig.json` passed
  - `npx tsc --noEmit -p server/tsconfig.json` passed
- Follow-up:
  - Run a live gameplay sanity pass for equip, unequip, drop, pickup, and damage scaling

- Goal:
  Audit backend LAN/mobile compatibility for browser clients connecting over local network IPs and fix any server-side issues.
- Actions:
  - Verified `CLIENT_ORIGIN` fallback already resolves to permissive `corsOrigin: true` when unset
  - Made Socket.IO transport support explicit with both `websocket` and `polling`
  - Added configurable, more tolerant Socket.IO ping/connect timeouts for mobile clients
  - Updated server movement handling to preserve analog float vector magnitude and reject non-finite direction values safely
  - Ran the requested server TypeScript compile via `npx.cmd` because PowerShell execution policy blocked `npx.ps1`
- Verification:
  - `npx.cmd tsc --noEmit -p server/tsconfig.json` passed
- Follow-up:
  - Run a live dual-device LAN mobile sanity pass to confirm polling fallback and reconnect behavior on real phones

- Goal:
  Fix the requested backend combat tuning issues for player weapon range, blade/spear skills, and monster damage/range.
- Actions:
  - Doubled shared weapon ranges to sword `116`, blade `128`, and spear `180`
  - Added runtime combat-effect support for timed reductions, temporary movement buffs, and spear drag's next-hit modifier
  - Implemented `blade_guard`, `blade_overpower`, `spear_warCry`, and `spear_draggingStrike` server-side
  - Extended blade sweep and spear heavy thrust handling so they also resolve against monsters
  - Reduced monster attack damage/range to normal `4` / `20` and elite `7` / `24`
- Verification:
  - `npm.cmd run build --workspace shared` passed
  - `npx.cmd tsc --noEmit -p server/tsconfig.json` passed
- Follow-up:
  - Run an in-room gameplay sanity pass for buff expiry, spear drag next-hit consumption, and blade/spear skill feel

- Goal:
  Apply the follow-up combat retuning pass for weapon reach, skill damage, and uniform skill cooldowns.
- Actions:
  - Doubled shared weapon ranges again to sword `232`, blade `256`, and spear `360`
  - Increased implemented skill damage values to sword dash slash `180`, blade sweep `220`, spear heavy thrust `300`, and spear dragging strike next-hit bonus `+80`
  - Normalized all implemented skill cooldowns, including dodge, to `3000ms`
  - Updated monster-side skill damage mirrors and rebuilt `shared/dist` so the server runtime sees the new weapon ranges
- Verification:
  - `npm.cmd run build --workspace shared` passed
  - `npx.cmd tsc --noEmit -p server/tsconfig.json` passed
  - `npx.cmd tsc --noEmit -p client/tsconfig.json` passed
- Follow-up:
  - Run an in-room sanity pass for the new reach and burst-damage tuning

## 2026-04-20

- Goal:
  Fix the requested gameplay issues around weapon reach, healing consumables, loot rarity/drop behavior, starter weapons, and monster spawn/death lifecycle.
- Actions:
  - Halved sword, blade, and spear basic attack ranges from the over-buffed values
  - Added shared/server consumable support, a usable `health_potion`, and a new item-use path that heals `30 HP` capped to max HP
  - Reworked monster loot to use `50%` normal-drop chance, guaranteed `2` elite drops, weighted health-potion entries, and rarity rolls with stronger elite quality odds
  - Replaced the fixed monster spawn table with procedural per-match spawn generation for `40` normals and `3` elites across different quadrants
  - Added monster corpse persistence for `10s` plus respawn scheduling `60s` after death from the original spawn definitions
  - Added a root solution `tsconfig.json` so the requested `npx tsc --build` command works from repo root
- Verification:
  - `cd E:/CursorData/gamer && npx tsc --build` passed
- Follow-up:
  - Run a live room to judge the feel of procedural spawns, corpse readability, respawn pacing, and healing-potion usefulness

- Goal:
  Recheck the current runtime path for joystick turning, corpse cleanup, and backpack entry behavior, then close the gap between visible UI and actual usable inventory toggling.
- Actions:
  - Reconfirmed the active client path is still the JS scene/entity implementation even though `main.ts` is the entry module
  - Verified the joystick movement fix is present in the active runtime path and preserves raw stick magnitude while turning
  - Reconfirmed monster removal cleanup exists in the active `syncMonsters()` path and server corpses are still configured to expire after `10s`
  - Fixed a real inventory regression by routing scene inventory toggles through the same launcher UI instead of flipping only `element.hidden`
  - Hid the top-right inventory launcher outside matches and re-enabled it only after entering a match
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
  - Browser check confirmed the login page no longer shows the launcher while the launcher node is hidden with `display: none`
- Follow-up:
  - Investigate why the browser lobby remained `OFFLINE` during manual create-room attempts before claiming live in-match verification

- Goal:
  Start paying down the mobile/web input architecture debt instead of continuing to patch joystick behavior directly inside the scene.
- Actions:
  - Added a new reusable mobile input module at `client/src/input/mobileControls.{js,ts}`
  - Implemented a dynamic-base virtual joystick model inspired by the feedback references instead of the old fixed joystick anchored to the corner
  - Moved mobile action buttons into the same module so `GameScene` no longer needs `window.__gameActions` to bridge DOM controls back into gameplay actions
  - Switched the active `GameScene.js` runtime path and the tracked `GameScene.ts` path to consume the new mobile controls module
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
- Follow-up:
  - Extract keyboard input behind the same style of adapter so scene code stops caring which platform is driving movement

- Goal:
  Continue the multi-platform input cleanup by giving Web keyboard controls the same kind of boundary as mobile touch controls and make the inventory entry discoverable on desktop.
- Actions:
  - Added `client/src/input/keyboardControls.{js,ts}` to own keyboard movement/action shortcuts instead of reading Phaser keys directly inside `GameScene`
  - Switched both `GameScene.js` and `GameScene.ts` to consume keyboard/touch adapters rather than storing raw key fields in the scene
  - Added inventory toggle shortcuts on Web (`I`, `B`, `Tab`) through the new keyboard adapter
  - Updated the inventory launcher copy so desktop shows a visible `Inventory (I)` entry instead of looking mobile-only
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
- Follow-up:
  - Revalidate the new shared input boundary in a real match, especially desktop inventory discovery and mobile horizontal layout spacing

- Goal:
  Address the next real-device regression batch on top of the new input layer: mobile inventory interaction, desktop tooltip clipping, and turn-time joystick speed inconsistency.
- Actions:
  - Updated `client/src/input/mobileControls.{js,ts}` so touches on inventory/UI surfaces no longer get hijacked by the joystick listeners
  - Changed mobile joystick output to a fixed active move magnitude with a small dead zone so turning changes direction only instead of changing speed
  - Updated `client/src/ui/InventoryPanel.{js,ts}` and `client/src/styles/inventory.css` so desktop item detail tooltips are positioned as fixed overlays rather than being clipped inside the backpack panel
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
- Follow-up:
  - Revalidate these three behaviors in a live browser/mobile session before moving on to broader screen-ratio polishing

- Goal:
  Close the strongest evidence-backed root cause for joystick turn-time acceleration without guessing at more client-side stick heuristics.
- Actions:
  - Changed `server/src/index.ts` so `PlayerInputMove` only stores the latest player intent instead of moving immediately per packet
  - Changed `server/src/room-store.ts` so player movement is advanced on the fixed player sync tick using the stored input vector and time-based distance from `moveSpeed`
  - Added runtime player `moveInput` state in `server/src/types.ts` and preserved last non-zero facing when a stop vector is received
  - Verified with a direct `RoomStore` script that steady input and noisy multi-update-per-tick input both produce `300` units of cumulative travel over `20` ticks at `50ms`
- Verification:
  - `npm.cmd run typecheck --workspace server` passed
  - `npm.cmd run build --workspace server` passed
  - `npm.cmd run build --workspace client` passed
- Follow-up:
  - Revalidate on a real mobile device that joystick turning no longer changes effective move speed

- Goal:
  Use Gemini for a focused frontend adaptation pass now that its headless execution path is understood in this environment.
- Actions:
  - Verified Gemini CLI headless behavior on this machine and found that `CI=1` is required for reliable stdout output inside the current Codex session
  - Used Gemini for a frontend-only audit and edit pass on the active runtime path
  - Cleaned up `client/src/scenes/GameScene.{js,ts}` touch-control dead code so the active path relies on `mobileControls`
  - Reworked `client/src/ui/InventoryPanel.{js,ts}` so backpack slots render from real `inventory.width x inventory.height` and place items by `x/y`
  - Fixed visible inventory labels/actions to readable Chinese on the active frontend path
  - Updated `client/src/styles/inventory.css` so the mobile inventory launcher no longer overlaps the top-right HUD and mobile backpack uses horizontal scrolling instead of collapsing true column count into tiny cells
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
- Follow-up:
  - Revalidate on desktop and phone that inventory slot placement, tapping, tooltip behavior, and lower-right launcher placement feel correct in a real match

- Goal:
  Resolve the next Web-first acceptance issues without opening a new gameplay branch: tooltip hover continuity on desktop and mobile inventory launcher placement away from the combat action cluster.
- Actions:
  - Reworked `client/src/ui/InventoryPanel.{js,ts}` desktop tooltip behavior so hover can move from slot to tooltip without immediately collapsing
  - Changed desktop tooltip placement to prefer side-by-side attachment near the hovered slot instead of detached floating behavior
  - Moved the mobile inventory launcher out of the lower-right combat interaction zone to a top-center mobile position
  - Kept the real inventory grid rendering and `x/y` slot placement logic intact while updating these interaction details
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
- Follow-up:
  - Revalidate on Web that tooltip hover feels continuous and visually attached
  - Revalidate on mobile that the top-center launcher is discoverable and no longer competes with attack/skill/pickup buttons

- Goal:
  Close the specific Web tooltip regression where equipment/item details still appeared detached in the lower-right despite the side-placement code.
- Actions:
  - Inspected the live browser DOM and confirmed the root cause was not the math but the containing layer: `.inventory-tooltip` used `position: fixed` while still mounted inside `.inventory-panel`, and `.inventory-panel` itself uses `transform: translate(-50%, -50%)`
  - Updated `client/src/ui/InventoryPanel.{js,ts}` so all per-item tooltips mount to `document.body` instead of living under the transformed panel
  - Added owned-tooltip cleanup before each inventory re-render so body-level overlay nodes do not accumulate stale DOM between renders
- Verification:
  - Browser inspection showed the old lower-right drift was caused by fixed-position containment under the transformed panel
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
- Follow-up:
  - Revalidate on Web that hovering an equipment or backpack slot now keeps the detail card visually attached to that slot instead of drifting to the lower-right

- Goal:
  Remove the remaining desktop inventory annoyance where moving from a hovered slot toward the detail card could cross a neighboring slot and instantly replace or dismiss the active detail card.
- Actions:
  - Updated `client/src/ui/InventoryPanel.{js,ts}` to add a short desktop hover-intent delay before switching from one visible tooltip to another
  - Changed slot/tooltip leave handling so moving across neighboring inventory slots no longer immediately starts the old hide path while the player is still steering into the current detail card
  - Kept mobile tap behavior unchanged so this desktop-specific forgiveness does not alter touch interaction
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
- Follow-up:
  - Revalidate on Web that you can move from a slot into its detail card without briefly crossing a sibling slot and losing the current card

- Goal:
  Add the smallest safe Web-only minimap so desktop testing gets positional awareness without leaking full-map information or touching server/shared contracts.
- Actions:
  - Added `client/src/ui/Minimap.{js,ts}` as a dedicated HUD helper with a low-resolution explored-cell grid, dark unexplored background, and a local player marker
  - Wired `client/src/scenes/GameScene.{js,ts}` to instantiate the minimap only on non-touch sessions, sync world bounds from match state, and reveal/update from the smoothed self player marker in `update()`
  - Kept the implementation intentionally narrow: no monsters, drops, loot, or terrain thumbnail, only explored area plus player position
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
- Follow-up:
  - Revalidate on Web that the minimap sits cleanly in the top-left HUD and that exploration/fog behavior reads well during movement

- Goal:
  Improve Web inventory readability without touching the current 1-slot storage model or expanding the work into GameScene/minimap changes.
- Actions:
  - Added `client/src/ui/itemPresentation.{js,ts}` as the shared front-end source for item names, category labels, rarity labels, and static icon-plus-badge presentation
  - Reworked `client/src/ui/InventoryPanel.{js,ts}` so filled slots no longer render only the first character of the item name; they now show a stable glyph/badge presentation and use the shared presentation helper for tooltip headers and labels
  - Updated `client/src/scenes/createGameClient.{js,ts}`, `client/src/results/ResultsOverlay.{js,ts}`, `client/src/ui/lobbyView.{js,ts}`, `client/src/styles/inventory.css`, `shared/src/data/items.ts`, `shared/src/data/weapons.ts`, and `server/src/inventory/catalog.ts` to tighten Chinese-facing naming and reduce obvious player-visible English leftovers
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
  - `npm.cmd run build --workspace server` passed
- Follow-up:
  - Revalidate on Web that the new inventory glyph/badge system reads clearly in the dense backpack grid and that settlement/lobby copy no longer leaks obvious English placeholders

- Goal:
  Rebase the active Web lobby onto the imported Claude Design hall instead of continuing a loosely inspired rewrite.
- Actions:
  - Replaced `client/src/ui/lobbyView.{js,ts}` with a Claude-Design-led hall structure that restores the topbar, left squad panel, center deploy hero, right summary stack, and footer ticker composition
  - Switched `client/src/styles/lobby.css` back to the imported hall CSS as the visual base and only added minimal project-specific disabled/banner rules
  - Kept only the existing real room actions wired (`create/join/leave/capacity/start`) and left undeveloped hall modules in disabled presentation state
  - Updated `client/src/app/lobbyApp.{js,ts}` and `client/src/network/createLobbyController.{js,ts}` copy so the hall status text matches the new shell
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
  - `npm.cmd run build --workspace server` passed
- Follow-up:
  - Revalidate in the browser that the imported hall now reads as the same Claude Design family and no longer looks like a separate GPT-authored redesign

- Goal:
  Tighten the active Claude-led lobby toward the imported source-of-truth details instead of only preserving the broad shell.
- Actions:
  - Restored the original lobby font stack in `client/index.html` using the Claude source Google Fonts import
  - Switched both `client/src/app/mockLobbyController.ts` and `server/src/room-store.ts` to generate place-name plus middot room codes such as `南岭·42`
  - Normalized join-room input handling across lobby app, mock controller, and server room lookup so separator variants collapse to the Claude middot format
  - Updated the active room-code input placeholder in `client/src/ui/lobbyView.{js,ts}` to the Claude source example `南岭·42`
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
  - `npm.cmd run build --workspace server` passed
- Follow-up:
  - Revalidate in the browser that the hall now feels materially closer to the imported Claude Design source in room-code flavor, typography, and first-screen composition

- Goal:
  Spend one last controlled pass on the Web lobby's visual soul without reopening structural churn.
- Actions:
  - Rebalanced `client/src/styles/lobby.css` around a Chinese-first hierarchy: `Noto Serif SC` for major hall titles and verdict numbers, `Noto Sans SC` for navigation/body/buttons, and `JetBrains Mono` for stamped system labels
  - Increased the weight and scale of the brand, squad, deploy, room-code, CTA, and result typography so the page reads less like a generic web dashboard and more like a game hall
  - Kept the existing Claude-led layout, room-code flavor, and minimal real-action wiring unchanged while only adjusting type roles and proportions
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
- Follow-up:
  - Treat this as the last hall polish pass unless a true blocking usability bug appears; move back to actual game progression work

- Goal:
  Start unifying the in-match experience with the Claude-led hall so entering gameplay no longer feels like switching to a different product.
- Actions:
  - Restyled `client/src/scenes/GameScene.{ts,js}` HUD clusters into framed warm panels for HP, timer/channel, combat line, and controls hint while keeping existing anchors and gameplay behavior intact
  - Restyled `client/src/ui/Minimap.{ts,js}` away from the cold prototype blue-gray treatment and toward the hall palette with a tactical label and warmer frame/exploration colors
  - Reworked `client/src/results/ResultsOverlay.{ts,js}` and `client/src/styles/results.css` to match the hall typography hierarchy, panel borders, and recovery-report tone
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
- Follow-up:
  - Browser-check that the first in-game frame, minimap, and settlement screen now feel like the same game as the hall before moving on to deeper gameplay work


- Goal:
  Recover the regressed in-match terrain/detail presentation while putting the first minimal shared theme hook under the active gameplay HUD and minimap.
- Actions:
  - Restored the active `GameScene` world backdrop chain with plaza/path patches/obstacle props/region labels/extract beacon visuals instead of the flat fallback `syncWorld()`
  - Added `client/src/ui/gameplayTheme.{ts,js}` and rewired the active `GameScene` HUD plus `Minimap` frame/palette to read from shared gameplay tokens/helpers
  - Rebuilt the active JS siblings from TS using local `esbuild.exe` so the checked-in runtime path stays aligned
- Verification:
  - `npm.cmd run typecheck --workspace client` passed
  - `npm.cmd run build --workspace client` passed
- Follow-up:
  - Browser-verify that the map no longer reads as a flat green field and that the in-match HUD/minimap now feel consistently tied to the lobby language
