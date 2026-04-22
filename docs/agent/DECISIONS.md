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

## 2026-04-20: Client Bundles Must Prefer TS Sources Over Checked-In JS Siblings

- Decision:
  Configure Vite to resolve `client/src` imports to `.ts/.tsx` before `.js/.jsx`.
- Why:
  The repo contains checked-in compiled JS beside authored TS, and the browser was silently executing stale JS versions. This caused repeated "already fixed" regressions for mobile controls, corpse cleanup, and inventory UI.
- Consequence:
  Client-side fixes should land in the TS source of truth again, while legacy JS copies are only a compatibility path until the duplicates are cleaned up.

## 2026-04-21: Canonical Doc Set Moved To Root Spec/Queue Plus Audited Agent Memory

- Decision:
  Treat `AGENTS.md` + root `MASTER_SPEC.md` + root `WORK_QUEUE.md` + `docs/agent/{STATUS,PROJECT_STATE,OPEN_LOOPS,DECISIONS,WORKLOG,CANONICAL_BASELINE,DELTA_MATRIX}` as the only canonical documentation set.
- Why:
  The repo had accumulated duplicate plans, extracted GDD text, and old prompt/playbook files that drifted away from the actual implementation.
- Consequence:
  Superseded docs live under `docs/archive/` as reference-only material, and future agents should baseline against the audited docs before changing code.

## 2026-04-21: Player Movement Authority Must Be Tick-Based, Not Packet-Based

- Decision:
  Player movement authority now advances on the fixed server player sync tick using each player's latest stored input vector, instead of applying distance directly on every accepted move packet.
- Why:
  The strongest evidence-backed root cause for joystick turn-time acceleration was packet-count-sensitive movement: turning generated more accepted input packets, which previously meant more movement steps per second.
- Consequence:
  Client input cadence can no longer change effective move speed by itself. Future movement tuning should happen through tick rate and move-speed values, not packet throttling heuristics.

## 2026-04-22: Web Is The Primary Acceptance Baseline For Demo 1

- Decision:
  Treat Web as the main acceptance surface for the current demo, while mobile remains an important regression surface rather than the main day-to-day validation baseline.
- Why:
  The user explicitly shifted current testing to Web only, and the project needs a stable, observable surface to close the main gameplay loop before further multi-platform polish.
- Consequence:
  Immediate priorities should center on browser-visible Web loop acceptance, return-to-lobby recovery, and Web gameplay readability before resuming deeper mobile-specific tuning.

## 2026-04-22: Vite Must Prefer Authored TS Over Checked-In JS Siblings

- Decision:
  Pin Vite resolution so `.ts/.tsx` are resolved before `.js/.jsx`.
- Why:
  The repo still carries same-basename TS/JS siblings, and the drift risk remained a documented high-priority failure mode.
- Consequence:
  Authored TS should now win during normal Vite dev/build resolution, but the duplicate JS layer still needs later cleanup or formal artifact governance.
