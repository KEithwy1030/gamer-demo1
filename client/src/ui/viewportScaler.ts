export interface ViewportScaler {
  refresh(): void;
  destroy(): void;
}

export interface ViewportScalerOptions {
  designWidth: number;
  designHeight: number;
  maxScale?: number;
}

export function attachViewportScaler(
  frame: HTMLElement,
  canvas: HTMLElement,
  options: ViewportScalerOptions
): ViewportScaler {
  const maxScale = options.maxScale ?? 1;
  let rafId = 0;

  frame.classList.add("viewport-scale-frame");
  canvas.classList.add("viewport-scale-canvas");
  canvas.style.width = `${options.designWidth}px`;
  canvas.style.minHeight = `${options.designHeight}px`;

  const sync = () => {
    rafId = 0;
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const scale = Math.min(maxScale, viewportWidth / options.designWidth, viewportHeight / options.designHeight);
    const canvasHeight = Math.max(options.designHeight, canvas.scrollHeight);
    const scaledWidth = options.designWidth * scale;
    const scaledHeight = canvasHeight * scale;
    const offsetX = Math.max(0, (viewportWidth - scaledWidth) / 2);

    frame.style.setProperty("--viewport-scale", String(scale));
    frame.style.setProperty("--viewport-offset-x", `${offsetX}px`);
    frame.style.setProperty("--viewport-canvas-width", `${options.designWidth}px`);
    frame.style.setProperty("--viewport-canvas-height", `${canvasHeight}px`);
    frame.style.width = "100vw";
    frame.style.minHeight = `${Math.max(viewportHeight, scaledHeight)}px`;
  };

  const requestSync = () => {
    if (rafId) return;
    rafId = window.requestAnimationFrame(sync);
  };

  const observer = new ResizeObserver(requestSync);
  observer.observe(canvas);
  window.addEventListener("resize", requestSync);
  window.addEventListener("orientationchange", requestSync);
  sync();

  return {
    refresh: requestSync,
    destroy() {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
      window.removeEventListener("resize", requestSync);
      window.removeEventListener("orientationchange", requestSync);
      frame.classList.remove("viewport-scale-frame");
      canvas.classList.remove("viewport-scale-canvas");
      frame.style.removeProperty("--viewport-scale");
      frame.style.removeProperty("--viewport-offset-x");
      frame.style.removeProperty("--viewport-canvas-width");
      frame.style.removeProperty("--viewport-canvas-height");
      frame.style.width = "";
      frame.style.minHeight = "";
      canvas.style.width = "";
      canvas.style.minHeight = "";
      canvas.style.transform = "";
    }
  };
}
