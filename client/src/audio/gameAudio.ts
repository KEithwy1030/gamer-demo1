export type GameAudioCue =
  | "attack"
  | "hit"
  | "hurt"
  | "pickup"
  | "chest"
  | "extract"
  | "death"
  | "warning";

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
  death: { frequency: 88, durationMs: 240, type: "sawtooth", gain: 0.07, slideTo: 38 },
  warning: { frequency: 190, durationMs: 150, type: "square", gain: 0.042, slideTo: 190 }
};

export class GameAudioController {
  private context?: AudioContext;
  private unlocked = false;
  private muted = false;
  private readonly unlock = (): void => {
    void this.ensureContext();
  };

  constructor() {
    if (typeof window === "undefined") {
      return;
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
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
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
