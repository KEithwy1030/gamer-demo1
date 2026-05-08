# Game Feel Overhaul Plan 2026-05-08

## Why This Is A Separate Doc

The existing `GOAL_PLAN_2026-05-08.md` is a tactical repair list. It is useful for narrow bugfix work, but it is the wrong container for the current problem.

The current problem is not a single bug. It is that the playable build still feels like an early prototype instead of a modern game. That requires a separate execution track with its own acceptance bar, sequencing, and review system.

This document is therefore the plan for a **game-feel and presentation overhaul**, not another pile of local fixes.

## Core Judgment

### What To Prioritize Next

Do **not** spend the next long run trying to close every leftover micro issue from the previous round one by one.

Do this instead:

1. Freeze the lock-assist improvement that already feels better.
2. Treat the current drag anchor fix as sufficient closure for that issue unless a regression appears.
3. Move the main execution focus to a **game-feel vertical slice**.

Reason:

- The user's strongest dissatisfaction is no longer basic functionality.
- The biggest release blocker is that combat, monsters, HUD, and environment still do not look or feel like a contemporary game.
- Continuing to patch isolated issues without a visual and feedback baseline will keep producing inconsistent results.

## What "Better Game Feel" Means In This Project

This project is a 2.5D top-down extraction game.

It must **not** read as:

- pixel art
- flat paper cutouts
- placeholder HUD
- prototype-only combat feedback

It should move toward this presentation standard:

- readable 2.5D slash oblique character and monster presentation
- combat hits that feel visible and satisfying
- stronger depth, shadow, facing, and environmental layering
- HUD that feels intentional, stable, and game-native rather than page-native
- no obvious size mismatches, clipping, overflow, or fake debug elements during core play

Reference direction for feel, not for direct copying: games like `Alien Shooter` are useful because they show that a top-down / 2.5D view can still feel kinetic, readable, and modern enough through VFX, motion, impact, and presentation discipline.

## Hard Truth About The Current Build

The current build feels old mainly for these reasons:

1. **Monsters are still billboard-like sprites**.
   Their face reads toward the camera too often, so they look like flat paper units instead of creatures occupying space.

2. **Animation is too sparse**.
   Motion often reads as frame swapping rather than weight, direction, anticipation, or recovery.

3. **Combat juice is too weak**.
   Damage numbers, hit spark, blood, impact pause, victim reaction, and screen response are not yet carrying the moment.

4. **HUD quality is below the lobby standard**.
   The lobby can get away with being a structured page. Combat HUD cannot. It needs spacing discipline, hierarchy, anchoring, and zero overflow under stress.

5. **Environment depth is weak**.
   Ground, river, fog, hazard layers, shadows, and occlusion are not yet contributing enough to depth.

6. **The project lacks a proper acceptance loop for feel**.
   The current validation set is useful, but it mostly protects contracts and regressions. It does not yet enforce presentation quality strongly enough.

## Execution Strategy

This overhaul should be run as a staged vertical slice with strict acceptance gates.

### Phase 0 - Freeze And Baseline

Goal:
- freeze the currently accepted lock-assist behavior
- freeze the latest monster size targets unless a dedicated visual review changes them
- capture baseline screenshots and current failure list

Deliverables:
- one baseline evidence set for combat, monster proximity, HUD, backpack, corpse fog, river
- one written issue sheet from that baseline

Acceptance:
- no new mechanic work starts before baseline evidence exists

### Phase 1 - Character And Monster Presentation

Goal:
- stop monsters from reading like front-facing paper sprites
- make units feel grounded in a 2.5D space

Tasks:
1. Define a presentation contract for each unit tier:
   - player
   - normal monster
   - elite monster
   - boss

2. Normalize:
   - visual scale
   - shadow footprint
   - hit footprint marker alignment
   - health bar anchor
   - label anchor

3. Replace or refine monster facing behavior.
   Preferred target:
   - directional presentation with at least coarse facing states

4. If full directional sprite coverage is not available yet:
   - use a staged fallback that reduces the billboard effect
   - but do not pretend a flat front-face sprite is acceptable final output

Important judgment:

This is not a place for fake code-only tricks. If the source asset does not support believable facing, then the plan must explicitly include asset replacement or directional variants. Otherwise the result will stay cheap no matter how many code patches are applied.

Acceptance:
- monsters no longer read as permanently facing the camera
- ordinary proximity screenshots no longer look like a face pasted on a cardboard sheet
- size and anchor elements remain consistent across all tiers

### Phase 2 - Combat Feedback And Readability

Goal:
- make hits feel satisfying and legible without clutter

Tasks:
1. Rebuild damage number presentation:
   - larger scale
   - stronger outline
   - cleaner color language
   - separate treatment for player hit, monster hit, bleed, hazard

2. Remove remaining prototype-looking attack guide lines.

