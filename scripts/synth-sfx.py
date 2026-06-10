# 离线合成战斗音效，替换来源不明/内容错误的下载 wav。
# 用法: python scripts/synth-sfx.py
# 设计原则：短（<0.35s）、干净（无削波、-6dBFS 峰值）、打击感（快攻击慢衰减包络）。
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path("client/public/assets/audio")


def envelope(n: int, attack: float, decay_power: float = 3.0) -> np.ndarray:
    t = np.linspace(0, 1, n)
    attack_n = max(1, int(n * attack))
    env = np.ones(n)
    env[:attack_n] = np.linspace(0, 1, attack_n)
    env[attack_n:] = (1 - t[attack_n:]) ** decay_power / (1 - t[attack_n]) ** decay_power
    return env


def bandpass_noise(n: int, low_hz: float, high_hz: float) -> np.ndarray:
    noise = np.random.default_rng(7).normal(0, 1, n)
    spectrum = np.fft.rfft(noise)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    spectrum[~mask] = 0
    return np.fft.irfft(spectrum, n)


def normalize(x: np.ndarray, peak: float = 0.5) -> np.ndarray:
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def save(name: str, samples: np.ndarray) -> None:
    pcm = (np.clip(samples, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(OUT / name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"wrote {name}: {len(samples)/SR:.2f}s peak={np.max(np.abs(samples)):.2f}")


def attack_whoosh() -> np.ndarray:
    # 0.22s 挥砍：带通噪声中心频率 1800→600Hz 下扫，快进快出
    n = int(SR * 0.22)
    sweep = np.zeros(n)
    segments = 6
    for i in range(segments):
        lo = 1800 - i * 200
        seg = bandpass_noise(n, lo * 0.6, lo * 1.8)
        w = np.zeros(n)
        s, e = int(n * i / segments), int(n * (i + 2) / segments) if i < segments - 1 else n
        w[s:e] = np.hanning(e - s)
        sweep += seg * w
    return normalize(sweep * envelope(n, 0.08, 2.0))


def pickup_coin() -> np.ndarray:
    # 0.18s 硬币叮当：两个高频泛音对 + 快速二次敲击
    n = int(SR * 0.18)
    t = np.arange(n) / SR
    tone = (
        np.sin(2 * np.pi * 2680 * t) * 0.6
        + np.sin(2 * np.pi * 4300 * t) * 0.35
        + np.sin(2 * np.pi * 6900 * t) * 0.18
    )
    env = np.exp(-t * 34)
    second = np.zeros(n)
    offset = int(SR * 0.055)
    second[offset:] = (np.sin(2 * np.pi * 3120 * t[: n - offset]) * 0.4) * np.exp(-t[: n - offset] * 40)
    return normalize(tone * env + second)


def hit_flesh() -> np.ndarray:
    # 0.16s 击中肉体：低频 thump（120→60Hz 俯冲）+ 中频短噪声拍击
    n = int(SR * 0.16)
    t = np.arange(n) / SR
    freq = 120 * np.exp(-t * 14) + 55
    thump = np.sin(2 * np.pi * np.cumsum(freq) / SR)
    smack = bandpass_noise(n, 500, 2200) * np.exp(-t * 48)
    return normalize(thump * np.exp(-t * 22) * 0.8 + smack * 0.7)


def hit_armor() -> np.ndarray:
    # 0.22s 击中甲胄：金属泛音簇（非整数倍频）+ 短噪声冲击 + 余振
    n = int(SR * 0.22)
    t = np.arange(n) / SR
    partials = [(820, 1.0, 16), (1370, 0.55, 20), (2210, 0.4, 26), (3580, 0.25, 30)]
    ring = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, a, d in partials)
    clank = bandpass_noise(n, 900, 5200) * np.exp(-t * 60)
    return normalize(ring * 0.7 + clank * 0.8)


if __name__ == "__main__":
    save("attack_whoosh.wav", attack_whoosh())
    save("pickup_coin.wav", pickup_coin())
    save("hit_flesh.wav", hit_flesh())
    save("hit_armor.wav", hit_armor())
