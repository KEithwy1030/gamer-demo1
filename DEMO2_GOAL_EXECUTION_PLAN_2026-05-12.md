# Demo2 Goal Execution Plan 2026-05-12

This document is the physical handoff for the next long-running `/goal` session.
It exists so a new agent can continue after context compaction without drifting
back into Demo1 validation or small polish tasks.

## Target

Deliver `Demo2: multi-device hardcore extraction vertical slice`.

The goal is not to prove that Demo1 can run. Demo1 is treated as the sealed
baseline at commit `87db588`. Demo2 must make the game feel like a real
hardcore extraction game by combining:

- desktop Web and mobile browser play in the same room
- a larger and more tactical map
- chest/resource looting as the main reward driver
- harder PvE/Bot pressure around resources and extraction
- first-pass audio, atmosphere, and readable skill/combat feedback

## Current Baseline

- Branch: `master`
- Baseline commit: `87db588 Guide post-extract stash flow into market lifecycle`
- Working tree before writing this plan: clean and aligned with `origin/master`
- Demo1 status: main loop is considered complete and sealed locally
- Known recent validation: build and existing validation scripts passed before
  Demo1 closure
- Known visible risks from final browser pass:
  - green hazard/fog overlay can visually dominate the scene
  - hit feedback is not always obvious in real browser observation
  - favicon/meta warnings are low priority

## Product Judgment

The next phase must not be a short polish run.

The main weakness is now structural: the game can run, but the map, looting,
mobile control, pressure model, and atmosphere do not yet carry the extraction
fantasy. A narrow "make combat nicer" sprint would improve presentation but
would not solve the player's core question: why search, where to go, what risk
to take, and when to extract.

## In Scope

### P0-A Mobile As First-Class Input

Deliver a complete mobile browser control layer:

- virtual joystick tuned for thumb movement
- attack, skill, dash, pickup/interact, inventory, and extract controls
- mobile HUD layout that is not just a scaled desktop HUD
- safe-area handling for modern phone browsers
- portrait and landscape decision documented; if both are too costly, support
  landscape first and mark portrait as manual/future validation
- mobile and desktop clients can join the same room and interact in one match

### P0-B Map V2 Gameplay Layout

Replace the current flat-feeling battlefield with a gameplay map:

- larger practical play space
- obstacles, ruins, chokepoints, bridges or crossings, and route choices
- clear spawn, starter loot, contested loot, hazard, and extract zones
- high-value areas that naturally create PvE/Bot/player conflict
- either complete the Tiled import path or explicitly choose a runtime layout
  generator for this phase; do not leave the map editor as unused paperwork

### P0-C Chest And Resource Looting

Make chest/resource looting a first-class loop:

- starter chests near spawn routes
- contested chests in higher-risk center or route chokepoints
- chest state: unopened, opening/channeling, opened, emptied
- opening can be interrupted by moving away, damage, death, or match end
- chest loot can include equipment, gold, treasure, and utility items if
  already supported by inventory contracts
- Bot and monster pressure should care about resource areas

### P0-D Hard-Core Pressure Model

Tune difficulty around decisions, not raw health inflation:

- monsters guard or drift near meaningful zones
- elites protect contested rewards and punish greedy routes
- Bot behavior prioritizes nearby loot, survival, opportunistic combat, and
  extraction instead of idle filler behavior
- keep server authority for combat, death, loot, and extraction
- difficulty must make retreat and path choice matter

### P0-E Atmosphere And Feedback Foundation

Add the first usable atmosphere layer:

- basic audio system and sound toggles/mute handling
- sounds for attack, hit, hurt, death, pickup, chest open, extract, warning, and
  ambient hazard/fog/river where practical
- restrained skill VFX that improves readability without turning the game into
  a screen-clearing mowing game
- improve hit feedback and hazard visibility enough that human reviewers can
  see what happened without reading debug text

### P0-F Acceptance And Evidence Loop

The goal must produce evidence, not just code:

- desktop browser screenshots
- mobile viewport/browser screenshots
- at least one multiplayer/local two-client or desktop+mobile-equivalent run
- visible chest interaction evidence
- visible contested/high-value area evidence
- visible extraction after looting evidence
- process/port/browser cleanup report

## Out Of Scope

- real-money market or payment integration
- full matchmaking
- full account system
- full 2.5D asset replacement for every unit
- a complete commercial map editor product
- complex item build theorycrafting
- full native mobile app
- changing Demo1 baseline commitments unless a blocker requires it

## Main Pitfalls

### 1. Scope Explosion

