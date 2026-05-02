import Phaser from "phaser";
import type { PlayerState, WeaponType } from "@gamer/shared";

export type AnimationState = "IDLE" | "MOVE" | "ATTACK" | "HURT" | "DIE";
type DirectionKey = "down" | "left" | "right" | "up";
type ActionKey = "attack" | "skill" | "dodge" | "hurt";

const PLAYER_FRAME_SIZE = 132;
const PLAYER_BODY_Y = 8;
const PLAYER_HP_Y = -78;
const PLAYER_NAME_Y = -92;

export class PlayerMarker {
  readonly id: string;
  readonly root: Phaser.GameObjects.Container;

  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly hpTrack: Phaser.GameObjects.Rectangle;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly nameplate: Phaser.GameObjects.Text;
  private targetX: number;
  private targetY: number;
  private currentState: AnimationState = "IDLE";
  private facing: DirectionKey = "down";
  private weaponType: WeaponType;
  private actionLockedUntil = 0;
  private lastHp: number = 0;
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

    // Pixel-style Foot Glow & Shadow
    this.shadow = scene.add.graphics();
    if (isSelf) {
      this.shadow.fillStyle(0xe8602c, 0.28);
      this.shadow.fillEllipse(0, 38, 76, 26);
    } else if (player.isBot) {
      this.shadow.fillStyle(0xb8371f, 0.24);
      this.shadow.fillEllipse(0, 38, 72, 24);
    } else {
      this.shadow.fillStyle(0x7fb4c2, 0.2);
      this.shadow.fillEllipse(0, 38, 70, 24);
    }
    this.shadow.fillStyle(0x0e0b08, 0.36);
    this.shadow.fillEllipse(0, 38, 48, 14);
    
    this.sprite = scene.add.sprite(0, PLAYER_BODY_Y, getPlayerTextureKey(player.weaponType));
    this.sprite.setDisplaySize(PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE);
    this.playIdle();
    if (player.isBot) {
      this.sprite.setTint(resolveSquadTint(player.squadId));
    } else if (!isSelf) {
      this.sprite.setTint(0x7fb4c2);
    }

    // HP Bar: Sharper Pixel Look
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

    const children: Phaser.GameObjects.GameObject[] = [
      this.shadow,
      this.sprite,
      this.hpTrack,
      this.hpFill,
      this.nameplate
    ];

    this.root = scene.add.container(player.x, player.y, children);
    this.root.setDepth(this.root.y);

