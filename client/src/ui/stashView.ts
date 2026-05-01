import type { EquipmentSlot } from "@gamer/shared";
import type { LocalProfile, LocalProfileItem, LocalProfileMovePayload } from "../profile/localProfile";

type SelectedItemRef =
  | { area: "inventory"; item: LocalProfile["inventory"]["items"][number] }
  | { area: "equipment"; item: NonNullable<LocalProfile["equipment"][EquipmentSlot]>; slot: EquipmentSlot }
  | { area: "stash"; item: LocalProfile["stash"]["pages"][number]["items"][number]; pageIndex: number }
  | { area: "pending"; item: NonNullable<LocalProfile["pendingReturn"]>["items"][number] };

type CategoryFilter = "all" | "weapon" | "head" | "chest" | "hands" | "shoes" | "treasure" | "consumable" | "material";

export interface StashViewApi {
  readonly element: HTMLElement;
  show(): void;
  hide(): void;
  render(profile: LocalProfile): void;
}

export interface StashViewCallbacks {
  onMoveItem(payload: LocalProfileMovePayload): void;
}

type ActionItem = {
  label: string;
  payload: LocalProfileMovePayload;
};

const GRID_CELL_SIZE = 52;
const EQUIPMENT_ORDER: readonly EquipmentSlot[] = ["weapon", "head", "chest", "hands", "shoes"];
const EQUIPMENT_LABELS: Record<EquipmentSlot, string> = {
  weapon: "武器",
  head: "头盔",
  chest: "胸甲",
  hands: "护手",
  shoes: "靴履"
};

const CATEGORY_OPTIONS: Array<{ key: CategoryFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "weapon", label: "武器" },
  { key: "head", label: "头部" },
  { key: "chest", label: "胸甲" },
  { key: "hands", label: "护手" },
  { key: "shoes", label: "靴履" },
  { key: "treasure", label: "战利品" },
  { key: "material", label: "材料" },
  { key: "consumable", label: "消耗" }
];

export function createStashView(callbacks: StashViewCallbacks): StashViewApi {
  const view = new StashView(callbacks);
  return {
    element: view.element,
    show: () => view.show(),
    hide: () => view.hide(),
    render: (profile) => view.render(profile)
  };
}

class StashView {
  readonly element: HTMLElement;

  private readonly callbacks: StashViewCallbacks;
  private readonly goldValue: HTMLElement;
  private readonly pendingBanner: HTMLElement;
  private readonly pendingTray: HTMLElement;
  private readonly pageTabs: HTMLElement;
  private readonly filterButtons = new Map<CategoryFilter, HTMLButtonElement>();
  private readonly stashSummary: HTMLElement;
  private readonly loadoutSummary: HTMLElement;
  private readonly capacityFill: HTMLElement;
  private readonly capacityText: HTMLElement;
  private readonly pendingText: HTMLElement;
  private readonly stashGrid: HTMLElement;
  private readonly equipmentRack: HTMLElement;
  private readonly loadoutGrid: HTMLElement;
  private readonly detailEmpty: HTMLElement;
  private readonly detailTitle: HTMLElement;
  private readonly detailMeta: HTMLElement;
  private readonly detailDesc: HTMLElement;
  private readonly detailStats: HTMLElement;
  private readonly detailActions: HTMLElement;

  private profile: LocalProfile | null = null;
  private selected: SelectedItemRef | null = null;
  private currentPageIndex = 0;
  private activeCategory: CategoryFilter = "all";

