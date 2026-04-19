# Project State

## What This Repo Is

This repo is a LAN multiplayer browser game prototype built as a monorepo:

- `client/`: `TypeScript + Phaser 3 + Vite`
- `server/`: `Node.js + Socket.IO`
- `shared/`: shared protocol, types, and gameplay constants

The intended game is a top-down multiplayer extraction demo. The current approved direction is not "finish every system first". It is:

- make the prototype clearly read as a 2D game scene
- keep LAN room flow working
- then validate the full playable loop

## Current Truth

### Working Today

- LAN room flow works:
  - create room
  - join room
  - host starts match
- both clients enter the same scene
- A scripted backend E2E loop now passes locally:
  - create room
  - join room
  - start match
  - kill monster
  - observe loot spawn
  - pick up item
  - wait for extract open
  - start extract
  - receive settlement
- Client build and typecheck pass.
- Server health endpoint responds successfully.
- Backend LAN/mobile socket compatibility is now explicitly hardened:
  - if `CLIENT_ORIGIN` is unset, server CORS accepts any origin via `corsOrigin: true`
  - Socket.IO explicitly allows both `websocket` and `polling`
  - Socket.IO ping/connect timeouts are now more tolerant for higher-latency mobile clients
  - player movement now preserves analog touch-vector magnitude instead of forcing every non-zero vector to full-speed movement
- The scene now contains:
  - terrain zones
  - paths
  - central extract plaza
  - obstacle visuals
  - more game-like player/monster/drop markers
- Inventory is now a collapsible auxiliary panel instead of the main page focus.
- The equipment system source has been expanded to:
  - align client/server equip payload naming on `itemInstanceId`
  - use `weapon/head/chest/hands/shoes` slot naming consistently
  - generate rarity-based affixes on monster drops
  - project equipped item stats into runtime player state for combat and movement
  - keep equip, unequip, and drop event wiring consistent with the current inventory API

### What Is Still Not Good Enough

- The game still lacks satisfying gameplay feedback.
- Obstacles currently improve scene readability but do not yet act as authoritative collision blockers.
- Combat and interaction feedback are still too weak for a convincing demo:
  - attack feel
  - hit feedback
  - pickup feedback
  - extract feedback
- Full-loop validation is still incomplete:
  - frontend/manual return to lobby after settlement
  - any user-visible polish expectations around feedback and pacing
- The latest equipment refactor now has fresh passing client/server TypeScript verification.

## Technical Reality

### Important Client Files

- [client/src/main.ts](/E:/CursorData/gamer/client/src/main.ts)
- [client/src/scenes/createGameClient.ts](/E:/CursorData/gamer/client/src/scenes/createGameClient.ts)
- [client/src/scenes/GameScene.ts](/E:/CursorData/gamer/client/src/scenes/GameScene.ts)
- [client/src/game/entities/PlayerMarker.ts](/E:/CursorData/gamer/client/src/game/entities/PlayerMarker.ts)
- [client/src/game/entities/MonsterMarker.ts](/E:/CursorData/gamer/client/src/game/entities/MonsterMarker.ts)
- [client/src/game/entities/DropMarker.ts](/E:/CursorData/gamer/client/src/game/entities/DropMarker.ts)
- [client/src/ui/InventoryPanel.ts](/E:/CursorData/gamer/client/src/ui/InventoryPanel.ts)

### Important Server Files

- [server/src/index.ts](/E:/CursorData/gamer/server/src/index.ts)
- [server/src/combat/combat-service.ts](/E:/CursorData/gamer/server/src/combat/combat-service.ts)
- [server/src/inventory/index.ts](/E:/CursorData/gamer/server/src/inventory/index.ts)
- [server/src/loot/loot-manager.ts](/E:/CursorData/gamer/server/src/loot/loot-manager.ts)
- [server/src/monsters/monster-manager.ts](/E:/CursorData/gamer/server/src/monsters/monster-manager.ts)
- [server/src/extract/index.ts](/E:/CursorData/gamer/server/src/extract/index.ts)
- [scripts/test-loop.mjs](/E:/CursorData/gamer/scripts/test-loop.mjs)

## Runtime Facts

- Frontend is normally served at `http://localhost:5173/`.
- LAN clients should use `http://192.168.1.204:5173/`.
- Default server URL resolution was changed so LAN clients connect to the host machine instead of their own `localhost`.
- The backend now explicitly exposes both Socket.IO `websocket` and `polling` transports, with relaxed ping/connect timeouts for mobile LAN clients.
- Phaser canvas resize logic was fixed after a bug where the game rendered at `0x0` and only the DOM inventory panel was visible.
- `scripts/test-loop.mjs` starts the server with accelerated extract/match timers for automated validation and runs a dual-client Socket.IO loop test end to end.

## Acceptance Standard Now

The current demo standard is defined by [EXECUTION_PLAN.md](/E:/CursorData/gamer/EXECUTION_PLAN.md):

- it must first read as a 2D game scene
- it must keep LAN multiplayer flow working
- it must then support a complete playable extraction loop

Any claim that the demo is "ready" must be checked against those standards, not just build success or socket connectivity.
