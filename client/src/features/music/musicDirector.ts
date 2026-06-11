import type { MusicMode } from "@gamer/shared";
import { clientEventBus } from "../../core/event-bus";
import { logEvent } from "../../dev/runtimeLog";

/**
 * 程序化 BGM 引擎。服务端通过 MusicModeChanged 决定模式（客户端不推断），
 * 本板块只负责把模式翻译成声音：分层 WebAudio 合成（drone / pad / pulse / heartbeat），
 * 模式切换时 crossfade。没有外部音频文件依赖。
 */

const CROSSFADE_SEC = 1.6;
// BGM 必须明显低于音效层。0.5 的首版被反馈与杂音难区分，压到 0.38。
const MASTER_CEILING = 0.38;

interface DroneSpec {
  freq: number;
  detuneCents: number;
  cutoff: number;
  lfoHz: number;
  lfoDepth: number;
  gain: number;
}

interface PadSpec {
  freqs: number[];
  gain: number;
  type: OscillatorType;
}

interface PulseSpec {
  freqs: number[];
  intervalMs: number;
  noteMs: number;
  gain: number;
  type: OscillatorType;
}

interface HeartbeatSpec {
  intervalMs: number;
  gain: number;
}

interface ModeSpec {
  master: number;
  drone?: DroneSpec;
  pad?: PadSpec;
  pulse?: PulseSpec;
  heartbeat?: HeartbeatSpec;
  /** victory 这类一次性情绪：渐强后自动淡出 */
  autoFadeMs?: number;
}

// 调性设计：A 小调系。calm 低伏，skirmish 上小三度，danger 再上一度并提亮，
// extract_pressure 回根音但加心跳与小九度高频担忧层，death 三全音失谐，victory 大三和弦。
const MODE_SPECS: Record<MusicMode, ModeSpec> = {
  lobby: {
    master: 0.5,
    drone: { freq: 55, detuneCents: 5, cutoff: 260, lfoHz: 0.05, lfoDepth: 90, gain: 0.045 },
    pad: { freqs: [110, 164.8], gain: 0.018, type: "triangle" }
  },
  calm: {
    master: 0.7,
    drone: { freq: 55, detuneCents: 6, cutoff: 320, lfoHz: 0.07, lfoDepth: 130, gain: 0.055 },
    pad: { freqs: [110, 164.8], gain: 0.022, type: "triangle" }
  },
  skirmish: {
    master: 0.85,
    drone: { freq: 65.4, detuneCents: 8, cutoff: 480, lfoHz: 0.12, lfoDepth: 170, gain: 0.06 },
    pad: { freqs: [130.8, 196], gain: 0.02, type: "triangle" },
    pulse: { freqs: [130.8, 155.6, 196], intervalMs: 620, noteMs: 130, gain: 0.05, type: "square" }
  },
  danger: {
    master: 1,
    drone: { freq: 73.4, detuneCents: 11, cutoff: 760, lfoHz: 0.22, lfoDepth: 260, gain: 0.065 },
    pad: { freqs: [146.8, 155.6], gain: 0.02, type: "sawtooth" },
    pulse: { freqs: [146.8, 174.6, 220, 174.6], intervalMs: 430, noteMs: 110, gain: 0.06, type: "square" }
  },
  extract_pressure: {
    master: 1,
    drone: { freq: 55, detuneCents: 9, cutoff: 540, lfoHz: 0.3, lfoDepth: 220, gain: 0.06 },
    pad: { freqs: [233.1, 466.2], gain: 0.014, type: "sine" },
    heartbeat: { intervalMs: 700, gain: 0.16 }
  },
  death: {
    master: 0.8,
    drone: { freq: 55, detuneCents: 14, cutoff: 220, lfoHz: 0.04, lfoDepth: 60, gain: 0.06 },
    pad: { freqs: [77.8], gain: 0.03, type: "sine" },
    autoFadeMs: 9000
  },
  victory: {
    master: 0.9,
    drone: { freq: 110, detuneCents: 4, cutoff: 900, lfoHz: 0.15, lfoDepth: 240, gain: 0.05 },
    pad: { freqs: [220, 277.2, 329.6], gain: 0.03, type: "triangle" },
    autoFadeMs: 7000
  }
};

interface ActiveScene {
  mode: MusicMode;
  gain: GainNode;
  stop: () => void;
}

