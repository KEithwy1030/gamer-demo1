# S6 Acceptance Report

## Scope

S6 completed the final refactor step: tuning, extraction layout changes, extraction-channel behavior, acceptance scripting, and project-rule anchoring.

## Tuning Before / After

| Area | Before | After | Evidence |
|---|---:|---:|---|
| Sword dashSlash distance | 96 px design target, 150 px server fallback | 64 px shared skill value and 64 px server fallback | `shared/src/data/skills.ts`, `server/src/combat/combat-service.ts`, `server/src/monsters/monster-manager.ts` |
| Sword dashSlash speed | baseline | `dashSpeedScale: 0.85` | `shared/src/data/skills.ts` |
| Sword dashSlash damage | 18 | unchanged | `server/src/combat/combat-service.ts` |
| Corpse fog grace | 0-8 min | 0-6 min | `shared/src/data/constants.ts`, `server/src/corpse-fog.ts` |
| Corpse fog backlash | 8-12 min, 1 hp/s | 6-13 min, 1 hp/s | `shared/src/domain/extractionPressure.ts`, `server/src/corpse-fog.ts` |
| Corpse fog intensified | 12-15 min, 5 hp/s | 13-18 min, 5 hp/s | `shared/src/domain/extractionPressure.ts`, `server/src/corpse-fog.ts` |
| Match duration | 15 min | 18 min | `MATCH_DURATION_SEC = 18 * 60` |
| Extract open time | 8 min | unchanged | `EXTRACT_OPEN_SEC = 8 * 60` |
| Chest loot phase | fixed table | opening/skirmish default, danger +1 weight, extract +2 weight | `server/src/chests/chest-manager.ts`, `server/src/chests/listeners.ts` |

## Extract Zones

Extraction now uses three central triangle points:

| Zone | Position | Radius |
|---|---:|---:|
| `extract_north` | `(2400, 2080)` | 96 px |
| `extract_southwest` | `(2080, 2640)` | 96 px |
| `extract_southeast` | `(2720, 2640)` | 96 px |

All three zones are included in match layout, initial client extract state, world backdrop markers, extract VFX markers, and nearest-open-zone interaction selection.

## Playtest Observations

Socket playtest artifact: `.codex-artifacts/s6-playtest/2026-05-21T20-25-27-660Z/summary.json`.

- Contested chest flow passed: `ChestRummageStarted`, full rummage ticks, `ChestOpened`, world drops, pickup, equip.
- Equipment stat change passed: picked `raider_blade`, equipped `weapon`, attackPower changed from `0` to `3`.
- Extract movement passed: started extraction at `extract_north`, sent in-zone movement during channel, received tick with `8723 ms` remaining, no interrupt event, then `ExtractSucceeded`.
- Settlement passed: result `success`, reason `extracted`.

Browser lategame artifact: `.codex-artifacts/game-feel-baseline/lategame-extract-baseline-2026-05-21T20-26-40-188Z/summary.json`.

- Browser reached lategame preset at `http://127.0.0.1:5296/?devRoomPreset=lategame&p0bTestHooks=1`.
- Captured 16 chest init payloads.
- Captured opened extract event.
- Captured extract channel started at `extract_north`.
- Captured extract success at `extract_north`.
- Screenshots captured:
  - `01-lategame-extract-ready.png`
  - `02-lategame-extract-pressure.png`
  - `03-lategame-extract-sustained-pressure.png`

Combat feel note:

- S6-specific sword dash distance is contract-verified at 64 px through `verify-s6-tuning.mjs` and shared/server skill data.
- The older boss browser hit loop in `accept:game-feel` remained unreliable because its click approximation did not produce a self combat result in this run. This report does not count that flaky boss harness as S6 acceptance evidence.

## Verification Output

`node scripts/verify-s6-tuning.mjs`

```text
PASS  sword dash distance: 64 (target <= 64)
PASS  extract zones count: 3 (target >= 3)
PASS  MATCH_DURATION_SEC: 1080 (target >= 1020)

ALL PASS
```

Additional commands run:

```text
npm run validate:loot-depth
[loot-depth] PASS expanded item tiers, deterministic normal/elite/boss drops, abandoned crate depth

npm run validate:chest-contract
[chest-contract] PASS abandoned crate shape, 3-5 item rummage, 60px interrupt, per-tick inventory/drop feed, all-chest noise pulse, rich guarantee

npm run validate:lategame-smoke
[lategame-smoke] PASS

npm run accept:lategame-extract
result: pass

npm run build
shared/server/client build passed
```

## Known Boundary

The socket and browser automation prove the S6 structural flows. Final subjective tuning still needs human feel review for dash feel, combat VFX/audio feel, and long-session greed pressure.