  constructor(callbacks: StashViewCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement("section");
    this.element.className = "view-stash";
    this.element.hidden = true;

    const header = document.createElement("div");
    header.className = "view-header";

    const headerLeft = document.createElement("div");
    headerLeft.append(
      this.makeStamp("STASH / 整备"),
      this.makeTitle("行囊"),
      this.makeSub("五页仓储、待整理带出物、局外配装都在这里处理。")
    );

    const headerRight = document.createElement("div");
    headerRight.className = "view-header-right";
    headerRight.append(this.makeStamp("金币"));
    this.goldValue = document.createElement("div");
    this.goldValue.className = "stash-gold";
    headerRight.append(this.goldValue);
    header.append(headerLeft, headerRight);

    const layout = document.createElement("div");
    layout.className = "stash-layout";

    const filters = document.createElement("aside");
    filters.className = "stash-filters";
    CATEGORY_OPTIONS.forEach((option) => {
      filters.append(
        this.makeFilterButton(option.label, option.key === this.activeCategory, () => {
          this.activeCategory = option.key;
          this.render(this.profile);
        })
      );
    });

    const divider = document.createElement("div");
    divider.className = "filters-divider";
    filters.append(divider);

    const capacityLabel = this.makeStamp("容量");
    const capacityBar = document.createElement("div");
    capacityBar.className = "capacity-bar";
    this.capacityFill = document.createElement("div");
    this.capacityFill.className = "capacity-fill";
    capacityBar.append(this.capacityFill);
    this.capacityText = document.createElement("div");
    this.capacityText.className = "stash-capacity-text";
    this.pendingText = document.createElement("div");
    this.pendingText.className = "stash-capacity-text";
    filters.append(capacityLabel, capacityBar, this.capacityText, this.pendingText);

    const center = document.createElement("div");
    center.className = "stash-main";

    const mainPanel = document.createElement("section");
    mainPanel.className = "stash-grid-wrap stash-grid-wrap--main";

    this.pendingBanner = document.createElement("div");
    this.pendingBanner.className = "stash-pending-banner";
    this.pendingTray = document.createElement("div");
    this.pendingTray.className = "stash-pending-tray";

    const topRow = document.createElement("div");
    topRow.className = "stash-top-row";
    this.pageTabs = document.createElement("div");
    this.pageTabs.className = "stash-page-tabs";
    this.stashSummary = document.createElement("div");
    this.stashSummary.className = "stash-capacity-text";
    topRow.append(this.pageTabs, this.stashSummary);

    this.stashGrid = document.createElement("div");
    this.stashGrid.className = "stash-grid";
    mainPanel.append(this.pendingBanner, this.pendingTray, topRow, this.stashGrid);

    const loadoutPanel = document.createElement("section");
    loadoutPanel.className = "stash-grid-wrap stash-grid-wrap--loadout";
    const loadoutHead = document.createElement("div");
    loadoutHead.className = "stash-section-head";
    loadoutHead.append(this.makeStamp("携行配置"));
    this.loadoutSummary = document.createElement("div");
    this.loadoutSummary.className = "stash-capacity-text";
    loadoutHead.append(this.loadoutSummary);
    this.equipmentRack = document.createElement("div");
    this.equipmentRack.className = "stash-equipment-rack";
    this.loadoutGrid = document.createElement("div");
    this.loadoutGrid.className = "stash-grid stash-grid--loadout";
    loadoutPanel.append(loadoutHead, this.equipmentRack, this.loadoutGrid);

    center.append(mainPanel, loadoutPanel);

    const detail = document.createElement("aside");
    detail.className = "stash-detail";
    detail.append(this.makeStamp("详情 / 操作"));
    this.detailTitle = document.createElement("div");
    this.detailTitle.className = "detail-item-title";
    this.detailMeta = document.createElement("div");
    this.detailMeta.className = "detail-item-meta";
    this.detailDesc = document.createElement("div");
    this.detailDesc.className = "detail-desc";
    this.detailStats = document.createElement("div");
    this.detailStats.className = "detail-stats";
    this.detailActions = document.createElement("div");
    this.detailActions.className = "detail-actions";
    this.detailEmpty = document.createElement("div");
    this.detailEmpty.className = "detail-empty";
    this.detailEmpty.textContent = "选中任意物资后，可以直接整理到携行、装备位或仓库页。";
    detail.append(this.detailEmpty, this.detailTitle, this.detailMeta, this.detailDesc, this.detailStats, this.detailActions);

    layout.append(filters, center, detail);
    this.element.append(header, layout);
  }

