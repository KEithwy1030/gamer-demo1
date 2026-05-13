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
const BASE_SIZE = 148;
const KNOB_SIZE = 64;
const MAX_RADIUS = 48;
const DEAD_ZONE = 10;
const EDGE_PADDING = 18;

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
  const joystickTrack = document.createElement("div");
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
    const buttonSize = portrait ? 58 : 64;
    const attackSize = portrait ? 70 : 78;
    const utilitySize = portrait ? 44 : 48;
    const actionWidth = portrait ? 206 : 236;
    const actionHeight = portrait ? 164 : 178;
    const actionBottom = portrait ? 22 : 20;
    const joystickSize = portrait ? 138 : BASE_SIZE;
    const joystickLeft = portrait ? 22 : 36;
    const joystickBottom = portrait ? 22 : 24;

    setStyles(joystick, {
      width: `${joystickSize}px`,
      height: `${joystickSize}px`,
      left: `max(${joystickLeft}px, env(safe-area-inset-left))`,
      bottom: `max(${joystickBottom}px, env(safe-area-inset-bottom))`
    });

    setStyles(joystickBase, {
      width: `${joystickSize}px`,
      height: `${joystickSize}px`
    });

    setStyles(joystickTrack, {
      inset: `${Math.round(joystickSize * 0.16)}px`
    });

    setStyles(joystickKnob, {
      left: `${(joystickSize - KNOB_SIZE) / 2}px`,
      top: `${(joystickSize - KNOB_SIZE) / 2}px`
    });

    setStyles(actionOverlay, {
      right: `max(${EDGE_PADDING}px, env(safe-area-inset-right))`,
      bottom: `max(${actionBottom}px, env(safe-area-inset-bottom))`,
      width: `${actionWidth}px`,
      height: `${actionHeight}px`
    });

    for (const [buttonId, button] of buttons.entries()) {
      const size = buttonId === "attack"
        ? attackSize
        : buttonId === "pickup" || buttonId === "extract" || buttonId === "inventory"
          ? utilitySize
          : buttonSize;
      setStyles(button.element, {
        width: `${size}px`,
        height: `${size}px`
      });
      setStyles(button.label, {
        fontSize: buttonId === "attack" ? (portrait ? "24px" : "27px") : (portrait ? "18px" : "20px")
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
    joystick.classList.remove("is-active");
    setStyles(joystickKnob, {
      transform: "translate(0px, 0px)"
    });
  };

  const showJoystick = (touch: Touch) => {
    const rect = joystick.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    joystick.classList.add("is-active");
  };

  const isJoystickTouch = (touch: Touch) => (
    touch.clientX <= window.innerWidth * zoneRatio
    && touch.clientY >= window.innerHeight * 0.44
  );

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
    const readyColor = parts.accentColor;

    parts.label.textContent = parts.state.label ?? parts.label.textContent;
    parts.timer.textContent = parts.state.cooldownText ?? "";
    parts.timer.style.opacity = parts.timer.textContent ? "1" : "0";
    parts.element.disabled = disabled;
    parts.element.style.opacity = disabled ? "0.86" : "1";
    parts.element.style.filter = disabled ? "saturate(0.75) brightness(0.9)" : "none";
    parts.element.style.setProperty("--mobile-action-color", readyColor);
    parts.element.style.setProperty("--mobile-cooldown-angle", `${remainingAngle}deg`);
    parts.element.style.background = [
      `conic-gradient(from -90deg, rgba(6,10,16,0.78) 0deg ${remainingAngle}deg, rgba(255,255,255,0.02) ${remainingAngle}deg 360deg)`,
      "radial-gradient(circle at 36% 24%, rgba(255,255,255,0.28), rgba(255,255,255,0.04) 26%, rgba(7,13,20,0.2) 54%)",
      "linear-gradient(180deg, rgba(37,48,55,0.92), rgba(7,10,16,0.94))"
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

    const isPrimary = buttonId === "attack";
    const isUtility = buttonId === "pickup" || buttonId === "extract" || buttonId === "inventory";

    setStyles(button, {
      position: "relative",
      overflow: "hidden",
      borderRadius: "50%",
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
      boxShadow: [
        `0 0 0 ${isPrimary ? 5 : isUtility ? 2 : 3}px rgba(255,255,255,0.05)`,
        `0 0 0 ${isPrimary ? 9 : isUtility ? 5 : 6}px ${color}1c`,
        `0 12px 28px rgba(0,0,0,0.46)`,
        `inset 0 0 0 1px rgba(255,255,255,0.13)`,
        `inset 0 -10px 18px rgba(0,0,0,0.34)`
      ].join(", "),
      textShadow: `0 0 10px ${color}`,
      letterSpacing: "0",
      transition: "transform 120ms ease, opacity 120ms ease, filter 120ms ease"
    });

    button.className = [
      "mobile-action-button",
      `mobile-action-button--${buttonId}`,
      isPrimary ? "mobile-action-button--primary" : "",
      isUtility ? "mobile-action-button--utility" : ""
    ].filter(Boolean).join(" ");

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
    opacity: "0.88"
  });
  joystick.className = "mobile-joystick";

  setStyles(joystickBase, {
    width: `${BASE_SIZE}px`,
    height: `${BASE_SIZE}px`,
    borderRadius: "50%",
    background: [
      "radial-gradient(circle at 50% 50%, rgba(104,161,181,0.2) 0 30%, rgba(13,24,35,0.44) 31% 56%, rgba(5,9,16,0.12) 57%)",
      "conic-gradient(from 20deg, rgba(143,222,255,0.08), rgba(255,255,255,0.18), rgba(143,222,255,0.06), rgba(255,255,255,0.16), rgba(143,222,255,0.08))"
    ].join(", "),
    border: "2px solid rgba(157,210,225,0.38)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.1) inset, 0 18px 42px rgba(0,0,0,0.42), 0 0 34px rgba(83,162,190,0.16)"
  });
  joystickBase.className = "mobile-joystick__base";

  setStyles(joystickTrack, {
    position: "absolute",
    borderRadius: "50%",
    border: "1px solid rgba(214,238,243,0.28)",
    background: "radial-gradient(circle, rgba(163,215,229,0.08), rgba(5,10,16,0.24) 58%, rgba(5,10,16,0.02) 60%)",
    boxShadow: "inset 0 0 22px rgba(63,142,177,0.18)"
  });
  joystickTrack.className = "mobile-joystick__track";

  setStyles(joystickKnob, {
    position: "absolute",
    left: `${(BASE_SIZE - KNOB_SIZE) / 2}px`,
    top: `${(BASE_SIZE - KNOB_SIZE) / 2}px`,
    width: `${KNOB_SIZE}px`,
    height: `${KNOB_SIZE}px`,
    borderRadius: "50%",
    background: [
      "radial-gradient(circle at 34% 28%, rgba(255,255,255,0.72), rgba(182,224,232,0.78) 28%, rgba(56,92,116,0.86) 64%, rgba(12,18,27,0.96))",
      "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(0,0,0,0.18))"
    ].join(", "),
    border: "2px solid rgba(220,247,255,0.56)",
    boxShadow: "0 0 0 6px rgba(155,218,232,0.08), 0 0 28px rgba(101,199,229,0.44), 0 12px 24px rgba(0,0,0,0.4)",
    pointerEvents: "none"
  });
  joystickKnob.className = "mobile-joystick__knob";

  setStyles(actionOverlay, {
    position: "fixed",
    display: "block",
    pointerEvents: "auto",
    background: "radial-gradient(ellipse at 68% 62%, rgba(8,13,20,0.52), rgba(8,13,20,0.08) 58%, transparent 72%)"
  });
  actionOverlay.className = "mobile-action-cluster";

  joystick.append(joystickBase, joystickTrack, joystickKnob);
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
