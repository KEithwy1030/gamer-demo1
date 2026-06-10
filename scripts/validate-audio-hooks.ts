import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const audioSource = readFileSync("client/src/audio/gameAudio.ts", "utf8");
const clientSource = readFileSync("client/src/scenes/createGameClient.ts", "utf8");
const marketSource = readFileSync("client/src/ui/marketView.ts", "utf8");
const combatAudioSource = readFileSync("client/src/features/combat/audio/combatAudio.ts", "utf8");
const chestAudioSource = readFileSync("client/src/features/chests/audio/chestAudio.ts", "utf8");
const extractAudioSource = readFileSync("client/src/features/extract/audio/extractAudio.ts", "utf8");
const musicSource = readFileSync("client/src/features/music/musicDirector.ts", "utf8");

for (const cue of ["attack", "hit", "hurt", "pickup", "chest", "extract", "market", "death", "warning"]) {
  assert.match(audioSource, new RegExp(`${cue}:\\s*\\{`), `audio cue ${cue} should have a synthesized shape`);
}

assert.match(audioSource, /pointerdown/, "audio should unlock after pointer input");
assert.match(audioSource, /keydown/, "audio should unlock after keyboard input");
assert.match(audioSource, /touchstart/, "audio should unlock after touch input");
assert.match(audioSource, /setMuted/, "audio controller should expose mute control");

// S5 cutover moved gameplay cue hooks from createGameClient into feature audio modules.
const cueHookSources: Record<string, string> = {
  attack: combatAudioSource,
  hit: combatAudioSource,
  hurt: combatAudioSource,
  death: combatAudioSource,
  chest: chestAudioSource,
  extract: extractAudioSource,
  pickup: clientSource,
  warning: clientSource
};

for (const [cue, source] of Object.entries(cueHookSources)) {
  assert.ok(source.includes(`"${cue}"`), `cue ${cue} should be hooked in its feature audio module`);
}

for (const mount of ["mountCombatAudio", "mountChestAudio", "mountExtractAudio", "mountMusicDirector"]) {
  assert.ok(clientSource.includes(`${mount}(`), `createGameClient should mount ${mount}`);
}

assert.match(clientSource, /audio\.destroy\(\)/, "game client should clean up audio listeners on destroy");
assert.match(marketSource, /new GameAudioController\(\)/, "black-market UI should own a lightweight audio controller");
assert.match(marketSource, /audio\.play\("market"\)/, "black-market payoff actions should play the market cue");

// Music director must cover every MusicMode with a scene spec and react to the domain event.
for (const mode of ["lobby", "calm", "skirmish", "danger", "extract_pressure", "death", "victory"]) {
  assert.match(musicSource, new RegExp(`${mode}:\\s*\\{`), `music director should define a scene for mode ${mode}`);
}
assert.match(musicSource, /MusicModeChanged/, "music director should subscribe to MusicModeChanged");

console.log("[audio-hooks] PASS audio cues wired in feature modules and music director covers all modes");