  show(): void {
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
  }

  render(profile: LocalProfile | null): void {
    this.profile = profile;
    const pageCount = profile?.stash.pages.length ?? 1;
    this.currentPageIndex = clamp(this.currentPageIndex, 0, Math.max(0, pageCount - 1));
    if (this.selected && !this.resolveSelected(this.selected)) {
      this.selected = null;
    }

    this.goldValue.textContent = formatCompactNumber(profile?.gold ?? 0);
    this.renderCapacity();
    this.renderPendingBanner();
    this.renderPendingItems();
    this.renderFilterButtons();
    this.renderPageTabs();
    this.renderStash();
    this.renderLoadout();
    this.renderDetail();
  }

  private renderCapacity(): void {
    const stash = this.profile?.stash;
    const totalCells = (stash?.width ?? 10) * (stash?.height ?? 8) * (stash?.pages.length ?? 5);
    const occupiedCells = (stash?.pages ?? []).reduce((sum, page) => sum + countOccupiedCells(page.items), 0);
    const ratio = totalCells > 0 ? occupiedCells / totalCells : 0;
    this.capacityFill.style.width = `${Math.min(100, Math.round(ratio * 100))}%`;
    this.capacityText.textContent = `${occupiedCells} / ${totalCells} 格`;
    const pendingCount = this.profile?.pendingReturn?.items.length ?? 0;
    this.pendingText.textContent = pendingCount > 0 ? `待整理 ${pendingCount} 件` : "无待整理";
  }

  private renderPendingBanner(): void {
    const pendingCount = this.profile?.pendingReturn?.items.length ?? 0;
    this.pendingBanner.hidden = pendingCount === 0;
    this.pendingBanner.textContent = pendingCount > 0
      ? `本次带回 ${pendingCount} 件物资，先整理完毕再决定下一局携带内容。`
      : "";
  }

