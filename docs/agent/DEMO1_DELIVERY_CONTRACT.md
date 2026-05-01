# Demo 1 Delivery Contract

## Plain-Language Goal

Make a browser game where the player can repeatedly do this loop:

1. enter a match
2. search, fight, and loot
3. escape alive
4. bring items back
5. place them into stash or loadout
6. start the next run with chosen carried gear

If they escape, what they brought out matters in the next run.
If they die or time out, the loss also matters in the next run.

This repeated carry loop is the full value of Demo 1.

## What This Game Should Be Right Now

Not a huge sandbox.
Not a content-heavy RPG.
Not a forever-growing experimental prototype.

For now, it should be:

- an `extraction carry-loop demo`
- `PC browser first`
- `top-down / 2.5D-feeling readability first`
- `one strong playable loop before expansion`

## In Scope For Demo 1

- create room
- join room
- start same-match session with the current testing setup
- player movement
- basic attack
- three weapon styles with clear feel difference
- one dodge skill
- normal monsters and elite monsters
- world drops
- backpack grid
- equipment slots
- full death drop
- fixed extraction point
- extraction open timing
- match settlement screen
- carry-out result for successful extraction
- stash organization after returning
- next-run loadout based on stash and carried gear

## Explicitly Out Of Scope

- trading house
- crafting
- enhancement systems
- insurance box
- free skill combinations
- world boss content
- complex account system
- complex matchmaking
- chat system
- broad meta progression beyond what is needed to support the demo

## Default Product Decisions

Use these unless the user explicitly changes them later:

- Demo 1 is judged by whether the core loop is playable, not by visual polish depth.
- Current multiplayer implementation is acceptable for testing and should not be the main investment area right now.
- Bot work is optional support for fuller test matches, not the center of the demo.
- New features do not enter the current phase unless they are required to close the extraction loop.
- Polish only matters after the full loop is stable.
- The loop must hold across two or three consecutive runs, not just one successful extraction.

## Browser-Visible Acceptance

Demo 1 is complete when all of these are true:

1. Two or more players can enter the same room and see the same match state.
2. Players can move, attack, use a skill, and dodge.
3. Different weapons feel materially different in use.
4. Monsters can pressure the player and drop rewards.
5. Players can pick up items only when they have space.
6. Inventory pressure creates real tradeoffs.
7. Death causes full loadout and carried items to drop.
8. Extraction opens at the intended point in the match.
9. Successful extraction and failed runs both produce a clear settlement result.
10. Returned items can be organized in stash or carried loadout after the match.
11. The next run starts with the chosen carried gear instead of silently resetting to a default setup.
12. The whole loop works for two or three consecutive runs.

## Development Order

Build and judge the game in this order:

1. `Carry-loop truth`
   Match start, extraction, settlement, stash return, next-run carried loadout.

2. `Combat truth`
   Basic attack, weapon differences, damage, death, monster threat.

3. `Loot truth`
   Drops, pickup validation, inventory constraints, death drop.

4. `Readability and pressure`
   HUD clarity, prompts, map hazard readability, pacing, polish that helps play.

## What The Agent Should Do From Now On

When asked to continue this project, default behavior should be:

1. check this contract
2. implement the next missing slice in the delivery order
3. verify it in runtime
4. continue until the current slice is actually closed

Do not switch back into patch-by-patch conversation mode unless a real scope decision is missing.
