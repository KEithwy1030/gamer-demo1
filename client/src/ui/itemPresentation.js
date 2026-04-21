const SLOT_LABELS = {
    weapon: "武器",
    head: "头部",
    chest: "胸甲",
    hands: "手部",
    shoes: "鞋子"
};
const RARITY_LABELS = {
    common: "普通",
    uncommon: "精良",
    rare: "稀有",
    epic: "史诗"
};
const ITEM_PRESETS = {
    starter_sword: buildPreset("weapon-sword", "近战武器", "武器", ["制式长剑", "Starter Sword", "Sword"]),
    weapon_sword_basic: buildPreset("weapon-sword", "近战武器", "武器", ["锈剑", "Rust Sword"]),
    raider_blade: buildPreset("weapon-blade", "近战武器", "武器", ["突击者之刃", "Raider Blade", "Blade"]),
    weapon_blade_basic: buildPreset("weapon-blade", "近战武器", "武器", ["掠袭短刃", "Raider Blade"]),
    hunter_spear: buildPreset("weapon-spear", "近战武器", "武器", ["猎人长矛", "Hunter Spear", "Spear"]),
    weapon_spear_basic: buildPreset("weapon-spear", "近战武器", "武器", ["旧长矛", "Old Spear"]),
    leather_hood: buildPreset("armor-head", "护甲", "头部", ["皮质兜帽", "Leather Hood"]),
    armor_head_common: buildPreset("armor-head", "护甲", "头部", ["斥候兜帽", "Scout Hood"]),
    scavenger_coat: buildPreset("armor-chest", "护甲", "胸甲", ["拾荒者大衣", "Scavenger Coat"]),
    armor_chest_common: buildPreset("armor-chest", "护甲", "胸甲", ["拼接胸甲", "Patch Chestpiece"]),
    armor_hands_common: buildPreset("armor-hands", "护甲", "手部", ["握柄手套", "Grip Gloves"]),
    trail_greaves: buildPreset("armor-shoes", "护甲", "鞋子", ["径行腿甲", "Trail Greaves"]),
    armor_feet_common: buildPreset("armor-shoes", "护甲", "鞋子", ["旅途皮靴", "Road Boots"]),
    jade_idol: buildPreset("treasure-idol", "宝物", undefined, ["古玉像", "Jade Idol"]),
    treasure_small_idol: buildPreset("treasure-idol", "宝物", undefined, ["小型神像", "Small Idol"]),
    treasure_medium_tablet: buildPreset("treasure-tablet", "宝物", undefined, ["石刻碑板", "Stone Tablet"]),
    treasure_large_statue: buildPreset("treasure-statue", "宝物", undefined, ["残损雕像", "Broken Statue"]),
    gold_pouch: buildPreset("currency-gold", "钱币", undefined, ["金币袋", "Gold Pouch"]),
    health_potion: buildPreset("consumable-potion", "消耗品", undefined, ["回血药", "Health Potion"])
};
const NAME_LOOKUP = new Map();
for (const [definitionId, preset] of Object.entries(ITEM_PRESETS)) {
    NAME_LOOKUP.set(normalizeKey(definitionId), definitionId);
    for (const name of preset.names) {
        NAME_LOOKUP.set(normalizeKey(name), definitionId);
    }
}
export function translateItemName(nameOrId, definitionId) {
    const preset = resolvePreset({ definitionId, name: nameOrId });
    return preset?.names[0] ?? nameOrId;
}
export function getItemPresentation(input) {
    const preset = resolvePreset(input);
    const rarityLabel = getRarityLabel(input.rarity);
    const displayName = preset?.names[0] ?? input.name ?? input.definitionId ?? "未知物品";
    const base = preset ?? getFallbackPresentation(input);
    return {
        displayName,
        ...base,
        iconKey: base.variant,
        iconSvg: buildIconSvg(base.variant),
        shortLabel: base.badge,
        detailLabel: base.slotLabel ? `${base.categoryLabel} / ${base.slotLabel}` : base.categoryLabel,
        rarityLabel
    };
}
export function getSlotLabel(slot) {
    return SLOT_LABELS[normalizeKey(slot)] ?? slot;
}
function resolvePreset(input) {
    const candidates = [input.definitionId, input.name]
        .filter((value) => typeof value === "string" && value.length > 0)
        .map((value) => NAME_LOOKUP.get(normalizeKey(value)))
        .filter((value) => typeof value === "string");
    for (const key of candidates) {
        const preset = ITEM_PRESETS[key];
        if (preset) {
            return preset;
        }
    }
    return undefined;
}
function getFallbackPresentation(input) {
    const slot = normalizeKey(input.slot ?? "");
    const kind = normalizeKey(input.kind ?? "");
    if (slot === "weapon" || kind === "weapon") {
        return buildPreset("weapon-sword", "近战武器", "武器", [""]);
    }
    if (slot === "head") {
        return buildPreset("armor-head", "护甲", "头部", [""]);
    }
    if (slot === "chest") {
        return buildPreset("armor-chest", "护甲", "胸甲", [""]);
    }
    if (slot === "hands") {
        return buildPreset("armor-hands", "护甲", "手部", [""]);
    }
    if (slot === "shoes") {
        return buildPreset("armor-shoes", "护甲", "鞋子", [""]);
    }
    if (kind === "consumable") {
        return buildPreset("consumable-potion", "消耗品", undefined, [""]);
    }
    if (kind === "currency" || kind === "gold") {
        return buildPreset("currency-gold", "钱币", undefined, [""]);
    }
    if (kind === "treasure") {
        return buildPreset("treasure-idol", "宝物", undefined, [""]);
    }
    return buildPreset("misc-crate", "物品", undefined, [""]);
}
function getRarityLabel(rarity) {
    return RARITY_LABELS[normalizeKey(rarity ?? "common")] ?? RARITY_LABELS.common;
}
function buildPreset(variant, categoryLabel, slotLabel, names) {
    return {
        icon: getGlyphForVariant(variant),
        badge: getBadgeForVariant(variant),
        categoryLabel,
        slotLabel,
        variant,
        names
    };
}
function getBadgeForVariant(variant) {
    if (variant.startsWith("weapon"))
        return "战";
    if (variant.startsWith("armor"))
        return "甲";
    if (variant.startsWith("treasure"))
        return "宝";
    if (variant.startsWith("consumable"))
        return "药";
    if (variant.startsWith("currency"))
        return "金";
    return "物";
}
function getGlyphForVariant(variant) {
    if (variant.startsWith("weapon"))
        return "刃";
    if (variant.startsWith("armor"))
        return "甲";
    if (variant.startsWith("treasure"))
        return "宝";
    if (variant.startsWith("consumable"))
        return "药";
    if (variant.startsWith("currency"))
        return "金";
    return "物";
}
function normalizeKey(value) {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
}
function buildIconSvg(variant) {
    switch (variant) {
        case "weapon-sword":
            return iconSvg('<path d="M32 10 L38 16 L27 27 L21 21 Z" />' +
                '<rect x="20" y="27" width="4" height="18" rx="1" />' +
                '<rect x="14" y="42" width="16" height="4" rx="1" />');
        case "weapon-blade":
            return iconSvg('<path d="M14 16 L42 22 L31 33 L12 28 Z" />' +
                '<rect x="28" y="32" width="4" height="12" rx="1" />' +
                '<rect x="24" y="42" width="12" height="4" rx="1" />');
        case "weapon-spear":
            return iconSvg('<path d="M30 8 L38 18 L32 20 L24 12 Z" />' +
                '<rect x="22" y="18" width="4" height="28" rx="1" transform="rotate(25 24 32)" />');
        case "armor-head":
            return iconSvg('<path d="M16 26 C16 16 24 10 32 10 C40 10 48 16 48 26 L48 40 L16 40 Z" />' +
                '<circle cx="32" cy="26" r="7" fill="#0f172a" />');
        case "armor-chest":
            return iconSvg('<path d="M20 12 L28 16 L36 16 L44 12 L48 20 L42 50 L22 50 L16 20 Z" />');
        case "armor-hands":
            return iconSvg('<path d="M24 12 L28 18 L28 28 L24 42 L16 38 L18 24 Z" />' +
                '<path d="M40 12 L46 24 L48 38 L40 42 L36 28 L36 18 Z" />');
        case "armor-shoes":
            return iconSvg('<path d="M18 18 L28 18 L30 34 L18 34 Z" />' +
                '<path d="M30 34 L42 34 L46 44 L18 44 L18 38 Z" />');
        case "treasure-idol":
            return iconSvg('<circle cx="32" cy="18" r="7" />' +
                '<path d="M22 28 L42 28 L46 50 L18 50 Z" />');
        case "treasure-tablet":
            return iconSvg('<rect x="18" y="12" width="28" height="40" rx="4" />' +
                '<path d="M24 24 H40 M24 32 H40 M24 40 H36" stroke="#0f172a" stroke-width="3" stroke-linecap="round" fill="none" />');
        case "treasure-statue":
            return iconSvg('<path d="M24 12 H40 L46 50 H18 Z" />' +
                '<circle cx="32" cy="22" r="5" fill="#0f172a" />');
        case "currency-gold":
            return iconSvg('<ellipse cx="32" cy="20" rx="12" ry="6" />' +
                '<ellipse cx="32" cy="30" rx="12" ry="6" />' +
                '<ellipse cx="32" cy="40" rx="12" ry="6" />');
        case "consumable-potion":
            return iconSvg('<path d="M24 12 H40 V20 L44 28 V46 A4 4 0 0 1 40 50 H24 A4 4 0 0 1 20 46 V28 L24 20 Z" />' +
                '<path d="M24 30 H40" stroke="#0f172a" stroke-width="3" stroke-linecap="round" fill="none" />');
        default:
            return iconSvg('<rect x="18" y="18" width="28" height="28" rx="6" />');
    }
}
function iconSvg(content) {
    return `
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        ${content}
      </g>
    </svg>
  `.trim();
}
