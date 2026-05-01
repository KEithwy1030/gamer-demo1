# NOW

## Current Intent

Keep this repo on a low-doc, high-execution workflow where an autonomous agent can deliver complete demo slices without falling back into patch-by-patch conversation.

## Current Stack

- Client: `Phaser 3.90.0 + Vite + TypeScript`
- Server: `Node.js + Socket.IO`
- Shared contract: `shared/`
- Main risk area: `client/src/scenes/GameScene.ts` is already large and should stop absorbing unrelated systems.

## Source Of Truth

- Product spec: `E:\CursorData\gamer\GDD_Demo1_v1.3.docx`
- Fallback text export: `E:\CursorData\gamer\docs\archive\GDD_Demo1_v1.3.txt`
- Current demo boundary: `E:\CursorData\gamer\docs\agent\DEMO1_DELIVERY_CONTRACT.md`

## Active Workflow Rule

For any non-trivial game work:

1. Restate the current demo target and explicit non-goals.
2. Define acceptance that can be observed in browser/runtime.
3. Implement one coherent slice.
4. Build and run verification.
5. Update this file if project truth changed.

## Current Demo Judgment

The next correct development target is not "more random features". It is a full `Demo 1` delivery for a browser-first extraction prototype with a real multi-run carry loop:

- enter a match
- loot and survive
- extract
- bring items back
- organize stash and loadout
- launch again with carried gear

Current networking is "good enough for testing" and should be kept as-is unless it directly blocks this loop.
Anything outside that chain is secondary until the loop is solid across two or three consecutive runs.
