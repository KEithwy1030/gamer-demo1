import Phaser from "phaser";
import type { PlayerState } from "../../../../shared/src/index";

export type AnimationState = "IDLE" | "MOVE" | "ATTACK" | "HURT" | "DIE";

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
  private lastHp: number = 0;

  constructor(scene: Phaser.Scene, player: PlayerState, isSelf: boolean) {
    this.id = player.id;
    this.targetX = player.x;
    this.targetY = player.y;
    this.lastHp = player.hp;

    // Pixel-style Foot Glow & Shadow
    this.shadow = scene.add.graphics();
    if (isSelf) {
      this.shadow.fillStyle(0xe8602c, 0.28);
      this.shadow.fillEllipse(0, 24, 52, 20);
    } else {
      this.shadow.fillStyle(0x7fb4c2, 0.2);
      this.shadow.fillEllipse(0, 24, 48, 18);
    }
    this.shadow.fillStyle(0x0e0b08, 0.36);
    this.shadow.fillEllipse(0, 24, 30, 10);
    
    this.sprite = scene.add.sprite(0, 0, "player");
    this.sprite.setDisplaySize(64, 64);

    // HP Bar: Sharper Pixel Look
    this.hpTrack = scene.add.rectangle(0, -36, 40, 8, 0x16130f, 0.92);
    this.hpFill = scene.add.rectangle(-20, -36, 40, 8, 0x7fa14a, 1);
    this.hpFill.setOrigin(0, 0.5);

    this.nameplate = scene.add.text(0, -48, player.name, {
      fontFamily: "monospace",
      fontSize: "13px",
      fontStyle: "bold",
      color: "#e8dfc8",
      backgroundColor: "rgba(22,19,15,0.84)",
      padding: { x: 6, y: 3 }
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
    this.applyState(player, isSelf);
  }

  private playHurt(): void {
    if (this.currentState === "DIE") return;
    const scene = this.root.scene as any;
    if (scene.flashEffect) {
      scene.flashEffect(this.sprite);
    }
  }

  step(alpha: number): void {
    const prevX = this.root.x;
    const prevY = this.root.y;
    this.root.x = Phaser.Math.Linear(this.root.x, this.targetX, alpha);
    this.root.y = Phaser.Math.Linear(this.root.y, this.targetY, alpha);
    this.root.setDepth(this.root.y); // Non-negotiable Y-sorting

    if (this.currentState !== "DIE") {
      const dx = this.root.x - prevX;
      const dy = this.root.y - prevY;
      
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > 0) this.sprite.anims.play("player-walk-right", true);
          else this.sprite.anims.play("player-walk-left", true);
        } else {
          if (dy > 0) this.sprite.anims.play("player-walk-down", true);
          else this.sprite.anims.play("player-walk-up", true);
        }
      } else {
        this.sprite.anims.stop();
        const currentAnim = this.sprite.anims.currentAnim?.key;
        if (currentAnim === "player-walk-left") this.sprite.setFrame(4);
        else if (currentAnim === "player-walk-right") this.sprite.setFrame(8);
        else if (currentAnim === "player-walk-up") this.sprite.setFrame(12);
        else this.sprite.setFrame(0);
      }
    }
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private applyState(player: PlayerState, isSelf: boolean): void {
    const hpRatio = Phaser.Math.Clamp(player.maxHp > 0 ? player.hp / player.maxHp : 0, 0, 1);
    
    if (!player.isAlive) {
      this.currentState = "DIE";
      this.sprite.anims.stop();
      this.sprite.setAlpha(0.5);
      this.sprite.setAngle(90);
    } else {
      this.currentState = "IDLE";
      this.sprite.setAngle(0);
      this.sprite.setAlpha(1);
    }
    
    this.hpFill.width = Math.max(4, 36 * hpRatio);
    this.hpFill.setFillStyle(resolveHpColor(hpRatio), player.isAlive ? 1 : 0.45);

    this.nameplate.setText(player.name);
    this.nameplate.setAlpha(player.isAlive ? 1 : 0.65);
    this.root.setAlpha(player.isAlive ? 1 : 0.55);
  }

  createGhost(): void {
    const scene = this.root.scene;
    const ghost = scene.add.sprite(this.root.x, this.root.y, "player");
    ghost.setDisplaySize(64, 64);
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
