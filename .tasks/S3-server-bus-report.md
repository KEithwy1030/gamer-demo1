# S3 Server Bus Report

## Scope

- Branch: `refactor-domain-events`
- Baseline: `s2-skeleton-checkpoint-20260521`
- Goal: add `room.events` + `flushEvents(room, io)` and enqueue S3 sample domain events alongside legacy socket emits.

## Changed Files

Numstat from `s2-skeleton-checkpoint-20260521..HEAD`:

| File | + | - |
|---|---:|---:|
| `server/src/types.ts` | 3 | 0 |
| `server/src/room-store.ts` | 2 | 1 |
| `server/src/event-bus/flush.ts` | 24 | 0 |
| `server/src/event-bus/index.ts` | 1 | 0 |
| `server/src/combat/combat-service.ts` | 28 | 3 |
| `server/src/monsters/monster-manager.ts` | 40 | 2 |
| `server/src/chests/chest-manager.ts` | 50 | 2 |
| `server/src/extract/service.ts` | 32 | 0 |
| `server/src/index.ts` | 23 | 0 |

No client files were changed by S3.

## Domain Events Added

- Combat: `PlayerDamaged`
- Monsters: `MonsterSpawned`, `MonsterKilled`
- Chests: `ChestRummageStarted`, `ChestOpened`
- Extract: `ExtractOpened`, `ExtractSucceeded`

## Legacy Socket Emit Preservation

- `rg "io\\.to\\(.*\\.emit" server/src/index.ts` at S2 baseline: 85
- Same count after S3: 85
- Existing legacy emits were preserved; S3 only adds domain fanout through `flushEvents`.

Note: the task prompt expected "100+ nearby", but this branch's actual S2 baseline is 85 with the same grep pattern.

## Broadcast Bus Counts

- `flushEvents(` call sites in `server/src/index.ts`: 20
- `emitDomain(` call sites in `server/src`: 7
- `rg "emitDomain|flushEvents" server/src`: 36 lines

## Verification

Static:

- `npm run typecheck` passed.
- `npm run build` passed.

Runtime smoke:

- Started `npm run dev` on `5288/5289`.
- `GET http://127.0.0.1:5289/health` returned `{ "ok": true }`.
- `GET http://127.0.0.1:5288/` returned 200.
- Browser opened `http://127.0.0.1:5288/`; title was `流荒之路 // 营地`; console had 0 errors and 0 warnings.

Socket domain probes:

- Real socket flow with `ENABLE_TEST_HOOKS=1`, create room + start `contested` preset:
  - Legacy event count observed: 128
  - Domain events observed: `domain:MonsterSpawned`, `domain:ChestRummageStarted`, `domain:ChestOpened`
- Real socket flow with `extract` preset + `player:startExtract`:
  - Domain events observed: `domain:ExtractOpened`, `domain:ExtractSucceeded`
- Direct service + fake io probe:
  - Observed `domain:PlayerDamaged`
  - Observed `domain:MonsterKilled`

## Resource Cleanup

- Dev server/client processes started for S3 verification were stopped.
- Ports `5288` and `5289` had only `TimeWait` entries after cleanup, no active listeners.

## Notes

- `ChestOpened` domain payload maps dispensed loot to the S1 `WorldDrop` shape using item instance id as the drop id and chest position as the world position. This keeps the payload typed without changing old chest socket payloads.
- `ExtractOpened` domain payload uses the S1 shape `{ zoneIds, pressure }`; pressure is currently `"open"` or `"active"` because S3 does not introduce a richer extract pressure domain contract.
- `docs/REFACTOR-GUIDE.md` displayed as mojibake in PowerShell, so this task did not edit docs.
