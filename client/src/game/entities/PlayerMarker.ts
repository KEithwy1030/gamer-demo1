import Phaser from "phaser";
import { type PlayerState, type StatusEffectState, type WeaponType } from "@gamer/shared";
import { logEvent } from "../../dev/runtimeLog";

export type AnimationState = "IDLE" | "MOVE" | "ATTACK" | "HURT" | "DIE";
type DirectionKey = "down" | "left" | "right" | "up";
type ActionKey = "attack" | "skill" | "dodge" | "hurt";

const BODY_DISPLAY = 158;
const BODY_BASE_Y = 22;       // 身体中心 y（脚落在接地影上）
const WEAPON_DISPLAY = 78;
const HAND_OFFSET_X = 24;     // 手相对身体中心（朝右时）
const HAND_OFFSET_Y = 6;
const WEAPON_REST_ANGLE = 28; // 静止时武器斜指前上方（度）
const PLAYER_HP_Y = -78;
const PLAYER_NAME_Y = -92;
const STATUS_BADGE_Y = -61;
const STATUS_BADGE_SPACING = 27;
const MAX_STATUS_BADGES = 4;

/**
 * 分层玩家渲染：身体（武器无关的拾荒者动作图）+ 武器图层（按武器类型选图，
 * 挂在手部锚点，攻击时由引擎挥舞）。加新武器 = 加一张武器图 + 配置，不动身体。
 * 朝向用左右翻转 + 引擎动作表现，不画多方向帧。武器的"个性"= 挥舞轨迹 + 战斗特效。
 */
export class PlayerMarker {
  readonly id: string;
  readonly root: Phaser.GameObjects.Container;

  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly weapon: Phaser.GameObjects.Image;
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
  private weaponSwing?: Phaser.Tweens.Tween;
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

    // 接地影 + 队伍识别光圈（柔和实心椭圆，非描边圈，不是调试感）
    this.shadow = scene.add.graphics();
    this.shadow.fillStyle(0x0a0805, 0.3);
    this.shadow.fillEllipse(6, 40, 84, 24);
    if (isSelf) {
      this.shadow.fillStyle(0xe8602c, 0.22);
      this.shadow.fillEllipse(0, 40, 60, 18);
    } else if (player.isBot) {
      this.shadow.fillStyle(0xb8371f, 0.18);
      this.shadow.fillEllipse(0, 40, 56, 17);
    } else {
      this.shadow.fillStyle(0x7fb4c2, 0.16);
      this.shadow.fillEllipse(0, 40, 56, 17);
    }
    this.shadow.fillStyle(0x0e0b08, 0.34);
    this.shadow.fillEllipse(0, 40, 42, 13);

    this.body = scene.add.sprite(0, BODY_BASE_Y, "scavenger_body", 0);
    this.body.setOrigin(0.5, 0.86);
    this.body.setDisplaySize(BODY_DISPLAY, BODY_DISPLAY);
    if (player.isBot) {
      this.body.setTint(resolveSquadTint(player.squadId));
    } else if (!isSelf) {
      this.body.setTint(0x9fd0dc);
    }
    this.startIdleBreath(scene);

