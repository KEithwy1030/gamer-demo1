process.env.GAME_FEEL_PRESET = "lategame";
process.env.GAME_FEEL_RUN_ID ??= `lategame-extract-baseline-${new Date().toISOString().replace(/[:.]/g, "-")}`;

await import("./accept-game-feel-baseline.mjs");