This plan touches mobile, map, loot, AI, audio, and VFX. The risk is that every
worker expands their own area into a separate product.

Control rule:
- keep P0 focused on one playable vertical slice
- add no optional system unless it directly supports mobile play, map routes,
  chest looting, pressure, or atmosphere
- defer nice-to-have UI, extra content, and deep balance to P1

### 2. Map Pipeline Drift

The repo already has `docs/map-pipeline-tiled.md` and
`client/public/assets/maps/match-layout-minimal.tmj`, but current runtime truth
is still server layout generation. A worker may spend too long perfecting Tiled
instead of delivering a better playable map.

Control rule:
- first decide one delivery path:
  - Tiled import if it can be completed quickly and safely
  - otherwise runtime map v2 with a Tiled-compatible schema documented
- if Tiled import blocks for more than one bounded attempt, use runtime map v2
  and mark "full Tiled authoring" as a future/manual toolchain task

### 3. Mobile Browser Reality

Desktop emulation is useful but incomplete. Real phones can differ on touch
events, browser UI bars, safe areas, refresh rate, and audio autoplay.

Control rule:
- automate viewport checks in Playwright
- implement conservative touch handling and safe-area layout
- mark real-device touch feel as manual validation
- do not block the goal waiting for a human phone test; continue with emulated
  mobile evidence and a clear manual checklist

### 4. Multiplayer Validation Cost

True desktop plus real phone testing is partly manual. Automated two-client
testing can cover room/join/sync but not human feel.

Control rule:
- build a local two-client browser acceptance path
- validate same room, two player identities, movement sync, combat/loot
  visibility where possible
- mark real cross-device LAN/Wi-Fi test as manual validation if the automation
  environment cannot represent it

### 5. AI And Difficulty Can Break The Loop

Harder monsters and smarter Bots can make extraction impossible or produce
unfair deaths if tuned before movement, map routes, and feedback are readable.

Control rule:
- tune pressure in stages:
  1. map/resource placement
  2. monster/Bot interest in resources
  3. damage, speed, and aggression
- keep env overrides or dev presets for acceptance
- preserve a playable path to extract even under pressure

### 6. Audio Can Become A Browser Trap

Browser audio requires user gesture unlock and can fail differently on mobile.

Control rule:
- add an audio manager with mute and lazy unlock after first user input
- if autoplay restrictions block ambient audio in automation, mark as manual
  validation rather than stalling
- never make audio required for gameplay correctness

### 7. Visual Effects Can Fight The Hard-Core Tone

Skill VFX can easily push the game toward arcade/grass-cutting instead of
hardcore extraction.

Control rule:
- VFX must communicate hit, danger, range, and state
- no oversized full-screen effects for normal skills
- prioritize telegraph clarity and impact feedback over spectacle

### 8. Existing Good Work Can Be Regressed

Lock assist, stash/market flow, profile carry, inventory drag, and extract
service are already protected by validation. Wide changes can accidentally
break them.

Control rule:
- run existing validation gates after each major slice
- do not rewrite lock assist or market/stash flows unless directly required
- prefer additive contracts and small server-authoritative extensions

### 9. Context Compaction Drift

The task is large enough to trigger context compaction. The main risk is that a
later agent forgets the target and starts chasing local bugs or Demo1 harnesses.

Control rule:
- this file is the source of truth for the next goal
- each committed slice must update the commit message with:
  - scope delivered
  - validation run
  - manual validation left
  - browser/MCP/server cleanup state
- if a new handoff is needed, create a short dated handoff file and commit it
  only if it is intended to be durable

## Autonomy Rules During Goal Execution

The goal should continue autonomously after approval.

Do not stop for:

- implementation strategy choices
- library or file organization choices
- reasonable tuning changes
- replacing a failing approach with a smaller working approach
- marking real-device feel or cross-device testing as manual validation

Stop or explicitly report only for:

- irreversible operations
- product direction choices outside this plan
- more than 30 minutes blocked on the same step
- the same code/function failing after three meaningful repair attempts
- a required external service/tool that cannot be substituted

## Manual Validation Items

These are expected and should not block autonomous delivery:

- real phone touch feel with thumbs
- real phone browser safe-area and address-bar behavior
- real PC plus phone on the same network, if automation cannot fully represent it
- audio loudness and atmosphere taste
- final difficulty fairness and "hardcore but not unfair" judgment
- whether map routes feel interesting after repeated human play
- whether VFX feel satisfying without becoming noisy

For each manual item, final reporting must include:

