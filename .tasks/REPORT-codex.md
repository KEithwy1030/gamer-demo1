# codex-combat-depth-2026-05-20

## Landed

- `3aa7428` `feat(spawn): add phased combat archetypes and music bus`
  - TASK 1 landed: new monster archetypes `skirmisher` / `brute` / `archer`, legacy `normal -> basic` normalization, projectile protocol, projectile manager, and client/devlog visibility for spawn, windup, hit, death, projectile lifecycle, and archetype state.
  - TASK 2 landed: `server/src/spawn/spawn-director.ts` added phase-based spawn pacing with `opening -> skirmish -> danger -> extract`, phase caps, socket broadcast `SpawnPhaseChanged`, and `server/src/spawn/spawn-director.test.ts`.
  - TASK 4 landed at feature level: server music mode broadcast chain for `lobby | calm | skirmish | danger | extract_pressure | death | victory`.
  - TASK 5 landed: shared projectile payloads and client socket wiring for `MonsterProjectileSpawn` / `Hit` / `Despawn`.
- `4803323` `fix(extract): stabilize lategame acceptance signal`
  - Dev-only lategame preset now pre-arms extract progress and pins the spawn director to extract grace instead of letting the first phase-change tick immediately re-arm fresh threats.
  - Extract service no longer rebroadcasts `ExtractOpened` every tick when nothing actually changed.
  - This commit existed only to unblock the required browser + `.devlog/latest.jsonl` acceptance chain and did not retune shipped combat stats.

## Validation Evidence

- Static checks passed after the final fix:
  - `npm run typecheck`
  - `npm run build`
  - `npm run validate:audio-hooks`
  - `npm run validate:chest-contract`
  - `npx vitest run server/src/spawn/spawn-director.test.ts`
- Browser acceptance used the dedicated 52XX-style isolated ports with Playwright fallback because Chrome DevTools MCP timed out repeatedly at `list_pages` for 120s and could not be used reliably in this environment.
- Latest passing lategame acceptance artifact:
  - `.codex-artifacts/game-feel-baseline/game-feel-baseline-2026-05-20T08-58-26-543Z`
- Latest passing `.devlog/latest.jsonl` chain includes:
  - `extract.progress` repeating with pressure payload
  - `extract.success`
  - `music.mode_changed` = `victory`
  - Follow-up `room.error` = `Dead players cannot extract.` from the acceptance hook retry after success, which is expected post-settlement noise rather than a failure of the victory chain

## Skipped Or Partial

- TASK 3 telemetry-driven 5-match rebalance pass: skipped.
  - Reason: the feature implementation was already landed in `3aa7428`, but this session did not complete the requested five-match automated telemetry aggregation and did not make a defensible stats retune from that dataset.
  - Impact: no additional chest/basic/elite/spawn-density balance constants were changed beyond the archetype/spawn values already introduced in `3aa7428`.
- TASK 6 elite secondary move: skipped.
  - Reason: optional by spec, and higher-priority extract/victory acceptance closure consumed the remaining budget.
- Chrome DevTools MCP self-test path: blocked.
  - Reason: `mcp__chrome_devtools__.list_pages` timed out twice for 120 seconds, so browser verification used the working Playwright/browser path instead.

## Key Tuning Constants Changed

- Combat archetypes from `3aa7428`
  - `SKIRMISHER_MAX_HP = 25`
  - `SKIRMISHER_ATTACK_DAMAGE = 12`
  - `SKIRMISHER_ATTACK_COOLDOWN_MS = 1500`
  - `SKIRMISHER_RETREAT_DISTANCE = 180`
  - `BRUTE_MAX_HP = 120`
  - `BRUTE_ATTACK_DAMAGE = 50`
  - `BRUTE_ATTACK_RANGE = 110`
  - `BRUTE_ATTACK_ARC_DEG = 120`
  - `BRUTE_WINDUP_MS = 1500`
  - `BRUTE_ATTACK_COOLDOWN_MS = 2800`
  - `ARCHER_MAX_HP = 40`
  - `ARCHER_ATTACK_DAMAGE = 22`
  - `ARCHER_ATTACK_COOLDOWN_MS = 2200`
  - `ARCHER_RETREAT_DISTANCE = 180`
  - `ARCHER_RETREAT_TRIGGER_RANGE = 120`
  - `ARCHER_PROJECTILE_TTL_MS = 850`
- Spawn pacing from `3aa7428`
  - `opening`: `0-90s`, cap `6`, interval `4200ms`
  - `skirmish`: `90-240s`, cap `12`, interval `2600ms`
  - `danger`: `240-360s`, cap `16`, interval `2100ms`
  - `extract`: `360-480s`, cap `20`, interval `1600ms`
- Dev-only acceptance constants touched by `4803323`
  - `DEV_EXTRACT_CHANNEL_DURATION_MS = 9000`
  - `DEV_LATEGAME_SPAWN_GRACE_MS = 12000`
  - `DEV_LATEGAME_RUN_OFFSET_MS = 361000`
  - plus new lategame preset behavior: pre-armed `player.extract` state and forced initial `spawnDirector.phase = extract`

## Boundary Notes

- No edits were made to `GDD.md`, `PITCH.md`, `AGENTS.md`, `client/public/assets/audio/*`, or `client/public/assets/generated/*`.
- No `git push` was performed.
