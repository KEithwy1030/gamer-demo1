# Agent Player

Agent Player is a thin browser-game smoke runner for this project. It uses the
existing dev acceptance launcher, Playwright, `window.__P0B_TEST_HOOKS__`,
socket frame capture, screenshots, and `.devlog/latest.jsonl` evidence.

It is not an AI player and does not implement pathfinding or gameplay logic.
Scenarios should stay small, deterministic, and focused on one player-visible
workflow.

## Commands

```bash
npm run agent:playtest -- --scenario sandbox-smoke
```

Dynamic right-walk facing stability:

```bash
npm run agent:playtest -- --scenario walk-facing-stability
```

Optional trace capture:

```bash
npm run agent:playtest -- --scenario sandbox-smoke --trace
```

Report-contract validation:

```bash
npm run validate:agent-player-report
```

## Architecture

- `run.mjs`: owns process lifecycle, artifact writing, cleanup, and scenario
  dispatch.
- `browser-session.mjs`: owns browser-side recorders, test hook helpers, and
  event waiting helpers.
- `scenarios/`: owns small deterministic player scripts. A scenario should not
  know how to start servers or write final reports.
- `report.mjs`: owns summary schema, failure classification, and Markdown
  output.

## Output

Each run writes to `.codex-artifacts/agent-player/<run-id>/`:

- `summary.json`
- `report.md`
- screenshots
- `events.json`
- `devlog-tail.jsonl` when available
- `trace.zip` only when `--trace` or `AGENT_PLAYER_TRACE=1` is enabled
- `facing-samples.json` and `facing-analysis.json` for
  `walk-facing-stability`

Findings must use `scope: "game"` when the game fails, and `scope: "tool"`
when the automation itself fails. This keeps tool bugs from being mistaken for
game bugs.

`walk-facing-stability` holds right movement through the real test hook, records
the live render state during animation frames, captures motion screenshots as
auxiliary evidence, and fails if the self player leaves `cardinal=right` or
`flipX=true` after the startup grace window. It also fails if the current sword
side-walk animation plays frame `2`, because that generated frame currently
reads as a reversed side pose even when the runtime facing state is stable. The
JSON render-state sequence is the primary evidence for dynamic facing jitter
that a single screenshot cannot prove.
