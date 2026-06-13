import Phaser from "phaser";
import { type PlayerState, type StatusEffectState, type WeaponType } from "@gamer/shared";
import { logEvent } from "../../dev/runtimeLog";

export type AnimationState = "IDLE" | "MOVE" | "ATTACK" | "HURT" | "DIE";
type DirectionKey = "down" | "left" | "right" | "up";
type ActionKey = "attack" | "skill" | "dodge" | "hurt";

// 焊接动作图（人+武器一体）。每把武器一张 3x2 图，帧序固定：
const FRAME = { idle: 0, walkA: 1, walkB: 2, windup: 3, strike: 4, hurt: 5 } as const;

const BODY_DISPLAY = 150;
const BODY_BASE_Y = 20;        // 身体中心 y（脚落在接地影上）
const PLAYER_HP_Y = -78;
const PLAYER_NAME_Y = -92;
const STATUS_BADGE_Y = -61;
const STATUS_BADGE_SPACING = 27;
const MAX_STATUS_BADGES = 4;

/**
 * 焊接式玩家渲染（2026-06-13 owner 拍板，推翻分层）：每把武器一张完整动作图
 * （站/走/挥砍/受击都把剑画在身上），人和武器天然同步、零脱节、单层调试。
 * 帧动画由生成图驱动 + 引擎走路颠动/攻击前冲补足。朝向用左右翻转。
 * 加新武器 = 多生成一张同布局动作图 + 一行 weaponSheetKey，不动代码动画逻辑。
 */
export class PlayerMarker {
  readonly id: string;
  readonly root: Phaser.GameObjects.Container;

  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly hpTrack: Phaser.GameObjects.Rectangle;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly nameplate: Phaser.GameObjects.Text;
  private readonly statusBadges: Phaser.GameObjects.Text[] = [];
  private targetX: number;
  private targetY: number;
  private currentState: AnimationState = "IDLE";
  private facing: DirectionKey = "down";
  private weaponType: WeaponType;
  private actionLockedUntil = 0;
  private walkPhase = 0;
  private lastHp = 0;
  private lastNameplateText = "";
  private lastNameplateColor = "";
  private lastAliveAlpha = -1;
  private lastRootAlpha = -1;
  private lastHpWidth = -1;
  private lastHpColor = -1;

  constructor(scene: Phaser.Scene, player: PlayerState, isSelf: boolean) {
    this.id = player.id;
    this.targetX = player.x;
    this.targetY = player.y;
    this.lastHp = player.hp;
    this.weaponType = player.weaponType;
    this.facing = directionToKey(player.direction);

    this.shadow = scene.add.graphics();
    this.shadow.fillStyle(0x0a0805, 0.3);
    this.shadow.fillEllipse(6, 40, 84, 24);
    if (isSelf) {
      this.shadow.fillStyle(0xe8602c, 0.2);
      this.shadow.fillEllipse(0, 40, 58, 17);
    } else if (player.isBot) {
      this.shadow.fillStyle(0xb8371f, 0.16);
      this.shadow.fillEllipse(0, 40, 54, 16);
    } else {
      this.shadow.fillStyle(0x7fb4c2, 0.15);
      this.shadow.fillEllipse(0, 40, 54, 16);
    }
    this.shadow.fillStyle(0x0e0b08, 0.34);
    this.shadow.fillEllipse(0, 40, 40, 12);

    this.body = scene.add.sprite(0, BODY_BASE_Y, weaponSheetKey(player.weaponType), FRAME.idle);
    this.body.setOrigin(0.5, 0.86);
    this.body.setDisplaySize(BODY_DISPLAY, BODY_DISPLAY);
    if (player.isBot) {
      this.body.setTint(resolveSquadTint(player.squadId));
    } else if (!isSelf) {
      this.body.setTint(0x9fd0dc);
    }
    this.startIdleBreath(scene);

    this.hpTrack = scene.add.rectangle(0, PLAYER_HP_Y, 54, 8, 0x16130f, 0.92);
    this.hpFill = scene.add.rectangle(-27, PLAYER_HP_Y, 54, 8, 0x7fa14a, 1);
    this.hpFill.setOrigin(0, 0.5);

    this.nameplate = scene.add.text(0, PLAYER_NAME_Y, player.name, {
      fontFamily: "monospace",
      fontSize: player.isBot ? "11px" : "13px",
      fontStyle: "bold",
      color: "#e8dfc8",
      backgroundColor: "rgba(22,19,15,0.84)",
      padding: player.isBot ? { x: 4, y: 2 } : { x: 6, y: 3 }
    });
    this.nameplate.setOrigin(0.5, 1);
    for (let index = 0; index < MAX_STATUS_BADGES; index += 1) {
      const badge = scene.add.text(0, STATUS_BADGE_Y, "", {
        fontFamily: "monospace",
        fontSize: "10px",
        fontStyle: "bold",
        color: "#f3ead6",
        backgroundColor: "rgba(22,19,15,0.78)",
        padding: { x: 4, y: 2 }
      });
      badge.setOrigin(0.5, 0.5);
      badge.setVisible(false);
      this.statusBadges.push(badge);
    }

    this.root = scene.add.container(player.x, player.y, [
      this.shadow,
      this.body,
      this.hpTrack,
      this.hpFill,
      this.nameplate,
      ...this.statusBadges
    ]);
    this.root.setDepth(this.root.y);
    this.body.setFlipX(this.shouldFlip());
    this.playIdle();
    this.applyState(player, isSelf);
  }

