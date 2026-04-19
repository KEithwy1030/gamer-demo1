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
  head: "头盔",
  chest: "护甲",
  hands: "手套",
  shoes: "鞋子"
};

const RARITY_LABELS: Record<string, string> = {
  common: "普通",
  uncommon: "稀有",
  rare: "精良",
  epic: "史诗"
};

const STAT_LABELS: Record<string, string> = {
  attackPower: "攻击力",
  attackSpeed: "攻击速度",
  maxHp: "最大生命值",
  moveSpeed: "移动速度",
  damageReduction: "伤害减免",
  critRate: "暴击率",
  critDamage: "暴击伤害",
  hpRegen: "生命恢复",
  dodgeRate: "闪避率",
  slow: "减速",
  bleed: "流血",
  slowResist: "减速抗性",
  antiCrit: "抗暴率"
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

export function createInventoryPanel(options: InventoryPanelOptions): InventoryPanelApi {
  let hideTimeout: number | undefined;
  let activeTooltip: HTMLElement | null = null;

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
    }, 150);
  };

  const element = document.createElement("aside");
  element.className = "inventory-panel inventory-panel--collapsed";

  const header = document.createElement("div");
  header.className = "inventory-panel__header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "inventory-panel__title-wrap";

  const title = document.createElement("h3");
  title.className = "inventory-panel__title";
  title.textContent = "背囊";

  const summary = document.createElement("p");
  summary.className = "inventory-panel__summary";
  summary.textContent = "正在获取背囊信息...";

  titleWrap.append(title, summary);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "inventory-panel__toggle";
  toggle.textContent = "展开";

  const mobileToggle = document.createElement("div");
  mobileToggle.className = "inventory-mobile-toggle";
  mobileToggle.textContent = "背囊";

  const closeInventory = () => {
    element.classList.add("inventory-panel--collapsed");
    toggle.textContent = "展开";
  };

  const openInventory = () => {
    element.classList.remove("inventory-panel--collapsed");
    toggle.textContent = "收起";
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
    openInventory();
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
  };
  mq.addEventListener("change", handleMq);
  handleMq(mq);

  mobileClose.addEventListener("click", closeInventory);

  header.append(titleWrap, toggle, mobileClose);
  document.body.append(mobileToggle);

  const body = document.createElement("div");
  body.className = "inventory-panel__body";

  const equipmentSection = document.createElement("div");
  equipmentSection.className = "inventory-section";
  const equipmentTitle = document.createElement("h4");
  equipmentTitle.textContent = "装备栏";
  const equipmentGrid = document.createElement("div");
  equipmentGrid.className = "inventory-grid inventory-grid--equipment";

  const backpackSection = document.createElement("div");
  backpackSection.className = "inventory-section inventory-section--backpack";
  const backpackTitle = document.createElement("h4");
  backpackTitle.textContent = "背包 (10×10)";
  const backpackGrid = document.createElement("div");
  backpackGrid.className = "inventory-grid inventory-grid--backpack";

  equipmentSection.append(equipmentTitle, equipmentGrid);
  backpackSection.append(backpackTitle, backpackGrid);
  body.append(equipmentSection, backpackSection);
  element.append(header, body);

  return {
    element,
    render(inventory) {
      if (!inventory) {
        summary.textContent = "正在获取背包信息...";
        equipmentGrid.replaceChildren();
        backpackGrid.replaceChildren();
        return;
      }

      const itemCount = inventory.items.length;
      const weapon = inventory.equipment.weapon;
      summary.textContent = `${weapon?.name ?? "赤手空拳"} | ${itemCount} 件物品`;

      equipmentGrid.replaceChildren();
      for (const slotKey of SLOT_ORDER) {
        equipmentGrid.append(createGridSlot(slotKey, inventory.equipment[slotKey]));
      }

      backpackGrid.replaceChildren();
      const totalSlots = 100;
      for (let index = 0; index < totalSlots; index += 1) {
        backpackGrid.append(createGridSlot("item", inventory.items[index]));
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
    slot.append(icon, tooltip);

    const toggleTooltip = (show: boolean) => {
      clearHideTimeout();
      if (show) {
        if (activeTooltip && activeTooltip !== tooltip) {
          activeTooltip.classList.remove("is-visible");
        }
        activeTooltip = tooltip;
        tooltip.classList.add("is-visible");
      } else {
        startHideTimeout();
      }
    };

    slot.addEventListener("mouseenter", () => {
      if (window.matchMedia("(min-width: 768px)").matches) {
        toggleTooltip(true);
      }
    });

    slot.addEventListener("mouseleave", () => {
      if (window.matchMedia("(min-width: 768px)").matches) {
        toggleTooltip(false);
      }
    });

    slot.addEventListener("click", (event) => {
      if (window.matchMedia("(max-width: 767px)").matches) {
        event.stopPropagation();
        const wasVisible = tooltip.classList.contains("is-visible");
        if (wasVisible) {
          toggleTooltip(false);
          activeTooltip = null;
        } else {
          toggleTooltip(true);
        }
      }
    });

    return slot;
  }

  function createTooltip(item: MatchInventoryItem, isEquipped: boolean): HTMLElement {
    const tooltip = document.createElement("div");
    tooltip.className = "inventory-tooltip";

    tooltip.addEventListener("mouseenter", () => {
      clearHideTimeout();
    });

    tooltip.addEventListener("mouseleave", () => {
      startHideTimeout();
    });

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
