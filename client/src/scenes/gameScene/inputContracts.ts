export interface PrimaryPointerAttackLike {
  button?: number;
  wasTouch?: boolean;
  event?: {
    button?: number;
    ctrlKey?: boolean;
  };
  leftButtonDown?: () => boolean;
}

export function isPrimaryPointerAttack(pointer: PrimaryPointerAttackLike): boolean {
  if (pointer.wasTouch) {
    return false;
  }

  if (pointer.event?.ctrlKey) {
    return false;
  }

  const button = pointer.event?.button ?? pointer.button;
  if (button != null) {
    return button === 0;
  }

  return pointer.leftButtonDown?.() === true;
}
