import { logEvent } from "../dev/runtimeLog";

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
  private attackStopTimer?: number;
  private hurtLastStartMs = 0;
  private static readonly HURT_MIN_INTERVAL_MS = 350;

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
      audio.addEventListener("error", () => {
        logEvent("AUDIO", "audio.load_failed", {
          cue,
          url: path,
          error: formatAudioError(audio)
        });
      });
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
      if (this.attackStopTimer !== undefined) {
        window.clearTimeout(this.attackStopTimer);
        this.attackStopTimer = undefined;
      }
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
    logEvent("AUDIO", "audio.play", {
      cue,
      muted: this.muted,
      hasFile: CUE_FILES[cue] ? "yes" : "no"
    });

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
        if (cue === "attack") {
          // A sword swing should be a short, interruptible cue rather than a looping wave.
          if (this.attackStopTimer !== undefined) {
            window.clearTimeout(this.attackStopTimer);
            this.attackStopTimer = undefined;
          }
          cached.pause();
          cached.currentTime = 0;
          cached.muted = this.muted;
          await cached.play();
          const stopTimer = window.setTimeout(() => {
            if (this.attackStopTimer !== stopTimer) {
              return;
            }
            logEvent("AUDIO", "audio.cap_reached", {
              cue,
              durationMs: 400
            });
            cached.pause();
            cached.currentTime = 0;
            this.attackStopTimer = undefined;
          }, 400);
          this.attackStopTimer = stopTimer;
          return;
        }

        if (cue === "hurt") {
          // Suppress rapid-fire hurt overlaps — prior session log showed 6 plays in 4s
          // creating noise. 350ms min interval matches typical combat hit cadence.
          const now = Date.now();
          if (now - this.hurtLastStartMs < GameAudioController.HURT_MIN_INTERVAL_MS) {
            return;
          }
          this.hurtLastStartMs = now;
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
        if (cached.error) {
          logEvent("AUDIO", "audio.load_failed", {
            cue,
            url: CUE_FILES[cue] ?? "",
            error: formatAudioError(cached, err)
          });
        }
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

function formatAudioError(audio: HTMLAudioElement, error?: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const mediaError = audio.error;
  if (!mediaError) {
    return typeof error === "string" ? error : "unknown";
  }

  switch (mediaError.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "aborted";
    case MediaError.MEDIA_ERR_NETWORK:
      return "network";
    case MediaError.MEDIA_ERR_DECODE:
      return "decode";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "src_not_supported";
    default:
      return "unknown";
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