    this.weapon = scene.add.image(HAND_OFFSET_X, BODY_BASE_Y + HAND_OFFSET_Y, weaponTextureKey(player.weaponType));
    this.weapon.setOrigin(0.5, 0.9);
    this.sizeWeapon();
    this.weapon.setAngle(WEAPON_REST_ANGLE);

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
      this.weapon,
      this.hpTrack,
      this.hpFill,
      this.nameplate,
      ...this.statusBadges
    ]);
    this.root.setDepth(this.root.y);
    this.applyFacing();
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

  /** 攻击/技能 = 身体武器无关动作（轻前冲由 root 处理）+ 武器挥舞 + 战斗特效。 */
  playAction(action: ActionKey, direction?: { x: number; y: number }): void {
    if (this.currentState === "DIE") return;
    if (direction && (direction.x !== 0 || direction.y !== 0)) {
      this.facing = directionToKey(direction);
    }
    this.applyFacing();

    if (action === "hurt") {
      this.currentState = "HURT";
      this.actionLockedUntil = Date.now() + 180;
      this.body.anims.play("scavenger-hurt", true);
      return;
    }

    this.currentState = "ATTACK";
    this.actionLockedUntil = Date.now() + 260;
    this.swingWeapon();
  }

  /** 武器挥舞：剑/刀走旋转扫劈，枪走前刺。方向左右镜像。 */
  private swingWeapon(): void {
    const scene = this.body.scene;
    const left = this.facing === "left";
    const sign = left ? -1 : 1;
    this.weaponSwing?.stop();
    this.weapon.setAngle(WEAPON_REST_ANGLE * sign);
    this.weapon.setPosition(HAND_OFFSET_X * sign, BODY_BASE_Y + HAND_OFFSET_Y);

    if (this.weaponType === "spear") {
      // 前刺：沿朝向把武器推出去再收回
      const reach = 26 * sign;
      this.weaponSwing = scene.tweens.add({
        targets: this.weapon,
        x: HAND_OFFSET_X * sign + reach,
        y: BODY_BASE_Y + HAND_OFFSET_Y - 10,
        duration: 90,
        yoyo: true,
        ease: "Cubic.out",
        onComplete: () => this.resetWeaponRest()
      });
    } else {
      // 扫劈：从后上方抡到前下方
      this.weapon.setAngle(-55 * sign);
      this.weaponSwing = scene.tweens.add({
        targets: this.weapon,
        angle: 80 * sign,
        duration: 150,
        ease: "Cubic.in",
        onComplete: () => this.resetWeaponRest()
      });
    }
  }

  private resetWeaponRest(): void {
    const left = this.facing === "left";
    const sign = left ? -1 : 1;
    this.weapon.setAngle(WEAPON_REST_ANGLE * sign);
    this.weapon.setPosition(HAND_OFFSET_X * sign, BODY_BASE_Y + HAND_OFFSET_Y);
    if (this.currentState !== "DIE") {
      this.currentState = "IDLE";
      this.actionLockedUntil = 0;
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
      const moving = Math.abs(this.root.x - prevX) > 0.6 || Math.abs(this.root.y - prevY) > 0.6;
      this.applyFacing();
      if (moving) {
        if (this.body.anims.currentAnim?.key !== "scavenger-walk") {
          this.body.anims.play("scavenger-walk", true);
        }
      } else {
        this.playIdle();
      }
    }
  }

  destroy(): void {
    this.weaponSwing?.stop();
    this.root.destroy(true);
  }

  createGhost(): void {
    const scene = this.root.scene;
    const ghost = scene.add.sprite(this.root.x, this.root.y + BODY_BASE_Y, "scavenger_body", this.body.frame.name);
    ghost.setOrigin(0.5, 0.86);
    ghost.setDisplaySize(BODY_DISPLAY, BODY_DISPLAY);
    ghost.setFlipX(this.facing === "left");
    ghost.setDepth(this.root.depth - 1);
    ghost.setAlpha(0.5);
    ghost.setTint(0xe8602c);
    scene.tweens.add({ targets: ghost, alpha: 0, duration: 300, onComplete: () => ghost.destroy() });
  }

  private applyFacing(): void {
    const left = this.facing === "left";
    this.body.setFlipX(left);
    this.weapon.setFlipX(left);
    if (this.currentState !== "ATTACK") {
      const sign = left ? -1 : 1;
      this.weapon.setPosition(HAND_OFFSET_X * sign, BODY_BASE_Y + HAND_OFFSET_Y);
      this.weapon.setAngle(WEAPON_REST_ANGLE * sign);
    }
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

  private sizeWeapon(): void {
    const tex = this.weapon.scene.textures.get(this.weapon.texture.key).getSourceImage();
    const ratio = tex && "height" in tex && tex.width ? tex.height / tex.width : 1;
    this.weapon.setDisplaySize(WEAPON_DISPLAY / Math.max(ratio, 1), WEAPON_DISPLAY * Math.min(ratio, 2.4));
  }

  private playIdle(): void {
    if (this.body.anims.currentAnim?.key !== "scavenger-idle" || !this.body.anims.isPlaying) {
      this.body.anims.play("scavenger-idle", true);
    }
  }

  private applyState(player: PlayerState, isSelf: boolean): void {
    const hpRatio = Phaser.Math.Clamp(player.maxHp > 0 ? player.hp / player.maxHp : 0, 0, 1);
    if (this.weaponType !== player.weaponType) {
      this.weaponType = player.weaponType;
      this.weapon.setTexture(weaponTextureKey(player.weaponType));
      this.sizeWeapon();
      this.applyFacing();
    }

    if (!player.isAlive) {
      this.currentState = "DIE";
      this.weaponSwing?.stop();
      this.body.anims.stop();
      this.body.setFrame(3);
      this.body.setAlpha(0.5);
      this.body.setAngle(this.facing === "left" ? -82 : 82);
      this.weapon.setAlpha(0.4);
      this.weapon.setAngle(110);
    } else if (this.currentState === "DIE") {
      this.currentState = "IDLE";
      this.body.setAngle(0);
      this.body.setAlpha(1);
      this.weapon.setAlpha(1);
      this.resetWeaponRest();
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

function weaponTextureKey(weaponType: WeaponType): string {
  switch (weaponType) {
    case "blade":
      return "weapon_saber";
    case "spear":
      return "weapon_spear";
    case "sword":
    default:
      return "weapon_sword";
  }
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
