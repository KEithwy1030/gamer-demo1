# Delta Matrix

Updated: 2026-04-21

This file tracks conflicts between current canonical docs and current code truth.

| Area | Spec / Doc Claim | Code Truth | Severity | Notes |
| --- | --- | --- | --- | --- |
| Canonical spec path | `MASTER_SPEC` says canonical files live at `docs/MASTER_SPEC.md` and `docs/WORK_QUEUE.md` | Actual files are root [MASTER_SPEC.md](/E:/CursorData/gamer/MASTER_SPEC.md:1) and [WORK_QUEUE.md](/E:/CursorData/gamer/WORK_QUEUE.md:1) | P0 | Future agents will miss the source of truth unless paths are fixed |
| Baseline audit outputs | `WORK_QUEUE` requires `docs/agent/CANONICAL_BASELINE.md` and `DELTA_MATRIX.md` | Files did not exist before this audit | P0 | This created an impossible bootstrap requirement |
| Client runtime truth | Prior memory/docs implied TS-first client runtime | Browser entry is TS, but downstream runtime resolves into `.js` siblings for most modules | P0 | Any fix applied only to TS can miss the active runtime |
| Shared contract consumption | Repo describes shared as common source | Client consumes `shared/src`, server consumes `shared/dist` | P0 | Contract drift can occur whenever shared build artifacts lag |
| Inventory dimensions | Some UI text/memory implies backpack `10x10` | Server inventory is `10x6`; client panel still renders `100` slots | P0 | UI model and authoritative data model are not aligned |
| Weapon ranges | [OPEN_LOOPS.md](/E:/CursorData/gamer/docs/agent/OPEN_LOOPS.md:61) says `232/256/360` | [PROJECT_STATE.md](/E:/CursorData/gamer/docs/agent/PROJECT_STATE.md:69) and [shared/src/data/weapons.ts](/E:/CursorData/gamer/shared/src/data/weapons.ts:1) say `116/128/180` | P0 | Current memory contains contradictory combat truth |
| Repo status | [AGENTS.md](/E:/CursorData/gamer/AGENTS.md:26) said repo is not git-managed | Workspace contains `.git/` and `git status` works | P1 | Bootstrap instructions are stale |
| Top-level execution doc | [PROJECT_STATE.md](/E:/CursorData/gamer/docs/agent/PROJECT_STATE.md:142) points to `EXECUTION_PLAN.md` as current standard | New process says `MASTER_SPEC` + `WORK_QUEUE` are top docs | P1 | Competing top-level instructions create drift |
| Encoding reliability | Multiple docs appeared garbled under default shell read | Files are valid UTF-8; default shell decoding path is unreliable | P1 | Future audits must read these docs as UTF-8 |
| Test coverage | Existing automation proves backend/socket loop | No equivalent browser/UI smoke chain exists for joystick/UI regressions | P1 | Explains why visible regressions can survive passing automation |

## P0 Audit Conclusions

- Do not trust TS-only client fixes until runtime path ambiguity is removed or explicitly accounted for.
- Do not change shared contract consumers piecemeal.
- Do not use the current inventory UI as evidence that the server inventory model is aligned.
- Do not attempt to fix joystick speed by feel alone; first fix the event-driven movement model mismatch.

## P1 Audit Conclusions

- Canonical doc paths and repo bootstrap references must be aligned.
- UTF-8 decoding should be treated as required for doc work in this repo.
- Browser smoke coverage is required before declaring front-end movement or UI issues solved.
