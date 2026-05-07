import Phaser from "phaser";
import type { MatchViewState } from "../../game";
import type { MonsterMarker } from "../../game/entities/MonsterMarker";
import type { PlayerMarker } from "../../game/entities/PlayerMarker";
import type { ChaseAssistState, ChaseAssistStepResult } from "./lockAssist";

const LOCK_RING_RADIUS = 22;
const LOCK_RING_ALPHA = 0.9;
const LOCK_LABEL_OFFSET_Y = -42;
const TOAST_DEDUPE_WINDOW_MS = 850;

export type LockAssistToastTone = "info" | "warn";

export interface LockAssistToastEvent {
  key: string;
  text: string;
  tone: LockAssistToastTone;
  visibleMs?: number;
}

export interface LockAssistFeedbackSnapshot {
  chaseAssist?: ChaseAssistState;
  queuedAttackTargetId?: string;
}

export class LockAssistFeedbackController {
  private readonly scene: Phaser.Scene;
  private ring?: Phaser.GameObjects.Graphics;
  private label?: Phaser.GameObjects.Text;
  private activeTargetId?: string;
  private activeTargetKind?: "player" | "monster";
  private activeReason?: string;
  private lastToastKey?: string;
  private lastToastAt = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  sync(params: {
    state: MatchViewState | null;
    chaseAssist?: ChaseAssistState;
    queuedAttackTargetId?: string;
    playerMarkers: Map<string, PlayerMarker>;
    monsterMarkers: Map<string, MonsterMarker>;
  }): void {
    const { state, chaseAssist, queuedAttackTargetId, playerMarkers, monsterMarkers } = params;
    if (!state || !chaseAssist) {
      this.hideTarget();
      return;
    }

    const targetId = chaseAssist.targetId;
    const targetKind = chaseAssist.targetKind;
    const marker = targetKind === "player" ? playerMarkers.get(targetId) : monsterMarkers.get(targetId);
    const target = findLockAssistTarget(state, targetId, targetKind);

    if (!marker || !target?.isAlive) {
      this.hideTarget();
      return;
    }

    if (!this.ring) {
      this.ring = this.scene.add.graphics().setDepth(9990);
    }
    if (!this.label) {
      this.label = this.scene.add.text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        fontStyle: "bold",
        color: "#f8e7b2",
        stroke: "#120d0a",
        strokeThickness: 3
      })
        .setOrigin(0.5, 1)
        .setDepth(9991);
    }

    this.activeTargetId = targetId;
    this.activeTargetKind = targetKind;
    const root = marker.root;
    const pulse = 1 + Math.sin(this.scene.time.now / 95) * 0.08;
    const label = queuedAttackTargetId === targetId ? "锁定追击" : "锁定目标";

    this.ring.clear();
    this.ring.lineStyle(2, targetKind === "player" ? 0x7fd3ff : 0xf7c35c, LOCK_RING_ALPHA);
    this.ring.strokeCircle(root.x, root.y + 16, LOCK_RING_RADIUS * pulse);
    this.ring.lineStyle(1, 0x1a120d, 0.7);
    this.ring.strokeCircle(root.x, root.y + 16, (LOCK_RING_RADIUS - 5) * pulse);

    this.label
      .setText(label)
      .setPosition(root.x, root.y + LOCK_LABEL_OFFSET_Y)
      .setVisible(true)
      .setAlpha(0.95);
  }

  handleStepResult(params: {
    result: ChaseAssistStepResult;
    before: LockAssistFeedbackSnapshot;
    after: LockAssistFeedbackSnapshot;
  }): LockAssistToastEvent | null {
    const event = mapLockAssistFeedbackEvent(params, {
      activeTargetId: this.activeTargetId,
      activeReason: this.activeReason
    });
    if (params.after.chaseAssist) {
      this.activeTargetId = params.after.chaseAssist.targetId;
    }
    if (event) {
      this.activeReason = params.result.reason;
    }
    return event ? this.emitToastOnce(event) : null;
  }

  destroy(): void {
    this.ring?.destroy();
    this.ring = undefined;
    this.label?.destroy();
    this.label = undefined;
    this.activeTargetId = undefined;
    this.activeTargetKind = undefined;
    this.activeReason = undefined;
  }

  private emitToastOnce(event: LockAssistToastEvent): LockAssistToastEvent | null {
    const now = Date.now();
    if (this.lastToastKey === event.key && now - this.lastToastAt < TOAST_DEDUPE_WINDOW_MS) {
      return null;
    }
    this.lastToastKey = event.key;
    this.lastToastAt = now;
    return event;
  }

  private hideTarget(): void {
    this.ring?.clear();
    this.label?.setVisible(false);
    this.activeTargetId = undefined;
    this.activeTargetKind = undefined;
  }
}

export function mapLockAssistFeedbackEvent(params: {
  result: ChaseAssistStepResult;
  before: LockAssistFeedbackSnapshot;
  after: LockAssistFeedbackSnapshot;
}, context?: {
  activeTargetId?: string;
  activeReason?: string;
}): LockAssistToastEvent | null {
  const { result, before, after } = params;

  if (after.chaseAssist && after.chaseAssist.targetId !== context?.activeTargetId) {
    context = { ...context, activeReason: undefined };
  }

  if (after.chaseAssist && result.kind === "continue") {
    return {
      key: `continue:${after.chaseAssist.targetId}`,
      text: "锁定追击中",
      tone: "info"
    };
  }

  if (!before.chaseAssist || result.reason === context?.activeReason) {
    return null;
  }

  switch (result.reason) {
    case "retreat-input":
      return { key: "cancel:retreat-input", text: "锁定取消：后撤", tone: "warn", visibleMs: 1700 };
    case "manual-input":
      return { key: "cancel:manual-input", text: "锁定取消：手动接管", tone: "warn", visibleMs: 1700 };
    case "target-lost":
      return { key: "clear:target-lost", text: "目标丢失", tone: "warn" };
    case "target-dead":
      return { key: "clear:target-dead", text: "目标已倒下", tone: "info" };
    case "target-out-of-range":
      return { key: "clear:target-out-of-range", text: "目标脱离追击", tone: "warn" };
    case "expired":
      return { key: "clear:expired", text: "锁定结束", tone: "info" };
    case "entered-range":
      return { key: "attack:entered-range", text: "进入攻击距离", tone: "info" };
    default:
      return null;
  }
}

function findLockAssistTarget(
  state: MatchViewState,
  targetId: string,
  targetKind: "player" | "monster"
): { id: string; isAlive: boolean } | undefined {
  if (targetKind === "player") {
    return state.players.find((player) => player.id === targetId);
  }
  return state.monsters.find((monster) => monster.id === targetId);
}
