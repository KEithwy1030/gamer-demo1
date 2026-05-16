import Phaser from "phaser";

const fragShader = `
#define SHADER_NAME MIASMA_POST_FX

precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
uniform vec2 uResolution;
uniform float uRadius;
uniform vec2 uCenter;
uniform float uIntensity;

varying vec2 outTexCoord;

// Stable value noise keeps the post effect deterministic across browsers.
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = outTexCoord;
    vec4 texColor = texture2D(uMainSampler, uv);

    vec2 pixelPos = uv * uResolution;
    float dist = distance(pixelPos, uCenter);
    float d = dist / max(uRadius, 1.0);

    float t = uTime * 0.2;
    float n = fbm(uv * 4.0 + vec2(t, t * 0.8));
    float fogThreshold = 0.8 + n * 0.15;
    float edge = smoothstep(fogThreshold, fogThreshold + 0.3, d);

    vec3 miasmaColor = mix(vec3(0.05, 0.08, 0.02), vec3(0.15, 0.18, 0.05), n);
    vec3 finalColor = mix(texColor.rgb, miasmaColor, edge * uIntensity);

    if (edge > 0.01) {
        finalColor *= (1.0 - edge * 0.2 * uIntensity);
    }

    gl_FragColor = vec4(finalColor, texColor.a);
}
`;

export class MiasmaPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private _radius = 1000;
  private _center = new Phaser.Math.Vector2(0, 0);
  private _intensity = 0;

  constructor(game: Phaser.Game) {
    super({
      game,
      renderTarget: true,
      fragShader
    });
  }

  onPreRender(): void {
    this.set1f("uTime", this.game.loop.time / 1000);
    this.set2f("uResolution", this.renderer.width, this.renderer.height);
    this.set1f("uRadius", this._radius);
    this.set2f("uCenter", this._center.x, this._center.y);
    this.set1f("uIntensity", this._intensity);
  }

  setMiasma(centerX: number, centerY: number, radius: number, intensity: number): void {
    this._center.set(centerX, centerY);
    this._radius = radius;
    this._intensity = intensity;
  }
}
