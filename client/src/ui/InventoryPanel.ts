import { findFirstFitRect } from "@gamer/shared";
import type { MatchInventoryItem, MatchInventoryState } from "../game/matchRuntime";
import "../styles/inventory.css";
import "../styles/inventoryDrag.css";
import { getItemPresentation, getSlotLabel } from "./itemPresentation";
import {
  createDragGhost,
  formatHighlightRect,
  resolveEquipmentCandidate,
  resolveGridCandidate,
  toDragOccupants,
  updateDragGhostPosition,
  isPointWithinRect,
  type DragGridCandidate,
  type DragPointerOffset
} from "./inventoryDrag/shared";

export interface InventoryPanelApi {
  readonly element: HTMLElement;
  render(inventory: MatchInventoryState | null): void;
  destroy(): void;
}

export interface InventoryPanelOptions {
  onMove(payload: { itemInstanceId: string; targetArea: "grid" | "equipment"; slot?: string; swapItemInstanceId?: string; x?: number; y?: number }): void;
  onEquip(instanceId: string): void;
  onUnequip(instanceId: string): void;
  onDrop(instanceId: string): void;
  onUse(instanceId: string): void;
}

type EquipmentSlotKey = "weapon" | "head" | "chest" | "hands" | "shoes";
type ItemArea = "backpack" | "equipment";
type DragState = {
  item: MatchInventoryItem;
  area: ItemArea;
  ghost: HTMLElement;
  offset: DragPointerOffset;
};

const SLOT_ORDER: EquipmentSlotKey[] = ["weapon", "head", "chest", "hands", "shoes"];
const EQUIPMENT_SLOT_KEYS = new Set<EquipmentSlotKey>(SLOT_ORDER);
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

