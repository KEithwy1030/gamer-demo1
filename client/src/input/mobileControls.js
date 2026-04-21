const DEFAULT_ZONE_RATIO = 0.55;
const BASE_SIZE = 120;
const KNOB_SIZE = 50;
const MAX_RADIUS = 35;
const DEAD_ZONE = 8;
const EDGE_PADDING = 16;

function isPortraitViewport() {
    return window.innerHeight >= window.innerWidth;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function setStyles(element, styles) {
    Object.assign(element.style, styles);
}
function shouldIgnoreTouchTarget(target) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    return Boolean(target.closest(".inventory-panel, .inventory-mobile-toggle, .inventory-tooltip, .inventory-panel__toggle, button, input, textarea, select"));
}

export function supportsTouchInput() {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
        return false;
    }
    return navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
}

export function createMobileControls(options) {
    if (!supportsTouchInput()) {
        return null;
    }
    const root = options.root ?? document.body;
    const shell = document.createElement("div");
    const joystick = document.createElement("div");
    const joystickBase = document.createElement("div");
    const joystickKnob = document.createElement("div");
    const actionOverlay = document.createElement("div");
    let activeTouchId = null;
    let centerX = 0;
    let centerY = 0;
    let currentVector = { x: 0, y: 0 };
    const zoneRatio = options.zoneRatio ?? DEFAULT_ZONE_RATIO;
    const speedScale = options.speedScale ?? 1;
    const updateLayout = () => {
        const portrait = isPortraitViewport();
        const buttonSize = portrait ? 64 : 70;
        const gap = portrait ? 10 : 8;
        setStyles(actionOverlay, {
            right: `${EDGE_PADDING}px`,
            bottom: `${EDGE_PADDING}px`,
            gap: `${gap}px`,
            gridTemplateColumns: `repeat(2, ${buttonSize}px)`
        });
        for (const button of actionOverlay.children) {
            setStyles(button, {
                width: `${buttonSize}px`,
                height: `${buttonSize}px`,
                fontSize: portrait ? "20px" : "22px"
            });
        }
    };
    const emitVector = (nextVector) => {
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
    const showJoystick = (touch) => {
        const zoneMaxX = window.innerWidth * zoneRatio - BASE_SIZE / 2 - EDGE_PADDING;
        centerX = clamp(touch.clientX, BASE_SIZE / 2 + EDGE_PADDING, Math.max(BASE_SIZE / 2 + EDGE_PADDING, zoneMaxX));
        centerY = clamp(touch.clientY, BASE_SIZE / 2 + EDGE_PADDING, window.innerHeight - BASE_SIZE / 2 - EDGE_PADDING);
        setStyles(joystick, {
            transform: `translate(${Math.round(centerX - BASE_SIZE / 2)}px, ${Math.round(centerY - BASE_SIZE / 2)}px)`,
            opacity: "1",
            visibility: "visible"
        });
    };
    const isJoystickTouch = (touch) => {
        return touch.clientX <= window.innerWidth * zoneRatio;
    };
    const handleTouchStart = (event) => {
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
    const handleTouchMove = (event) => {
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
    const handleTouchEnd = (event) => {
        if (activeTouchId === null) {
            return;
        }
        if (Array.from(event.changedTouches).some((touch) => touch.identifier === activeTouchId)) {
            event.preventDefault();
            resetJoystick();
        }
    };
    const createActionButton = (label, color, onPress) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        setStyles(button, {
            borderRadius: "999px",
            background: "rgba(15,23,42,0.88)",
            border: `3px solid ${color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            fontWeight: "700",
            fontFamily: "monospace",
            userSelect: "none",
            WebkitUserSelect: "none",
            touchAction: "manipulation"
        });
        const pressStart = (event) => {
            event.preventDefault();
            button.style.opacity = "0.72";
            onPress();
        };
        const pressEnd = () => {
            button.style.opacity = "1";
        };
        button.addEventListener("touchstart", pressStart, { passive: false });
        button.addEventListener("touchend", pressEnd, { passive: false });
        button.addEventListener("touchcancel", pressEnd, { passive: false });
        button.addEventListener("mousedown", pressStart);
        button.addEventListener("mouseup", pressEnd);
        button.addEventListener("mouseleave", pressEnd);
        return button;
    };
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
        background: "rgba(255,255,255,0.15)",
        border: "2px solid rgba(255,255,255,0.4)",
        boxShadow: "0 0 0 1px rgba(15,23,42,0.25) inset"
    });
    setStyles(joystickKnob, {
        position: "absolute",
        left: `${(BASE_SIZE - KNOB_SIZE) / 2}px`,
        top: `${(BASE_SIZE - KNOB_SIZE) / 2}px`,
        width: `${KNOB_SIZE}px`,
        height: `${KNOB_SIZE}px`,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.55)",
        pointerEvents: "none"
    });
    setStyles(actionOverlay, {
        position: "fixed",
        display: "grid",
        pointerEvents: "auto"
    });
    joystick.append(joystickBase, joystickKnob);
    actionOverlay.append(createActionButton("\u653b", "#ef4444", () => options.onAttack?.()), createActionButton("\u6280", "#38bdf8", () => options.onSkill?.()), createActionButton("\u53d6", "#4ade80", () => options.onPickup?.()), createActionButton("\u5305", "#fbbf24", () => options.onInventory?.()));
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
        }
    };
}