  sync(player: PlayerState, isSelf: boolean): void {
    if (player.hp !== this.lastHp) {
      logEvent("PLAYER", "hp.changed", { playerId: player.id, isSelf, from: this.lastHp, to: player.hp, max: player.maxHp });
    }
    if (player.hp < this.lastHp) {
      this.playAction("hurt");
    }
    this.lastHp = player.hp;
    this.targetX = player.x;
    this.targetY = player.y;
    if (player.direction.x !== 0 || player.direction.y !== 0) {
      this.facing = directionToKey(player.direction);
    }
    this.applyState(player, isSelf);
  }

  /** 攻击播抬刀→挥砍帧（人剑一体）；受击播受击帧。朝向左右翻转。 */
  playAction(action: ActionKey, direction?: { x: number; y: number }): void {
    if (this.currentState === "DIE") return;
    if (direction && (direction.x !== 0 || direction.y !== 0)) {
      this.facing = directionToKey(direction);
    }
    this.body.setFlipX(this.shouldFlip());

    const animKey = action === "hurt" ? this.anim("hurt") : this.anim("attack");
    if (!this.body.scene.anims.exists(animKey)) return;
    this.currentState = action === "hurt" ? "HURT" : "ATTACK";
    this.actionLockedUntil = Date.now() + (action === "hurt" ? 200 : 300);
    this.body.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    this.body.anims.play(animKey, true);
    this.body.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (this.currentState !== "DIE") {
        this.currentState = "IDLE";
        this.actionLockedUntil = 0;
        this.playIdle();
      }
    });
  }

  step(alpha: number): void {
    const prevX = this.root.x;
    const prevY = this.root.y;
    this.root.x = Phaser.Math.Linear(this.root.x, this.targetX, alpha);
    this.root.y = Phaser.Math.Linear(this.root.y, this.targetY, alpha);
    if (Math.abs(this.root.depth - this.root.y) > 0.5) {
      this.root.setDepth(this.root.y);
    }

    if (this.currentState !== "DIE" && Date.now() >= this.actionLockedUntil) {
      const moving = Math.abs(this.root.x - prevX) > 0.6 || Math.abs(this.root.y - prevY) > 0.6;
      this.body.setFlipX(this.shouldFlip());
      if (moving) {
        const walkKey = this.anim("walk");
        if (this.body.anims.currentAnim?.key !== walkKey) {
          this.body.anims.play(walkKey, true);
        }
        // 走路颠动 + 轻微侧倾，让移动读得出来
        this.walkPhase += 0.32;
        const bob = Math.abs(Math.sin(this.walkPhase)) * 4;
        this.body.setY(BODY_BASE_Y - bob);
        this.body.setAngle(Math.sin(this.walkPhase) * 2.2);
      } else {
        this.playIdle();
        if (this.body.y !== BODY_BASE_Y) {
          this.body.setY(BODY_BASE_Y);
          this.body.setAngle(0);
        }
      }
    }
  }

  destroy(): void {
    this.root.destroy(true);
  }

  createGhost(): void {
    const scene = this.root.scene;
    const ghost = scene.add.sprite(this.root.x, this.root.y + BODY_BASE_Y, weaponSheetKey(this.weaponType), this.body.frame.name);
    ghost.setOrigin(0.5, 0.86);
    ghost.setDisplaySize(BODY_DISPLAY, BODY_DISPLAY);
    ghost.setFlipX(this.shouldFlip());
    ghost.setDepth(this.root.depth - 1);
    ghost.setAlpha(0.5);
    ghost.setTint(0xe8602c);
    scene.tweens.add({ targets: ghost, alpha: 0, duration: 300, onComplete: () => ghost.destroy() });
  }

  private anim(action: "idle" | "walk" | "attack" | "hurt"): string {
    return `scavenger-${this.weaponType}-${action}`;
  }

  /**
   * 朝向翻转的唯一真源（别再各写各的，历史反复写反这个）。
   * 生成的拾荒者动作图**默认朝屏幕左**（待机脸朝左、挥砍向左劈，见 SPEC）。
   * 因此仅在朝右时水平翻转；朝左/上/下都用原图（默认左向）。
   */
  private shouldFlip(): boolean {
    return this.facing === "right";
  }

  private startIdleBreath(scene: Phaser.Scene): void {
    scene.tweens.add({
      targets: this.body,
      scaleY: this.body.scaleY * 0.975,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut"
    });
  }

  private playIdle(): void {
    const idleKey = this.anim("idle");
    if (this.body.scene.anims.exists(idleKey)) {
      if (this.body.anims.currentAnim?.key !== idleKey || !this.body.anims.isPlaying) {
        this.body.anims.play(idleKey, true);
      }
    } else {
      this.body.anims.stop();
      this.body.setFrame(FRAME.idle);
    }
  }

  private applyState(player: PlayerState, isSelf: boolean): void {
    const hpRatio = Phaser.Math.Clamp(player.maxHp > 0 ? player.hp / player.maxHp : 0, 0, 1);
    if (this.weaponType !== player.weaponType) {
      this.weaponType = player.weaponType;
      this.body.setTexture(weaponSheetKey(player.weaponType), FRAME.idle);
      this.playIdle();
    }

    if (!player.isAlive) {
      this.currentState = "DIE";
      this.body.anims.stop();
      this.body.setFrame(FRAME.hurt);
      this.body.setAlpha(0.5);
      this.body.setAngle(this.shouldFlip() ? 82 : -82);
    } else if (this.currentState === "DIE") {
      this.currentState = "IDLE";
      this.body.setAngle(0);
      this.body.setAlpha(1);
      this.playIdle();
    }

    const hpWidth = Math.max(5, 50 * hpRatio);
    if (Math.abs(this.lastHpWidth - hpWidth) > 0.5) {
      this.hpFill.width = hpWidth;
      this.lastHpWidth = hpWidth;
    }
    const hpColor = resolveHpColor(hpRatio);
    if (this.lastHpColor !== hpColor || this.lastAliveAlpha !== (player.isAlive ? 1 : 0.45)) {
      this.hpFill.setFillStyle(hpColor, player.isAlive ? 1 : 0.45);
      this.lastHpColor = hpColor;
      this.lastAliveAlpha = player.isAlive ? 1 : 0.45;
    }

    const nextNameplateText = formatNameplate(player, isSelf);
    if (this.lastNameplateText !== nextNameplateText) {
      this.nameplate.setText(nextNameplateText);
      this.lastNameplateText = nextNameplateText;
    }
    const nextNameplateColor = isSelf ? "#e8dfc8" : player.isBot ? "#ffb199" : "#bde6ef";
    if (this.lastNameplateColor !== nextNameplateColor) {
      this.nameplate.setColor(nextNameplateColor);
      this.lastNameplateColor = nextNameplateColor;
    }

    this.syncStatusBadges(player);
    this.nameplate.setScale(player.isBot ? 0.84 : 1);
    const nextLabelAlpha = player.isAlive ? (player.isBot ? 0.82 : 1) : 0.65;
    if (this.nameplate.alpha !== nextLabelAlpha) {
      this.nameplate.setAlpha(nextLabelAlpha);
    }
    const nextRootAlpha = player.isAlive ? 1 : 0.55;
    if (this.lastRootAlpha !== nextRootAlpha) {
      this.root.setAlpha(nextRootAlpha);
      this.lastRootAlpha = nextRootAlpha;
    }
  }

  private syncStatusBadges(player: PlayerState): void {
    const presentations = summarizeStatusEffects(player.statusEffects ?? []);
    const rowWidth = Math.max(0, (presentations.length - 1) * STATUS_BADGE_SPACING);
    this.statusBadges.forEach((badge, index) => {
      const presentation = presentations[index];
      if (!presentation || !player.isAlive) {
        badge.setVisible(false);
        return;
      }
      badge.setText(presentation.label);
      badge.setColor(presentation.color);
      badge.setBackgroundColor(presentation.backgroundColor);
      badge.setPosition(index * STATUS_BADGE_SPACING - rowWidth / 2, STATUS_BADGE_Y);
      badge.setVisible(true);
    });
  }
}