const STAT_LABELS: Record<string, string> = {
  attackPower: "攻击",
  attackSpeed: "攻速",
  maxHp: "生命上限",
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

const GRID_CELL_SIZE = 34;
const GRID_GAP = 4;
const GRID_METRICS = { cellSize: GRID_CELL_SIZE, gap: GRID_GAP };
const STABLE_BACKPACK_WIDTH = 376;

export function createInventoryPanel(options: InventoryPanelOptions): InventoryPanelApi {
  let inventoryState: MatchInventoryState | null = null;
  let activeTooltip: HTMLElement | null = null;
  let activeDrag: DragState | null = null;
  let currentBackpackCandidate: DragGridCandidate | null = null;
  let currentEquipCandidate: EquipmentSlotKey | null = null;
  const cleanup: Array<() => void> = [];

  const element = document.createElement("aside");
  element.className = "inventory-panel inventory-panel--collapsed";

  const header = document.createElement("div");
  header.className = "inventory-panel__header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "inventory-panel__title-wrap";

  const title = document.createElement("h3");
  title.className = "inventory-panel__title";
  title.textContent = "携行背包";

  const summary = document.createElement("p");
  summary.className = "inventory-panel__summary";
  summary.textContent = "正在同步携行状态...";
  titleWrap.append(title, summary);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "inventory-panel__toggle";

  const mobileToggle = document.createElement("div");
  mobileToggle.className = "inventory-mobile-toggle";

  const mobileClose = document.createElement("button");
  mobileClose.type = "button";
  mobileClose.className = "inventory-panel__toggle";
  mobileClose.textContent = "收起";
  mobileClose.style.display = "none";

  const body = document.createElement("div");
  body.className = "inventory-panel__body";

  const equipmentSection = document.createElement("section");
  equipmentSection.className = "inventory-section inventory-section--equipment";
  const equipmentTitle = document.createElement("h4");
  equipmentTitle.textContent = "当前装备";
  const equipmentGrid = document.createElement("div");
  equipmentGrid.className = "inventory-equipment-grid";

  const backpackSection = document.createElement("section");
  backpackSection.className = "inventory-section inventory-section--backpack";
  const backpackTitle = document.createElement("h4");
  backpackTitle.textContent = "携行格";
  const backpackSurface = document.createElement("div");
  backpackSurface.className = "inventory-backpack-surface";
  const backpackCells = document.createElement("div");
  backpackCells.className = "inventory-backpack-cells";
  const backpackHighlight = document.createElement("div");
  backpackHighlight.className = "inventory-grid-drop-preview";
  backpackHighlight.hidden = true;
  const backpackItems = document.createElement("div");
  backpackItems.className = "inventory-backpack-items";
  backpackSurface.append(backpackCells, backpackHighlight, backpackItems);

  equipmentSection.append(equipmentTitle, equipmentGrid);
  backpackSection.append(backpackTitle, backpackSurface);
  body.append(equipmentSection, backpackSection);

  header.append(titleWrap, toggle, mobileClose);
  element.append(header, body);
  document.body.append(mobileToggle);

  const equipmentSlotElements = new Map<EquipmentSlotKey, HTMLElement>();

  function isCompactViewport(): boolean {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function updateLauncherLabel(): void {
    const collapsed = element.classList.contains("inventory-panel--collapsed");
    if (isCompactViewport()) {
      mobileToggle.textContent = collapsed ? "背包" : "收起";
      toggle.textContent = collapsed ? "展开" : "收起";
      return;
    }

    mobileToggle.textContent = collapsed ? "背包 I" : "收起背包";
    toggle.textContent = collapsed ? "打开" : "关闭";
  }

  function closeInventory(): void {
    element.classList.add("inventory-panel--collapsed");
    hideTooltip();
    updateLauncherLabel();
  }

  function openInventory(): void {
    element.classList.remove("inventory-panel--collapsed");
    updateLauncherLabel();
  }

  function hideTooltip(): void {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  }

  function showTooltip(item: MatchInventoryItem, area: ItemArea, anchorRect?: DOMRect, point?: { x: number; y: number }): void {
    hideTooltip();

    const tooltip = createTooltip(item, area);
    document.body.append(tooltip);
    activeTooltip = tooltip;

    const rect = tooltip.getBoundingClientRect();
    const top = point
      ? Math.min(window.innerHeight - rect.height - 12, Math.max(12, point.y))
      : Math.min(window.innerHeight - rect.height - 12, Math.max(12, anchorRect?.top ?? 12));
    const left = point
      ? Math.min(window.innerWidth - rect.width - 12, Math.max(12, point.x))
      : Math.min(window.innerWidth - rect.width - 12, Math.max(12, (anchorRect?.right ?? 12) + 10));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.classList.add("is-visible");
  }

  function createTooltip(item: MatchInventoryItem, area: ItemArea): HTMLElement {
    const presentation = getItemPresentation(item);
    const rarity = (item.rarity ?? "common").toLowerCase();

    const tooltip = document.createElement("div");
    tooltip.className = "inventory-tooltip";

    const headerEl = document.createElement("div");
    headerEl.className = "tooltip-header";

    const titleGroup = document.createElement("div");
    titleGroup.className = "tooltip-title-group";

    const name = document.createElement("span");
    name.className = `tooltip-name quality-${rarity}`;
    name.textContent = presentation.displayName;

    const meta = document.createElement("span");
    meta.className = "tooltip-meta";
    meta.textContent = `${presentation.detailLabel} · ${Math.max(1, item.width ?? 1)}x${Math.max(1, item.height ?? 1)}`;

    const badge = document.createElement("span");
    badge.className = `tooltip-rarity quality-${rarity}`;
    badge.textContent = presentation.rarityLabel;

    titleGroup.append(name, meta);
    headerEl.append(titleGroup, badge);

    const stats = document.createElement("div");
    stats.className = "tooltip-stats";

    for (const [key, value] of Object.entries(item.modifiers ?? {})) {
      if (typeof value === "number" && value !== 0) {
        stats.append(createStatLine(key, value));
      }
    }
    for (const affix of item.affixes ?? []) {
      stats.append(createStatLine(affix.key, affix.value));
    }

    if (item.kind === "consumable" && item.healAmount) {
      stats.append(createStatLine("heal", item.healAmount, `治疗 +${item.healAmount}`));
    }

    if (!stats.childElementCount) {
      const empty = document.createElement("div");
      empty.className = "stat-line";
      empty.textContent = "无额外词条";
      stats.append(empty);
    }

    const actions = document.createElement("div");
    actions.className = "tooltip-actions";

    if (item.kind === "consumable" && area === "backpack") {
      actions.append(createActionButton("使用", () => options.onUse(item.instanceId)));
    }

    if (area === "backpack" && item.equipmentSlot && EQUIPMENT_SLOT_KEYS.has(item.equipmentSlot as EquipmentSlotKey)) {
      actions.append(createActionButton("装备", () => options.onEquip(item.instanceId)));
    }

    if (area === "equipment") {
      actions.append(createActionButton("卸下", () => options.onUnequip(item.instanceId)));
    }

    if (area === "backpack") {
      actions.append(createActionButton("丢弃", () => options.onDrop(item.instanceId), true));
    }

    tooltip.append(headerEl, stats, actions);
    return tooltip;
  }

  function createActionButton(label: string, action: () => void, danger = false): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (danger) {
      button.classList.add("btn-drop");
    }
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      hideTooltip();
      action();
    });
    return button;
  }

  function createStatLine(key: string, value: number, explicitText?: string): HTMLElement {
    const line = document.createElement("div");
    line.className = "stat-line";
    if (value > 0) {
      line.classList.add("stat-line--positive");
    }
    if (explicitText) {
      line.textContent = explicitText;
      return line;
    }
    const amount = PERCENT_STATS.has(key) ? `${Math.round(value * 100)}%` : `${Math.round(value * 10) / 10}`;
    const sign = value >= 0 ? "+" : "";
    line.textContent = `${STAT_LABELS[key] ?? key} ${sign}${amount}`;
    return line;
  }

  function clearHighlights(): void {
    currentBackpackCandidate = null;
    backpackHighlight.hidden = true;
    backpackHighlight.classList.remove("inventory-grid-drop-preview--invalid");
    if (currentEquipCandidate) {
      const slotElement = equipmentSlotElements.get(currentEquipCandidate);
      slotElement?.classList.remove("inventory-drop-target--candidate", "inventory-drop-target--invalid");
      currentEquipCandidate = null;
    }
  }

  function renderBackpackHighlight(candidate: DragGridCandidate | null): void {
    currentBackpackCandidate = candidate;
    if (!candidate) {
      backpackHighlight.hidden = true;
      backpackHighlight.classList.remove("inventory-grid-drop-preview--invalid");
      return;
    }

    const styles = formatHighlightRect(candidate, GRID_METRICS);
    backpackHighlight.hidden = false;
    backpackHighlight.classList.toggle("inventory-grid-drop-preview--invalid", !candidate.valid);
    backpackHighlight.style.left = styles.left;
    backpackHighlight.style.top = styles.top;
    backpackHighlight.style.width = styles.width;
    backpackHighlight.style.height = styles.height;
  }

  function renderEquipmentCandidate(slot: EquipmentSlotKey | null, valid = true): void {
    if (currentEquipCandidate && currentEquipCandidate !== slot) {
      equipmentSlotElements.get(currentEquipCandidate)?.classList.remove("inventory-drop-target--candidate", "inventory-drop-target--invalid");
    }
    currentEquipCandidate = slot;
    for (const [slotKey, slotElement] of equipmentSlotElements.entries()) {
      const active = slotKey === slot;
      slotElement.classList.toggle("inventory-drop-target--candidate", active && valid);
      slotElement.classList.toggle("inventory-drop-target--invalid", active && !valid);
    }
  }

  function startDrag(event: PointerEvent, item: MatchInventoryItem, area: ItemArea, sourceEl: HTMLElement): void {
    if (event.button !== 0 || isCompactViewport()) {
      return;
    }

    hideTooltip();

    const { ghost, offset } = createDragGhost(sourceEl, event);

    activeDrag = {
      item,
      area,
      ghost,
      offset
    };
    sourceEl.classList.add("inventory-item--dragging");
    document.body.classList.add("inventory-dragging");
  }

  function updateDrag(event: PointerEvent): void {
    if (!activeDrag || !inventoryState) {
      return;
    }

    updateDragGhostPosition(activeDrag.ghost, { x: event.clientX, y: event.clientY }, activeDrag.offset);

    clearHighlights();

    const slot = resolveEquipmentHover(event.clientX, event.clientY);
    if (slot) {
      const occupant = inventoryState.equipment[slot];
      const candidate = resolveEquipmentCandidate({
        slot,
        item: activeDrag.item,
        occupant: occupant ?? null
      });
      renderEquipmentCandidate(slot, candidate.valid);
      return;
    }

    const backpackRect = backpackCells.getBoundingClientRect();
    if (!isPointWithinRect(event.clientX, event.clientY, backpackRect)) {
      return;
    }

    renderBackpackHighlight(resolveBackpackCandidate(event.clientX, event.clientY));
  }

  function endDrag(event: PointerEvent): void {
    if (!activeDrag) {
      return;
    }

    const sourceInstanceId = activeDrag.item.instanceId;
    const sourceArea = activeDrag.area;
    activeDrag.ghost.remove();
    document.querySelectorAll(".inventory-item--dragging").forEach((node) => node.classList.remove("inventory-item--dragging"));
    document.body.classList.remove("inventory-dragging");

    if (currentEquipCandidate && inventoryState) {
      const equipped = inventoryState.equipment[currentEquipCandidate];
      const candidate = resolveEquipmentCandidate({
        slot: currentEquipCandidate,
        item: activeDrag.item,
        occupant: equipped ?? null
      });
      if (candidate.valid) {
        options.onMove({
          itemInstanceId: sourceInstanceId,
          targetArea: "equipment",
          slot: currentEquipCandidate,
          swapItemInstanceId: candidate.swapItemInstanceId
        });
      }
    } else if (currentBackpackCandidate?.valid) {
      options.onMove({
        itemInstanceId: sourceInstanceId,
        targetArea: "grid",
        x: currentBackpackCandidate.x,
        y: currentBackpackCandidate.y,
        swapItemInstanceId: currentBackpackCandidate.swapItemInstanceId
      });
    }

    clearHighlights();
    activeDrag = null;
  }

  function resolveEquipmentHover(clientX: number, clientY: number): EquipmentSlotKey | null {
    for (const [slotKey, slotElement] of equipmentSlotElements.entries()) {
      const rect = slotElement.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return slotKey;
      }
    }
    return null;
  }

  function renderEquipmentItem(slotKey: EquipmentSlotKey, item: MatchInventoryItem | undefined): HTMLElement {
    const slot = document.createElement("div");
    slot.className = "inventory-equip-slot";
    slot.dataset.slot = slotKey;

    const label = document.createElement("span");
    label.className = "inventory-slot-label";
    label.textContent = getSlotLabel(slotKey);
    slot.append(label);

    if (!item) {
      slot.classList.add("inventory-equip-slot--empty");
      return slot;
    }

    const button = createInventoryItemElement(item, "equipment");
    button.classList.add("inventory-item--equipment");
    slot.append(button);
    return slot;
  }

  function createInventoryItemElement(item: MatchInventoryItem, area: ItemArea): HTMLButtonElement {
    const presentation = getItemPresentation(item);
    const rarity = (item.rarity ?? "common").toLowerCase();
    const button = document.createElement("button");
    button.type = "button";
    button.className = `inventory-item inventory-item--${area} quality-${rarity}`;
    button.title = `${presentation.displayName} · ${Math.max(1, item.width ?? 1)}x${Math.max(1, item.height ?? 1)}`;

    const icon = document.createElement("div");
    icon.className = `inventory-item-icon inventory-item-icon--${presentation.iconKey}`;
    icon.innerHTML = presentation.iconSvg;

    const badge = document.createElement("span");
    badge.className = "inventory-item-badge";
    badge.textContent = `${Math.max(1, item.width ?? 1)}x${Math.max(1, item.height ?? 1)}`;

    const titleText = document.createElement("span");
    titleText.className = "inventory-item-name";
    titleText.textContent = presentation.displayName;

    button.append(icon, badge, titleText);

    button.addEventListener("pointerdown", (event) => startDrag(event, item, area, button));
    button.addEventListener("mouseenter", () => {
      if (!isCompactViewport() && !activeDrag) {
        showTooltip(item, area, button.getBoundingClientRect());
      }
    });
    button.addEventListener("mouseleave", () => {
      if (!activeDrag && !isCompactViewport()) {
        hideTooltip();
      }
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showTooltip(item, area, undefined, { x: event.clientX, y: event.clientY });
    });
    button.addEventListener("click", (event) => {
      if (activeDrag) {
        return;
      }
      event.stopPropagation();
      showTooltip(item, area, button.getBoundingClientRect(), isCompactViewport() ? {
        x: Math.max(12, window.innerWidth / 2 - 140),
        y: Math.max(12, window.innerHeight / 2 - 120)
      } : undefined);
    });

    return button;
  }

  function renderBackpackGrid(width: number, height: number): void {
    backpackCells.replaceChildren();
    backpackSurface.style.width = `${STABLE_BACKPACK_WIDTH}px`;
    backpackSurface.style.height = `${height * GRID_CELL_SIZE + (height - 1) * GRID_GAP}px`;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cell = document.createElement("div");
        cell.className = "inventory-grid-cell";
        cell.style.left = `${x * (GRID_CELL_SIZE + GRID_GAP)}px`;
        cell.style.top = `${y * (GRID_CELL_SIZE + GRID_GAP)}px`;
        cell.style.width = `${GRID_CELL_SIZE}px`;
        cell.style.height = `${GRID_CELL_SIZE}px`;
        backpackCells.append(cell);
      }
    }
  }

  function renderBackpackItems(items: MatchInventoryItem[]): void {
    backpackItems.replaceChildren();
    for (const item of items) {
      const x = Number.isFinite(item.x) ? Number(item.x) : 0;
      const y = Number.isFinite(item.y) ? Number(item.y) : 0;
      const itemWidth = Math.max(1, item.width ?? 1);
      const itemHeight = Math.max(1, item.height ?? 1);

      const button = createInventoryItemElement(item, "backpack");
      button.style.left = `${x * (GRID_CELL_SIZE + GRID_GAP)}px`;
      button.style.top = `${y * (GRID_CELL_SIZE + GRID_GAP)}px`;
      button.style.width = `${itemWidth * GRID_CELL_SIZE + (itemWidth - 1) * GRID_GAP}px`;
      button.style.height = `${itemHeight * GRID_CELL_SIZE + (itemHeight - 1) * GRID_GAP}px`;
      backpackItems.append(button);
    }
  }

  function render(inventory: MatchInventoryState | null): void {
    inventoryState = inventory;
    hideTooltip();
    clearHighlights();

    if (!inventory) {
      summary.textContent = "正在同步携行状态...";
      equipmentGrid.replaceChildren();
      backpackCells.replaceChildren();
      backpackItems.replaceChildren();
      return;
    }

    const width = Math.max(1, inventory.width || 10);
    const height = Math.max(1, inventory.height || 6);
    const total = width * height;
    const used = inventory.items.reduce((sum, item) => sum + Math.max(1, item.width ?? 1) * Math.max(1, item.height ?? 1), 0);
    const weaponName = inventory.equipment.weapon ? getItemPresentation(inventory.equipment.weapon).displayName : "空手";

    summary.textContent = `${weaponName} · ${used}/${total} 格已占用`;
    backpackTitle.textContent = `携行格 ${width}x${height}`;

    equipmentGrid.replaceChildren();
    for (const slotKey of SLOT_ORDER) {
      const slotElement = renderEquipmentItem(slotKey, inventory.equipment[slotKey]);
      equipmentSlotElements.set(slotKey, slotElement);
      equipmentGrid.append(slotElement);
    }

    renderBackpackGrid(width, height);
    renderBackpackItems(inventory.items);
  }

  function findFirstFit(
    items: MatchInventoryItem[],
    gridWidth: number,
    gridHeight: number,
    item: MatchInventoryItem
  ): { x: number; y: number } | null {
    const itemWidth = Math.max(1, item.width ?? 1);
    const itemHeight = Math.max(1, item.height ?? 1);
    return findFirstFitRect(
      { width: gridWidth, height: gridHeight },
      toGridRects(items),
      { width: itemWidth, height: itemHeight }
    ) ?? null;
  }

  function resolveBackpackCandidate(clientX: number, clientY: number): DragGridCandidate | null {
    if (!inventoryState || !activeDrag) {
      return null;
    }
    return resolveGridCandidate({
      grid: { width: inventoryState.width, height: inventoryState.height },
      pointer: { x: clientX, y: clientY },
      surfaceRect: backpackCells.getBoundingClientRect(),
      metrics: GRID_METRICS,
      item: activeDrag.item,
      occupants: toDragOccupants(
        inventoryState.items.map((entry) => ({
          ...entry,
          x: Number.isFinite(entry.x) ? Number(entry.x) : 0,
          y: Number.isFinite(entry.y) ? Number(entry.y) : 0
        }))
      ),
      ignoreInstanceIds: [activeDrag.item.instanceId]
    });
  }

  function toGridRects(items: MatchInventoryItem[]): Array<{ x: number; y: number; width: number; height: number }> {
    return items.map((entry) => ({
      x: Number.isFinite(entry.x) ? Number(entry.x) : 0,
      y: Number.isFinite(entry.y) ? Number(entry.y) : 0,
      width: Math.max(1, entry.width ?? 1),
      height: Math.max(1, entry.height ?? 1)
    }));
  }

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

  mobileClose.addEventListener("click", closeInventory);
  const onPointerMove = (event: PointerEvent) => updateDrag(event);
  const onPointerUp = (event: PointerEvent) => endDrag(event);
  const onDocumentClick = (event: MouseEvent) => {
    if (activeTooltip && !activeTooltip.contains(event.target as Node) && !element.contains(event.target as Node)) {
      hideTooltip();
    }
  };
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("click", onDocumentClick);
  cleanup.push(
    () => document.removeEventListener("pointermove", onPointerMove),
    () => document.removeEventListener("pointerup", onPointerUp),
    () => document.removeEventListener("click", onDocumentClick)
  );

  const mediaQuery = window.matchMedia("(max-width: 767px)");
  const syncViewportMode = (media: MediaQueryList | MediaQueryListEvent) => {
    mobileClose.style.display = media.matches ? "flex" : "none";
    toggle.style.display = media.matches ? "none" : "flex";
    updateLauncherLabel();
  };
  mediaQuery.addEventListener("change", syncViewportMode);
  cleanup.push(() => mediaQuery.removeEventListener("change", syncViewportMode));
  syncViewportMode(mediaQuery);
  updateLauncherLabel();

  return {
    element,
    render,
    destroy() {
      cleanup.forEach((fn) => fn());
      cleanup.length = 0;
      hideTooltip();
      clearHighlights();
      mobileToggle.remove();
      element.remove();
    }
  };
}
