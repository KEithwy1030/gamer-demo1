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

// Simplex 2D noise
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
    dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 a0 = x - floor(x + 0.5);
  vec3 m1 = m * ( 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h ) );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m1, g);
}

float fbm(vec2 uv) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * snoise(uv);
    uv *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = outTexCoord;
  vec4 texColor = texture2D(uMainSampler, uv);
  
  // Calculate distance from world center in screen space
  vec2 screenPos = uv * uResolution;
  float dist = distance(screenPos, uCenter);
  
  // Normalized distance based on radius
  float d = dist / uRadius;
  
  // Create noise-based edge
  float n = fbm(uv * 3.0 + uTime * 0.15);
  float edge = smoothstep(0.85, 1.15, d + n * 0.1);
  
  // Sickly green-yellow color for miasma
  vec3 miasmaColor = vec3(0.12, 0.18, 0.08); // Base dark moss
  miasmaColor = mix(miasmaColor, vec3(0.3, 0.25, 0.1), n * 0.5 + 0.5); // Add rust yellow
  
  // Contrast enhancement in the fog
  vec3 finalColor = mix(texColor.rgb, miasmaColor, edge * uIntensity);
  
  // Pulse effect near the edge
  float pulse = sin(uTime * 2.0) * 0.05 + 0.95;
  if (edge > 0.1) {
      finalColor *= mix(1.0, 0.8, edge * pulse);
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
