# Audit Summary

Updated: 2026-04-21

## 1. Current Architecture

- `client/`: Vite + Phaser browser client. Browser entry is [client/src/main.ts](/E:/CursorData/gamer/client/src/main.ts:1), but the active downstream runtime resolves into many checked-in `.js` siblings.
- `server/`: Node.js + Express + Socket.IO authority. Dev entry is [server/src/index.ts](/E:/CursorData/gamer/server/src/index.ts:1).
- `shared/`: shared protocol/types/data package. Client reads mostly from `shared/src`; server reads mostly from `shared/dist`.
- `scripts/`: one relevant runtime test path, [scripts/test-loop.mjs](/E:/CursorData/gamer/scripts/test-loop.mjs:1), which covers backend/socket flow but not browser/touch/UI behavior.
- `docs/agent/`: canonical memory and audited baseline.

## 2. Highest-Risk Debug Root Causes

1. Client movement send cadence changes with stick turning, while server movement is distance-per-input-event. This is the strongest evidence-backed root cause for turn-time acceleration.
2. Client runtime shadowing: many fixes can land in TS while the browser still executes JS siblings.
3. Shared contract split: client `shared/src` vs server `shared/dist` can create protocol/value drift.
4. Inventory UI model drift: server inventory is `10x6`, current client panel still renders `100` slots and labels `10x10`.
5. Automation gap: backend/socket tests do not validate touch capture, joystick feel, tooltip clipping, or other visible UI regressions.
6. Historical doc drift created contradictory “truth” about weapon ranges, execution priority, and spec paths.

## 3. P0 / P1 / P2

### P0

- Fix the movement authority model so speed is time-based or cadence-stable, not event-count-based.
- Freeze shared consumption so client and server do not read different shared realities.
- Decide and enforce one active client runtime path, or explicitly manage JS/TS dual-track execution.

### P1

- Align inventory UI with server inventory dimensions and multi-cell semantics.
- Add browser smoke coverage for lobby -> match -> result -> return flow and at least one touch-path check.
- Revalidate result-to-lobby cleanup and in-room acceptance on real browser clients.

### P2

- Game feel polish: hit feedback, extract feedback, pickup feedback, stronger HUD readability.
- Visual cleanup after runtime and contract drift are contained.

## 4. Recommended Next Coding Task

Use the next task card to address the movement model itself, not joystick cosmetics:

- keep this task narrowly scoped to movement cadence and authority
- prove the fix on the active JS runtime path
- validate that the change does not break keyboard movement or LAN sync
