# Task Card 02

## Goal

Remove the joystick turn-time acceleration by fixing the movement authority model on the active runtime path, not by adding more local input heuristics.

## Input Docs

- [MASTER_SPEC.md](/E:/CursorData/gamer/MASTER_SPEC.md)
- [WORK_QUEUE.md](/E:/CursorData/gamer/WORK_QUEUE.md)
- [CANONICAL_BASELINE.md](/E:/CursorData/gamer/docs/agent/CANONICAL_BASELINE.md)
- [DELTA_MATRIX.md](/E:/CursorData/gamer/docs/agent/DELTA_MATRIX.md)
- [AUDIT_SUMMARY.md](/E:/CursorData/gamer/docs/agent/AUDIT_SUMMARY.md)

## Will Modify

- `server/src/index.ts`
- `server/src/room-store.ts`
- `server/src/internal-constants.ts` if needed
- `shared/src/**` only if a shared movement contract change is required
- `client/src/scenes/GameScene.js`
- `client/src/scenes/createGameClient.js`
- `client/src/network/socketClient.js`
- matching TS sources if they must stay aligned

## Will Not Modify

- visual polish files unrelated to movement
- inventory UI behavior unrelated to movement
- lobby presentation
- results presentation

## Shared Contract Changes

- Maybe
- If movement becomes time-based or cadence-normalized through explicit payloads, shared must be updated first.

## Acceptance

- Holding a steady stick and rotating the stick do not produce different effective move speed.
- Keyboard movement remains stable.
- LAN sync still works.
- The fix is verified on the active JS runtime path, not only TS.
- `typecheck` and `build` pass for affected packages.

## Notes

- Strong current hypothesis: server movement is per input event, while client sends more movement packets during turning than during steady hold.

## Status

- Implemented on `2026-04-21`
- Root fix landed on the server authority path:
  - `PlayerInputMove` now stores latest move intent
  - movement advances on the fixed player sync tick
- Measured verification:
  - direct `RoomStore` script produced equal cumulative travel for steady input and noisy multi-update-per-tick input over `20` ticks at `50ms`
- Remaining acceptance:
  - real mobile-device validation of joystick turning feel