- test steps
- expected result
- visible failure symptoms
- any automation evidence already collected

## Worker Split

Main session role:
- coordinator, reviewer, integration owner, and final judge
- do not become the default implementation worker
- assign bounded write scopes to workers
- merge only after validation evidence

Recommended workers:

- Worker A, Mobile Controls and HUD
  - owns mobile input, touch UI, mobile layout, viewport validation
- Worker B, Map V2
  - owns map layout path, obstacles, zones, crossings, visual route clarity
- Worker C, Chest Looting
  - owns chest state, loot generation, interaction, inventory integration
- Worker D, Pressure AI
  - owns monster/Bot behavior around resources, difficulty tuning, dev presets
- Worker E, Audio and Feedback
  - owns audio manager, sound hooks, restrained skill/hit feedback
- Verifier
  - owns build, validation matrix, browser evidence, cleanup audit

Workers are not alone in the codebase. They must not revert edits made by
others, must keep write scopes narrow, and must report changed files.

## Suggested Implementation Order

1. Baseline and acceptance harness
   - capture current desktop/mobile evidence
   - define new validation scripts needed for Demo2
   - decide acceptance ports/artifact directory conventions

2. Map V2 foundation
   - choose Tiled import or runtime layout v2
   - implement larger route-based map
   - add obstacles/crossings/zones without breaking extraction

3. Chest looting loop
   - implement chest state and loot interaction
   - connect chest zones to map v2
   - validate loot enters inventory/pending return correctly

4. Mobile controls and HUD
   - make the new loop playable on mobile browser viewport
   - ensure all core actions are reachable by touch

5. Pressure AI and difficulty
   - make monsters/Bots care about resources and extraction
   - tune around routes and reward areas

6. Audio, feedback, and atmosphere
   - add sound and visible feedback after mechanics are stable
   - improve hazard/fog readability and skill feedback

7. Final multi-device acceptance
   - run automated validations
   - run desktop and mobile browser checks
   - run two-client same-room check
   - produce final manual validation checklist
   - cleanup all servers, browsers, MCP launchers, and temporary processes

## Required Validation Gates

Always run after relevant slices:

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
- `npm run validate:extract-service`
- `npm run validate:profile-carry`
- `npm run validate:market-lifecycle`

Add or update scripts as needed for:

- mobile control contract
- chest interaction contract
- map v2 layout contract
- two-client room sync smoke test
- audio hook smoke test if feasible without depending on playback

## Browser And Process Hygiene

Any browser, MCP, dev server, or launcher started during the goal must be closed
before final reporting or before handing off.

Every final or handoff report must include:

- browser/MCP tools used
- ports and PIDs started
- artifact/evidence directories
- cleanup result
- remaining process risks, if any

Do not kill unrelated global Node/Chrome processes. Only clean processes started
by the current agent or clearly identified task launchers.

## Commit Discipline

Follow project discipline: small, verified, pushed commits.

Because the worktree may contain unrelated user changes in future sessions:

- inspect `git status` before every commit
- stage only intended files
- do not blindly include `.codex-artifacts`, screenshots, or local logs unless
  the artifact is intentionally durable
- do not modify `AGENTS.md` without explicit user approval

Suggested commit sequence:

1. `Plan Demo2 multi-device extraction vertical slice`
2. `Add Demo2 acceptance harness`
3. `Add map v2 route and resource layout`
4. `Implement chest looting loop`
5. `Upgrade mobile controls and HUD`
6. `Tune resource-driven AI pressure`
7. `Add audio and atmosphere feedback`
8. `Validate Demo2 vertical slice`

Commit messages must mention validations and manual checks left.

## Definition Of Done

Demo2 is done when:

- desktop and mobile browser flows are both usable
- two clients can join the same room in local validation
- a player can loot a chest/resource, fight or avoid pressure, extract, and see
  loot carried into post-run flow
- the map has real route/obstacle/resource structure
- high-value resources create risk
- audio and feedback provide a basic atmosphere layer
- all required automatic gates pass or failures are explicitly classified
- manual validation items are listed instead of hidden
- all task-started processes are cleaned up

## Start Condition For Goal Mode

The next `/goal` can start after this plan is committed and pushed.

The opening instruction for the goal should be:

> Execute `DEMO2_GOAL_EXECUTION_PLAN_2026-05-12.md` as the source of truth.
> Main session is coordinator/reviewer, not default implementer. Use subagents
> for bounded implementation slices, commit and push verified steps, preserve
> Demo1 baseline, and report manual validation items instead of stopping on
> real-device feel checks.

