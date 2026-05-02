export class LobbyBackground {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private animationId: number | null = null;
  private time = 0;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "lobby-background";
    this.ctx = this.canvas.getContext("2d")!;
    
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  get element() {
    return this.canvas;
  }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.draw();
  }

  start() {
    const loop = (t: number) => {
      this.time = t / 1000;
      this.draw();
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private draw() {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // 1. Clear with warm camp dusk gradient
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "#18110b");
    grad.addColorStop(0.52, "#0f0c08");
    grad.addColorStop(1, "#060504");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    this.drawGroundGrid(width, height);

    // 3. Draw broken ridgelines and camp silhouettes
    this.drawMountains(height * 0.62, "#14100b", 0.35);
    this.drawMountains(height * 0.76, "#21170f", 0.62);
    this.drawCampfires(width, height);
    this.drawTornBanners(width, height);

    // 4. Draw drifting ash and ember particles
    this.drawParticles();
  }

  private drawGroundGrid(width: number, height: number) {
    const ctx = this.ctx;
    const tileSize = 72;
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = "#3a2b1d";
    ctx.lineWidth = 1;
    for (let x = -tileSize; x < width + tileSize; x += tileSize) {
      for (let y = Math.floor(height * 0.42); y < height + tileSize; y += tileSize) {
        ctx.strokeRect(x, y, tileSize, tileSize);
        const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        if (seed - Math.floor(seed) > 0.72) {
          ctx.fillStyle = "#5f4930";
          ctx.fillRect(x + 18, y + 22, 22, 2);
          ctx.fillRect(x + 34, y + 18, 2, 18);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawMountains(yBase: number, color: string, speed: number) {
    const ctx = this.ctx;
    const { width } = this.canvas;
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, this.canvas.height);
    
    const segments = 10;
    const segmentWidth = width / segments;
    
    for (let i = 0; i <= segments; i++) {
      const x = i * segmentWidth;
      // Use sine waves for pseudo-random but stable mountains
      const noise = Math.sin(i * 1.5 + this.time * 0.1 * speed) * 40 + 
                    Math.cos(i * 0.8) * 20;
      const y = yBase + noise;
      ctx.lineTo(x, y);
    }
    
    ctx.lineTo(width, this.canvas.height);
    ctx.fill();
  }

  private drawParticles() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    
    for (let i = 0; i < 34; i++) {
      const t = this.time + i * 10;
      const x = ((i * 137) % width + Math.sin(t * 0.5) * 50 + width) % width;
      const y = ((i * 243) % height - t * 26 + height) % height;
      const size = (i % 3) + 1;
      ctx.fillStyle = i % 5 === 0 ? "#e8602c" : "#b8ae96";
      ctx.globalAlpha = (i % 5 === 0 ? 0.28 : 0.16) + Math.sin(t + i) * 0.07;
      ctx.fillRect(x, y, size * 2, size * 2);
    }
    ctx.globalAlpha = 1.0;
  }

  private drawCampfires(width: number, height: number) {
    const ctx = this.ctx;
    const fires = [
      { x: width * 0.13, y: height * 0.78, s: 1.1 },
      { x: width * 0.77, y: height * 0.7, s: 0.85 },
      { x: width * 0.56, y: height * 0.86, s: 0.65 }
    ];

    for (const fire of fires) {
      const flicker = 1 + Math.sin(this.time * 5 + fire.x) * 0.08;
      const radius = 92 * fire.s * flicker;
      const glow = ctx.createRadialGradient(fire.x, fire.y, 0, fire.x, fire.y, radius);
      glow.addColorStop(0, "rgba(232,96,44,0.32)");
      glow.addColorStop(0.34, "rgba(212,178,76,0.1)");
      glow.addColorStop(1, "rgba(232,96,44,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(fire.x - radius, fire.y - radius, radius * 2, radius * 2);

      ctx.fillStyle = "#2b1b10";
      ctx.fillRect(fire.x - 18 * fire.s, fire.y + 10 * fire.s, 36 * fire.s, 5 * fire.s);
      ctx.fillStyle = "#e8602c";
      ctx.beginPath();
      ctx.moveTo(fire.x, fire.y - 24 * fire.s * flicker);
      ctx.lineTo(fire.x + 14 * fire.s, fire.y + 8 * fire.s);
      ctx.lineTo(fire.x - 12 * fire.s, fire.y + 8 * fire.s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#d4b24c";
      ctx.beginPath();
      ctx.moveTo(fire.x + 1, fire.y - 12 * fire.s);
      ctx.lineTo(fire.x + 7 * fire.s, fire.y + 6 * fire.s);
      ctx.lineTo(fire.x - 5 * fire.s, fire.y + 5 * fire.s);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawTornBanners(width: number, height: number) {
    const ctx = this.ctx;
    const banners = [
      { x: width * 0.24, y: height * 0.66, h: 118, flip: 1 },
      { x: width * 0.87, y: height * 0.58, h: 96, flip: -1 }
    ];

    for (const banner of banners) {
      ctx.strokeStyle = "#4d3825";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(banner.x, banner.y);
      ctx.lineTo(banner.x, banner.y - banner.h);
      ctx.stroke();

      ctx.fillStyle = "rgba(128, 43, 28, 0.72)";
      ctx.beginPath();
      ctx.moveTo(banner.x, banner.y - banner.h + 10);
      ctx.lineTo(banner.x + 62 * banner.flip, banner.y - banner.h + 22);
      ctx.lineTo(banner.x + 44 * banner.flip, banner.y - banner.h + 48);
      ctx.lineTo(banner.x + 18 * banner.flip, banner.y - banner.h + 38);
      ctx.lineTo(banner.x, banner.y - banner.h + 54);
      ctx.closePath();
      ctx.fill();
    }
  }
}
