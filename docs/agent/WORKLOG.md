# Worklog

## 2026-04-19

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
