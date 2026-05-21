# S5 Cutover Report

## Scope

- Branch: `refactor-domain-events`
- S5 goal: make domain events the only path for migrated combat, monster, chest, extract, loot, and music events.
- Shared protocol was not modified.

## Cutover Counts

- `server/src/index.ts` legacy `io.to(...).emit(...)` count:
  - Before S5 cutover baseline (`c58c926`): 85
  - After S5 cutover: 12
- Client legacy `network.onXxx(...)` handlers removed from `createGameClient.ts`:
  - Before: 13
  - After: 0
  - Removed: 13

## Deleted Files

- `client/src/scenes/gameScene/feedbackFx.ts`

`client/src/scenes/gameScene/interactions.ts` was kept because it still owns live chest prompt, chest marker, and auto-extract interaction logic.

## Verification

### S5 Script

Command:

```text
node scripts/verify-s5-cutover.mjs
```

Output:

```text
PASS  server/index.ts emit count: 12 (S3 baseline 85, target < 30)
PASS  emitExtractInterruptForCombatEvent removed from index.ts
PASS  GameScene.syncMonsters windup diff removed
PASS  createGameClient.applyMonsters windup inference removed
PASS  client/src/scenes/gameScene/feedbackFx.ts deleted
PASS  client/src/scenes/gameScene/interactions.ts deleted (or kept only for autoExtractLogic)
PASS  GameScene.onAudioCue callback field removed
PASS  GameScene.applyHitFlash callback field removed

ALL PASS
```

### Build

Command:

```text
npm run build
```

Result: passed for shared, server, and client. Vite reported only the existing large chunk warning for the Phaser vendor chunk.

### Playtest Notes

Dev server:

- Client: `http://localhost:5288/`
- Server health: `http://localhost:5289/health`

Observed in browser and `.devlog/latest.jsonl`:

- Created a room and started a match.
- State snapshots continued to drive the match: monsters spawned and spawn phase changed.
- `MusicModeChanged` reached the client: `lobby` then `calm` entries appeared in runtime log.
- Player attack input fired and played the `attack` audio cue.
- Pickup input fired and played the `pickup` audio cue.
- Extract input outside the extract zone produced the expected room error: `Player is not inside the extract zone.`
- Environmental damage reached the client through `PlayerDamaged`; HP changed repeatedly and `hurt` audio played.
- Death reached the client through the new path; `death` audio played and the settlement failure panel appeared.
- Browser console had no errors in the first run.

Regression found during repeat-run playtest:

- Returning to lobby and starting a second run initially produced stale GameScene subscriber errors from `lootToastVfx` and `extractVfx`.
- Fix applied: `GameScene` now unsubscribes feature domain-event subscriptions on Phaser scene shutdown and destroy.
- After the fix, `npm run build`, client typecheck, and the S5 script all passed again.

Not fully covered by automated browser playtest:

- Successful chest rummage/open sequence.
- Successful extract channel and victory settlement.
- Equipment stat-change observation.

These require either a longer manual route through the live map or a dedicated deterministic playtest preset.

