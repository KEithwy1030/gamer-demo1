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

    // 1. Clear with dark gradient
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "#0c1424");
    grad.addColorStop(1, "#060a12");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw pixelated floor tiles (subtle)
    const tileSize = 64;
    ctx.globalAlpha = 0.15;
    for (let x = 0; x < width; x += tileSize) {
      for (let y = 0; y < height; y += tileSize) {
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, tileSize, tileSize);
        
        // Random "cracks"
        if (Math.random() > 0.95) {
          ctx.fillStyle = "#334155";
          ctx.fillRect(x + 10, y + 10, 4, 4);
        }
      }
    }
    ctx.globalAlpha = 1.0;

    // 3. Draw "mountains" in background
    this.drawMountains(height * 0.7, "#0f172a", 0.5);
    this.drawMountains(height * 0.8, "#1e293b", 0.8);

    // 4. Draw some "dust particles"
    this.drawParticles();
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
    
    ctx.fillStyle = "#38bdf8";
    for (let i = 0; i < 20; i++) {
      const t = this.time + i * 10;
      const x = ((i * 137) % width + Math.sin(t * 0.5) * 50 + width) % width;
      const y = ((i * 243) % height - t * 30 + height) % height;
      const size = (i % 3) + 1;
      
      ctx.globalAlpha = 0.2 + Math.sin(t + i) * 0.1;
      ctx.fillRect(x, y, size * 2, size * 2);
    }
    ctx.globalAlpha = 1.0;
  }
}
