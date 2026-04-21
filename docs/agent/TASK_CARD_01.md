# Task Card 01

## Goal

Complete the baseline audit and documentation cleanup so future implementation work starts from one audited reality.

## Input Docs

- [MASTER_SPEC.md](/E:/CursorData/gamer/MASTER_SPEC.md)
- [WORK_QUEUE.md](/E:/CursorData/gamer/WORK_QUEUE.md)
- [CANONICAL_BASELINE.md](/E:/CursorData/gamer/docs/agent/CANONICAL_BASELINE.md)
- [DELTA_MATRIX.md](/E:/CursorData/gamer/docs/agent/DELTA_MATRIX.md)

## Will Modify

- `AGENTS.md`
- `README.md`
- `MASTER_SPEC.md`
- `WORK_QUEUE.md`
- `docs/agent/**`
- `docs/archive/**`

## Will Not Modify

- `client/**`
- `server/**`
- `shared/**`
- `scripts/**`

## Shared Contract Changes

- No

## Acceptance

- Canonical doc set is unambiguous.
- Baseline and delta audit docs exist and match current code truth.
- Archived docs are moved out of the live source set.
- Bootstrap references no longer point at stale paths or stale repo assumptions.

## Status

- Completed on 2026-04-21

## Outcome

- The repo now has one canonical doc set plus a separated archive.
- Future code work can proceed against audited runtime facts instead of mixed historical instructions.