3. Add or strengthen:
   - hit spark
   - blood or impact burst
   - victim flash
   - small recoil / reaction where appropriate
   - short impact emphasis without harming control feel

4. Keep the improved lock-assist feel stable.
   Do not rewrite targeting again unless a proven regression appears.

Acceptance:
- every damage event produces obvious readable feedback
- player can tell hit, miss, hazard, and sustained damage apart quickly
- combat moment feels stronger without debug-like noise

### Phase 3 - Combat HUD Overhaul

Goal:
- bring combat HUD up to a productized standard

Tasks:
1. Audit every combat HUD element for:
   - anchoring
   - spacing
   - typography hierarchy
   - overflow behavior
   - mobile/desktop resilience

2. Rework layout zones:
   - objective/info
   - command area
   - skill area
   - health/status area
   - combat feedback overlay

3. Remove any remaining page-like or placeholder feel.

4. Define HUD density rules so later changes do not collapse spacing.

Acceptance:
- no text clipping
- no panel overlap
- no misaligned anchors under scaled viewports
- combat HUD reads as a game HUD, not a debug overlay or admin page fragment

### Phase 4 - Environment Depth And Mood

Goal:
- make the world read as layered space, not a painted floor with sprites on top

Tasks:
1. Improve river rendering from placeholder strokes to actual hazard surface language.
2. Improve corpse fog into a layered atmospheric effect.
3. Increase ground-depth cues through shadow, stain, debris, edge softness, and tonal separation.
4. Add or refine foreground/background treatment where the camera allows it.

Acceptance:
- river is no longer a placeholder
- fog is no longer a flat mask
- combat screenshots show stronger environmental depth even when static

### Phase 5 - Asset Pipeline Upgrade

Goal:
- stop relying on ad hoc one-off asset drops for core gameplay presentation

Tasks:
1. Define asset classes:
   - unit directional sheets
   - hit FX sheets
   - environment overlays
   - HUD textures
   - ground decals

2. Define minimum quality bar for generated assets before integration.
3. Record generation and selection rules so future workers do not reintroduce low-grade assets.

Acceptance:
- assets entering gameplay are screened against a shared quality bar
- low-resolution, visibly blocky, or flat-facing core assets do not silently enter the main loop

## Acceptance System

This project now needs a **two-layer acceptance system**.

### Layer A - Automatic Gates

These are not enough by themselves, but they must become stricter.

Keep and extend the existing validation scripts:

- `npm run build`
- `npm run validate:lock-assist`
- `npm run validate:monster-assets`
- `npm run validate:combat-readability`
- `npm run validate:inventory-drag-contract`
- `npm run validate:profile-drag-contract`
- `npm run validate:inventory-drag-ui`
- `npm run validate:hud-ui`
- `npm run validate:visual-clarity`
- `npm run validate:map-hazards`

Add new validation focus where needed:

1. `monster-presentation` checks
   - per-tier visual scale contract
   - anchor consistency
   - directional asset presence or explicit fallback contract

2. `combat-feedback` checks
   - all damage sources emit visible feedback events
   - no deprecated attack-line visual remains

3. `hud-layout` checks
   - no overflow
   - no text clipping
   - no illegal overlap in key viewport sizes

4. `asset-quality` checks
   - minimum resolution and intended sheet structure for key sprites

### Layer B - Review Gates

This is the part the project is currently missing.

For every major presentation task, require a review bundle:

- desktop screenshots
- one close combat screenshot
- one medium scene screenshot
- one HUD stress screenshot
- one monster/player adjacency screenshot
- short reviewer note: pass / fail / why

This should be produced by the agent system before claiming completion.

## Should This Use Codex Hooks?

### Judgment

Relying on Codex CLI hooks alone is **not** the right primary solution.

Reason:

- hooks are useful as trigger points
- but they are not the real quality system
- the real need is repo-local, portable, explicit acceptance logic that any agent can run

### Better Approach

Implement the acceptance system inside the repo, then optionally trigger it via hooks.

Recommended structure:

1. Add one repo-level acceptance entrypoint, for example:
   - `npm run accept:game-feel`

2. That entrypoint should chain:
   - build
   - targeted validation scripts
   - Playwright screenshot capture on a fixed local acceptance environment
   - screenshot audits / structural checks
   - artifact output into a clean evidence directory

3. If Codex hooks are later configured, they should call this repo-level acceptance command.

This is better because:

- it is explicit
- it is versioned with the repo
- it works across sessions and agents
- it survives context compression
- it does not depend on one tool runtime's private behavior

## Worker Model For Long-Run Execution

The main session should stay in the reviewer/controller role.

Recommended split:

- GPT-5.4 workers: implementation and bounded asset/presentation tasks
- GPT-5.5: verification, acceptance review, and final judgment on whether a stage is actually good enough

