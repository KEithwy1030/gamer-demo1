# Project State

## Canonical Source Set

Use these as the live documentation surface, in order:

1. [MASTER_SPEC.md](/E:/CursorData/gamer/MASTER_SPEC.md)
2. [WORK_QUEUE.md](/E:/CursorData/gamer/WORK_QUEUE.md)
3. [docs/agent/STATUS.json](/E:/CursorData/gamer/docs/agent/STATUS.json)
4. [docs/agent/PROJECT_STATE.md](/E:/CursorData/gamer/docs/agent/PROJECT_STATE.md)
5. [docs/agent/OPEN_LOOPS.md](/E:/CursorData/gamer/docs/agent/OPEN_LOOPS.md)
6. [docs/agent/DECISIONS.md](/E:/CursorData/gamer/docs/agent/DECISIONS.md)
7. [docs/agent/CANONICAL_BASELINE.md](/E:/CursorData/gamer/docs/agent/CANONICAL_BASELINE.md)
8. [docs/agent/DELTA_MATRIX.md](/E:/CursorData/gamer/docs/agent/DELTA_MATRIX.md)
9. [docs/agent/WORKLOG.md](/E:/CursorData/gamer/docs/agent/WORKLOG.md)

Historical docs under [docs/archive/](/E:/CursorData/gamer/docs/archive/README.md) and [GDD_Demo1_v1.3.docx](/E:/CursorData/gamer/GDD_Demo1_v1.3.docx) are reference-only.

## Repo Shape

- `client/`: `TypeScript + Phaser 3 + Vite`
- `server/`: `Node.js + Express + Socket.IO`
- `shared/`: shared protocol, types, and gameplay/static data
- `scripts/`: local utility scripts including end-to-end loop validation

The workspace is a git worktree. `.git/` exists at repo root.

## Current Audited Truth

- Root workspace uses npm workspaces for `client`, `server`, and `shared`.
- The browser entry is [client/src/main.ts](/E:/CursorData/gamer/client/src/main.ts), but `client/src/` still contains 24 `.ts` files and 24 same-basename `.js` siblings.
- `main.ts` and many downstream client modules use extensionless imports such as `./app`, `./network`, and `./scenes`.
- Current [client/vite.config.ts](/E:/CursorData/gamer/client/vite.config.ts) does not override extension resolution, so the runtime still risks resolving authored TS entry points into checked-in JS siblings for much of the graph.
- Server runtime imports `shared/dist/**` directly from source files under [server/src/](/E:/CursorData/gamer/server/src/index.ts).
- Client runtime is split:
  - many game/network imports reach into `../../../shared/src/**`
  - some type imports use `@gamer/shared`
- This means client and server do not currently consume the same built shared surface.

## Runtime Defaults

- Client dev server default: `0.0.0.0:5173`
- Server default port: `3000`
- Shared constants currently define:
  - map: `6400 x 6400`
  - room capacity: default `6`, max `6`
  - match duration: `900s`
- Server runtime currently defines:
  - extract open: `180s`
  - extract radius: `96`
  - extract channel: `5000ms`
  - monster counts: `40` normal, `3` elite
  - corpse persistence: `10000ms`
  - respawn delay: `60000ms`
- Shared item/weapons currently define:
  - inventory grid: `10 x 6`
  - health potion heal: `30`
  - base weapon reach: sword `116`, blade `128`, spear `180`

See [docs/agent/CANONICAL_BASELINE.md](/E:/CursorData/gamer/docs/agent/CANONICAL_BASELINE.md) for the detailed audited baseline and evidence pointers.

## Validation State

- `scripts/test-loop.mjs` exists for backend main-loop validation.
- `node scripts/test-loop.mjs` now passes the backend full loop through room creation, join, match start, kill, loot, extract open, extract channel, and settlement.
- Server-side player movement is now applied on the fixed player sync tick using the latest stored input vector, not directly on each move packet.
- A direct `RoomStore` verification script measured equal cumulative travel (`300`) for steady input and noisy multi-update-per-tick input over `20` ticks at `50ms`, which closes the packet-cadence root cause for turn-time acceleration at the authority layer.
- The active frontend inventory path now renders backpack slots from the real `inventory.width x inventory.height` model and places items by `x/y`, instead of hardcoding `16` sequential slots.
- The active Web lobby shell now follows the imported Claude Design hall structure: topbar, left squad panel, center deploy hero, right summary stack, and footer ticker, while only the real room actions remain wired and undeveloped hall modules stay disabled.
- The active Web lobby now also restores key Claude Design identity details instead of only the coarse shell:
  - room-code example/format is `南岭·42`
  - the room-code label is `蜡印编号`
  - the join-code placeholder is `南岭·42`
  - the hall font stack now loads Oswald, JetBrains Mono, Inter Tight, Noto Sans SC, and Noto Serif SC from `client/index.html`
