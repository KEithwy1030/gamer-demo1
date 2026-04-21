import type { MatchInventoryItem, MatchInventoryState } from "../game/matchRuntime";
import "../styles/inventory.css";

export interface InventoryPanelApi {
  readonly element: HTMLElement;
  render(inventory: MatchInventoryState | null): void;
}

export interface InventoryPanelOptions {
  onEquip(instanceId: string): void;
  onUnequip(instanceId: string): void;
  onDrop(instanceId: string): void;
  onUse(instanceId: string): void;
}

const SLOT_ORDER = ["weapon", "head", "chest", "hands", "shoes"] as const;

const SLOT_LABELS: Record<string, string> = {
  weapon: "武器",
  head: "头部",
  chest: "胸甲",
  hands: "手部",
  shoes: "鞋子"
};

const RARITY_LABELS: Record<string, string> = {
  common: "普通",
  uncommon: "精良",
  rare: "稀有",
  epic: "史诗"
};

const STAT_LABELS: Record<string, string> = {
  attackPower: "攻击",
  attackSpeed: "攻速",
  maxHp: "最大生命",
  moveSpeed: "移速",
  damageReduction: "减伤",
  critRate: "暴击率",
  critDamage: "暴击伤害",
  hpRegen: "生命回复",
  dodgeRate: "闪避",
  slow: "减速",
  bleed: "流血",
  slowResist: "减速抗性",
  antiCrit: "抗暴"
};

const PERCENT_STATS = new Set([
  "attackSpeed",
  "damageReduction",
  "critRate",
  "critDamage",
  "dodgeRate",
  "slow",
  "slowResist",
  "antiCrit"
]);

const TOOLTIP_MARGIN = 12;
const TOOLTIP_GAP = 10;

