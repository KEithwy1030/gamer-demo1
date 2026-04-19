# Agent Bootstrap

This repository uses repo-native project memory under `docs/agent/`.

For any new session or agent, read in this order:

1. `docs/agent/STATUS.json`
2. `docs/agent/PROJECT_STATE.md`
3. `docs/agent/OPEN_LOOPS.md`
4. `docs/agent/DECISIONS.md`
5. `docs/agent/WORKLOG.md`

## Memory Rules

- Treat `docs/agent/` as the canonical cross-session memory.
- Update `PROJECT_STATE.md` when current truth changes.
- Update `OPEN_LOOPS.md` when work is opened, reframed, blocked, or closed.
- Update `DECISIONS.md` only for durable decisions.
- Append one concise entry to `WORKLOG.md` before ending substantial work.
- Refresh `STATUS.json` whenever priorities or active phase change.

## Current Repo Notes

- The root execution plan is [EXECUTION_PLAN.md](/E:/CursorData/gamer/EXECUTION_PLAN.md).
- The design source is [GDD_Demo1_v1.3.docx](/E:/CursorData/gamer/GDD_Demo1_v1.3.docx).
- This repo is currently managed as a local workspace and is not a git repository.
