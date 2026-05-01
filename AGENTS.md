# Gamer Repo Agent Guide

This repository is a `Phaser 3 + Vite + TypeScript + Socket.IO` multiplayer web game.

## First Read

When you enter this repo, read only these files before major work:

1. `E:\CursorData\gamer\docs\agent\NOW.md`
2. `E:\CursorData\gamer\docs\agent\DEMO1_DELIVERY_CONTRACT.md`
3. `E:\CursorData\gamer\GDD_Demo1_v1.3.docx`
4. `E:\CursorData\gamer\docs\archive\GDD_Demo1_v1.3.txt` if the docx is inconvenient to inspect

## Working Mode

- Treat the GDD and the current demo contract as the product source of truth.
- Treat repo docs as fast orientation, not guaranteed live truth.
- Do not jump straight into coding when demo scope, acceptance, or boundaries are unclear.
- Work in demo-sized vertical slices such as `Demo 1`, `Demo 2`, not endless patch streams.
- Prefer autonomous execution: plan, implement, build, run, verify, and summarize in one pass.
- Only stop to ask the user when a decision changes product scope, timeline, or irreversible architecture.

## Architecture Guardrails

- Keep rendering, network state, DOM UI, and persistence concerns separated.
- Do not keep growing `client/src/scenes/GameScene.ts` as the default answer.
- Move reusable logic into modules under `client/src/game`, `client/src/ui`, `client/src/network`, or `server/src`.
- Keep server authority over combat, loot, death, extraction, settlement, and state validation.
- Treat browser-visible behavior as the final truth. Docs help, but runtime wins.

## Verification Floor

Before trusting docs in a fresh session, run a minimal reality check:

1. `git status --short`
2. `npm run typecheck`
3. `npm run build` when the current task is broad or runtime-sensitive
4. `npm run validate:carry-loop` whenever the change touches extraction, settlement, stash, or next-run loadout

Before calling a slice done, run the smallest relevant verification loop:

1. `npm run build` or at minimum the affected package build/typecheck
2. Browser/runtime verification for the changed flow
3. Multiplayer or multi-tab verification if the feature touches rooms, sync, combat, settlement, or inventory persistence
4. `npm run validate:carry-loop` whenever the change touches extraction, settlement, stash, or next-run loadout

## Handoff

- Update `docs/agent/NOW.md` only when project truth or the active target actually changes.
- Update `docs/agent/DEMO1_DELIVERY_CONTRACT.md` only when scope or acceptance changes.