class ProceduralMusicEngine {
  private context?: AudioContext;
  private scene?: ActiveScene;
  private pendingMode?: MusicMode;
  private destroyed = false;
  private muted = false;

  private readonly unlock = (): void => {
    void this.resumeAndStartPending();
  };

  constructor() {
    if (typeof window === "undefined") {
      return;
    }
    window.addEventListener("pointerdown", this.unlock, { passive: true });
    window.addEventListener("keydown", this.unlock);
    window.addEventListener("touchstart", this.unlock, { passive: true });
  }

  setMode(mode: MusicMode): void {
    if (this.destroyed || this.scene?.mode === mode) {
      return;
    }

    const context = this.context;
    if (!context || context.state !== "running") {
      this.pendingMode = mode;
      void this.resumeAndStartPending();
      return;
    }

    this.startScene(context, mode);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    const context = this.context;
    const scene = this.scene;
    if (!context || !scene) {
      return;
    }

    const spec = MODE_SPECS[scene.mode];
    scene.gain.gain.cancelScheduledValues(context.currentTime);
    scene.gain.gain.setValueAtTime(
      muted ? 0.0001 : Math.max(0.0002, spec.master * MASTER_CEILING),
      context.currentTime
    );
  }

  destroy(): void {
    this.destroyed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerdown", this.unlock);
      window.removeEventListener("keydown", this.unlock);
      window.removeEventListener("touchstart", this.unlock);
    }
    this.teardownScene(0.2);
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
  }

  private async resumeAndStartPending(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    if (!this.context) {
      const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioCtor) {
        return;
      }
      this.context = new AudioCtor();
    }

    if (this.context.state === "suspended") {
      await this.context.resume().catch(() => undefined);
    }

    if (this.context.state === "running" && this.pendingMode) {
      const mode = this.pendingMode;
      this.pendingMode = undefined;
      if (this.scene?.mode !== mode) {
        this.startScene(this.context, mode);
      }
    }
  }

  private startScene(context: AudioContext, mode: MusicMode): void {
    const spec = MODE_SPECS[mode];
    this.teardownScene(CROSSFADE_SEC);

    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(
      this.muted ? 0.0001 : Math.max(0.0002, spec.master * MASTER_CEILING),
      context.currentTime + CROSSFADE_SEC
    );
    master.connect(context.destination);

    const stoppers: Array<() => void> = [];

    if (spec.drone) {
      stoppers.push(this.buildDrone(context, master, spec.drone));
    }
    if (spec.pad) {
      stoppers.push(this.buildPad(context, master, spec.pad));
    }
    if (spec.pulse) {
      stoppers.push(this.buildPulse(context, master, spec.pulse));
    }
    if (spec.heartbeat) {
      stoppers.push(this.buildHeartbeat(context, master, spec.heartbeat));
    }
    if (spec.autoFadeMs) {
      const timer = window.setTimeout(() => {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0002), context.currentTime);
        master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 3);
      }, spec.autoFadeMs);
      stoppers.push(() => window.clearTimeout(timer));
    }

    this.scene = {
      mode,
      gain: master,
      stop: () => {
        for (const stop of stoppers) {
          stop();
        }
        window.setTimeout(() => master.disconnect(), (CROSSFADE_SEC + 0.5) * 1000);
      }
    };

    logEvent("AUDIO", "music.scene_started", { mode });
  }

  private teardownScene(fadeSec: number): void {
    const previous = this.scene;
    const context = this.context;
    this.scene = undefined;
    if (!previous || !context) {
      return;
    }

    previous.gain.gain.cancelScheduledValues(context.currentTime);
    previous.gain.gain.setValueAtTime(Math.max(previous.gain.gain.value, 0.0002), context.currentTime);
    previous.gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + Math.max(fadeSec, 0.05));
    previous.stop();
  }

  private buildDrone(context: AudioContext, out: GainNode, spec: DroneSpec): () => void {
    const gain = context.createGain();
    gain.gain.value = spec.gain;

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = spec.cutoff;
    filter.Q.value = 0.8;

    const oscA = context.createOscillator();
    oscA.type = "sawtooth";
    oscA.frequency.value = spec.freq;
    oscA.detune.value = -spec.detuneCents;

    const oscB = context.createOscillator();
    oscB.type = "sawtooth";
    oscB.frequency.value = spec.freq;
    oscB.detune.value = spec.detuneCents;

    const lfo = context.createOscillator();
    lfo.frequency.value = spec.lfoHz;
    const lfoGain = context.createGain();
    lfoGain.gain.value = spec.lfoDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(out);

    oscA.start();
    oscB.start();
    lfo.start();

    return () => {
      const stopAt = context.currentTime + CROSSFADE_SEC + 0.4;
      oscA.stop(stopAt);
      oscB.stop(stopAt);
      lfo.stop(stopAt);
    };
  }

  private buildPad(context: AudioContext, out: GainNode, spec: PadSpec): () => void {
    const gain = context.createGain();
    gain.gain.value = spec.gain;
    gain.connect(out);

    const oscillators = spec.freqs.map((freq) => {
      const osc = context.createOscillator();
      osc.type = spec.type;
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start();
      return osc;
    });

    return () => {
      const stopAt = context.currentTime + CROSSFADE_SEC + 0.4;
      for (const osc of oscillators) {
        osc.stop(stopAt);
      }
    };
  }

  private buildPulse(context: AudioContext, out: GainNode, spec: PulseSpec): () => void {
    const gain = context.createGain();
    gain.gain.value = spec.gain;
    gain.connect(out);

    let step = 0;
    let nextNoteTime = context.currentTime + 0.1;
    const intervalSec = spec.intervalMs / 1000;

    const scheduler = window.setInterval(() => {
      while (nextNoteTime < context.currentTime + 0.35) {
        const freq = spec.freqs[step % spec.freqs.length] ?? spec.freqs[0] ?? 220;
        const osc = context.createOscillator();
        const env = context.createGain();
        osc.type = spec.type;
        osc.frequency.value = freq;
        env.gain.setValueAtTime(0.0001, nextNoteTime);
        env.gain.exponentialRampToValueAtTime(1, nextNoteTime + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, nextNoteTime + spec.noteMs / 1000);
        osc.connect(env);
        env.connect(gain);
        osc.start(nextNoteTime);
        osc.stop(nextNoteTime + spec.noteMs / 1000 + 0.05);
        nextNoteTime += intervalSec;
        step += 1;
      }
    }, 180);

    return () => window.clearInterval(scheduler);
  }

  private buildHeartbeat(context: AudioContext, out: GainNode, spec: HeartbeatSpec): () => void {
    const gain = context.createGain();
    gain.gain.value = spec.gain;
    gain.connect(out);

    let nextBeatTime = context.currentTime + 0.1;
    const intervalSec = spec.intervalMs / 1000;

    const thump = (at: number, strength: number): void => {
      const osc = context.createOscillator();
      const env = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(64, at);
      osc.frequency.exponentialRampToValueAtTime(38, at + 0.1);
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(strength, at + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.connect(env);
      env.connect(gain);
      osc.start(at);
      osc.stop(at + 0.25);
    };

    const scheduler = window.setInterval(() => {
      while (nextBeatTime < context.currentTime + 0.35) {
        thump(nextBeatTime, 1);
        thump(nextBeatTime + 0.18, 0.55);
        nextBeatTime += intervalSec;
      }
    }, 180);

    return () => window.clearInterval(scheduler);
  }
}

const MUSIC_MODES: readonly MusicMode[] = ["lobby", "calm", "skirmish", "danger", "extract_pressure", "death", "victory"];

function isMusicMode(value: unknown): value is MusicMode {
  return typeof value === "string" && (MUSIC_MODES as readonly string[]).includes(value);
}

export interface MusicDirectorControls {
  destroy(): void;
  setMuted(muted: boolean): void;
}

export function mountMusicDirector(initialMuted = false): MusicDirectorControls {
  const engine = new ProceduralMusicEngine();
  engine.setMuted(initialMuted);

  const onModeChanged = (payload: { mode?: string }): void => {
    if (isMusicMode(payload.mode)) {
      engine.setMode(payload.mode);
    }
  };

  clientEventBus.on("MusicModeChanged", onModeChanged);

  return {
    destroy() {
      clientEventBus.off("MusicModeChanged", onModeChanged);
      engine.destroy();
    },
    setMuted(muted: boolean) {
      engine.setMuted(muted);
    }
  };
}
