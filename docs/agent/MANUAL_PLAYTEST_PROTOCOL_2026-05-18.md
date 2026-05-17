# Manual Playtest Protocol - Demo 1 Release Feel

This protocol covers the remaining Demo 1 gap that deterministic validation cannot prove: whether one real 9-12 minute run feels tense, readable, and worth replaying.

## Objective

Run one focused browser playtest and record whether the current Demo 1 loop delivers:

- Search -> fight -> extract -> sell as a coherent loop.
- Meaningful greed decisions under backpack and corpse-fog pressure.
- Readable combat differences across weapon skills and status effects.
- Death-loss tension that feels harsh but understandable.
- Black-market payoff that makes the next run feel motivated.

## Setup

- Branch: `feat-frontend-optimization`.
- Start server: `npm run dev:server`.
- Start client: `npm run dev:client`.
- URL: `http://localhost:5173/`.
- Recommended run: one 9-12 minute human-controlled session using the normal room flow.
- Optional stronger run: two browser clients in the same room, one active player and one observer or second player.

Before starting, confirm:

- Lobby create/join is usable.
- Inventory, equipment, stash, and market panels open without console errors.
- Audio is not muted if audio feedback is part of the pass.

## Required Notes

Record these timestamps and observations:

| Time | Required observation |
|---|---|
| 0:00-2:00 | First search target, first combat, first item pickup. |
| 2:00-5:00 | Whether backpack pressure or equipment choices appear. |
| 5:00-8:00 | Whether contested resources or enemy pressure pull the player toward risk. |
| 8:00-12:00 | Whether corpse-fog and extraction pressure create urgency without hiding critical UI. |
| End | Settlement clarity, stash/market follow-through, desire to replay. |

## Scorecard

Use 1-5 scores. A release candidate needs no score below 3 and at least four scores at 4 or above.

| Axis | Score | Notes |
|---|---:|---|
| Loop clarity |  | Did the player understand what to do next without external instruction? |
| Combat feel |  | Did hits, skills, dodge, lock assist, and status effects feel readable? |
| Greed pressure |  | Did the player hesitate over loot, bag space, or staying longer? |
| Extraction pressure |  | Did the 8+ minute phase feel tense rather than noisy or unfair? |
| Death-loss tension |  | Did death feel consequential and understandable? |
| Market payoff |  | Did selling/listing loot make the next run feel valuable? |
| Visual readability |  | Were HUD, fog, loot, enemies, and extract prompts readable under pressure? |
| Replay intent |  | Would the player immediately try one more run? |

## Pass Conditions

The session can be counted as a manual release-feel pass only if:

- The player completes or clearly fails one full run through understandable in-game causes.
- The player reaches the extract phase or dies trying to greed before extraction.
- The settlement screen is reached, or the failure reason is clearly visible.
- At least one meaningful inventory or loot decision is recorded.
- At least one combat encounter uses an active skill or dodge decision.
- The tester can name one thing they would do differently next run.

## Fail Conditions

Treat the session as failed if any occur:

- The player cannot infer the core loop from the UI.
- Corpse-fog or HUD effects make extraction unreadable.
- Combat feedback does not explain why damage, slow, bleed, or death happened.
- Death or extraction failure feels like a bug rather than a risk decision.
- Market/stash follow-through does not make the recovered loot feel persistent.
- The session requires restarting due to crash, stuck state, or severe console errors.

## Output Format

Write the result as a dated note under `docs/agent/` or in the checkpoint tag message:

```text
Manual playtest - YYYY-MM-DD
Build: <commit>
Duration: <minutes>
Outcome: extracted | died | timeout | crash
Scores: loop clarity _, combat _, greed _, extract _, death _, market _, visual _, replay _
Key timestamps:
- 00:00 ...
- 05:00 ...
- 08:00 ...
Decision that mattered:
Issue list:
Next tuning recommendation:
```

## Boundary

This protocol does not replace `npm run validate:release-readiness` or `npm run accept:visual-readiness`. It fills the human-feel gap after structural tests are green.
