export interface Vector2 {
  x: number;
  y: number;
}

export const MOBILE_ACTION_BUTTONS = [
  "attack",
  "skill0",
  "skill1",
  "skill2",
  "dodge",
  "pickup",
  "extract",
  "inventory"
] as const;

export type MobileActionButtonId = (typeof MOBILE_ACTION_BUTTONS)[number];

export interface MobileButtonState {
  label?: string;
  cooldownRatio?: number;
  cooldownText?: string;
  disabled?: boolean;
}

export interface MobileControlsOptions {
  root?: HTMLElement;
  speedScale?: number;
  zoneRatio?: number;
  onMove?(vector: Vector2): void;
  onAttack?(): void;
  onSkill?(slotIndex: number): void;
  onDodge?(): void;
  onPickup?(): void;
  onExtract?(): void;
  onInventory?(): void;
}

export interface MobileControlsApi {
  destroy(): void;
  getVector(): Vector2;
  setButtonState(buttonId: MobileActionButtonId, state: MobileButtonState): void;
}

const DEFAULT_ZONE_RATIO = 0.55;
const BASE_SIZE = 120;
const KNOB_SIZE = 50;
const MAX_RADIUS = 35;
const DEAD_ZONE = 8;
const EDGE_PADDING = 16;

function isPortraitViewport(): boolean {
  return window.innerHeight >= window.innerWidth;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

function shouldIgnoreTouchTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      ".inventory-panel, .inventory-mobile-toggle, .inventory-tooltip, .inventory-panel__toggle, button, input, textarea, select"
    )
  );
}

export function supportsTouchInput(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  return navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
}

type ButtonParts = {
  element: HTMLButtonElement;
  label: HTMLSpanElement;
  timer: HTMLSpanElement;
  accentColor: string;
  state: MobileButtonState;
};