  private renderPendingItems(): void {
    const items = (this.profile?.pendingReturn?.items ?? []).filter((item) => matchesCategory(item, this.activeCategory));
    this.pendingTray.replaceChildren();
    this.pendingTray.hidden = items.length === 0;
    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `stash-pending-item tier-${item.rarity ?? "common"}`;
      if (this.selected?.area === "pending" && this.selected.item.instanceId === item.instanceId) {
        button.classList.add("selected");
      }
      button.innerHTML = `
        <div class="pending-item-badge">待整理</div>
        <div class="item-name">${item.name ?? item.definitionId}</div>
        <div class="item-meta">${buildCompactMeta(item)}</div>
      `;
      button.addEventListener("click", () => {
        this.selected = { area: "pending", item };
        this.render(this.profile);
      });
      this.pendingTray.append(button);
    });
  }

  private renderPageTabs(): void {
    const pageCount = this.profile?.stash.pages.length ?? 1;
    this.pageTabs.replaceChildren();
    for (let index = 0; index < pageCount; index += 1) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `stash-page-tab${index === this.currentPageIndex ? " active" : ""}`;
      tab.textContent = `仓库 ${index + 1}`;
      tab.addEventListener("click", () => {
        this.currentPageIndex = index;
        this.render(this.profile);
      });
      this.pageTabs.append(tab);
    }
  }

  private renderFilterButtons(): void {
    this.filterButtons.forEach((button, key) => {
      button.classList.toggle("active", key === this.activeCategory);
    });
  }

  private renderStash(): void {
    const stash = this.profile?.stash;
    const page = stash?.pages[this.currentPageIndex];
    const width = stash?.width ?? 10;
    const height = stash?.height ?? 8;
    const visibleItems = (page?.items ?? []).filter((item) => matchesCategory(item, this.activeCategory));
    const occupied = countOccupiedCells(page?.items ?? []);
    this.stashSummary.textContent = `第 ${this.currentPageIndex + 1} / ${stash?.pages.length ?? 1} 页 · ${occupied} / ${width * height} 格`;

    this.renderGridSurface(this.stashGrid, width, height);
    visibleItems.forEach((item) => {
      this.stashGrid.append(
        this.buildGridItem({ area: "stash", item, pageIndex: this.currentPageIndex }, item.x, item.y, item.width ?? 1, item.height ?? 1)
      );
    });
  }

  private renderLoadout(): void {
    const loadout = this.profile?.inventory;
    this.loadoutSummary.textContent = `${countOccupiedCells(loadout?.items ?? [])} / ${(loadout?.width ?? 10) * (loadout?.height ?? 6)} 格`;

    this.equipmentRack.replaceChildren();
    for (const slot of EQUIPMENT_ORDER) {
      const item = this.profile?.equipment[slot];
      const slotEl = document.createElement("div");
      slotEl.className = "stash-equip-slot";
      const label = document.createElement("div");
      label.className = "stash-equip-label";
      label.textContent = EQUIPMENT_LABELS[slot];
      slotEl.append(label);
      if (item) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = `stash-equip-card tier-${item.rarity ?? "common"}`;
        if (this.selected?.area === "equipment" && this.selected.item.instanceId === item.instanceId) {
          card.classList.add("selected");
        }
        card.innerHTML = `
          <div class="stash-equip-name">${item.name ?? item.definitionId}</div>
          <div class="stash-equip-meta">${buildCompactMeta(item)}</div>
        `;
        card.addEventListener("click", () => {
          this.selected = { area: "equipment", item, slot };
          this.render(this.profile);
        });
        slotEl.append(card);
      } else {
        const empty = document.createElement("div");
        empty.className = "stash-equip-empty";
        empty.textContent = "空位";
        slotEl.append(empty);
      }
      this.equipmentRack.append(slotEl);
    }

    this.renderGridSurface(this.loadoutGrid, loadout?.width ?? 10, loadout?.height ?? 6);
    (loadout?.items ?? []).forEach((item) => {
      this.loadoutGrid.append(this.buildGridItem({ area: "inventory", item }, item.x, item.y, item.width ?? 1, item.height ?? 1));
    });
  }

  private renderDetail(): void {
    const selected = this.selected ? this.resolveSelected(this.selected) : null;
    this.detailActions.replaceChildren();
    this.detailStats.replaceChildren();

    if (!selected) {
      this.detailEmpty.hidden = false;
      this.detailTitle.textContent = "";
      this.detailMeta.textContent = "";
      this.detailDesc.textContent = "";
      return;
    }

    this.selected = selected;
    this.detailEmpty.hidden = true;
    this.detailTitle.textContent = selected.item.name ?? selected.item.definitionId;
    this.detailMeta.textContent = buildAreaMeta(selected);
    this.detailDesc.textContent = buildDescription(selected.item);

    buildStatRows(selected.item).forEach((row) => {
      const line = document.createElement("div");
      line.className = "detail-row";
      const label = document.createElement("span");
      label.textContent = row.label;
      const value = document.createElement("span");
      value.className = "v";
      value.textContent = row.value;
      line.append(label, value);
      this.detailStats.append(line);
    });

    buildActionsForSelected(selected, this.currentPageIndex).forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "d-btn";
      button.textContent = action.label;
      button.addEventListener("click", () => this.callbacks.onMoveItem(action.payload));
      this.detailActions.append(button);
    });
  }

  private renderGridSurface(container: HTMLElement, width: number, height: number): void {
    container.replaceChildren();
    container.style.width = `${width * GRID_CELL_SIZE}px`;
    container.style.height = `${height * GRID_CELL_SIZE}px`;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const slot = document.createElement("div");
        slot.className = "stash-slot";
        slot.style.left = `${x * GRID_CELL_SIZE}px`;
        slot.style.top = `${y * GRID_CELL_SIZE}px`;
        container.append(slot);
      }
    }
  }

  private buildGridItem(ref: SelectedItemRef, x: number, y: number, width: number, height: number): HTMLElement {
    const itemEl = document.createElement("button");
    itemEl.type = "button";
    itemEl.className = `stash-item tier-${ref.item.rarity ?? "common"}`;
    if (this.selected?.item.instanceId === ref.item.instanceId) {
      itemEl.classList.add("selected");
    }
    itemEl.style.left = `${x * GRID_CELL_SIZE}px`;
    itemEl.style.top = `${y * GRID_CELL_SIZE}px`;
    itemEl.style.width = `${width * GRID_CELL_SIZE}px`;
    itemEl.style.height = `${height * GRID_CELL_SIZE}px`;
    itemEl.innerHTML = `
      <div class="item-name">${ref.item.name ?? ref.item.definitionId}</div>
      <div class="item-meta">${buildCompactMeta(ref.item)}</div>
      <div class="item-tier-pin">${width}×${height}</div>
    `;
    itemEl.addEventListener("click", () => {
      this.selected = ref;
      this.render(this.profile);
    });
    return itemEl;
  }

  private resolveSelected(selected: SelectedItemRef): SelectedItemRef | null {
    const profile = this.profile;
    if (!profile) {
      return null;
    }

    if (selected.area === "pending") {
      const item = profile.pendingReturn?.items.find((candidate) => candidate.instanceId === selected.item.instanceId);
      return item ? { area: "pending", item } : null;
    }

    if (selected.area === "inventory") {
      const item = profile.inventory.items.find((candidate) => candidate.instanceId === selected.item.instanceId);
      return item ? { area: "inventory", item } : null;
    }

    if (selected.area === "equipment") {
      const item = profile.equipment[selected.slot];
      return item?.instanceId === selected.item.instanceId ? { area: "equipment", item, slot: selected.slot } : null;
    }

    const page = profile.stash.pages[selected.pageIndex];
    const item = page?.items.find((candidate) => candidate.instanceId === selected.item.instanceId);
    return item ? { area: "stash", item, pageIndex: selected.pageIndex } : null;
  }

  private makeStamp(text: string): HTMLElement {
    const node = document.createElement("div");
    node.className = "stamp-label";
    node.textContent = text;
    return node;
  }

  private makeTitle(text: string): HTMLElement {
    const node = document.createElement("h2");
    node.className = "view-title";
    node.textContent = text;
    return node;
  }

  private makeSub(text: string): HTMLElement {
    const node = document.createElement("div");
    node.className = "view-sub";
    node.textContent = text;
    return node;
  }

  private makeFilterButton(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-btn${active ? " active" : ""}`;
    button.textContent = label;
    button.addEventListener("click", onClick);
    const key = CATEGORY_OPTIONS.find((option) => option.label === label)?.key;
    if (key) {
      this.filterButtons.set(key, button);
    }
    return button;
  }
}

function buildActionsForSelected(selected: SelectedItemRef, currentPageIndex: number): ActionItem[] {
  const itemId = selected.item.instanceId;
  const equipSlot = selected.item.equipmentSlot;

  if (selected.area === "pending") {
    return [
      { label: equipSlot ? "直接装备" : "放入携行", payload: { itemInstanceId: itemId, targetArea: equipSlot ? "equipment" : "grid", slot: equipSlot } },
      { label: "存入当前仓库页", payload: { itemInstanceId: itemId, targetArea: "stash", pageIndex: currentPageIndex } },
      { label: "丢弃", payload: { itemInstanceId: itemId, targetArea: "discard" } }
    ];
  }

  if (selected.area === "stash") {
    const actions: ActionItem[] = [
      { label: "转入携行", payload: { itemInstanceId: itemId, targetArea: "grid" } },
      { label: "丢弃", payload: { itemInstanceId: itemId, targetArea: "discard" } }
    ];
    if (equipSlot) {
      actions.unshift({ label: "装备", payload: { itemInstanceId: itemId, targetArea: "equipment", slot: equipSlot, pageIndex: currentPageIndex } });
    }
    return actions;
  }

  if (selected.area === "inventory") {
    const actions: ActionItem[] = [
      { label: "存入仓库", payload: { itemInstanceId: itemId, targetArea: "stash", pageIndex: currentPageIndex } }
    ];
    if (equipSlot) {
      actions.unshift({ label: "装备", payload: { itemInstanceId: itemId, targetArea: "equipment", slot: equipSlot } });
    }
    return actions;
  }

  return [
    { label: "卸到携行", payload: { itemInstanceId: itemId, targetArea: "grid" } },
    { label: "存入仓库", payload: { itemInstanceId: itemId, targetArea: "stash", pageIndex: currentPageIndex } }
  ];
}

function buildCompactMeta(item: LocalProfileItem): string {
  return `${rarityLabel(item.rarity)} · ${item.width ?? 1}×${item.height ?? 1}`;
}

function buildAreaMeta(selected: SelectedItemRef): string {
  if (selected.area === "pending") {
    return `待整理物资 · ${buildCompactMeta(selected.item)}`;
  }
  if (selected.area === "inventory") {
    return `携行背包 · ${buildCompactMeta(selected.item)}`;
  }
  if (selected.area === "equipment") {
    return `${EQUIPMENT_LABELS[selected.slot]} · ${buildCompactMeta(selected.item)}`;
  }
  return `仓库第 ${selected.pageIndex + 1} 页 · ${buildCompactMeta(selected.item)}`;
}

function buildDescription(item: LocalProfileItem): string {
  const parts: string[] = [];
  if (item.kind === "weapon") parts.push("可作为下一局出征武器");
  if (item.kind === "consumable" && typeof item.healAmount === "number") parts.push(`使用后恢复 ${item.healAmount}`);
  if (item.kind === "treasure") parts.push("带出后可转化为局外收益");
  return parts.join(" · ") || "可在营地内整理到仓库、携行或装备位。";
}

function buildStatRows(item: LocalProfileItem): Array<{ label: string; value: string }> {
  const rows = [{ label: "尺寸", value: `${item.width ?? 1}×${item.height ?? 1}` }];
  if (item.equipmentSlot) rows.push({ label: "部位", value: EQUIPMENT_LABELS[item.equipmentSlot] });
  if (item.kind) rows.push({ label: "类别", value: kindLabel(item.kind) });
  return rows;
}

function countOccupiedCells(items: Array<{ width?: number; height?: number }>): number {
  return items.reduce((sum, item) => sum + (item.width ?? 1) * (item.height ?? 1), 0);
}

function matchesCategory(item: LocalProfileItem, category: CategoryFilter): boolean {
  if (category === "all") return true;
  if (category === "weapon") return item.equipmentSlot === "weapon" || item.kind === "weapon";
  if (category === "head" || category === "chest" || category === "hands" || category === "shoes") return item.equipmentSlot === category;
  if (category === "treasure") return item.kind === "treasure";
  if (category === "consumable") return item.kind === "consumable";
  if (category === "material") return item.kind !== "weapon" && item.kind !== "treasure" && item.kind !== "consumable" && !item.equipmentSlot;
  return false;
}

function rarityLabel(rarity: string | undefined): string {
  if (rarity === "epic") return "S";
  if (rarity === "rare") return "A";
  if (rarity === "uncommon") return "B";
  return "C";
}

function kindLabel(kind: string): string {
  if (kind === "weapon") return "武器";
  if (kind === "treasure") return "战利品";
  if (kind === "consumable") return "消耗";
  return "材料";
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