- Both the mock lobby controller and the real server room store now generate place-name plus middot room codes, so the live room flow no longer falls back to random six-character alphanumeric IDs.
- The active frontend inventory path now also uses a shared item presentation layer for names and static icon-plus-badge rendering, so filled slots no longer degrade to a single first-letter placeholder.
- Player-visible item/weapon naming has been tightened across the current front-end presentation helper plus the active `server/src/inventory/catalog.ts` and `shared/src/data/items.ts` / `shared/src/data/weapons.ts` definitions.
- Mobile inventory entry has been moved away from the top-right HUD, and mobile backpack layout now preserves true column count with horizontal scrolling instead of shrinking `10` columns into tiny tap targets.
- Browser-backed Web acceptance has now been revalidated for:
  - lobby load
  - room creation
  - entering an in-match scene from the live lobby
- Manual frontend acceptance still remains incomplete for:
  - settlement overlay visibility in the real browser path
  - return-to-lobby after settlement
  - next-match replay readiness from the same browser session
  - real-device controls and final feel tuning
- Obstacles are still visually informative but not authoritative collision blockers.
- The most important implementation drift today is not feature count. It is source-of-truth drift between:
  - client TS vs checked-in JS siblings
  - client `shared/src` consumption vs server `shared/dist` consumption
- `client/vite.config.ts` now pins resolution order so Vite prefers `.ts/.tsx` over `.js/.jsx`, which reduces but does not fully remove the duplicate-file maintenance risk.

- The active `GameScene` world path once again rebuilds a richer backdrop with center plaza, dirt/path patches, obstacle markers, region labels, extract beacon rings, and world framing instead of only a flat green `ground_pixel` fill.
- `client/src/ui/gameplayTheme.{ts,js}` now exists as the minimum shared in-match UI token/helper entry for Phaser-rendered HUD and minimap surfaces.
- The current Web combat baseline now has weapon-differentiated Q skills:
  - sword: dash-path hit model, mobility-first, no crit identity
  - blade: trigger-time fan sweep plus simultaneous retreat, no crit identity
  - spear: deliberate windup plus guaranteed crit identity

## Current Visual Branch Truth

- The in-game visual/HUD pass has been promoted onto local `master`; `master` is now the active source for this work and is ahead of `origin/master`.
- The active pass deliberately targets only the in-match surface: `GameScene`, Phaser HUD, player/monster/drop markers, minimap theme, pickup feedback, and the in-match inventory panel. Lobby optimization is out of scope for this pass.
- `client/public/assets/wasteland-ground.png` remains checked in from the Image 2 art test, but `GameScene` no longer loads it for the active battlefield floor because it made non-colliding terrain look authoritative.
- The active battlefield floor is back to the procedural `ground_pixel` texture plus muted ambient river/detail layers, so visual terrain no longer claims collision rules that the server does not enforce.
- The active in-match HUD now uses a structured layout: player status card, match-state card, bottom action-order panel, low-HP wash, safer first-state synchronization, and restyled touch controls.
- The in-match opening view no longer shows the central tutorial card or the separate top-center backpack launcher; the battlefield starts unobstructed and the lower-right `包` action remains the backpack entry.
- Browser verification on `2026-04-25` passed for `http://127.0.0.1:5173/`: lobby load, create room, start match, fixed desktop HUD screen-edge pinning, and no mobile action cluster in the wide desktop viewport.
- Verification screenshots live under `artifacts/` in the clean worktree:
  - `visual-hud-pass-gameplay-final.png`
  - `visual-hud-pass-inventory-final.png`
  - `hud-framework-pass-gameplay-desktop.png`
