# Decisions

## 2026-04-19: Demo Acceptance Reframed Around 2D Game Readability

- Decision:
  The demo is no longer considered acceptable just because LAN networking and gameplay systems technically run.
- Why:
  The previous version read like a debug arena, not a game. The user explicitly rejected that quality bar.
- Consequence:
  All future work must prioritize:
  - scene readability
  - recognizable 2D game presentation
  - then full-loop gameplay validation

## 2026-04-19: Keep One Canonical Repo Memory System

- Decision:
  Use `AGENTS.md` plus `docs/agent/` as the canonical cross-session memory system.
- Why:
  This project already spans many sessions, decisions, and implementation phases. Context loss is a real risk.
- Consequence:
  Future agents should update `docs/agent/` instead of relying on ad hoc handover summaries.

## 2026-04-19: LAN Clients Must Resolve Server URL From Hostname By Default

- Decision:
  The client should default its server URL from the current page hostname instead of hardcoding `localhost`.
- Why:
  Remote LAN devices were connecting to their own machine and could not join the room host.
- Consequence:
  LAN playtesting now works without manual environment changes in the common case.

## 2026-04-19: Freeze Frontend Test Baseline During External UI/Animation Work

- Decision:
  If another model is actively optimizing frontend presentation, avoid protocol-breaking or flow-breaking gameplay changes on the active baseline.
- Why:
  Changing gameplay or payload behavior during frontend testing causes wasted effort and false failures.
- Consequence:
  Non-conflicting work is preferred during external frontend polish:
  - docs
  - tests
  - validation tooling
  - carefully isolated internal cleanup

## 2026-04-19: Backend Should Be LAN-Mobile Tolerant By Default

- Decision:
  The backend should accept any origin when `CLIENT_ORIGIN` is unset, explicitly allow Socket.IO `websocket` plus `polling`, and use relaxed ping/connect timeouts suitable for mobile LAN playtesting.
- Why:
  LAN mobile clients do not originate from `localhost`, and browser/network conditions on phones are less stable than desktop localhost testing.
- Consequence:
  Backend connectivity defaults are now safer for real-device LAN sessions without requiring extra environment tuning.

## 2026-04-20: Monster Population Should Be Procedural Per Match, Not Fixed

- Decision:
  Replace the fixed backend monster spawn table with per-match procedural spawn generation, while keeping corpse persistence and spawn-point-based delayed respawn.
- Why:
  The user explicitly asked for more distributed monster placement, half as many elites, visible corpses, and respawns tied back to the same spawn points instead of one-shot fixed placements.
- Consequence:
  Monster population tuning now depends on spawn-generation rules and lifecycle timings rather than a static coordinate list.