    this.applyState(player, isSelf);
  }

  sync(player: PlayerState, isSelf: boolean): void {
    if (player.hp < this.lastHp) {
      this.playHurt();
    }
    this.lastHp = player.hp;
    this.targetX = player.x;
    this.targetY = player.y;
    if (player.direction.x !== 0 || player.direction.y !== 0) {
      this.facing = directionToKey(player.direction);
    }
    this.applyState(player, isSelf);
  }

  private playHurt(): void {
    if (this.currentState === "DIE") return;
    this.playAction("hurt");
    const scene = this.root.scene as any;
    if (scene.flashEffect) {
      scene.flashEffect(this.sprite);
    }
  }

  playAction(action: ActionKey, direction?: { x: number; y: number }): void {
    if (this.currentState === "DIE") return;
    if (direction && (direction.x !== 0 || direction.y !== 0)) {
      this.facing = directionToKey(direction);
    }
    const actionFacing = direction ? directionToKey(direction) : this.facing;
    const animKey = getPlayerAnimKey(this.weaponType, action, actionFacing);
    if (this.sprite.scene.anims.exists(animKey)) {
      this.currentState = action === "hurt" ? "HURT" : "ATTACK";
      this.actionLockedUntil = Date.now() + getActionLockMs(action);
      this.sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
      this.sprite.anims.play(animKey, true);
      this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (this.currentState !== "DIE") this.currentState = "IDLE";
      });
    }
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
      const dx = this.root.x - prevX;
      const dy = this.root.y - prevY;
      
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        this.facing = movementToDirectionKey(dx, dy);
        const moveAnim = getPlayerAnimKey(this.weaponType, "move", this.facing);
        if (Math.abs(dx) > Math.abs(dy)) {
          this.sprite.anims.play(moveAnim, true);
        } else {
          this.sprite.anims.play(moveAnim, true);
        }
      } else {
        this.playIdle();
      }
    }
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private applyState(player: PlayerState, isSelf: boolean): void {
    const hpRatio = Phaser.Math.Clamp(player.maxHp > 0 ? player.hp / player.maxHp : 0, 0, 1);
    if (this.weaponType !== player.weaponType) {
      this.weaponType = player.weaponType;
      this.sprite.setTexture(getPlayerTextureKey(player.weaponType));
      this.playIdle();
    }
    
    if (!player.isAlive) {
      this.currentState = "DIE";
      const deathAnim = getPlayerAnimKey(this.weaponType, "die", this.facing);
      if (this.sprite.scene.anims.exists(deathAnim)) this.sprite.anims.play(deathAnim, true);
      else this.sprite.anims.stop();
      this.sprite.setAlpha(0.5);
      this.sprite.setAngle(90);
    } else if (this.currentState === "DIE") {
      this.currentState = "IDLE";
      this.sprite.setAngle(0);
      this.sprite.setAlpha(1);
    } else {
      this.sprite.setAngle(0);
      this.sprite.setAlpha(1);
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

  createGhost(): void {
    const scene = this.root.scene;
    const ghost = scene.add.sprite(this.root.x, this.root.y, getPlayerTextureKey(this.weaponType), this.sprite.frame.name);
    ghost.setDisplaySize(PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE);
    ghost.setRotation(this.sprite.rotation);
    ghost.setDepth(this.root.depth - 1);
    ghost.setAlpha(0.5);
    ghost.setTint(0xe8602c);

    scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 300,
      onComplete: () => ghost.destroy()
    });
  }

  private playIdle(): void {
    const idleAnim = getPlayerAnimKey(this.weaponType, "idle", this.facing);
    if (this.sprite.scene.anims.exists(idleAnim)) {
      if (this.sprite.anims.currentAnim?.key !== idleAnim || !this.sprite.anims.isPlaying) {
        this.sprite.anims.play(idleAnim, true);
      }
      return;
    }

    this.sprite.anims.stop();
    this.sprite.setFrame(getIdleFrame(this.facing));
  }
}

function resolveHpColor(hpRatio: number): number {
  if (hpRatio > 0.6) {
    return 0x7fa14a;
  }

  if (hpRatio > 0.3) {
    return 0xd4b24c;
  }

  return 0xb8371f;
}

function getPlayerTextureKey(weaponType: WeaponType): string {
  return `unit_player_${weaponType}`;
}

function getPlayerAnimKey(weaponType: WeaponType, action: string, direction: DirectionKey): string {
  return `player-${weaponType}-${action}-${direction}`;
}

function directionToKey(direction: { x: number; y: number }): DirectionKey {
  if (Math.abs(direction.x) > Math.abs(direction.y)) {
    return direction.x >= 0 ? "right" : "left";
  }
  return direction.y < 0 ? "up" : "down";
}

function movementToDirectionKey(dx: number, dy: number): DirectionKey {
  return directionToKey({ x: dx, y: dy });
}

function getIdleFrame(direction: DirectionKey): number {
  return getDirectionRow(direction) * 8;
}

function getDirectionRow(direction: DirectionKey): number {
  switch (direction) {
    case "left":
      return 1;
    case "right":
      return 2;
    case "up":
      return 3;
    case "down":
    default:
      return 0;
  }
}

function getActionLockMs(action: ActionKey): number {
  switch (action) {
    case "attack":
      return 260;
    case "skill":
      return 360;
    case "dodge":
      return 240;
    case "hurt":
      return 180;
  }
}

function formatNameplate(player: PlayerState, isSelf: boolean): string {
  if (isSelf) {
    return player.name;
  }

  if (!player.isBot) {
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
