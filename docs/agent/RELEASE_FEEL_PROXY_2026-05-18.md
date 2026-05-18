# Release Feel Proxy Evidence - 2026-05-18

Build: `42b9801`
Branch: `feat-frontend-optimization`

## Purpose

This note records a low-resource proxy run after `launch-readiness-checkpoint-20260518-q`.
It does not replace the 9-12 minute human release-feel session in
`MANUAL_PLAYTEST_PROTOCOL_2026-05-18.md`.

## Command

```text
node scripts/test-loop.mjs
```

## Result

```text
[PASS] Step 1: Room created: roomCode=LONG路88
[PASS] Step 2: PlayerB joined room and room:state shows both humans
[PASS] Step 3: Both clients received match:started, units=6, squads={"player":2,"bot_alpha":4}
[PASS] Step 4: Received state:monsters, alive count=47
[PASS] Step 5: PlayerA killed monster monster_normal_23_28db70d5
[PASS] Step 6: Received state:drops, count=8
[PASS] Step 7: Picked dropId=559653ee-3f15-46bc-9b1e-209c6e349216, inventory items=1
[PASS] Step 8: Extract opened, zones=1
[PASS] Step 9: Received extract event started
[PASS] Step 10: Received settlement, result=success reason=extracted
Summary: passed 10 / 10 steps
```

## Evidence Coverage

- Covers the server-authoritative loop from lobby create/join to match start.
- Covers monster presence, one combat kill, world drop creation, pickup, extract opening, extract start, and extracted settlement.
- Confirms the safe-zone and elite-pressure tuning did not break the core socket loop after `npm run validate:launch-readiness` passed.
- Historical resource check after the run found no listening processes on the then-used temporary ports.
- Current port policy reserves `5288` for the project frontend and `5289` for the project backend; future drift should stay in the `52XX` range and must not use `5173`.

## Remaining Manual Gap

The manual release-feel scorecard is still open. This proxy cannot judge:

- Whether the first 2 minutes are readable and tense for a human.
- Whether greed, backpack pressure, and contested routes create meaningful hesitation.
- Whether corpse-fog and extraction pressure feel fair in an uninterrupted 9-12 minute browser session.
- Whether the black-market payoff creates replay intent.

Next recommended action: run `npm run playtest:manual`, use the protocol scorecard, and record the result under `docs/agent/`.
