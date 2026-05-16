import { findFirstFitRect } from "@gamer/shared";
import type { MatchInventoryItem, MatchInventoryState } from "../game/matchRuntime";
import "../styles/inventory.css";
import "../styles/inventoryDrag.css";
import { getItemPresentation, getSlotLabel } from "./itemPresentation";
import {
  createDragGhost,
  formatHighlightRect,
  resolveEquipmentCandidate,
  resolveGridAnchor,
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
  gridAnchor: { x: number; y: number };
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
const BACKPACK_SURFACE_PADDING = 10;

export function createInventoryPanel(options: InventoryPanelOptions): InventoryPanelApi {
  let inventoryState: MatchInventoryState | null = null;
  let activeTooltip: HTMLElement | null = null;
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
      summary.textContent = "正在同步状态...";
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
  const backpackStage = document.createElement("div");
  backpackStage.className = "inventory-backpack-stage";
  const backpackCells = document.createElement("div");
  backpackCells.className = "inventory-backpack-cells";
  const backpackHighlight = document.createElement("div");
  backpackHighlight.className = "inventory-grid-drop-preview";
  backpackHighlight.hidden = true;
  const backpackItems = document.createElement("div");
  backpackItems.className = "inventory-backpack-items";
  backpackStage.append(backpackCells, backpackHighlight, backpackItems);
  backpackSurface.append(backpackStage);

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
    hideTooltip(true);
    if (activeDrag) {
      cancelDrag();
    }
    updateLauncherLabel();
  }

  function openInventory(): void {
    element.classList.remove("inventory-panel--collapsed");
    updateLauncherLabel();
  }

  let hideTooltipTimer: number | null = null;
  let activeTooltipInstanceId: string | null = null;

  function hideTooltip(immediate = false): void {
    if (immediate) {
      if (hideTooltipTimer) {
        window.clearTimeout(hideTooltipTimer);
        hideTooltipTimer = null;
      }
      activeTooltipInstanceId = null;
      doHideTooltip();
      return;
    }

    if (hideTooltipTimer) return;
    hideTooltipTimer = window.setTimeout(() => {
      hideTooltipTimer = null;
      activeTooltipInstanceId = null;
      doHideTooltip();
    }, 300);
  }

  function doHideTooltip(): void {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  }

  function showTooltip(item: MatchInventoryItem, area: ItemArea, anchorRect?: DOMRect, point?: { x: number; y: number }): void {
    if (activeTooltipInstanceId === item.instanceId) {
      if (hideTooltipTimer) {
        window.clearTimeout(hideTooltipTimer);
        hideTooltipTimer = null;
      }
      return;
    }

    if (hideTooltipTimer) {
      window.clearTimeout(hideTooltipTimer);
      hideTooltipTimer = null;
    }
    doHideTooltip();

    const tooltip = createTooltip(item, area);
    document.body.append(tooltip);
    activeTooltip = tooltip;
    activeTooltipInstanceId = item.instanceId;

    // Keep tooltip open when hovering over it
    tooltip.addEventListener("mouseenter", () => {
      if (hideTooltipTimer) {
        window.clearTimeout(hideTooltipTimer);
        hideTooltipTimer = null;
      }
    });
    tooltip.addEventListener("mouseleave", () => {
      hideTooltip();
    });

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

  function cleanupOrphanGhosts(): void {
    document.querySelectorAll(".inventory-drag-ghost").forEach(ghost => ghost.remove());
    document.body.classList.remove("inventory-dragging");
  }

  function clearHighlights(): void {
    currentGridCandidate = null;
    backpackHighlight.hidden = true;
    backpackHighlight.classList.remove("inventory-grid-drop-preview--invalid");

    if (currentEquipmentCandidate) {
      equipmentSlotElements.get(currentEquipmentCandidate)?.classList.remove("inventory-drop-target--candidate", "inventory-drop-target--invalid");
    }
    currentEquipmentCandidate = null;
  }

  function renderBackpackHighlight(candidate: DragGridCandidate | null): void {
    currentGridCandidate = candidate;
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
    if (currentEquipmentCandidate && currentEquipmentCandidate !== slot) {
      equipmentSlotElements.get(currentEquipmentCandidate)?.classList.remove("inventory-drop-target--candidate", "inventory-drop-target--invalid");
    }
    currentEquipmentCandidate = slot;
    for (const [slotKey, slotElement] of equipmentSlotElements.entries()) {
      const active = slotKey === slot;
      slotElement.classList.toggle("inventory-drop-target--candidate", active && valid);
      slotElement.classList.toggle("inventory-drop-target--invalid", active && !valid);
    }
  }

  function resolveBackpackCandidate(clientX: number, clientY: number): DragGridCandidate | null {
    if (!inventoryState || !activeDrag) return null;
    return resolveGridCandidate({
      grid: { width: inventoryState.width, height: inventoryState.height },
      pointer: { x: clientX, y: clientY },
      surfaceRect: backpackCells.getBoundingClientRect(),
      metrics: GRID_METRICS,
      item: activeDrag.item,
      occupants: toDragOccupants(inventoryState.items.map(it => ({
        ...it,
        x: it.x ?? 0,
        y: it.y ?? 0
      }))),
      anchor: activeDrag.gridAnchor,
      ignoreInstanceIds: [activeDrag.item.instanceId]
    });
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

  let activeDrag: DragState | null = null;
  let currentGridCandidate: DragGridCandidate | null = null;
  let currentEquipmentCandidate: EquipmentSlotKey | null = null;
  let interactionSessionId: string | null = null;

  function startDrag(event: PointerEvent, item: MatchInventoryItem, area: ItemArea, sourceEl: HTMLElement): void {
    if (event.button !== 0) return;

    try {
      sourceEl.setPointerCapture(event.pointerId);
    } catch (e) {}

    cancelDrag();
    const { ghost, offset } = createDragGhost(sourceEl, event);
    ghost.classList.remove("inventory-item--equipment");
    interactionSessionId = item.instanceId;

    activeDrag = {
      item,
      area,
      ghost,
      offset,
      gridAnchor: resolveGridAnchor(offset, GRID_METRICS, item)
    };

    sourceEl.style.visibility = "hidden";
    sourceEl.classList.add("inventory-item--dragging");
    document.body.classList.add("inventory-dragging");
    updateDragGhostPosition(ghost, { x: event.clientX, y: event.clientY }, offset);
  }

  function updateDrag(event: PointerEvent): void {
    if (!activeDrag || !inventoryState) return;
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
      currentEquipmentCandidate = slot;
      renderEquipmentCandidate(slot, candidate.valid);
      return;
    }

    const backpackRect = backpackCells.getBoundingClientRect();
    if (isPointWithinRect(event.clientX, event.clientY, backpackRect)) {
      const candidate = resolveBackpackCandidate(event.clientX, event.clientY);
      renderBackpackHighlight(candidate);
    }
  }

  function finishDrag(event?: PointerEvent): void {
    if (!activeDrag) {
      cancelDrag();
      return;
    }

    if (event) {
      try {
        (event.target as HTMLElement)?.releasePointerCapture(event.pointerId);
      } catch (e) {}
    }

    const sourceInstanceId = activeDrag.item.instanceId;
    if (currentEquipmentCandidate && inventoryState) {
      const equipped = inventoryState.equipment[currentEquipmentCandidate];
      const candidate = resolveEquipmentCandidate({
        slot: currentEquipmentCandidate,
        item: activeDrag.item,
        occupant: equipped ?? null
      });
      if (candidate.valid) {
        options.onMove({
          itemInstanceId: sourceInstanceId,
          targetArea: "equipment",
          slot: currentEquipmentCandidate,
          swapItemInstanceId: candidate.swapItemInstanceId
        });
      }
    } else if (currentGridCandidate?.valid && inventoryState) {
      options.onMove({
        itemInstanceId: sourceInstanceId,
        targetArea: "grid",
        x: currentGridCandidate.x,
        y: currentGridCandidate.y,
        swapItemInstanceId: currentGridCandidate.swapItemInstanceId
      });
    }
    cancelDrag();
    if (inventoryState) render(inventoryState);
  }

  function cancelDrag(): void {
    if (activeDrag) {
      activeDrag.ghost.remove();
    }

    if (interactionSessionId) {
      const el = itemElementCache.get(interactionSessionId);
      if (el) el.style.visibility = "";
    }

    activeDrag = null;
    interactionSessionId = null;
    currentGridCandidate = null;
    currentEquipmentCandidate = null;
    cleanupOrphanGhosts();
    document.querySelectorAll(".inventory-item--dragging").forEach(node => {
      (node as HTMLElement).style.visibility = "";
      node.classList.remove("inventory-item--dragging");
    });
    document.body.classList.remove("inventory-dragging");
    clearHighlights();
  }

  const equipmentSlotCache = new Map<EquipmentSlotKey, HTMLElement>();

  function renderEquipmentItem(slotKey: EquipmentSlotKey, item: MatchInventoryItem | undefined): HTMLElement {
    let slot = equipmentSlotCache.get(slotKey);
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "inventory-equip-slot";
      slot.dataset.slot = slotKey;

      const label = document.createElement("span");
      label.className = "inventory-slot-label";
      label.textContent = getSlotLabel(slotKey);
      slot.append(label);
      equipmentSlotCache.set(slotKey, slot);
    }

    if (!item) {
      slot.classList.add("inventory-equip-slot--empty");
      const itemBtn = slot.querySelector(".inventory-item");
      if (itemBtn) itemBtn.remove();
      return slot;
    }

    slot.classList.remove("inventory-equip-slot--empty");
    let el = itemElementCache.get(item.instanceId);
    if (!el) {
      el = createInventoryItemElement(item, "equipment");
      itemElementCache.set(item.instanceId, el);
    }
    updateInventoryItemElement(el, item, "equipment");

    // Reused grid nodes must shed absolute layout when mounted in equipment slots.
    el.style.left = "";
    el.style.top = "";
    el.style.width = "";
    el.style.height = "";
    el.style.visibility = "";
    el.classList.add("inventory-item--equipment");

    if (slot.querySelector(".inventory-item") !== el) {
      slot.querySelectorAll(".inventory-item").forEach(btn => btn.remove());
      slot.append(el);
    }
    return slot;
  }

  function resolveCurrentItemContext(button: HTMLButtonElement): { item: MatchInventoryItem; area: ItemArea } | null {
    if (!inventoryState) {
      return null;
    }

    const instanceId = button.dataset.instanceId;
    const area = button.dataset.area === "equipment" ? "equipment" : button.dataset.area === "backpack" ? "backpack" : null;
    if (!instanceId || !area) {
      return null;
    }

    if (area === "equipment") {
      const item = Object.values(inventoryState.equipment).find((entry) => entry?.instanceId === instanceId);
      return item ? { item, area } : null;
    }

    const item = inventoryState.items.find((entry) => entry.instanceId === instanceId);
    return item ? { item, area } : null;
  }

  function updateInventoryItemElement(button: HTMLButtonElement, item: MatchInventoryItem, area: ItemArea): void {
    const presentation = getItemPresentation(item);
    const rarity = (item.rarity ?? "common").toLowerCase();
    button.className = `inventory-item inventory-item--${area} quality-${rarity}`;
    button.dataset.instanceId = item.instanceId;
    button.dataset.area = area;

    const icon = button.querySelector<HTMLElement>(".inventory-item-icon");
    if (icon) {
      icon.className = `inventory-item-icon inventory-item-icon--${presentation.iconKey}`;
      icon.innerHTML = presentation.iconSvg;
    }

    const badge = button.querySelector<HTMLElement>(".inventory-item-badge");
    if (badge) {
      badge.textContent = `${item.width ?? 1}x${item.height ?? 1}`;
    }

    const name = button.querySelector<HTMLElement>(".inventory-item-name");
    if (name) {
      name.textContent = presentation.displayName;
    }
  }

  function createInventoryItemElement(item: MatchInventoryItem, area: ItemArea): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";

    const icon = document.createElement("div");
    icon.className = "inventory-item-icon";

    const badge = document.createElement("span");
    badge.className = "inventory-item-badge";

    const name = document.createElement("span");
    name.className = "inventory-item-name";

    button.append(icon, badge, name);
    updateInventoryItemElement(button, item, area);

    button.addEventListener("pointerdown", (event) => {
      const context = resolveCurrentItemContext(button);
      if (context) {
        startDrag(event, context.item, context.area, button);
      }
    });
    button.addEventListener("mouseenter", () => {
      const context = resolveCurrentItemContext(button);
      if (context && !isCompactViewport() && !activeDrag) {
        showTooltip(context.item, context.area, button.getBoundingClientRect());
      }
    });
    button.addEventListener("mouseleave", () => {
      if (!activeDrag) hideTooltip();
    });
    button.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const context = resolveCurrentItemContext(button);
      if (context) {
        showTooltip(context.item, context.area, undefined, { x: e.clientX, y: e.clientY });
      }
    });
    button.addEventListener("click", (e) => {
      if (activeDrag) return;
      e.stopPropagation();
      const context = resolveCurrentItemContext(button);
      if (context) {
        showTooltip(context.item, context.area, button.getBoundingClientRect());
      }
    });

    return button;
  }

  let currentGridWidth = 0;
  let currentGridHeight = 0;

  function renderBackpackGrid(width: number, height: number): void {
    const gridWidth = width * GRID_CELL_SIZE + (width - 1) * GRID_GAP;
    const gridHeight = height * GRID_CELL_SIZE + (height - 1) * GRID_GAP;

    if (width !== currentGridWidth || height !== currentGridHeight || backpackCells.childElementCount === 0) {
      backpackCells.replaceChildren();
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
      currentGridWidth = width;
      currentGridHeight = height;
    }

    backpackStage.style.width = `${gridWidth}px`;
    backpackStage.style.height = `${gridHeight}px`;
    backpackSurface.style.width = `${Math.max(STABLE_BACKPACK_WIDTH, gridWidth) + BACKPACK_SURFACE_PADDING * 2}px`;
    backpackSurface.style.height = `${gridHeight + BACKPACK_SURFACE_PADDING * 2}px`;
  }

  const itemElementCache = new Map<string, HTMLButtonElement>();

  function render(inventory: MatchInventoryState | null): void {
    inventoryState = inventory;
    clearHighlights();
    cleanupOrphanGhosts();

    if (!inventory) {
      hideTooltip(true);
      summary.textContent = "正在同步状态...";
      equipmentGrid.replaceChildren();
      backpackCells.replaceChildren();
      backpackItems.replaceChildren();
      itemElementCache.clear();
      interactionSessionId = null;
      return;
    }

    const width = Math.max(1, inventory.width || 10);
    const height = Math.max(1, inventory.height || 6);
    const totalCells = width * height;
    const usedCells = inventory.items.reduce((sum, item) => sum + (item.width ?? 1) * (item.height ?? 1), 0);
    const weaponName = inventory.equipment.weapon ? getItemPresentation(inventory.equipment.weapon).displayName : "空手";

    summary.textContent = `${weaponName} · ${usedCells}/${totalCells} 格已占用`;
    backpackTitle.textContent = `携行格 ${width}x${height}`;

    const activeIds = new Set<string>();
    for (const slotKey of SLOT_ORDER) {
      const item = inventory.equipment[slotKey];
      const slotElement = renderEquipmentItem(slotKey, item);
      if (item) {
        activeIds.add(item.instanceId);
        const el = itemElementCache.get(item.instanceId);
        if (el) {
          el.style.visibility = "";
          el.classList.remove("inventory-item--dragging");
        }
      }
      equipmentSlotElements.set(slotKey, slotElement);
      if (slotElement.parentElement !== equipmentGrid) equipmentGrid.append(slotElement);
    }

    renderBackpackGrid(width, height);

    inventory.items.forEach(item => {
      activeIds.add(item.instanceId);

      let el = itemElementCache.get(item.instanceId);
      if (!el) {
        el = createInventoryItemElement(item, "backpack");
        itemElementCache.set(item.instanceId, el);
      }
      updateInventoryItemElement(el, item, "backpack");

      // Reused equipment nodes must shed slot styling when mounted in the grid.
      const isCurrentlyDragged = interactionSessionId === item.instanceId;
      el.style.visibility = isCurrentlyDragged ? "hidden" : "";
      el.classList.toggle("inventory-item--dragging", isCurrentlyDragged);
      el.classList.remove("inventory-item--equipment");

      const x = Number.isFinite(item.x) ? Number(item.x) : 0;
      const y = Number.isFinite(item.y) ? Number(item.y) : 0;
      const itemWidth = Math.max(1, item.width ?? 1);
      const itemHeight = Math.max(1, item.height ?? 1);

      el.style.width = `${itemWidth * GRID_CELL_SIZE + (itemWidth - 1) * GRID_GAP}px`;
      el.style.height = `${itemHeight * GRID_CELL_SIZE + (itemHeight - 1) * GRID_GAP}px`;
      el.style.left = `${x * (GRID_CELL_SIZE + GRID_GAP)}px`;
      el.style.top = `${y * (GRID_CELL_SIZE + GRID_GAP)}px`;

      if (el.parentElement !== backpackItems) backpackItems.append(el);
    });

    itemElementCache.forEach((el, id) => {
      if (!activeIds.has(id) && interactionSessionId !== id) {
        el.remove();
        itemElementCache.delete(id);
      }
    });
  }

  toggle.addEventListener("click", () => element.classList.contains("inventory-panel--collapsed") ? openInventory() : closeInventory());
  mobileToggle.addEventListener("click", (e) => { e.stopPropagation(); element.classList.contains("inventory-panel--collapsed") ? openInventory() : closeInventory(); });
  mobileClose.addEventListener("click", closeInventory);

  const onPointerMove = (e: PointerEvent) => updateDrag(e);
  const onPointerUp = (e: PointerEvent) => finishDrag(e);
  const onDocumentClick = (e: MouseEvent) => {
    if (activeTooltip && !activeTooltip.contains(e.target as Node) && !element.contains(e.target as Node)) hideTooltip();
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
      cleanup.forEach(fn => fn());
      cleanup.length = 0;
      hideTooltip(true);
      clearHighlights();
      cleanupOrphanGhosts();
      mobileToggle.remove();
      element.remove();
    }
  };
}
