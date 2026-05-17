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
| Normal and elite monsters | `server/src/monsters/monster-manager.ts`, `server/src/internal-constants.ts`, `validate:monster-tuning-contract`, `validate:elite-encounter`, `validate:combat-readability` | Covered structurally; base GDD speed/range/damage/aggro/leash tuning is now directly locked in the release gate |
| Equipment, weapons, gold, treasure drops | `shared/src/data/items.ts`, `server/src/loot/loot-manager.ts`, `validate:loot-depth`, `validate:chest-contract` | Covered |
| Tactical consumables | `shared/src/data/items.ts`, `server/src/inventory/service.ts`, `client/src/ui/itemPresentation.ts`, `validate:tactical-consumables` | Covered for bandage cleanse, stimulant speed boost, miasma mitigation, distinct bitmap icons, and payoff-surface icon reuse |
| Backpack grid and equipment slots | `shared/src/domain/inventory.ts`, `client/src/ui/InventoryPanel.ts`, `validate:profile-carry`, `validate:drag-contracts` | Covered, but drag UI is not in release gate due existing dirty harness boundary |
| Death full loss | `server/src/inventory/service.ts`, `server/src/combat/combat-service.ts`, `validate:death-loot-contract`, `validate:results-overlay`, `validate:combat-readability` | Covered structurally for enemy kill, full death drop, and opposing pickup |
| Success/failure settlement UI | `client/src/results/ResultsOverlay.ts`, `client/src/results/replayPrompt.ts`, `validate:results-overlay`, `validate:results-replay-prompt`, `validate:profile-carry` | Covered structurally; settlement item cards now reuse bitmap item presentation and the card now renders a next-run prompt for replay intent |
| Black-market listing and sale flow | `client/src/ui/marketView.ts`, `server/src/market`, `validate:market-lifecycle`, `validate:audio-hooks` | Covered for Demo 1 simulated buyer/system sale; listing/sale payoff now has bitmap item thumbnails and a synthesized market cue |
| Long-term asset accumulation | `client/src/profile/localProfile.ts`, `client/src/ui/lobbyView.ts`, `validate:profile-carry`, `validate:market-lifecycle` | Covered structurally |
| Dark medieval scavenger atmosphere | `client/public/assets/generated/`, `client/src/scenes/gameScene/worldBackdrop.ts`, `client/src/audio/gameAudio.ts`, `validate:visual-clarity`, `validate:audio-hooks`, browser smoke evidence | Partially covered; lobby/results backdrop, payoff icons, and synthesized feedback are improved, but final commercial art/audio signoff remains manual |
| Release-level verification gate | `package.json` `validate:gdd-demo1-contract` and `validate:release-readiness` | Passed on 2026-05-18 at `8ad90ed`; includes multiclient, combat, loot, tactical consumables, carry, extract, audio, market, pressure, monster tuning, mobile action controls, typecheck, build, and late-game smoke |
| Browser visual acceptance | `package.json` `accept:visual-readiness`, `.codex-artifacts/game-feel-baseline/` screenshots | Passed on 2026-05-18 at `8ad90ed`; covers boss combat HUD, inventory overlay, and late-game extraction pressure visibility; not a manual fun signoff |
| Mobile action surface | `client/src/input/mobileControls.ts`, `client/src/scenes/gameScene/inputBridge.ts`, `client/src/styles/mobile.css`, `validate:mobile-controls-contract` | Covered structurally for attack, three skills, dodge, pickup, extract, inventory, cooldown display, and dead-state input disablement |
| Manual release-feel protocol | `docs/agent/MANUAL_PLAYTEST_PROTOCOL_2026-05-18.md` | Defines the required 9-12 minute human playtest scorecard, pass/fail rules, and output format; still requires execution |
| Playtest note export | `client/src/results/ResultsOverlay.ts`, `client/src/results/replayPrompt.ts`, `client/src/ui/lobbyView.ts`, `client/vite.config.ts`, `scripts/validate-results-overlay.ts`, `scripts/validate-results-replay-prompt.ts`, `scripts/validate-settlement-details.ts` | Results overlay and lobby recent-run card both expose a structured copyable manual playtest note from settlement data, including build commit, pressure phase, combat contacts, item value, loadout loss, next-run prompt, and timestamp prompts; the lobby also copies a build-stamped blank playtest template before the first run, and both the results card and lobby recent-run card show the build tag directly so testers can capture the required evidence quickly |

## Explicitly uncovered or weak areas

