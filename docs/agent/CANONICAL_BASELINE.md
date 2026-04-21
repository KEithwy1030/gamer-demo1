# Canonical Baseline

Updated: 2026-04-21

This file records the current code-truth baseline extracted from the running paths in the repo. It is not a wish list.

## Workspace

- Monorepo root: `E:\CursorData\gamer`
- Workspaces:
  - `client`: Vite + Phaser 3
  - `server`: Node.js + Express + Socket.IO
  - `shared`: shared protocol, types, static data
  - `scripts`: asset utilities plus one backend/socket loop test

## Entry Points

- Browser entry: [client/index.html](/E:/CursorData/gamer/client/index.html:36) -> `/src/main.ts`
- Client shell entry: [client/src/main.ts](/E:/CursorData/gamer/client/src/main.ts:1)
- Client scene controller: [client/src/scenes/createGameClient.js](/E:/CursorData/gamer/client/src/scenes/createGameClient.js:1)
- Active client scene runtime: [client/src/scenes/GameScene.js](/E:/CursorData/gamer/client/src/scenes/GameScene.js:1)
- Active client socket runtime: [client/src/network/socketClient.js](/E:/CursorData/gamer/client/src/network/socketClient.js:1)
- Server dev entry: [server/package.json](/E:/CursorData/gamer/server/package.json:1) `tsx watch src/index.ts`
- Server runtime entry: [server/src/index.ts](/E:/CursorData/gamer/server/src/index.ts:1)
- Shared package entry: [shared/src/index.ts](/E:/CursorData/gamer/shared/src/index.ts:1)

## Runtime Truth

- The client is not running a pure TS module graph.
- `main.ts` is the browser entry, but imports without file extensions resolve into checked-in `.js` siblings for most downstream modules.
- The active gameplay/input path in the browser currently flows through:
  - [client/src/main.ts](/E:/CursorData/gamer/client/src/main.ts:1)
  - [client/src/scenes/createGameClient.js](/E:/CursorData/gamer/client/src/scenes/createGameClient.js:147)
  - [client/src/scenes/GameScene.js](/E:/CursorData/gamer/client/src/scenes/GameScene.js:941)
  - [client/src/input/mobileControls.js](/E:/CursorData/gamer/client/src/input/mobileControls.js:112)
  - [client/src/network/socketClient.js](/E:/CursorData/gamer/client/src/network/socketClient.js:1)
- The server has no TS/JS sibling ambiguity, but it consumes `shared/dist/*` while the client mostly consumes `shared/src/*`.

## Shared / Server / Client Contract Consumption

- Client shared imports: mostly `../../../shared/src/...`
- Server shared imports: mostly `../../shared/dist/...`
- Result: shared contract drift is possible whenever shared TS changes are not rebuilt before server execution.

## Baseline Parameters From Code

### Match / Room

- Room code length: `6`
- Default room capacity: `6`
- Min room capacity: `1`
- Max room capacity: `6`
- Match duration: `900s` (`15m`)
- Player sync rate: `20 Hz`

Source:
- [shared/src/data/constants.ts](/E:/CursorData/gamer/shared/src/data/constants.ts:1)
- [server/src/internal-constants.ts](/E:/CursorData/gamer/server/src/internal-constants.ts:1)

### Map / Extract

- Map size: `6400 x 6400`
- Extract open time default: `180s` after match start unless overridden by env
- Extract radius: `96`
- Extract channel duration default: `5000ms` unless overridden by env
- Spawn ring radius: `280`

Source:
- [shared/src/data/constants.ts](/E:/CursorData/gamer/shared/src/data/constants.ts:1)
- [server/src/internal-constants.ts](/E:/CursorData/gamer/server/src/internal-constants.ts:18)

### Player Movement / Combat Baseline

- Player base move speed: `300`
- Move step per accepted input on server: `28`
- Movement application is event-driven, not server-tick-distance-driven
- Default weapon type: `sword`

Source:
- [shared/src/data/constants.ts](/E:/CursorData/gamer/shared/src/data/constants.ts:1)
- [server/src/internal-constants.ts](/E:/CursorData/gamer/server/src/internal-constants.ts:20)
- [server/src/room-store.ts](/E:/CursorData/gamer/server/src/room-store.ts:214)

### Weapon Stats

- Sword: `attackPower 10`, `1.5 attacks/s`, `range 116`
- Blade: `attackPower 15`, `1.0 attacks/s`, `range 128`
- Spear: `attackPower 20`, `0.5 attacks/s`, `range 180`

Source:
- [shared/src/data/weapons.ts](/E:/CursorData/gamer/shared/src/data/weapons.ts:1)

### Monster Baseline

- Normal monsters per match: `40`
- Elite monsters per match: `3`
- Corpse duration: `10000ms`
- Respawn delay: `60000ms`
- Normal monster move speed: `120`
- Elite monster move speed: `145`
- Normal monster damage/range: `4 / 20`
- Elite monster damage/range: `7 / 24`

Source:
- [server/src/monsters/monster-manager.ts](/E:/CursorData/gamer/server/src/monsters/monster-manager.ts:31)
- [server/src/internal-constants.ts](/E:/CursorData/gamer/server/src/internal-constants.ts:31)

### Inventory / Equipment Baseline

- Server inventory width: `10`
- Server inventory height: `6`
- Client panel currently renders backpack as `100` linear slots and labels it `10x10`
- Starter equipment is initialized on server
- Item definitions use real sizes, including multi-cell items

Source:
- [server/src/inventory/service.ts](/E:/CursorData/gamer/server/src/inventory/service.ts:18)
- [shared/src/data/items.ts](/E:/CursorData/gamer/shared/src/data/items.ts:1)
- [client/src/ui/InventoryPanel.ts](/E:/CursorData/gamer/client/src/ui/InventoryPanel.ts:170)

## Input / Movement Chain

- Mobile touch vector is created in [client/src/input/mobileControls.js](/E:/CursorData/gamer/client/src/input/mobileControls.js:112)
- Scene emits move input from [client/src/scenes/GameScene.js](/E:/CursorData/gamer/client/src/scenes/GameScene.js:941)
- Network forwards input without transformation from [client/src/scenes/createGameClient.js](/E:/CursorData/gamer/client/src/scenes/createGameClient.js:150)
- Server applies movement in [server/src/room-store.ts](/E:/CursorData/gamer/server/src/room-store.ts:214)

## Evidence-Backed Root-Cause Candidate For Joystick Speed Drift

- Client send cadence changes with direction changes:
  - [GameScene.js](/E:/CursorData/gamer/client/src/scenes/GameScene.js:969) computes `changed`
  - [GameScene.js](/E:/CursorData/gamer/client/src/scenes/GameScene.js:971) only throttles unchanged input to `60ms`
  - [GameScene.js](/E:/CursorData/gamer/client/src/scenes/GameScene.js:975) sends each accepted direction immediately
- Server movement is distance-per-input-event:
  - [room-store.ts](/E:/CursorData/gamer/server/src/room-store.ts:223) calculates magnitude
  - [room-store.ts](/E:/CursorData/gamer/server/src/room-store.ts:231) derives `moveStep = MOVE_STEP_PER_INPUT * directionMagnitude * speedRatio`
- Consequence:
  - holding a steady direction yields roughly one movement packet every `60ms`
  - rotating the stick yields many `changed` packets and therefore more server-side movement steps per second
  - this is the strongest current root-cause candidate for “turning causes acceleration”
