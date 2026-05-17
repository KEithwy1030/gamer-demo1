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
| Browser create/join room | `client/src/ui/lobbyView.ts`, `client/src/network/createLobbyController.ts`, `server/src/room-store.ts`, `validate:multiclient-room-contract`, `validate:dev-cors-contract` | Covered by contract; test-hook CORS regression is now guarded; browser feel still manual |
| Multiple players in one map | `validate:multiclient-room-contract` verifies two socket clients receive `match:started` and bootstrap streams | Covered structurally |
| Server-authoritative state | `server/src/room-store.ts`, `server/src/combat/combat-service.ts`, `server/src/inventory/service.ts`, `server/src/extract/service.ts` | Covered structurally; anti-cheat hardening is out of Demo 1 |
| Room capacity 6, 2 squads x 3 | `shared/src/data/constants.ts`, `validate:room-loadout-contract`, `validate:multiclient-room-contract` | Covered |
| Bot substitutes enemy players only | `server/src/room-store.ts`, `server/src/bots/bot-manager.ts`, `validate:room-loadout-contract`, `validate:pressure-ai-contract` | Covered for Demo 1 contract |
| Map 4800 x 4800 and center extract | `shared/src/data/constants.ts`, `server/src/match-layout.ts`, `validate:map-hazards` | Covered structurally |
| Corpse-fog 0-8 / 8-12 / 12-15 pressure | `shared/src/domain/extractionPressure.ts`, `server/src/corpse-fog.ts`, `client/src/scenes/gameScene/hudOverlay.ts`, `validate:extraction-pressure`, `validate:miasma-pipeline`, `accept:lategame-extract` | Covered by deterministic tests and browser-visible pressure screenshots; live feel manual |
| Fixed extract opens at 8 minutes, 5 second channel | `shared/src/data/constants.ts`, `server/src/extract/service.ts`, `validate:extract-service`, `validate:lategame-smoke` | Covered |
| Search/fight/extract single-run loop | `validate:carry-loop-release`, `validate:lategame-smoke`, `validate:profile-carry` | Covered structurally across three consecutive runs; full long-session feel manual |
| Three weapons and three active skills each | `shared/src/data/weaponSkills.ts`, `server/src/combat/combat-service.ts`, `validate:skill-contract` | Covered by branch contract; animation feel manual |
| Dodge and lock/approach assist | `server/src/combat/combat-service.ts`, `validate:lock-assist`, `validate:skill-contract` | Covered structurally |
| Normal and elite monsters | `server/src/monsters/monster-manager.ts`, `validate:elite-encounter`, `validate:combat-readability` | Covered structurally |
| Equipment, weapons, gold, treasure drops | `shared/src/data/items.ts`, `server/src/loot/loot-manager.ts`, `validate:loot-depth`, `validate:chest-contract` | Covered |
| Backpack grid and equipment slots | `shared/src/domain/inventory.ts`, `client/src/ui/InventoryPanel.ts`, `validate:profile-carry`, `validate:drag-contracts` | Covered, but drag UI is not in release gate due existing dirty harness boundary |
| Death full loss | `server/src/inventory/service.ts`, `server/src/combat/combat-service.ts`, `validate:death-loot-contract`, `validate:results-overlay`, `validate:combat-readability` | Covered structurally for enemy kill, full death drop, and opposing pickup |
| Success/failure settlement UI | `client/src/results/ResultsOverlay.ts`, `validate:results-overlay`, `validate:profile-carry` | Covered structurally |
| Black-market listing and sale flow | `client/src/ui/marketView.ts`, `server/src/market`, `validate:market-lifecycle` | Covered for Demo 1 simulated buyer/system sale |
| Long-term asset accumulation | `client/src/profile/localProfile.ts`, `client/src/ui/lobbyView.ts`, `validate:profile-carry`, `validate:market-lifecycle` | Covered structurally |
| Dark medieval scavenger atmosphere | `client/public/assets/generated/`, `client/src/scenes/gameScene/worldBackdrop.ts`, `validate:visual-clarity`, browser smoke evidence | Partially covered; commercial art pass remains open |
| Release-level verification gate | `package.json` `validate:gdd-demo1-contract` and `validate:release-readiness` | Passed on 2026-05-18 after adding `validate:dev-cors-contract`; includes multiclient, combat, loot, carry, extract, market, pressure, typecheck, build, and late-game smoke |
| Browser visual acceptance | `package.json` `accept:visual-readiness`, `.codex-artifacts/game-feel-baseline/` screenshots | Passed on 2026-05-18; covers boss combat HUD, inventory overlay, and late-game extraction pressure visibility; not a manual fun signoff |
| Manual release-feel protocol | `docs/agent/MANUAL_PLAYTEST_PROTOCOL_2026-05-18.md` | Defines the required 9-12 minute human playtest scorecard, pass/fail rules, and output format; still requires execution |
| Playtest note export | `client/src/results/ResultsOverlay.ts`, `client/src/ui/lobbyView.ts`, `scripts/validate-results-overlay.ts`, `scripts/validate-settlement-details.ts` | Results overlay and lobby recent-run summary both expose a copyable manual playtest note template from settlement data so testers can capture the required evidence quickly |

## Explicitly uncovered or weak areas

- Manual long-session balance: 9-12 minute ideal extraction timing cannot be proven by deterministic tests; `MANUAL_PLAYTEST_PROTOCOL_2026-05-18.md` now defines the required evidence format.
- Real multi-human PvPvE feel: socket contracts prove protocol shape, not player tension or combat readability under human pressure.
- Commercial art polish: the lobby / black-market entry and results overlay now use a generated bitmap backdrop, and a local preview screenshot confirmed the lobby shell renders with the new art, but the rest of the commercial art pass is still incomplete.
- Browser/mobile hands-on comfort: desktop-style lobby and settlement screens still render on a 390px mobile viewport, but they compress to a very small scale; automation can catch layout and console failures, yet a dedicated mobile-responsive pass is still needed for real play comfort.
- Human playtest note capture: the note-copy action now exists in both the results overlay and lobby recent-run summary, but the session itself still needs to be run and rated.
- Player death loot race: deterministic enemy kill, full drop, and opposing pickup is now covered; live multi-human contest tension still needs manual playtest.

## Next implementation target

The highest-value next slice is still manual/playtest-facing: run the focused 9-12 minute extraction session defined in `MANUAL_PLAYTEST_PROTOCOL_2026-05-18.md`, use the new note-copy action in `ResultsOverlay`, and record whether corpse-fog pressure, contested resources, black-market payoff, and death-loss tension feel readable and worth replaying. The new lobby bitmap backdrop improves the first impression, but automation still cannot prove human tension.

## Verification command

Run before the next checkpoint:

```bash
npm run validate:release-readiness
npm run accept:visual-readiness
```

This now expands to the broader GDD Demo 1 contract, including the isolated-port carry loop, and then runs the late-game smoke.

Latest automated evidence captured on 2026-05-18:

- `npm run validate:release-readiness` passed.
- `npm run accept:visual-readiness` passed.
- `validate:dev-cors-contract` now guards the `ENABLE_TEST_HOOKS=1` CORS path used by dev acceptance launchers and late-game smoke.
