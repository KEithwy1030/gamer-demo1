# Agent Bootstrap

This repository uses repo-native project memory under `docs/agent/`.

For any new session or agent, read in this order:

1. `MASTER_SPEC.md`
2. `WORK_QUEUE.md`
3. `docs/agent/STATUS.json`
4. `docs/agent/PROJECT_STATE.md`
5. `docs/agent/OPEN_LOOPS.md`
6. `docs/agent/DECISIONS.md`
7. `docs/agent/CANONICAL_BASELINE.md`
8. `docs/agent/DELTA_MATRIX.md`
9. `docs/agent/WORKLOG.md`

## Memory Rules

- Treat `AGENTS.md` + root `MASTER_SPEC.md` + root `WORK_QUEUE.md` + `docs/agent/` as the canonical source set.
- Update `PROJECT_STATE.md` when current truth changes.
- Update `OPEN_LOOPS.md` when work is opened, reframed, blocked, or closed.
- Update `DECISIONS.md` only for durable decisions.
- Append one concise entry to `WORKLOG.md` before ending substantial work.
- Refresh `STATUS.json` whenever priorities or active phase change.

## Current Repo Notes

- Canonical product docs live at [MASTER_SPEC.md](/E:/CursorData/gamer/MASTER_SPEC.md) and [WORK_QUEUE.md](/E:/CursorData/gamer/WORK_QUEUE.md).
- The audited implementation baseline lives at [docs/agent/CANONICAL_BASELINE.md](/E:/CursorData/gamer/docs/agent/CANONICAL_BASELINE.md) and [docs/agent/DELTA_MATRIX.md](/E:/CursorData/gamer/docs/agent/DELTA_MATRIX.md).
- Historical or superseded docs live under [docs/archive/](/E:/CursorData/gamer/docs/archive/README.md) and are reference-only.
- The design source [GDD_Demo1_v1.3.docx](/E:/CursorData/gamer/GDD_Demo1_v1.3.docx) is a historical reference, not the live implementation truth.
- This workspace is a git worktree (`.git/` exists at repo root).