export function createMobileControls(options: MobileControlsOptions): MobileControlsApi | null {
  if (!supportsTouchInput()) {
    return null;
  }

  const root = options.root ?? document.body;
  const shell = document.createElement("div");
  const joystick = document.createElement("div");
  const joystickBase = document.createElement("div");
  const joystickKnob = document.createElement("div");
  const actionOverlay = document.createElement("div");

  let activeTouchId: number | null = null;
  let centerX = 0;
  let centerY = 0;
  let currentVector: Vector2 = { x: 0, y: 0 };

  const zoneRatio = options.zoneRatio ?? DEFAULT_ZONE_RATIO;
  const speedScale = options.speedScale ?? 1;
  const buttons = new Map<MobileActionButtonId, ButtonParts>();

  const updateLayout = () => {
    const portrait = isPortraitViewport();
    const buttonSize = portrait ? 54 : 58;
    const gap = portrait ? 7 : 8;

    setStyles(actionOverlay, {
      right: `max(${EDGE_PADDING}px, env(safe-area-inset-right))`,
      bottom: `max(${EDGE_PADDING}px, env(safe-area-inset-bottom))`,
      gap: `${gap}px`,
      gridTemplateColumns: `repeat(4, ${buttonSize}px)`,
      padding: "8px"
    });

    for (const button of buttons.values()) {
      setStyles(button.element, {
        width: `${buttonSize}px`,
        height: `${buttonSize}px`
      });
      setStyles(button.label, {
        fontSize: portrait ? "18px" : "20px"
      });
      setStyles(button.timer, {
        fontSize: portrait ? "11px" : "12px"
      });
    }
  };

  const emitVector = (nextVector: Vector2) => {
    currentVector = nextVector;
    options.onMove?.(nextVector);
  };

  const resetJoystick = () => {
    activeTouchId = null;
    emitVector({ x: 0, y: 0 });
    setStyles(joystick, {
      opacity: "0",
      visibility: "hidden"
    });
    setStyles(joystickKnob, {
      transform: "translate(0px, 0px)"
    });
  };

  const showJoystick = (touch: Touch) => {
    const zoneMaxX = window.innerWidth * zoneRatio - BASE_SIZE / 2 - EDGE_PADDING;
    centerX = clamp(
      touch.clientX,
      BASE_SIZE / 2 + EDGE_PADDING,
      Math.max(BASE_SIZE / 2 + EDGE_PADDING, zoneMaxX)
    );
    centerY = clamp(
      touch.clientY,
      BASE_SIZE / 2 + EDGE_PADDING,
      window.innerHeight - BASE_SIZE / 2 - EDGE_PADDING
    );

    setStyles(joystick, {
      transform: `translate(${Math.round(centerX - BASE_SIZE / 2)}px, ${Math.round(centerY - BASE_SIZE / 2)}px)`,
      opacity: "1",
      visibility: "visible"
    });
  };

  const isJoystickTouch = (touch: Touch) => touch.clientX <= window.innerWidth * zoneRatio;

  const handleTouchStart = (event: TouchEvent) => {
    if (activeTouchId !== null) {
      return;
    }

    for (const touch of Array.from(event.changedTouches)) {
      if (shouldIgnoreTouchTarget(touch.target)) {
        continue;
      }

      if (!isJoystickTouch(touch)) {
        continue;
      }

      activeTouchId = touch.identifier;
      showJoystick(touch);
      event.preventDefault();
      break;
    }
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (activeTouchId === null) {
      return;
    }

    const touch = Array.from(event.changedTouches).find((item) => item.identifier === activeTouchId);
    if (!touch) {
      return;
    }

    event.preventDefault();
    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    const clampedDistance = Math.min(distance, MAX_RADIUS);
    const angle = distance > 0 ? Math.atan2(dy, dx) : 0;
    const knobX = Math.cos(angle) * clampedDistance;
    const knobY = Math.sin(angle) * clampedDistance;
    const magnitude = distance >= DEAD_ZONE ? speedScale : 0;

    setStyles(joystickKnob, {
      transform: `translate(${knobX}px, ${knobY}px)`
    });

    emitVector({
      x: distance > 0 ? Math.cos(angle) * magnitude : 0,
      y: distance > 0 ? Math.sin(angle) * magnitude : 0
    });
  };

  const handleTouchEnd = (event: TouchEvent) => {
    if (activeTouchId === null) {
      return;
    }

    if (Array.from(event.changedTouches).some((touch) => touch.identifier === activeTouchId)) {
      event.preventDefault();
      resetJoystick();
    }
  };

  function applyButtonState(parts: ButtonParts): void {
    const remainingRatio = clamp(parts.state.cooldownRatio ?? 0, 0, 1);
    const disabled = parts.state.disabled === true || remainingRatio > 0;
    const remainingAngle = Math.round(remainingRatio * 360);

    parts.label.textContent = parts.state.label ?? parts.label.textContent;
    parts.timer.textContent = parts.state.cooldownText ?? "";
    parts.timer.style.opacity = parts.timer.textContent ? "1" : "0";
    parts.element.disabled = disabled;
    parts.element.style.opacity = disabled ? "0.92" : "1";
    parts.element.style.filter = disabled ? "saturate(0.82)" : "none";
    parts.element.style.background = [
      `conic-gradient(from -90deg, rgba(0,0,0,0.58) 0deg ${remainingAngle}deg, rgba(255,255,255,0.04) ${remainingAngle}deg 360deg)`,
      "linear-gradient(180deg, rgba(43,37,25,0.96), rgba(14,11,8,0.94))"
    ].join(", ");
  }

  function createActionButton(
    buttonId: MobileActionButtonId,
    label: string,
    color: string,
    onPress: () => void
  ): HTMLButtonElement {
    const button = document.createElement("button");
    const labelEl = document.createElement("span");
    const timerEl = document.createElement("span");

    button.type = "button";
    button.setAttribute("data-button-id", buttonId);

    setStyles(button, {
      position: "relative",
      overflow: "hidden",
      borderRadius: "8px",
      border: `2px solid ${color}`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      color: color,
      fontWeight: "700",
      fontFamily: '"Noto Serif SC", "Noto Sans SC", serif',
      userSelect: "none",
      webkitUserSelect: "none",
      touchAction: "manipulation",
      boxShadow: `inset 0 0 0 1px rgba(232,223,200,0.1), 0 10px 20px rgba(0,0,0,0.34), 0 0 18px ${color}33`,
      textShadow: `0 0 10px ${color}`,
      letterSpacing: "0.08em",
      transition: "transform 120ms ease, opacity 120ms ease, filter 120ms ease"
    });

    setStyles(labelEl, {
      position: "relative",
      zIndex: "1"
    });
    labelEl.textContent = label;

    setStyles(timerEl, {
      position: "relative",
      zIndex: "1",
      marginTop: "2px",
      minHeight: "12px",
      color: "rgba(255,255,255,0.92)",
      opacity: "0"
    });

    const pressStart = (event: Event) => {
      event.preventDefault();
      const parts = buttons.get(buttonId);
      if (!parts || parts.element.disabled) {
        return;
      }
      button.style.transform = "translateY(1px) scale(0.98)";
      onPress();
    };

    const pressEnd = () => {
      button.style.transform = "translateY(0) scale(1)";
    };

    button.addEventListener("touchstart", pressStart, { passive: false });
    button.addEventListener("touchend", pressEnd, { passive: false });
    button.addEventListener("touchcancel", pressEnd, { passive: false });
    button.addEventListener("mousedown", pressStart);
    button.addEventListener("mouseup", pressEnd);
    button.addEventListener("mouseleave", pressEnd);

    button.append(labelEl, timerEl);
    buttons.set(buttonId, {
      element: button,
      label: labelEl,
      timer: timerEl,
      accentColor: color,
      state: { label }
    });
    applyButtonState(buttons.get(buttonId)!);
    return button;
  }

  setStyles(shell, {
    position: "fixed",
    inset: "0",
    zIndex: "3000",
    pointerEvents: "none"
  });

  setStyles(joystick, {
    position: "fixed",
    width: `${BASE_SIZE}px`,
    height: `${BASE_SIZE}px`,
    pointerEvents: "none",
    opacity: "0",
    visibility: "hidden"
  });

  setStyles(joystickBase, {
    width: `${BASE_SIZE}px`,
    height: `${BASE_SIZE}px`,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(232,96,44,0.16), rgba(14,11,8,0.44) 58%, rgba(14,11,8,0.1))",
    border: "2px solid rgba(232,96,44,0.38)",
    boxShadow: "0 0 0 1px rgba(232,223,200,0.1) inset, 0 12px 34px rgba(0,0,0,0.32)"
  });

  setStyles(joystickKnob, {
    position: "absolute",
    left: `${(BASE_SIZE - KNOB_SIZE) / 2}px`,
    top: `${(BASE_SIZE - KNOB_SIZE) / 2}px`,
    width: `${KNOB_SIZE}px`,
    height: `${KNOB_SIZE}px`,
    borderRadius: "50%",
    background: "rgba(232,223,200,0.68)",
    boxShadow: "0 0 18px rgba(232,96,44,0.45)",
    pointerEvents: "none"
  });

  setStyles(actionOverlay, {
    position: "fixed",
    display: "grid",
    pointerEvents: "auto",
    background: "linear-gradient(180deg, rgba(22,19,15,0.78), rgba(14,11,8,0.9))",
    border: "1px solid rgba(232,96,44,0.34)",
    borderRadius: "8px",
    boxShadow: "0 18px 42px rgba(0,0,0,0.42)"
  });

  joystick.append(joystickBase, joystickKnob);
  actionOverlay.append(
    createActionButton("attack", "攻", "#ef4444", () => options.onAttack?.()),
    createActionButton("skill0", "一", "#38bdf8", () => options.onSkill?.(0)),
    createActionButton("skill1", "二", "#60a5fa", () => options.onSkill?.(1)),
    createActionButton("skill2", "三", "#a78bfa", () => options.onSkill?.(2)),
    createActionButton("dodge", "闪", "#f97316", () => options.onDodge?.()),
    createActionButton("pickup", "取", "#4ade80", () => options.onPickup?.()),
    createActionButton("extract", "撤", "#facc15", () => options.onExtract?.()),
    createActionButton("inventory", "包", "#fbbf24", () => options.onInventory?.())
  );
  shell.append(joystick, actionOverlay);
  root.appendChild(shell);

  updateLayout();

  window.addEventListener("resize", updateLayout);
  window.addEventListener("orientationchange", updateLayout);
  document.addEventListener("touchstart", handleTouchStart, { passive: false });
  document.addEventListener("touchmove", handleTouchMove, { passive: false });
  document.addEventListener("touchend", handleTouchEnd, { passive: false });
  document.addEventListener("touchcancel", handleTouchEnd, { passive: false });

  return {
    destroy() {
      resetJoystick();
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("orientationchange", updateLayout);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
      shell.remove();
    },
    getVector() {
      return currentVector;
    },
    setButtonState(buttonId: MobileActionButtonId, state: MobileButtonState) {
      const parts = buttons.get(buttonId);
      if (!parts) {
        return;
      }
      parts.state = { ...parts.state, ...state };
      applyButtonState(parts);
    }
  };
}
