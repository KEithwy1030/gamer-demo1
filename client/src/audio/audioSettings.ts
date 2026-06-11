/** 音频偏好持久化：独立于游戏档案的轻量设置（静音状态跨局/跨刷新保留）。 */

const STORAGE_KEY = "liuhuang.audioSettings.v1";

export interface AudioSettings {
  muted: boolean;
}

export function loadAudioSettings(): AudioSettings {
  if (typeof localStorage === "undefined") {
    return { muted: false };
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<AudioSettings>;
    return { muted: parsed.muted === true };
  } catch {
    return { muted: false };
  }
}

export function saveAudioSettings(settings: AudioSettings): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 存储不可用时静音状态仅在本次会话生效
  }
}
