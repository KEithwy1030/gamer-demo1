import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const audioSource = readFileSync("client/src/audio/gameAudio.ts", "utf8");
const clientSource = readFileSync("client/src/scenes/createGameClient.ts", "utf8");

for (const cue of ["attack", "hit", "hurt", "pickup", "chest", "extract", "death", "warning"]) {
  assert.match(audioSource, new RegExp(`${cue}:\\s*\\{`), `audio cue ${cue} should have a synthesized shape`);
}

assert.match(audioSource, /pointerdown/, "audio should unlock after pointer input");
assert.match(audioSource, /keydown/, "audio should unlock after keyboard input");
assert.match(audioSource, /touchstart/, "audio should unlock after touch input");
assert.match(audioSource, /setMuted/, "audio controller should expose mute control");

for (const cue of ["attack", "hit", "hurt", "pickup", "chest", "extract", "death", "warning"]) {
  assert.ok(clientSource.includes(`"${cue}"`), `createGameClient should hook ${cue} cue`);
}

assert.match(clientSource, /audio\.destroy\(\)/, "game client should clean up audio listeners on destroy");

console.log("[audio-hooks] PASS synthesized audio cues are wired to gameplay events");
