# 拾荒者底版角色 · 生成规格（锁定）

> 永久存档。这是玩家角色的**底版模板**。未来"玩家选不同外貌的拾荒者"= 用同一规格、
> 同一提示词骨架换主体特征重生成一张图即可（广告牌渲染，换图即换人）。
> 角色定位：**普通寒酸的拾荒者，不是英雄、不是战士**；力量来自捡到的装备，人物本身刻意平庸。

## 锁定参数

- **相机**：斜上方俯视 ~50-55°（俯视动作 RPG 角度），身体前缩、可见肩头与脚下地面。真 2.5D，**禁止正面平面立绘 / 禁止平视**。
- **调性**：冷月写实（见 docs/QUALITY-BAR.md §7）。冷蓝灰为底，仅极少暖色点缀。深色细描边，剪影可读，有体积重量、站在地上，不是纸片。
- **底色**：纯洋红 `#ff00ff`，泛洪抠图（scripts/process-spritesheet.py --grid 1x1）。
- **源尺寸**：1024×1024，quality high。成品抠图后约 512×512。
- **入游戏**：`client/public/assets/generated/image2_processed/characters/billboard_player_sword.png`，
  PlayerMarker 广告牌模式（origin 底边、接地影、程序化动作）。

## 提示词骨架（填 `<主体特征>`）

```
A full-body game character sprite of an ordinary, destitute wasteland scavenger -
a common nobody, NOT a hero, NOT a warrior, plain and pitiable. <主体特征：体型/衣着/
姿态>. Gripping a crude short sword. CRITICAL camera: viewed from an oblique 2.5D
top-down action-RPG angle, about 50-55 degrees looking DOWN at the character from
above and in front (like Diablo or a classic top-down ARPG), the body clearly
foreshortened, you see the tops of the shoulders and the ground around the planted
feet - this is a 2.5D game unit, NOT a flat front-facing portrait, NOT eye-level.
Muted cool moonlit palette: cold blue-grey base, only a tiny warm accent. Dark thin
clean outline, strong readable silhouette, real sense of volume and weight standing
on the ground, NOT a flat paper figure. Centered, isolated on a solid flat magenta
#ff00ff background, no ground texture, no shadow on the background, no text. Crisp
detailed game asset, grounded and ordinary, not flashy.
```

## 已生成的可选外貌（同规格，演示"选不同拾荒者"）

- **variant-A**（已选为当前底版）：瘦削、兜帽、挎包，gaunt hooded scavenger
- **variant-B**：壮实中年、秃顶、围巾，stockier balding nobody
- **variant-C**：佝偻、破斗篷遮面，hunched cloaked wretch

每个的 raw + cut 都在本目录。未来新外貌按骨架加一行主体特征即可。

## 架构铁律 · 身体/武器分层（2026-06-13 锁定，禁止违反）

**禁止把武器烤进角色图。** 历代 agent 都栽在"角色×武器×帧"组合爆炸：加一种武器就要
重做所有角色图。本项目永久采用**分层**：

- **身体层**（`scavenger_body_2x2.png`，2×2 帧 = 0待机/1走A/2走B/3受击）：武器无关、
  空手待命姿。一个长相 = 一张身体图。`createUnitAnimations` 建 scavenger-idle/walk/hurt。
- **武器层**（`weapons/sword|saber|spear.png`，竖直握把朝下的独立图）：按 weaponType 选图，
  挂在手部锚点（PlayerMarker HAND_OFFSET），攻击时**引擎挥舞**（剑/刀旋转扫劈、枪前刺）+
  战斗特效（combatVfx 已按武器分）。
- **加新武器** = 加一张竖直武器图 + `weaponTextureKey()` 一行 + 挥舞参数。**角色一根毛不动。**
- **加新长相** = 加一张身体图，自动兼容所有武器。成本是加法（长相+武器），不是乘法。

朝向：左右翻转（身体+武器+镜像锚点），不画多方向帧。

## 未来装备-外观（方向已定）

不做"每件装备画在身上"。外观变化只走：手里武器（已实现分层）+ 未来最多护甲三档剪影
（破布/皮甲/重甲，作为身体层的 3 张变体），不做单件。力量感靠数值+武器+稀有光效。
