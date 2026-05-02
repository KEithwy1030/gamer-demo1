# Image2 Asset Intake Manifest

## Processed Runtime Candidates

Processed, alpha-cleaned copies live under:

`client/public/assets/generated/image2_processed/`

| Role | Raw path | Processed path | Notes |
| --- | --- | --- | --- |
| Player sword 8x4 sheet | `characters/unit_player_sword_sheet_8x4.png` | `characters/unit_player_sword_sheet_8x4.png` | 8 columns x 4 rows, green background removed. |
| Player spear 8x4 sheet | `characters/unit_player_spear_sheet_8x4.png` | `characters/unit_player_spear_sheet_8x4.png` | 8 columns x 4 rows, green background removed. |
| Enemy raider 4x4 sheet | `characters/unit_enemy_raider_sheet_4x4.png` | `characters/unit_enemy_raider_sheet_4x4.png` | 4 columns x 4 rows; no weapon-specific skill columns. |
| Elite monster 4x4 sheet | `monsters/monster_elite_sheet_4x4.png` | `monsters/monster_elite_sheet_4x4.png` | 4 columns x 4 rows. |
| Normal monster 4x4 sheet | `monsters/monster_normal_sheet_4x4.png` | `monsters/monster_normal_sheet_4x4.png` | 4 columns x 4 rows, green background removed. |
| World structures atlas | `atlases/atlas_world_structures_3x3.png` | `atlases/atlas_world_structures_3x3.png` | 3x3 structure atlas. |
| Spear icon | `items/icon_weapon_spear.png` | `items/icon_weapon_spear.png` | Background removed from fake checkerboard. |
| Blade icon | `items/icon_weapon_blade.png` | `items/icon_weapon_blade.png` | Background removed from fake checkerboard. |
| Sword icon | `items/icon_weapon_sword.png` | `items/icon_weapon_sword.png` | Background removed from fake checkerboard. |
| Loot bag | `items/loot_drop_bag.png` | `items/loot_drop_bag.png` | Background removed from fake checkerboard. |
| Open chest | `items/loot_chest_open.png` | `items/loot_chest_open.png` | Background removed from fake checkerboard. |
| Closed chest | `items/loot_chest_closed.png` | `items/loot_chest_closed.png` | Background removed from fake checkerboard. |

## Missing Or Incomplete For Full Replacement

- `characters/unit_player_blade_sheet_8x4.png` is missing.
- Enemy sword/blade/spear 8x4 sheets are missing; only one generic enemy raider 4x4 sheet exists.
- HUD single-component images are not in this raw intake folder.
- Ground tile atlas and map prop/decal atlases are not in this raw intake folder, except the world structures 3x3 atlas.

## Quarantined As Unused Review

These files are moved out of the active raw set but not deleted yet:

- `_unused_review/unit_player_sword_sheet_8x4_duplicate.png`
- `_unused_review/unit_player_sword_sheet_4x4_legacy.png`