But this must be paired with evidence. A verifier cannot simply trust worker prose.

## Required Evidence For Every Stage

Every major stage must produce:

1. Changed files
2. Validation commands run
3. Pass/fail result
4. Screenshot evidence directory
5. Browser/dev-server/process cleanup report
6. Manual-review-needed items, if any

## Immediate Next Goal Recommendation

The next long-run `/goal` should target this exact slice:

1. Monster presentation baseline
2. Damage-number and impact-feedback overhaul
3. Combat HUD stabilization
4. Screenshot-based acceptance loop

This is the highest-leverage package because it addresses the main complaint directly:

the game does not yet feel like a modern game during actual play.

## Next Task Package Breakdown

The next execution should be split into bounded packages. Each package must have its own implementation worker and a separate verification pass.

### Package A - Baseline And Acceptance Harness

Owner:
- controller/main session or a dedicated verifier

Scope:
- capture current screenshots for combat HUD, player/monster adjacency, damage feedback, corpse fog, river, backpack
- add or prepare `accept:game-feel` as a repo-level acceptance command if feasible
- document the evidence directory and cleanup state

Exit criteria:
- baseline evidence exists before visual work claims success
- next workers can compare against the same screenshot targets

### Package B - Monster 2.5D Presentation

Owner:
- GPT-5.4 implementation worker

Scope:
- inspect current monster assets and animation state machine
- reduce billboard/front-face feeling
- add directional or pseudo-directional presentation only if the asset supports it
- keep tier scale, shadow, ring, health bar, and label aligned

Exit criteria:
- ordinary monster no longer reads as permanently staring at the camera
- player/monster adjacency screenshot passes reviewer judgment
- `validate:monster-assets` and `validate:combat-readability` pass

### Package C - Damage Numbers And Impact Feedback

Owner:
- GPT-5.4 implementation worker

Scope:
- make damage numbers large and readable
- unify player-hit, monster-hit, bleed, poison/fog, river/hazard feedback
- remove remaining debug-like attack lines
- add hit spark, blood/impact burst, victim flash, and small recoil where safe

Exit criteria:
- every damage source has visible feedback from the damaged body
- hit feedback is obvious in screenshot and short play capture
- lock-assist behavior remains unchanged unless a regression is proven

### Package D - Combat HUD Productization

Owner:
- GPT-5.4 implementation worker

Scope:
- audit HUD anchoring, overflow, typography, and scaled viewport behavior
- rework combat HUD zones into a game-native layout
- prevent clipping and overlap across desktop and mobile-relevant sizes

Exit criteria:
- `validate:hud-ui` passes
- screenshot review shows no compressed text, overlap, or page-like placeholder presentation

### Package E - Environment Depth Pass

Owner:
- GPT-5.4 implementation worker

Scope:
- improve river from placeholder strokes to poisonous water body language
- improve corpse fog from flat mask to layered atmospheric hazard
- add shadow, stain, debris, edge softness, and tonal separation where practical

Exit criteria:
- `validate:visual-clarity` and `validate:map-hazards` pass
- scene screenshot shows stronger depth without confusing gameplay readability

### Package F - Final Review And Cleanup

Owner:
- main session / GPT-5.5 verifier when budget allows

Scope:
- rerun automatic gates
- inspect screenshot evidence rather than trusting worker reports
- verify browser, server, launcher, and MCP/process cleanup
- write pass/fail notes and remaining manual checks

Exit criteria:
- all required evidence is attached to the final delivery report
- no hidden dev server, browser, or MCP residue remains from the task

## Subagent And MCP Policy For This Goal

Default worker route:
- use GPT-5.4 for implementation packages

Default verifier route:
- use the main session for browser-based acceptance when subagent MCP startup is unstable
- use GPT-5.5 verification only where the budget and toolchain allow it

MCP rule:
- implementation workers should not use MCP unless their task explicitly requires it
- browser acceptance should prefer repo scripts or main-session Playwright, not worker-launched MCP
- any worker that uses browser or MCP must report tool use, ports, PIDs, artifact path, and cleanup status

Reason:
- presentation work benefits from subagent parallelism, but stale MCP startup or blocked browser authorization can waste more time than it saves
- acceptance quality depends on evidence, not on which agent produced it

## Non-Goals For The Next Long Run

To keep the next goal from dissolving into noise, do not mix in:

- unrelated backend mechanic rewrites
- room/lobby feature expansion
- market/stash feature expansion unrelated to game-feel
- full map editor migration
- total art-pipeline reinvention in one pass

Those can come later. The next goal must first make combat and on-screen presentation feel materially better.

## Final Decision

Use a **separate document** for this work.

Do not fold it back into the old tactical goal plan.

The old plan can remain as repair history. This document should become the source of truth for the next long-run game-feel execution phase.