- Manual long-session balance: 9-12 minute ideal extraction timing cannot be proven by deterministic tests; `MANUAL_PLAYTEST_PROTOCOL_2026-05-18.md` now defines the required evidence format.
- Real multi-human PvPvE feel: socket contracts prove protocol shape, not player tension or combat readability under human pressure.
- Commercial art/audio polish: the lobby / black-market entry and results overlay now use a generated bitmap backdrop, tactical consumables have distinct bitmap icons, payoff screens reuse itemPresentation icons, and black-market sale/listing actions play a synthesized market cue. The rest of the commercial art/audio pass is still incomplete.
- Browser/mobile hands-on comfort: the lobby now uses a stacked mobile layout on a 390px viewport, verified by a Chromium screenshot, and the settlement overlay now has dedicated mobile single-column and scroll rules, verified by a synthetic results overlay screenshot; both are guarded by `validate:mobile-shell` inside the Demo 1 gate. Mobile action surface wiring is now guarded by `validate:mobile-controls-contract`, but real thumb comfort still needs human device or touchpad play.
- Human playtest note capture: the note-copy action now exists in both the results overlay and lobby recent-run summary, pre-run lobby use copies a build-stamped blank template, and post-run use pre-fills structured pressure, combat, item-value, loadout-loss, replay-prompt, and timestamp evidence; both surfaces now also show the build tag directly. The session itself still needs to be run and rated.
- Player death loot race: deterministic enemy kill, full drop, and opposing pickup is now covered; live multi-human contest tension still needs manual playtest.

## Next implementation target

The highest-value next slice is still manual/playtest-facing: run the focused 9-12 minute extraction session defined in `MANUAL_PLAYTEST_PROTOCOL_2026-05-18.md`, use the new note-copy action in `ResultsOverlay`, and record whether corpse-fog pressure, contested resources, black-market payoff, and death-loss tension feel readable and worth replaying. The new lobby bitmap backdrop improves the first impression, but automation still cannot prove human tension.

## Verification command

Run before the next checkpoint:

```bash
npm run validate:launch-readiness
```

This combines the structural release gate and browser visual acceptance:

```bash
npm run validate:release-readiness
npm run accept:visual-readiness
```

This now expands to the broader GDD Demo 1 contract, including the isolated-port carry loop, and then runs the late-game smoke.

Latest automated evidence captured on 2026-05-18:

- `npm run validate:launch-readiness` passed at `8ad90ed` and is tagged as `launch-readiness-checkpoint-20260518-g`.
- `npm run validate:release-readiness` passed inside that launch gate after `validate:dev-cors-contract`, `validate:tactical-consumables`, `validate:audio-hooks`, and `validate:mobile-controls-contract` were added to `validate:gdd-demo1-contract`.
- `npm run accept:visual-readiness` passed inside that launch gate.
- `validate:dev-cors-contract` now guards the `ENABLE_TEST_HOOKS=1` CORS path used by dev acceptance launchers and late-game smoke.
- `validate:tactical-consumables` now guards consumable effects, distinct bitmap icons, and reuse of those icons on settlement and black-market payoff surfaces.
- `validate:audio-hooks` now guards combat/extract synthesized cues plus the black-market payoff cue.
- `validate:monster-tuning-contract` now guards normal/elite monster speed, attack range, attack damage, aggro range, and leash range against GDD section 18.3.
- `validate:results-overlay`, `validate:results-replay-prompt`, and `validate:settlement-details` now guard the settlement next-run prompt, copied playtest note replay-intent field, and branch behavior for high-value extraction, late extraction, corpse-fog failure, death loss, and low-information failure.
- `validate:mobile-controls-contract` now guards mobile combat/action button coverage, cooldown display, and dead-state input disabling inside the GDD release gate.
- The latest launch gate also verified the market audio teardown cleanup lineage, expanded monster tuning contract, and settlement replay prompt wiring; post-run checks found no lingering listeners on `3000`, `5173`, `4173`, `8791`, `9323`, `3191`, `3210`, or `3212`.
- Playwright visual spot-check confirmed the lobby recent-run card renders a build tag on `http://127.0.0.1:5173/`.
- The shared lobby/results backdrop asset at `client/public/assets/generated/lobby-black-market-backdrop.png` was replaced with a fuller battlefield/black-market scene; the spot-check screenshot is stored at `.codex-artifacts/lobby-buildtag-backdrop-check.png`.
- `npm run accept:visual-readiness` passed again after the backdrop replacement.
- Playwright DOM spot-check confirmed the pre-run lobby playtest button is enabled and shows `复制测评模板`.
