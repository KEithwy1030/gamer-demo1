type ItemPresentationInput = {
  definitionId?: string;
  name?: string;
  kind?: string;
  slot?: string;
  rarity?: string;
};

type ItemPresentationCore = {
  icon: string;
  badge: string;
  categoryLabel: string;
  slotLabel?: string;
  variant: string;
  assetPath?: string;
};

export type ItemPresentation = ItemPresentationCore & {
  displayName: string;
  iconKey: string;
  iconSvg: string;
  shortLabel: string;
  detailLabel: string;
  rarityLabel: string;
};

type ItemPresentationPreset = ItemPresentationCore & {
  names: string[];
};

const ITEM_PRESETS: Record<string, ItemPresentationPreset> = {
  starter_sword: { icon: "⚔", badge: "剑", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", assetPath: "assets/generated/image2_processed/items/icon_weapon_sword_v2.png", names: ["制式长剑", "Starter Sword", "Sword"] },
  "iron-sword": { icon: "⚔", badge: "剑", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", assetPath: "assets/generated/image2_processed/items/icon_weapon_sword_v2.png", names: ["制式长剑", "Iron Sword"] },
  weapon_sword_basic: { icon: "⚔", badge: "剑", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", assetPath: "assets/generated/image2_processed/items/icon_weapon_sword_v2.png", names: ["锈蚀长剑", "锈剑", "Rust Sword"] },
  raider_blade: { icon: "🗡", badge: "刃", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", assetPath: "assets/generated/image2_processed/items/icon_weapon_blade_v2.png", names: ["突袭弯刃", "突击者之刃", "Raider Blade", "Blade"] },
  weapon_blade_basic: { icon: "🗡", badge: "刃", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", assetPath: "assets/generated/image2_processed/items/icon_weapon_blade_v2.png", names: ["突袭弯刃", "掠袭短刃", "Raider Blade"] },
  hunter_spear: { icon: "✦", badge: "矛", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", assetPath: "assets/generated/image2_processed/items/icon_weapon_spear_v2.png", names: ["猎人长矛", "Hunter Spear", "Spear"] },
  weapon_spear_basic: { icon: "✦", badge: "矛", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", assetPath: "assets/generated/image2_processed/items/icon_weapon_spear_v2.png", names: ["旧猎矛", "旧长矛", "Old Spear"] },
  leather_hood: { icon: "⛑", badge: "头", categoryLabel: "护甲", slotLabel: "头部", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_head_v2.png", names: ["皮质兜帽", "Leather Hood"] },
  armor_head_common: { icon: "⛑", badge: "头", categoryLabel: "护甲", slotLabel: "头部", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_head_v2.png", names: ["斥候兜帽", "Scout Hood"] },
  scavenger_coat: { icon: "🜁", badge: "甲", categoryLabel: "护甲", slotLabel: "胸甲", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_chest_v2.png", names: ["拾荒者外衣", "拾荒者大衣", "Scavenger Coat"] },
  armor_chest_common: { icon: "🜁", badge: "甲", categoryLabel: "护甲", slotLabel: "胸甲", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_chest_v2.png", names: ["拼接胸甲", "Patch Chestpiece"] },
  armor_hands_common: { icon: "✊", badge: "手", categoryLabel: "护甲", slotLabel: "手部", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_hands_v2.png", names: ["握柄手套", "Grip Gloves"] },
  trail_greaves: { icon: "👢", badge: "靴", categoryLabel: "护甲", slotLabel: "鞋子", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_feet_v2.png", names: ["径行胫甲", "径行腿甲", "Trail Greaves"] },
  armor_feet_common: { icon: "👢", badge: "靴", categoryLabel: "护甲", slotLabel: "鞋子", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_feet_v2.png", names: ["旅者短靴", "旅途皮靴", "Road Boots"] },
  hunter_cowl: { icon: "⛑", badge: "头", categoryLabel: "护甲", slotLabel: "头部", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_head_v2.png", names: ["缇夜猎屏", "Hunter Cowl"] },
  runner_boots: { icon: "👢", badge: "靴", categoryLabel: "护甲", slotLabel: "鞋子", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_feet_v2.png", names: ["步境蹈靴", "Runner Boots"] },
  duelist_blade: { icon: "🗡", badge: "刃", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", assetPath: "assets/generated/image2_processed/items/icon_weapon_blade_v2.png", names: ["双刃绿刀", "Duelist Blade"] },
  warlord_cuirass: { icon: "🜁", badge: "甲", categoryLabel: "护甲", slotLabel: "胸甲", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_chest_v2.png", names: ["战主钉胸甲", "Warlord Cuirass"] },
  jade_idol: { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure", assetPath: "assets/generated/image2_processed/items/icon_treasure_small_idol_v2.png", names: ["古玉偶像", "古玉像", "Jade Idol"] },
  treasure_small_idol: { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure", assetPath: "assets/generated/image2_processed/items/icon_treasure_small_idol_v2.png", names: ["小型偶像", "小型神像", "Small Idol"] },
  treasure_medium_tablet: { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure", assetPath: "assets/generated/image2_processed/items/icon_treasure_stone_tablet_v2.png", names: ["石刻碑板", "Stone Tablet"] },
  treasure_large_statue: { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure", assetPath: "assets/generated/image2_processed/items/icon_treasure_broken_statue_v2.png", names: ["残破雕像", "残损雕像", "Broken Statue"] },
  treasure_cursed_reliquary: { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure", assetPath: "assets/generated/image2_processed/items/icon_treasure_broken_statue_v2.png", names: ["咒缚遗钉", "Cursed Reliquary"] },
  gold_pouch: { icon: "◎", badge: "金", categoryLabel: "金币", variant: "currency", assetPath: "assets/generated/image2_processed/items/icon_gold_pouch_v2.png", names: ["金币袋", "Gold Pouch"] },
  health_potion: { icon: "🧪", badge: "药", categoryLabel: "消耗品", variant: "consumable", assetPath: "assets/generated/image2_processed/items/icon_health_potion_v2.png", names: ["回血药剂", "回血药", "Health Potion"] },
  coagulant_bandage: { icon: "🧪", badge: "绷", categoryLabel: "消耗品", variant: "consumable", assetPath: "assets/generated/image2_processed/items/icon_consumable_bandage_v1.png", names: ["凝血绷带", "Coagulant Bandage"] },
  rust_stimulant: { icon: "🧪", badge: "兴", categoryLabel: "消耗品", variant: "consumable", assetPath: "assets/generated/image2_processed/items/icon_consumable_stimulant_v1.png", names: ["锈热兴奋剂", "Rust Stimulant"] },
  miasma_tonic: { icon: "🧪", badge: "抗", categoryLabel: "消耗品", variant: "consumable", assetPath: "assets/generated/image2_processed/items/icon_consumable_miasma_tonic_v1.png", names: ["尸毒抗性药", "Miasma Tonic"] },
  extract_torch: { icon: "◈", badge: "火", categoryLabel: "任务", variant: "quest", assetPath: "assets/generated/image2_processed/items/icon_treasure_small_idol_v2.png", names: ["归营火种", "Extract Torch"] },
  soldier_warblade: { icon: "⚔", badge: "剑", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", assetPath: "assets/generated/image2_processed/items/icon_weapon_warblade_v1.png", names: ["军阵阔剑", "Soldier Warblade"] },
  executioner_greatsword: { icon: "⚔", badge: "剑", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", assetPath: "assets/generated/image2_processed/items/icon_weapon_greatsword_v1.png", names: ["处刑大剑", "Executioner Greatsword"] },
  nightfang_dagger: { icon: "🗡", badge: "刃", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", assetPath: "assets/generated/image2_processed/items/icon_weapon_nightfang_v1.png", names: ["夜牙短刃", "Nightfang Dagger"] },
  bloodletter_falx: { icon: "🗡", badge: "刃", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", assetPath: "assets/generated/image2_processed/items/icon_weapon_falx_v1.png", names: ["放血弯钩", "Bloodletter Falx"] },
  serpent_pike: { icon: "✦", badge: "矛", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", assetPath: "assets/generated/image2_processed/items/icon_weapon_serpent_pike_v1.png", names: ["蛇形骑矛", "Serpent Pike"] },
  gravewarden_halberd: { icon: "✦", badge: "矛", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", assetPath: "assets/generated/image2_processed/items/icon_weapon_halberd_v1.png", names: ["守墓者长戟", "Gravewarden Halberd"] },
  iron_barbute: { icon: "⛑", badge: "头", categoryLabel: "护甲", slotLabel: "头部", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_barbute_v1.png", names: ["铸铁筒盔", "Iron Barbute"] },
  plague_doctor_mask: { icon: "⛑", badge: "头", categoryLabel: "护甲", slotLabel: "头部", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_plague_mask_v1.png", names: ["疫医鸟喙面具", "Plague Doctor Mask"] },
  ghoul_hide_wrap: { icon: "🜁", badge: "甲", categoryLabel: "护甲", slotLabel: "胸甲", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_ghoul_wrap_v1.png", names: ["食尸鬼皮裹甲", "Ghoul Hide Wrap"] },
  brigandine_vest: { icon: "🜁", badge: "甲", categoryLabel: "护甲", slotLabel: "胸甲", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_brigandine_v1.png", names: ["暗扣布面甲", "Brigandine Vest"] },
  bracers_of_haste: { icon: "✊", badge: "手", categoryLabel: "护甲", slotLabel: "手部", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_bracers_v1.png", names: ["疾手缚腕", "Bracers of Haste"] },
  assassin_tabi: { icon: "👢", badge: "靴", categoryLabel: "护甲", slotLabel: "鞋子", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_tabi_v1.png", names: ["无声足袋", "Assassin Tabi"] },
  bulwark_sabatons: { icon: "👢", badge: "靴", categoryLabel: "护甲", slotLabel: "鞋子", variant: "armor", assetPath: "assets/generated/image2_processed/items/icon_armor_sabatons_v1.png", names: ["壁垒铁靴", "Bulwark Sabatons"] },
  silver_candelabrum: { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure", assetPath: "assets/generated/image2_processed/items/icon_treasure_candelabrum_v1.png", names: ["银烛台", "Silver Candelabrum"] },
  bishops_signet: { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure", assetPath: "assets/generated/image2_processed/items/icon_treasure_signet_v1.png", names: ["主教印戒", "Bishop's Signet"] },
  ancient_coin_hoard: { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure", assetPath: "assets/generated/image2_processed/items/icon_treasure_coin_hoard_v1.png", names: ["古币堆", "Ancient Coin Hoard"] },
  gilded_reliquary: { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure", assetPath: "assets/generated/image2_processed/items/icon_treasure_reliquary_v1.png", names: ["鎏金圣髑匣", "Gilded Reliquary"] },
  crown_of_the_fallen: { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure", assetPath: "assets/generated/image2_processed/items/icon_treasure_crown_v1.png", names: ["陨落者王冠", "Crown of the Fallen"] },
  field_ration: { icon: "🧪", badge: "粮", categoryLabel: "消耗品", variant: "consumable", assetPath: "assets/generated/image2_processed/items/icon_consumable_ration_v1.png", names: ["行军干粮", "Field Ration"] },
  army_medkit: { icon: "🧪", badge: "医", categoryLabel: "消耗品", variant: "consumable", assetPath: "assets/generated/image2_processed/items/icon_consumable_medkit_v1.png", names: ["军用医疗包", "Army Medkit"] },
  berserk_draught: { icon: "🧪", badge: "狂", categoryLabel: "消耗品", variant: "consumable", assetPath: "assets/generated/image2_processed/items/icon_consumable_berserk_v1.png", names: ["蛮勇药剂", "Berserk Draught"] }
};

const NAME_LOOKUP = new Map<string, string>();
const RARITY_LABELS: Record<string, string> = {
  common: "普通",
  uncommon: "精良",
  rare: "稀有",
  epic: "史诗"
};

for (const [definitionId, preset] of Object.entries(ITEM_PRESETS)) {
  NAME_LOOKUP.set(normalizeKey(definitionId), definitionId);
  for (const name of preset.names) {
    NAME_LOOKUP.set(normalizeKey(name), definitionId);
  }
}

export function translateItemName(nameOrId: string, definitionId?: string): string {
  const preset = resolvePreset({ definitionId, name: nameOrId });
  return preset?.names[0] ?? nameOrId;
}

export function getItemPresentation(input: ItemPresentationInput): ItemPresentation {
  const preset = resolvePreset(input);
  const rarityLabel = RARITY_LABELS[normalizeKey(input.rarity ?? "common")] ?? "普通";
  if (preset) {
    return {
      displayName: preset.names[0],
      icon: preset.icon,
      badge: preset.badge,
      categoryLabel: preset.categoryLabel,
      slotLabel: preset.slotLabel,
      variant: preset.variant,
      iconKey: preset.variant,
      iconSvg: buildIconHtml(preset.icon, preset.assetPath),
      shortLabel: preset.badge,
      detailLabel: preset.slotLabel ? `${preset.categoryLabel} · ${preset.slotLabel}` : preset.categoryLabel,
      rarityLabel
    };
  }

  const fallback = getFallbackPresentation(input);
  return {
    displayName: input.name || input.definitionId || "未知物品",
    ...fallback,
    iconKey: fallback.variant,
    iconSvg: buildIconHtml(fallback.icon, fallback.assetPath),
    shortLabel: fallback.badge,
    detailLabel: fallback.slotLabel ? `${fallback.categoryLabel} · ${fallback.slotLabel}` : fallback.categoryLabel,
    rarityLabel
  };
}

export function getSlotLabel(slot: string): string {
  return getFallbackPresentation({ slot }).slotLabel ?? slot;
}

function resolvePreset(input: ItemPresentationInput): ItemPresentationPreset | undefined {
  const candidates = [input.definitionId, input.name]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => NAME_LOOKUP.get(normalizeKey(value)))
    .filter((value): value is string => typeof value === "string");

  for (const key of candidates) {
    const preset = ITEM_PRESETS[key];
    if (preset) return preset;
  }

  return undefined;
}

function getFallbackPresentation(input: ItemPresentationInput): ItemPresentationCore {
  const slot = input.slot?.toLowerCase();
  const kind = input.kind?.toLowerCase();

  if (slot === "weapon" || kind === "weapon") {
    return { icon: "⚔", badge: "武", categoryLabel: "武器", slotLabel: "武器", variant: "weapon" };
  }
  if (slot === "head") {
    return { icon: "⛑", badge: "头", categoryLabel: "护甲", slotLabel: "头部", variant: "armor" };
  }
  if (slot === "chest") {
    return { icon: "🜁", badge: "甲", categoryLabel: "护甲", slotLabel: "胸甲", variant: "armor" };
  }
  if (slot === "hands") {
    return { icon: "✊", badge: "手", categoryLabel: "护甲", slotLabel: "手部", variant: "armor" };
  }
  if (slot === "shoes") {
    return { icon: "👢", badge: "靴", categoryLabel: "护甲", slotLabel: "鞋子", variant: "armor" };
  }
  if (kind === "consumable") {
    return { icon: "🧪", badge: "药", categoryLabel: "消耗品", variant: "consumable" };
  }
  if (kind === "currency" || kind === "gold") {
    return { icon: "◎", badge: "金", categoryLabel: "金币", variant: "currency" };
  }
  if (kind === "treasure") {
    return { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure" };
  }

  return { icon: "◆", badge: "物", categoryLabel: "物品", variant: "misc" };
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildIconHtml(glyph: string, assetPath?: string): string {
  if (assetPath) {
    return `<img class="inventory-item-icon__image" src="${assetPath}" alt="" aria-hidden="true" loading="lazy" decoding="async">`;
  }
  return `<span class="inventory-item-icon__glyph" aria-hidden="true">${glyph}</span>`;
}