/** 武器→动作图键。每把武器一张同布局 3x2 图；未生成的暂回退到剑图。 */
function weaponSheetKey(weaponType: WeaponType): string {
  const scene_keys: Record<WeaponType, string> = {
    sword: "scavenger_sword",
    blade: "scavenger_blade",
    spear: "scavenger_spear"
  };
  return scene_keys[weaponType] ?? "scavenger_sword";
}

function summarizeStatusEffects(effects: StatusEffectState[]): Array<{ label: string; color: string; backgroundColor: string }> {
  const seen = new Set<StatusEffectState["type"]>();
  const presentations: Array<{ label: string; color: string; backgroundColor: string }> = [];
  for (const effect of effects) {
    if (seen.has(effect.type)) continue;
    const presentation = resolveStatusBadge(effect);
    if (!presentation) continue;
    seen.add(effect.type);
    presentations.push(presentation);
    if (presentations.length >= MAX_STATUS_BADGES) break;
  }
  return presentations;
}

function resolveStatusBadge(effect: StatusEffectState): { label: string; color: string; backgroundColor: string } | null {
  switch (effect.type) {
    case "slow":
      return { label: "缓", color: "#dbeafe", backgroundColor: "rgba(30,64,175,0.84)" };
    case "bleed":
      return { label: "血", color: "#fee2e2", backgroundColor: "rgba(127,29,29,0.84)" };
    case "damageReduction":
      return { label: "盾", color: "#fef3c7", backgroundColor: "rgba(113,63,18,0.84)" };
    case "attackBoost":
      return { label: "攻", color: "#ffedd5", backgroundColor: "rgba(154,52,18,0.84)" };
    case "attackSpeedBoost":
      return { label: "速", color: "#ecfccb", backgroundColor: "rgba(63,98,18,0.84)" };
    case "moveSpeedBoost":
      return { label: "疾", color: "#cffafe", backgroundColor: "rgba(21,94,117,0.84)" };
    default:
      return null;
  }
}

