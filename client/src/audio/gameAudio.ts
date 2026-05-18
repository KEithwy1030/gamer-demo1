export type GameAudioCue =
  | "attack"
  | "hit"
  | "hurt"
  | "pickup"
  | "chest"
  | "extract"
  | "market"
  | "death"
  | "warning"
  | "charge-up"
  | "thud"
  | "rummage-tick";

interface CueShape {
  frequency: number;
  durationMs: number;
  type: OscillatorType;
  gain: number;
  slideTo?: number;
}

const CUE_SHAPES: Record<GameAudioCue, CueShape> = {
  attack: { frequency: 170, durationMs: 72, type: "sawtooth", gain: 0.052, slideTo: 118 },
  hit: { frequency: 94, durationMs: 86, type: "square", gain: 0.064, slideTo: 54 },
  hurt: { frequency: 132, durationMs: 120, type: "sawtooth", gain: 0.05, slideTo: 66 },
  pickup: { frequency: 520, durationMs: 90, type: "triangle", gain: 0.045, slideTo: 760 },
  chest: { frequency: 310, durationMs: 160, type: "triangle", gain: 0.05, slideTo: 210 },
  extract: { frequency: 220, durationMs: 240, type: "sine", gain: 0.06, slideTo: 440 },
  market: { frequency: 620, durationMs: 130, type: "triangle", gain: 0.044, slideTo: 930 },
  death: { frequency: 88, durationMs: 240, type: "sawtooth", gain: 0.07, slideTo: 38 },
  warning: { frequency: 190, durationMs: 150, type: "square", gain: 0.042, slideTo: 190 },
  "charge-up": { frequency: 120, durationMs: 400, type: "sine", gain: 0.035, slideTo: 240 },
  thud: { frequency: 60, durationMs: 120, type: "triangle", gain: 0.08, slideTo: 30 },
  "rummage-tick": { frequency: 220, durationMs: 80, type: "sine", gain: 0.04, slideTo: 220 }
};

const CUE_FILES: Partial<Record<GameAudioCue, string>> = {
  attack: "/assets/audio/attack_whoosh.wav",
  hit: "/assets/audio/hit_flesh.wav",
  thud: "/assets/audio/hit_armor.wav",
  hurt: "/assets/audio/player_hurt_grunts.wav",
  pickup: "/assets/audio/pickup_coin.wav",
  chest: "/assets/audio/chest_open.wav"
};

const CUE_VOLUMES: Partial<Record<GameAudioCue, number>> = {
  attack: 0.5,
  hit: 0.7,
  thud: 0.8,
  hurt: 0.75,
  pickup: 0.6,
  chest: 0.45
};

export class GameAudioController {
  private context?: AudioContext;
  private unlocked = false;
  private muted = false;
  private readonly audioCache: Map<string, HTMLAudioElement> = new Map();
  private readonly hurtStartPoints = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45];

  private readonly unlock = (): void => {
    void this.ensureContext();
    // Unlock HTMLAudio elements via a silent play/pause
    for (const audio of this.audioCache.values()) {
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => {
        // Expected failure if browser blocks it, will retry on next interaction
      });
    }
  };

  constructor() {
    if (typeof window === "undefined") {
      return;
    }

    // Preload files
    for (const [cue, path] of Object.entries(CUE_FILES)) {
      const audio = new Audio(path);
      audio.preload = "auto";
      audio.volume = CUE_VOLUMES[cue as GameAudioCue] ?? 0.6;
      this.audioCache.set(cue, audio);
    }

    window.addEventListener("pointerdown", this.unlock, { passive: true });
    window.addEventListener("keydown", this.unlock);
    window.addEventListener("touchstart", this.unlock, { passive: true });
  }

  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerdown", this.unlock);
      window.removeEventListener("keydown", this.unlock);
      window.removeEventListener("touchstart", this.unlock);
    }

    void this.context?.close();
    this.context = undefined;
    this.unlocked = false;
    this.audioCache.clear();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const audio of this.audioCache.values()) {
      audio.muted = muted;
    }
  }

  play(cue: GameAudioCue): void {
    if (this.muted || typeof window === "undefined") {
      return;
    }

    void this.playInternal(cue);
  }

  private async ensureContext(): Promise<AudioContext | undefined> {
    if (this.context) {
      if (this.context.state === "suspended") {
        await this.context.resume();
      }
      this.unlocked = this.context.state === "running";
      return this.context;
    }

    const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioCtor) {
      return undefined;
    }

    this.context = new AudioCtor();
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    this.unlocked = this.context.state === "running";
    return this.context;
  }

  private async playInternal(cue: GameAudioCue): Promise<void> {
    const cached = this.audioCache.get(cue);
    if (cached) {
      try {
        if (cue === "hurt") {
          // Special handling for the long grunt file
          const start = this.hurtStartPoints[Math.floor(Math.random() * this.hurtStartPoints.length)];
          cached.currentTime = start;
          await cached.play();
          setTimeout(() => {
            cached.pause();
            cached.currentTime = 0;
          }, 1100);
          return;
        }

        // For other cues, use cloneNode to allow overlapping plays
        const instance = cached.cloneNode(true) as HTMLAudioElement;
        instance.volume = cached.volume;
        instance.muted = this.muted;
        await instance.play();
        instance.onended = () => instance.remove();
        return;
      } catch (err) {
        // Fallback to synth on playback error
        console.warn(`[audio] Failed to play WAV for ${cue}, falling back to synth:`, err);
      }
    }

    const context = await this.ensureContext();
    if (!context || !this.unlocked) {
      return;
    }

    const shape = CUE_SHAPES[cue];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    const end = start + shape.durationMs / 1000;

    oscillator.type = shape.type;
    oscillator.frequency.setValueAtTime(shape.frequency, start);
    if (shape.slideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, shape.slideTo), end);
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(shape.gain, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.015);
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
