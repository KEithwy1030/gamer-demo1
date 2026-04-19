# Open Loops

## 1. Frontend Return-To-Lobby Still Needs Explicit Revalidation

- Symptom:
  The backend gameplay loop is now covered by an automated Socket.IO test, but the frontend/manual return-to-lobby behavior after settlement has not yet been explicitly rechecked in the current build.
- Confirmed facts:
  - `scripts/test-loop.mjs` passes locally through create -> join -> start -> combat -> pickup -> extract -> settlement
  - create/join/start works on LAN
  - both clients enter the same 2D scene
- Next step:
  Run a frontend-visible dual-client/manual check to confirm the user-facing post-settlement flow and lobby recovery.
- Blocking reason:
  The new script validates protocol and backend state flow, but not the full browser UI transition.

## 2. Obstacles Are Visual Only

- Symptom:
  The scene now has crates, rocks, barricades, and brush, but they do not yet meaningfully block movement in gameplay logic.
- Confirmed facts:
  - obstacle rendering exists in `GameScene.ts`
  - worker explicitly flagged them as visual layout only
- Next step:
  Decide whether to implement local collision, server-authoritative collision, or both. Then integrate with movement validation.
- Blocking reason:
  Requires coordination with gameplay logic and should not break the current frontend baseline casually.

## 3. Combat and Interaction Feedback Are Still Weak

- Symptom:
  The game scene now reads better, but attacks and interactions still lack enough animation and feedback to feel playable.
- Confirmed facts:
  - entities are now more readable
  - no strong hit flashes, impact timing, pickup feedback, or extract dramatization yet
- Next step:
  Add a feedback pass for attacks, damage, pickups, and extract progress.
- Blocking reason:
  This overlaps with frontend polish work and should be coordinated carefully if another model is assigned to presentation.

## 4. Coordination With External Frontend Optimizer

- Symptom:
  Another model may be used for frontend/animation optimization. Uncontrolled backend or protocol changes would disrupt its testing.
- Confirmed facts:
  - the user explicitly raised this concern
  - the agreed safe approach is to freeze the gameplay/protocol baseline while frontend polish is underway
- Next step:
  Prepare a stable handoff note for the frontend optimizer and avoid protocol-breaking changes on the active baseline.
- Blocking reason:
  Depends on the timing of the external frontend pass.

## 5. Gameplay Sanity Pass For Equipment System

- Symptom:
  The equipment/affix/stat refactor is now compile-verified, but live gameplay behavior still needs a real-room sanity pass.
- Confirmed facts:
  - `npx tsc --noEmit -p client/tsconfig.json` passes
  - `npx tsc --noEmit -p server/tsconfig.json` passes
  - equip/drop/unequip payloads are wired on `itemInstanceId`
  - loot slot mapping and rarity-based affix generation are aligned with the current item model
  - doubled player weapon range plus blade/spear skill handlers compile on the server
  - monster attack damage/range are reduced to the latest requested values
- Next step:
  Run a live sanity pass for equip, unequip, drop, pickup, movement speed changes, combat damage changes, and the new blade/spear skill effects in an active room.
- Blocking reason:
  Type safety is green, but runtime behavior still needs explicit gameplay validation.