function resolveHpColor(hpRatio: number): number {
  if (hpRatio > 0.6) return 0x7fa14a;
  if (hpRatio > 0.3) return 0xd4b24c;
  return 0xb8371f;
}

function directionToKey(direction: { x: number; y: number }): DirectionKey {
  if (Math.abs(direction.x) > Math.abs(direction.y)) {
    return direction.x >= 0 ? "right" : "left";
  }
  return direction.y < 0 ? "up" : "down";
}

function formatNameplate(player: PlayerState, isSelf: boolean): string {
  if (isSelf || !player.isBot) {
    return player.name;
  }
  const suffix = player.id.match(/_(\d+)$/)?.[1] ?? player.name.match(/(\d+)$/)?.[1] ?? "?";
  switch (player.squadId) {
    case "bot_alpha":
      return `BOT A${suffix}`;
    case "bot_beta":
      return `BOT B${suffix}`;
    case "bot_gamma":
      return `BOT G${suffix}`;
    default:
      return `BOT ${suffix}`;
  }
}

function resolveSquadTint(squadId: PlayerState["squadId"]): number {
  switch (squadId) {
    case "player":
      return 0xd95a36;
    case "bot_alpha":
      return 0xb7c0c7;
    case "bot_beta":
      return 0x8b72d9;
    case "bot_gamma":
      return 0x7fa14a;
    default:
      return 0xd4b24c;
  }
}
