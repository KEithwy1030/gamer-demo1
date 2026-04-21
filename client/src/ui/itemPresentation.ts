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
  starter_sword: { icon: "⚔", badge: "剑", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", names: ["制式长剑", "Starter Sword", "Sword"] },
  weapon_sword_basic: { icon: "⚔", badge: "剑", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", names: ["锈蚀长剑", "锈剑", "Rust Sword"] },
  raider_blade: { icon: "🗡", badge: "刃", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", names: ["突袭弯刃", "突击者之刃", "Raider Blade", "Blade"] },
  weapon_blade_basic: { icon: "🗡", badge: "刃", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", names: ["突袭弯刃", "掠袭短刃", "Raider Blade"] },
  hunter_spear: { icon: "✦", badge: "矛", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", names: ["猎人长矛", "Hunter Spear", "Spear"] },
  weapon_spear_basic: { icon: "✦", badge: "矛", categoryLabel: "武器", slotLabel: "武器", variant: "weapon", names: ["旧猎矛", "旧长矛", "Old Spear"] },
  leather_hood: { icon: "⛑", badge: "头", categoryLabel: "护甲", slotLabel: "头部", variant: "armor", names: ["皮质兜帽", "Leather Hood"] },
  armor_head_common: { icon: "⛑", badge: "头", categoryLabel: "护甲", slotLabel: "头部", variant: "armor", names: ["斥候兜帽", "Scout Hood"] },
  scavenger_coat: { icon: "🜁", badge: "甲", categoryLabel: "护甲", slotLabel: "胸甲", variant: "armor", names: ["拾荒者外衣", "拾荒者大衣", "Scavenger Coat"] },
  armor_chest_common: { icon: "🜁", badge: "甲", categoryLabel: "护甲", slotLabel: "胸甲", variant: "armor", names: ["拼接胸甲", "Patch Chestpiece"] },
  armor_hands_common: { icon: "✊", badge: "手", categoryLabel: "护甲", slotLabel: "手部", variant: "armor", names: ["握柄手套", "Grip Gloves"] },
  trail_greaves: { icon: "👢", badge: "靴", categoryLabel: "护甲", slotLabel: "鞋子", variant: "armor", names: ["径行胫甲", "径行腿甲", "Trail Greaves"] },
  armor_feet_common: { icon: "👢", badge: "靴", categoryLabel: "护甲", slotLabel: "鞋子", variant: "armor", names: ["旅者短靴", "旅途皮靴", "Road Boots"] },
  jade_idol: { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure", names: ["古玉偶像", "古玉像", "Jade Idol"] },
  treasure_small_idol: { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure", names: ["小型偶像", "小型神像", "Small Idol"] },
  treasure_medium_tablet: { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure", names: ["石刻碑板", "Stone Tablet"] },
  treasure_large_statue: { icon: "◈", badge: "宝", categoryLabel: "宝物", variant: "treasure", names: ["残破雕像", "残损雕像", "Broken Statue"] },
  gold_pouch: { icon: "◎", badge: "金", categoryLabel: "金币", variant: "currency", names: ["金币袋", "Gold Pouch"] },
  health_potion: { icon: "🧪", badge: "药", categoryLabel: "消耗品", variant: "consumable", names: ["回血药剂", "回血药", "Health Potion"] }
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
      iconSvg: buildIconSvg(preset.icon),
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
    iconSvg: buildIconSvg(fallback.icon),
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

function buildIconSvg(glyph: string): string {
  return `<span class="inventory-item-icon__glyph" aria-hidden="true">${glyph}</span>`;
}
