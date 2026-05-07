import type { Vector2 } from "@gamer/shared";
import Phaser from "phaser";
import {
  createKeyboardControls,
  type KeyboardControlsApi
} from "../../input/keyboardControls";
import {
  createMobileControls,
  type MobileControlsApi
} from "../../input/mobileControls";
import { isPrimaryPointerAttack } from "./inputContracts";

export function shouldUseTouchLayout(): boolean {
  const finePointer = window.matchMedia?.("(pointer: fine)").matches ?? false;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarsePointer || (navigator.maxTouchPoints > 0 && !finePointer);
}

export interface GameSceneInputBridgeOptions {
  touchLayout: boolean;
  onMoveInput?: (direction: Vector2) => void;
  onAttack: () => void;
  onSkill: (slotIndex: number) => void;
  onDodge: () => void;
  onPickup: () => void;
  onExtract: () => void;
  onInventory: () => void;
}

export class GameSceneInputBridge {
  private readonly scene: Phaser.Scene;
  private readonly options: GameSceneInputBridgeOptions;
  private keyboardControls?: KeyboardControlsApi | null;
  private mobileControls?: MobileControlsApi | null;
  private joystickVector: Vector2 = { x: 0, y: 0 };
  private lastMoveDirection: Vector2 = { x: 0, y: 0 };
  private lastFacingDirection: Vector2 = { x: 0, y: 1 };
  private lastMoveSentAt = 0;
  private currentMoveDirection: Vector2 = { x: 0, y: 0 };
  private currentManualMoveDirection: Vector2 = { x: 0, y: 0 };
  private facingLockDirection?: Vector2;
  private assistMoveOverride?: Vector2;
  private readonly handlePrimaryPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (isPrimaryPointerAttack(pointer)) {
      this.options.onAttack();
    }
  };

  constructor(scene: Phaser.Scene, options: GameSceneInputBridgeOptions) {
    this.scene = scene;
    this.options = options;
  }

  mount(): void {
    const keyboard = this.scene.input.keyboard;
    if (keyboard) {
      this.keyboardControls = createKeyboardControls(keyboard);
    }

    if (!this.options.touchLayout) {
      this.mobileControls?.destroy();
      this.mobileControls = undefined;
      this.scene.input.on("pointerdown", this.handlePrimaryPointerDown);
      return;
    }

    this.mobileControls?.destroy();
    this.mobileControls = createMobileControls({
      root: document.body,
      speedScale: 0.5,
      onMove: (vector) => {
        this.joystickVector = vector;
      },
      onAttack: this.options.onAttack,
      onSkill: () => this.options.onSkill(0),
      onPickup: this.options.onPickup,
      onInventory: this.options.onInventory
    });
  }

  update(time: number): void {
    this.emitMoveInput(time);
    this.emitActionInput();
  }

  destroy(): void {
    this.scene.input.off("pointerdown", this.handlePrimaryPointerDown);
    this.keyboardControls?.destroy();
    this.keyboardControls = undefined;
    this.mobileControls?.destroy();
    this.mobileControls = undefined;
    this.joystickVector = { x: 0, y: 0 };
  }

  getLastFacingDirection(): Vector2 {
    return this.lastFacingDirection;
  }

  getCurrentMoveDirection(): Vector2 {
    return this.currentMoveDirection;
  }

  getCurrentManualMoveDirection(): Vector2 {
    return this.currentManualMoveDirection;
  }

  setAssistMoveOverride(direction?: Vector2): void {
    if (!direction) {
      this.assistMoveOverride = undefined;
      return;
    }

    const magnitude = Math.hypot(direction.x, direction.y);
    if (magnitude <= 0.001) {
      this.assistMoveOverride = undefined;
      return;
    }

    this.assistMoveOverride = {
      x: direction.x / magnitude,
      y: direction.y / magnitude
    };
  }

  setFacingLockDirection(direction?: Vector2): void {
    if (!direction) {
      this.facingLockDirection = undefined;
      return;
    }

    const magnitude = Math.hypot(direction.x, direction.y);
    if (magnitude <= 0.001) {
      this.facingLockDirection = undefined;
      return;
    }

    this.facingLockDirection = { x: direction.x / magnitude, y: direction.y / magnitude };
  }

  private emitMoveInput(time: number): void {
    if (!this.options.onMoveInput) return;

    let horizontal = 0;
    let vertical = 0;
    const keyboardVector = this.keyboardControls?.getVector();
    if (keyboardVector) {
      horizontal = keyboardVector.x;
      vertical = keyboardVector.y;
    }

    if (this.joystickVector.x !== 0 || this.joystickVector.y !== 0) {
      horizontal = this.joystickVector.x;
      vertical = this.joystickVector.y;
    }

    let direction: Vector2 = { x: horizontal, y: vertical };
    const isJoystickActive = this.joystickVector.x !== 0 || this.joystickVector.y !== 0;
    if (isJoystickActive) {
      direction = { x: this.joystickVector.x, y: this.joystickVector.y };
    }

    this.currentManualMoveDirection = direction;

    if (
      this.assistMoveOverride
      && Math.abs(direction.x) < 0.001
      && Math.abs(direction.y) < 0.001
    ) {
      direction = { ...this.assistMoveOverride };
    }

    this.currentMoveDirection = direction;
    const magnitude = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
    if (magnitude > 0 && !this.facingLockDirection) {
      this.lastFacingDirection = { x: direction.x / magnitude, y: direction.y / magnitude };
    } else if (this.facingLockDirection) {
      this.lastFacingDirection = { ...this.facingLockDirection };
    }

    if (
      Math.abs(direction.x - this.lastMoveDirection.x) < 0.01
      && Math.abs(direction.y - this.lastMoveDirection.y) < 0.01
      && time - this.lastMoveSentAt < 60
    ) {
      return;
    }

    this.lastMoveDirection = direction;
    this.lastMoveSentAt = time;
    this.options.onMoveInput(direction);
  }

  private emitActionInput(): void {
    this.keyboardControls?.consumeActions({
      onAttack: this.options.onAttack,
      onSkill: this.options.onSkill,
      onDodge: this.options.onDodge,
      onPickup: this.options.onPickup,
      onExtract: this.options.onExtract,
      onInventory: this.options.onInventory
    });
  }
}