export function createInventoryPanel(options: InventoryPanelOptions): InventoryPanelApi {
  let hideTimeout: number | undefined;
  let activeTooltip: HTMLElement | null = null;
  const ownedTooltips = new Set<HTMLElement>();

  const clearHideTimeout = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = undefined;
    }
  };

  const startHideTimeout = () => {
    clearHideTimeout();
    hideTimeout = window.setTimeout(() => {
      if (activeTooltip) {
        activeTooltip.classList.remove("is-visible");
        activeTooltip = null;
      }
    }, 220);
  };

  const removeOwnedTooltips = () => {
    clearHideTimeout();
    activeTooltip = null;
    for (const tooltip of ownedTooltips) {
      tooltip.remove();
    }
    ownedTooltips.clear();
  };

  const element = document.createElement("aside");
  element.className = "inventory-panel inventory-panel--collapsed";

  const header = document.createElement("div");
  header.className = "inventory-panel__header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "inventory-panel__title-wrap";

  const title = document.createElement("h3");
  title.className = "inventory-panel__title";
  title.textContent = "背包";

  const summary = document.createElement("p");
  summary.className = "inventory-panel__summary";
  summary.textContent = "正在获取背包信息...";

  titleWrap.append(title, summary);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "inventory-panel__toggle";

  const mobileToggle = document.createElement("div");
  mobileToggle.className = "inventory-mobile-toggle";

  const updateLauncherLabel = () => {
    const isCompact = window.matchMedia("(max-width: 767px)").matches;
    const isCollapsed = element.classList.contains("inventory-panel--collapsed");
    if (isCompact) {
      mobileToggle.textContent = isCollapsed ? "背包" : "收起";
      toggle.textContent = isCollapsed ? "展开" : "收起";
      return;
    }

    mobileToggle.textContent = isCollapsed ? "Inventory (I)" : "Close Inventory";
    toggle.textContent = isCollapsed ? "Open" : "Close";
  };

  const closeInventory = () => {
    element.classList.add("inventory-panel--collapsed");
    updateLauncherLabel();
  };

  const openInventory = () => {
    element.classList.remove("inventory-panel--collapsed");
    updateLauncherLabel();
  };

  toggle.addEventListener("click", () => {
    if (element.classList.contains("inventory-panel--collapsed")) {
      openInventory();
    } else {
      closeInventory();
    }
  });

  mobileToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (element.classList.contains("inventory-panel--collapsed")) {
      openInventory();
    } else {
      closeInventory();
    }
  });

  const mobileClose = document.createElement("button");
  mobileClose.className = "inventory-panel__toggle";
  mobileClose.style.display = "none";
  mobileClose.textContent = "收起";
  mobileClose.style.backgroundColor = "#f85149";
  mobileClose.style.borderColor = "#f85149";

  const mq = window.matchMedia("(max-width: 767px)");
  const handleMq = (media: MediaQueryList | MediaQueryListEvent) => {
    mobileClose.style.display = media.matches ? "flex" : "none";
    toggle.style.display = media.matches ? "none" : "flex";
    updateLauncherLabel();
  };
  mq.addEventListener("change", handleMq);
  handleMq(mq);

  mobileClose.addEventListener("click", closeInventory);

  header.append(titleWrap, toggle, mobileClose);
  document.body.append(mobileToggle);
  updateLauncherLabel();

  const body = document.createElement("div");
  body.className = "inventory-panel__body";

  const equipmentSection = document.createElement("div");
  equipmentSection.className = "inventory-section";
  const equipmentTitle = document.createElement("h4");
  equipmentTitle.textContent = "已装备";
  const equipmentGrid = document.createElement("div");
  equipmentGrid.className = "inventory-grid inventory-grid--equipment";

  const backpackSection = document.createElement("div");
  backpackSection.className = "inventory-section inventory-section--backpack";
  const backpackTitle = document.createElement("h4");
  backpackTitle.textContent = "背包";
  const backpackGrid = document.createElement("div");
  backpackGrid.className = "inventory-grid inventory-grid--backpack";

  equipmentSection.append(equipmentTitle, equipmentGrid);
  backpackSection.append(backpackTitle, backpackGrid);
  body.append(equipmentSection, backpackSection);
  element.append(header, body);

  return {
    element,
    render(inventory) {
      removeOwnedTooltips();
      if (!inventory) {
        summary.textContent = "正在获取背包信息...";
        equipmentGrid.replaceChildren();
        backpackGrid.replaceChildren();
        return;
      }

      const itemCount = inventory.items.length;
      const weapon = inventory.equipment.weapon;
      const invW = inventory.width || 10;
      const invH = inventory.height || 6;
      summary.textContent = `${weapon?.name ?? "赤手空拳"} | ${itemCount} 件物品 (${invW}x${invH})`;
      backpackTitle.textContent = `背包 (${invW}x${invH})`;
      backpackGrid.style.setProperty("--inventory-columns", String(invW));

      equipmentGrid.replaceChildren();
      for (const slotKey of SLOT_ORDER) {
        equipmentGrid.append(createGridSlot(slotKey, inventory.equipment[slotKey]));
      }

      backpackGrid.replaceChildren();
      const placedItems = buildBackpackSlots(inventory.items, invW, invH);
      for (const item of placedItems) {
        backpackGrid.append(createGridSlot("item", item));
      }
    }
  };

  function createGridSlot(type: string, item?: MatchInventoryItem): HTMLElement {
    const slot = document.createElement("div");
    slot.className = "inventory-slot";

    if (type !== "item") {
      slot.dataset.label = SLOT_LABELS[type] ?? type;
      const label = document.createElement("span");
      label.className = "inventory-slot-label";
      label.textContent = SLOT_LABELS[type] ?? type;
      slot.append(label);
    }

    if (!item) {
      slot.classList.add("inventory-slot--empty");
      return slot;
    }

    const rarity = (item.rarity ?? "common").toLowerCase();
    slot.classList.add(`quality-${rarity}`, "inventory-slot--filled");

    const icon = document.createElement("div");
    icon.className = "inventory-item-icon";
    icon.textContent = (item.name || "?")[0]?.toUpperCase() ?? "?";

    const tooltip = createTooltip(item, type !== "item");
    ownedTooltips.add(tooltip);
    document.body.append(tooltip);
    slot.append(icon);

    const positionTooltip = () => {
      if (!window.matchMedia("(min-width: 768px)").matches) {
        return;
      }

      const slotRect = slot.getBoundingClientRect();
      const tooltipWidth = tooltip.offsetWidth || 220;
      const tooltipHeight = tooltip.offsetHeight || 180;
      const maxTop = window.innerHeight - tooltipHeight - TOOLTIP_MARGIN;
      const top = Math.min(maxTop, Math.max(TOOLTIP_MARGIN, slotRect.top));
      const canPlaceRight = slotRect.right + TOOLTIP_GAP + tooltipWidth <= window.innerWidth - TOOLTIP_MARGIN;
      const canPlaceLeft = slotRect.left - TOOLTIP_GAP - tooltipWidth >= TOOLTIP_MARGIN;

      if (canPlaceRight) {
        tooltip.style.left = `${slotRect.right + TOOLTIP_GAP}px`;
        tooltip.style.top = `${top}px`;
        tooltip.style.transform = "translate(0, 0)";
        return;
      }

      if (canPlaceLeft) {
        tooltip.style.left = `${slotRect.left - TOOLTIP_GAP}px`;
        tooltip.style.top = `${top}px`;
        tooltip.style.transform = "translate(-100%, 0)";
        return;
      }

      const centeredLeft = slotRect.left + slotRect.width / 2;
      const minLeft = TOOLTIP_MARGIN + tooltipWidth / 2;
      const maxLeft = window.innerWidth - TOOLTIP_MARGIN - tooltipWidth / 2;
      const left = Math.min(maxLeft, Math.max(minLeft, centeredLeft));
      const placeAbove = slotRect.top - tooltipHeight - TOOLTIP_GAP >= TOOLTIP_MARGIN;
      const fallbackTop = placeAbove
        ? slotRect.top - TOOLTIP_GAP
        : Math.min(maxTop, slotRect.bottom + TOOLTIP_GAP);

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${fallbackTop}px`;
      tooltip.style.transform = placeAbove ? "translate(-50%, -100%)" : "translate(-50%, 0)";
    };

    const shouldKeepVisible = (relatedTarget: EventTarget | null) =>
      relatedTarget instanceof Node && (slot.contains(relatedTarget) || tooltip.contains(relatedTarget));

    const showTooltip = () => {
      clearHideTimeout();
      if (activeTooltip && activeTooltip !== tooltip) {
        activeTooltip.classList.remove("is-visible");
      }
      activeTooltip = tooltip;
      tooltip.classList.add("is-visible");
      positionTooltip();
    };

    slot.addEventListener("mouseenter", () => {
      if (window.matchMedia("(min-width: 768px)").matches) {
        showTooltip();
      }
    });

    slot.addEventListener("mouseleave", (event) => {
      if (window.matchMedia("(min-width: 768px)").matches && !shouldKeepVisible(event.relatedTarget)) {
        startHideTimeout();
      }
    });

    tooltip.addEventListener("mouseenter", () => {
      clearHideTimeout();
      activeTooltip = tooltip;
    });

    tooltip.addEventListener("mouseleave", (event) => {
      if (!shouldKeepVisible(event.relatedTarget)) {
        startHideTimeout();
      }
    });

    slot.addEventListener("click", (event) => {
      if (window.matchMedia("(max-width: 767px)").matches) {
        event.stopPropagation();
        const wasVisible = tooltip.classList.contains("is-visible");
        if (wasVisible) {
          tooltip.classList.remove("is-visible");
          activeTooltip = null;
          clearHideTimeout();
        } else {
          showTooltip();
        }
      }
    });

    return slot;
  }

  function createTooltip(item: MatchInventoryItem, isEquipped: boolean): HTMLElement {
    const tooltip = document.createElement("div");
    tooltip.className = "inventory-tooltip";

    const rarity = (item.rarity ?? "common").toLowerCase();

    const header = document.createElement("div");
    header.className = "tooltip-header";

    const name = document.createElement("span");
    name.className = `tooltip-name quality-${rarity}`;
    name.textContent = item.name;

    const badge = document.createElement("span");
    badge.className = `tooltip-rarity quality-${rarity}`;
    badge.textContent = RARITY_LABELS[rarity] ?? rarity;

    header.append(name, badge);

    const slotInfo = document.createElement("div");
    slotInfo.className = "tooltip-slot";
    slotInfo.textContent = item.slot ? (SLOT_LABELS[item.slot] ?? item.slot) : "物品";

    const statsContainer = document.createElement("div");
    statsContainer.className = "tooltip-stats";

    for (const [key, value] of Object.entries(item.modifiers ?? {})) {
      if (value != null && value !== 0) {
        statsContainer.append(createStatLine(key, value));
      }
    }

    for (const affix of item.affixes ?? []) {
      statsContainer.append(createStatLine(affix.key, affix.value));
    }

    if (item.kind === "consumable" && item.healAmount) {
      const line = document.createElement("div");
      line.className = "stat-line stat-line--positive";
      line.textContent = `治疗 +${item.healAmount} 生命值`;
      statsContainer.append(line);
    }

    const actions = document.createElement("div");
    actions.className = "tooltip-actions";

    if (item.kind === "consumable") {
      const useBtn = document.createElement("button");
      useBtn.textContent = "使用";
      useBtn.onclick = (event) => {
        event.stopPropagation();
        options.onUse(item.instanceId);
      };
      actions.append(useBtn);
    } else if (!isEquipped) {
      const equipBtn = document.createElement("button");
      equipBtn.textContent = "装备";
      equipBtn.onclick = (event) => {
        event.stopPropagation();
        options.onEquip(item.instanceId);
      };
      actions.append(equipBtn);
    } else {
      const unequipBtn = document.createElement("button");
      unequipBtn.textContent = "卸下";
      unequipBtn.onclick = (event) => {
        event.stopPropagation();
        options.onUnequip(item.instanceId);
      };
      actions.append(unequipBtn);
    }

    if (!isEquipped) {
      const dropBtn = document.createElement("button");
      dropBtn.textContent = "丢弃";
      dropBtn.className = "btn-drop";
      dropBtn.onclick = (event) => {
        event.stopPropagation();
        options.onDrop(item.instanceId);
      };
      actions.append(dropBtn);
    }

    tooltip.append(header, slotInfo, statsContainer, actions);
    return tooltip;
  }

  function createStatLine(key: string, value: number): HTMLElement {
    const line = document.createElement("div");
    line.className = "stat-line";
    if (value > 0) {
      line.classList.add("stat-line--positive");
    }

    const amount = PERCENT_STATS.has(key)
      ? `${Math.round(value * 100)}%`
      : `${Math.round(value * 10) / 10}`;
    const sign = value >= 0 ? "+" : "";
    line.textContent = `${STAT_LABELS[key] ?? key} ${sign}${amount}`;
    return line;
  }
}

function buildBackpackSlots(
  items: MatchInventoryItem[],
  width: number,
  height: number
): Array<MatchInventoryItem | undefined> {
  const totalSlots = Math.max(width * height, 0);
  const slots = new Array<MatchInventoryItem | undefined>(totalSlots).fill(undefined);
  const fallbackItems: MatchInventoryItem[] = [];

  for (const item of items ?? []) {
    const hasGridPosition = Number.isInteger(item?.x) && Number.isInteger(item?.y);
    if (!hasGridPosition) {
      fallbackItems.push(item);
      continue;
    }

    const index = (item.y as number) * width + (item.x as number);
    if (index >= 0 && index < totalSlots && !slots[index]) {
      slots[index] = item;
    } else {
      fallbackItems.push(item);
    }
  }

  for (const item of fallbackItems) {
    const emptyIndex = slots.findIndex((entry) => !entry);
    if (emptyIndex === -1) {
      break;
    }
    slots[emptyIndex] = item;
  }

  return slots;
}
