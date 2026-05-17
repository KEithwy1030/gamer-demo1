# Demo 1 completion audit - 2026-05-18

This audit maps the current objective, `PITCH.md`, and `GDD.md` to concrete implementation and verification evidence. It is not a completion claim. Manual game-feel and long-session balance remain open until a human playtest signs them off.

## Objective restated

Deliver `流荒之路` as a commercial-ready direction, starting with a durable Demo 1 vertical slice:

- 8-15 minute lightweight extraction loop: search, fight, extract, sell.
- Browser multiplayer room flow, not a single-player substitute.
- Server-authoritative PvPvE combat, drops, death, extraction, and settlement.
- Three weapons with distinct combat identities.
- Backpack greed, full-loss death, corpse-fog time pressure, and black-market value loop.
- Demo 1 excludes real-money trading, complex account/matchmaking, crafting, insurance, chat, and full commercial backend.

## Prompt-to-artifact checklist

| Requirement | Evidence | Current status |
|---|---|---|
| Browser create/join room | `client/src/ui/lobbyView.ts`, `client/src/network/createLobbyController.ts`, `server/src/room-store.ts`, `validate:multiclient-room-contract` | Covered by contract; browser feel still manual |
| Multiple players in one map | `validate:multiclient-room-contract` verifies two socket clients receive `match:started` and bootstrap streams | Covered structurally |
| Server-authoritative state | `server/src/room-store.ts`, `server/src/combat/combat-service.ts`, `server/src/inventory/service.ts`, `server/src/extract/service.ts` | Covered structurally; anti-cheat hardening is out of Demo 1 |
| Room capacity 6, 2 squads x 3 | `shared/src/data/constants.ts`, `validate:room-loadout-contract`, `validate:multiclient-room-contract` | Covered |
| Bot substitutes enemy players only | `server/src/room-store.ts`, `server/src/bots/bot-manager.ts`, `validate:room-loadout-contract`, `validate:pressure-ai-contract` | Covered for Demo 1 contract |
| Map 4800 x 4800 and center extract | `shared/src/data/constants.ts`, `server/src/match-layout.ts`, `validate:map-hazards` | Covered structurally |
| Corpse-fog 0-8 / 8-12 / 12-15 pressure | `shared/src/domain/extractionPressure.ts`, `server/src/corpse-fog.ts`, `client/src/scenes/gameScene/hudOverlay.ts`, `validate:extraction-pressure`, `validate:miasma-pipeline` | Covered by deterministic tests; live feel manual |
| Fixed extract opens at 8 minutes, 5 second channel | `shared/src/data/constants.ts`, `server/src/extract/service.ts`, `validate:extract-service`, `validate:lategame-smoke` | Covered |
| Search/fight/extract single-run loop | `validate:carry-loop`, `validate:lategame-smoke`, `validate:profile-carry` | Mostly covered; full long-session feel manual |
| Three weapons and three active skills each | `shared/src/data/weaponSkills.ts`, `server/src/combat/combat-service.ts`, `validate:skill-contract` | Covered by branch contract; animation feel manual |
| Dodge and lock/approach assist | `server/src/combat/combat-service.ts`, `validate:lock-assist`, `validate:skill-contract` | Covered structurally |
| Normal and elite monsters | `server/src/monsters/monster-manager.ts`, `validate:elite-encounter`, `validate:combat-readability` | Covered structurally |
| Equipment, weapons, gold, treasure drops | `shared/src/data/items.ts`, `server/src/loot/loot-manager.ts`, `validate:loot-depth`, `validate:chest-contract` | Covered |
| Backpack grid and equipment slots | `shared/src/domain/inventory.ts`, `client/src/ui/InventoryPanel.ts`, `validate:profile-carry`, `validate:drag-contracts` | Covered, but drag UI is not in release gate due existing dirty harness boundary |
| Death full loss | `server/src/settlement.ts`, `server/src/inventory/service.ts`, `validate:results-overlay`, `validate:combat-readability` | Partially covered by contracts; live player-versus-player death pickup remains weakly verified |
| Success/failure settlement UI | `client/src/results/ResultsOverlay.ts`, `validate:results-overlay`, `validate:profile-carry` | Covered structurally |
| Black-market listing and sale flow | `client/src/ui/marketView.ts`, `server/src/market`, `validate:market-lifecycle` | Covered for Demo 1 simulated buyer/system sale |
| Long-term asset accumulation | `client/src/profile/localProfile.ts`, `client/src/ui/lobbyView.ts`, `validate:profile-carry`, `validate:market-lifecycle` | Covered structurally |
| Dark medieval scavenger atmosphere | `client/public/assets/generated/`, `client/src/scenes/gameScene/worldBackdrop.ts`, `validate:visual-clarity`, browser smoke evidence | Partially covered; commercial art pass remains open |
| Release-level verification gate | `package.json` `validate:gdd-demo1-contract` and `validate:release-readiness` | Added in this slice; must be run before checkpoint |

## Explicitly uncovered or weak areas

- Manual long-session balance: 9-12 minute ideal extraction timing cannot be proven by deterministic tests.
- Real multi-human PvPvE feel: socket contracts prove protocol shape, not player tension or combat readability under human pressure.
- Commercial art polish: generated assets and visual clarity tests exist, but the game is not yet at final store-ready art direction.
- Browser/mobile hands-on comfort: automation can catch layout and console failures, but not actual play feel.
- Player death loot race: full-loss mechanics are present, but live PvP death-to-pickup contest needs a stronger targeted smoke or manual pass.

## Next implementation target

The highest-value next slice is to close the weak PvP death-loot evidence gap: create a deterministic two-client or server contract where one player dies with backpack/equipment, all carried items drop, and another opposing player can pick at least one dropped item. This directly supports the `死亡 x 全失` and PvPvE threat pillars.

## Verification command

Run before the next checkpoint:

```bash
npm run validate:release-readiness
```

This now expands to the broader GDD Demo 1 contract and then runs the late-game smoke.
