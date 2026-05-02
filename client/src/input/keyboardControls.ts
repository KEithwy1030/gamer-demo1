import Phaser from "phaser";

export interface Vector2 {
  x: number;
  y: number;
}

export interface KeyboardActionHandlers {
  onAttack?(): void;
  onSkill?(slotIndex: number): void;
  onPickup?(): void;
  onExtract?(): void;
  onInventory?(): void;
}

export interface KeyboardControlsApi {
  destroy(): void;
  getVector(): Vector2;
  consumeActions(handlers: KeyboardActionHandlers): void;
}

function readAxis(
  positivePrimary: Phaser.Input.Keyboard.Key,
  positiveAlt: Phaser.Input.Keyboard.Key,
  negativePrimary: Phaser.Input.Keyboard.Key,
  negativeAlt: Phaser.Input.Keyboard.Key
): number {
  return Number(positivePrimary.isDown || positiveAlt.isDown) - Number(negativePrimary.isDown || negativeAlt.isDown);
}

export function createKeyboardControls(
  keyboard: Phaser.Input.Keyboard.KeyboardPlugin
): KeyboardControlsApi {
  const keys = keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,Q,R,E,F,I,B,T,TAB") as Record<
    "W" | "A" | "S" | "D" | "UP" | "DOWN" | "LEFT" | "RIGHT" | "SPACE" | "Q" | "R" | "E" | "F" | "I" | "B" | "T" | "TAB",
    Phaser.Input.Keyboard.Key
  >;

  return {
    destroy() {
      // Phaser owns the key instances. We only keep lightweight references.
    },
    getVector() {
      return {
        x: readAxis(keys.D, keys.RIGHT, keys.A, keys.LEFT),
        y: readAxis(keys.S, keys.DOWN, keys.W, keys.UP)
      };
    },
    consumeActions(handlers) {
      if (Phaser.Input.Keyboard.JustDown(keys.SPACE)) {
        handlers.onAttack?.();
      }

      if (Phaser.Input.Keyboard.JustDown(keys.Q)) {
        handlers.onSkill?.(0);
      }

      if (Phaser.Input.Keyboard.JustDown(keys.R)) {
        handlers.onSkill?.(1);
      }

      if (Phaser.Input.Keyboard.JustDown(keys.T)) {
        handlers.onSkill?.(2);
      }

      if (Phaser.Input.Keyboard.JustDown(keys.E)) {
        handlers.onPickup?.();
      }

      if (Phaser.Input.Keyboard.JustDown(keys.F)) {
        handlers.onExtract?.();
      }

      if (
        Phaser.Input.Keyboard.JustDown(keys.I)
        || Phaser.Input.Keyboard.JustDown(keys.B)
        || Phaser.Input.Keyboard.JustDown(keys.TAB)
      ) {
        handlers.onInventory?.();
      }
    }
  };
}
