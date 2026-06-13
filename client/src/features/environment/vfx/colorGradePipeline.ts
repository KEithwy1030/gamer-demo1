import Phaser from "phaser";

/**
 * 全屏颜色分级（环境板块 · 客户端表现）。
 *
 * 这是"美术方向"的核心调色层：对最终画面做对比度 / 饱和度 / 增益 + 阴影-高光
 * 分离调色（split-tone）。同一批资产，换一组分级参数就是另一种调性——这是固定
 * 资产下决定"像不像一款真游戏"的最大杠杆。
 *
 * tone = mix(阴影色, 高光色, 亮度)，乘性作用（中性色 = vec3(1.0) 不改变画面），
 * 数值围绕 1.0 偏移：偏暖>1 的通道提暖，偏冷<1 的通道压暖。
 *
 * 作为最后一道后处理（在 miasma 之上）运行，得到最终成片色。
 */
const fragShader = `
#define SHADER_NAME COLOR_GRADE_POST_FX

precision mediump float;

uniform sampler2D uMainSampler;
uniform float uContrast;
uniform float uSaturation;
uniform float uGain;
uniform float uLift;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;

varying vec2 outTexCoord;

void main() {
    vec4 src = texture2D(uMainSampler, outTexCoord);
    vec3 c = src.rgb;

    // 对比度（围绕 0.5 中灰）
    c = (c - 0.5) * uContrast + 0.5;
    // 增益 + 黑位抬升
    c = c * uGain + uLift;
    c = clamp(c, 0.0, 1.0);

    float luma = dot(c, vec3(0.299, 0.587, 0.114));

    // 阴影-高光分离调色（乘性，按亮度插值）
    vec3 tone = mix(uShadowTint, uHighlightTint, smoothstep(0.0, 1.0, luma));
    c *= tone;

    // 饱和度（围绕灰度）
    c = mix(vec3(luma), c, uSaturation);

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}
`;

export interface ColorGradeParams {
  contrast: number;
  saturation: number;
  gain: number;
  lift: number;
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
}

export const NEUTRAL_GRADE: ColorGradeParams = {
  contrast: 1,
  saturation: 1,
  gain: 1,
  lift: 0,
  shadowTint: [1, 1, 1],
  highlightTint: [1, 1, 1]
};

export class ColorGradePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private params: ColorGradeParams = NEUTRAL_GRADE;

  constructor(game: Phaser.Game) {
    super({ game, renderTarget: true, fragShader });
  }

  onPreRender(): void {
    this.set1f("uContrast", this.params.contrast);
    this.set1f("uSaturation", this.params.saturation);
    this.set1f("uGain", this.params.gain);
    this.set1f("uLift", this.params.lift);
    this.set3f("uShadowTint", this.params.shadowTint[0], this.params.shadowTint[1], this.params.shadowTint[2]);
    this.set3f("uHighlightTint", this.params.highlightTint[0], this.params.highlightTint[1], this.params.highlightTint[2]);
  }

  setGrade(params: ColorGradeParams): void {
    this.params = params;
  }
}
