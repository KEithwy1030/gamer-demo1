import type { ColorGradeParams } from "./colorGradePipeline";

/**
 * 美术方向候选（2026-06-13 定调子用）。同一批资产 + 同一套光照，仅换分级，
 * 给项目所有者对比挑选。锁定后写入 docs/QUALITY-BAR.md §7 美术圣经，再据此
 * 派 Codex 批量重生成资产。
 *
 * 每套同时给一组光照覆盖（ambient/vignette/提灯色），让调性与光照协同——
 * 哥特要更黑更冷的环境光，余烬要更暖更亮的提灯。
 */
export interface ArtDirectionPreset {
  key: string;
  label: string;
  grade: ColorGradeParams;
  lighting: {
    ambientColor: number;
    ambientAlpha: number;
    vignetteAlpha: number;
    lanternColor: number;
    lanternAlpha: number;
  };
}

export const ART_DIRECTION_PRESETS: Record<string, ArtDirectionPreset> = {
  // A · 暗夜哥特：高对比、压黑、冷调阴影，少量暖色提灯刺破黑暗（暗黑地牢谱系）
  gothic: {
    key: "gothic",
    label: "暗夜哥特",
    grade: {
      contrast: 1.28,
      saturation: 0.74,
      gain: 0.9,
      lift: -0.015,
      shadowTint: [0.7, 0.78, 1.02],
      highlightTint: [1.08, 0.98, 0.86]
    },
    lighting: { ambientColor: 0x070a14, ambientAlpha: 0.24, vignetteAlpha: 0.74, lanternColor: 0xffb24d, lanternAlpha: 0.52 }
  },
  // B · 余烬暖土：暖琥珀主调、饱和更足、金色高光，更"邀请人探索"（莫塔孩子谱系）
  ember: {
    key: "ember",
    label: "余烬暖土",
    grade: {
      contrast: 1.1,
      saturation: 1.16,
      gain: 1.04,
      lift: 0.005,
      shadowTint: [1.06, 0.9, 0.68],
      highlightTint: [1.2, 1.04, 0.78]
    },
    lighting: { ambientColor: 0x140d08, ambientAlpha: 0.14, vignetteAlpha: 0.5, lanternColor: 0xffc266, lanternAlpha: 0.5 }
  },
  // C · 冷月写实：冷蓝月光、克制、低饱和、银调高光（当前方向的精修版）
  moonlit: {
    key: "moonlit",
    label: "冷月写实",
    grade: {
      contrast: 1.1,
      saturation: 0.9,
      gain: 0.98,
      lift: 0,
      shadowTint: [0.8, 0.88, 1.06],
      highlightTint: [0.92, 0.98, 1.13]
    },
    lighting: { ambientColor: 0x0b1020, ambientAlpha: 0.16, vignetteAlpha: 0.62, lanternColor: 0xffb46a, lanternAlpha: 0.46 }
  }
};

export const DEFAULT_ART_DIRECTION = "moonlit";

export function resolveArtDirection(): ArtDirectionPreset {
  if (typeof window !== "undefined") {
    try {
      const param = new URLSearchParams(window.location.search).get("grade");
      if (param && ART_DIRECTION_PRESETS[param]) {
        return ART_DIRECTION_PRESETS[param];
      }
    } catch {
      // ignore malformed URL
    }
  }
  return ART_DIRECTION_PRESETS[DEFAULT_ART_DIRECTION];
}
