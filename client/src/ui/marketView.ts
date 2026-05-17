import type { MarketListing, MarketListingItem, MarketSettlementReceipt, MarketSettlementResult, SystemSellMarketResult } from "@gamer/shared";
import type { LocalProfile, LocalProfileItem } from "../profile/localProfile";
import { resolveServerUrl } from "../network/serverUrl";

export interface MarketViewApi {
  readonly element: HTMLElement;
  show(): void;
  hide(): void;
  render(profile: LocalProfile): void;
}

export interface MarketViewCallbacks {
  onProfileChanged?(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

export function createMarketView(callbacks: MarketViewCallbacks = {}): MarketViewApi {
  const element = el("section", "view-market");
  element.hidden = true;

  const header = el("div", "view-header");
  const left = el("div");
  left.append(
    stamp("BLACK MARKET"),
    title("黑市"),
    sub("挂单流程已接线；成交暂不开放。"),
  );
  const right = el("div", "view-header-right");
  right.append(stamp("金库"));
  const goldValue = el("div", "stash-gold", "0");
  right.append(goldValue);
  header.append(left, right);

  const layout = el("div", "market-layout");
  const sourcePanel = el("section", "market-panel market-panel--source");
  const detailPanel = el("section", "market-panel market-panel--detail");
  const listingsPanel = el("section", "market-panel market-panel--listings");

  const sourceList = el("div", "market-source-list");
  sourcePanel.append(panelTitle("可挂物资", "上一局回收与当前仓储"), sourceList);

  const selectedName = el("div", "market-selected-name", "未选择物资");
  const selectedMeta = el("div", "market-selected-meta", "从左侧选择一件物资");
  const selectedStats = el("div", "market-selected-stats");
  const selectedHint = el("div", "market-selected-hint", "选择物资后生成建议价");
  const priceInput = el("input", "market-price-input") as HTMLInputElement;
  priceInput.type = "number";
  priceInput.min = "1";
  priceInput.step = "1";
  priceInput.placeholder = "卖价 / 金币";
  const createButton = el("button", "market-primary", "挂出") as HTMLButtonElement;
  createButton.type = "button";
  createButton.disabled = true;
  const quickSellButton = el("button", "market-primary market-primary--secondary", "急售给系统") as HTMLButtonElement;
  quickSellButton.type = "button";
  quickSellButton.disabled = true;
  const status = el("div", "market-status");
  detailPanel.append(
    panelTitle("挂单", "设置卖价"),
    selectedName,
    selectedMeta,
    selectedStats,
    selectedHint,
    priceInput,
    createButton,
    quickSellButton,
    status
  );

  const listingList = el("div", "market-listings");
  const salesList = el("div", "market-sales");
  const salesSummary = el("div", "market-sales-summary", "近4笔成交 / +0 金币");
  listingsPanel.append(panelTitle("我的挂单", "独立玩家内存货架"), listingList, panelTitle("近期成交", "模拟买家回执"), salesSummary, salesList);
  layout.append(sourcePanel, detailPanel, listingsPanel);
  element.append(header, layout);

  let currentProfile: LocalProfile | null = null;
  let candidates: LocalProfileItem[] = [];
  let listings: MarketListing[] = [];
  let recentSales: MarketSettlementReceipt[] = [];
  let selectedItemId: string | null = null;
  let requestVersion = 0;

  createButton.addEventListener("click", async () => {
    const profile = currentProfile;
    const selected = candidates.find((item) => item.instanceId === selectedItemId);
    const price = Number.parseInt(priceInput.value, 10);
    if (!profile || !selected || !Number.isFinite(price) || price <= 0) {
      setStatus("需要选择物资并填写正数卖价。", true);
      return;
    }

    createButton.disabled = true;
    try {
      const listing = await createListing(profile.profileId, selected, price);
      listings = [...listings, listing];
      selectedItemId = null;
      priceInput.value = "";
      setStatus("已挂出，等待买家。");
      callbacks.onProfileChanged?.();
      renderAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "挂单失败。", true);
      renderAll();
    }
  });

  quickSellButton.addEventListener("click", async () => {
    const profile = currentProfile;
    const selected = candidates.find((item) => item.instanceId === selectedItemId);
    if (!profile || !selected) {
      setStatus("需要先选择一件物资。", true);
      return;
    }

    createButton.disabled = true;
    quickSellButton.disabled = true;
    try {
      const result = await systemSell(profile.profileId, selected);
      candidates = candidates.filter((item) => item.instanceId !== selected.instanceId);
      selectedItemId = null;
      priceInput.value = "";
      goldValue.textContent = result.profileGold.toLocaleString("zh-CN");
      recentSales = [result.receipt, ...recentSales].slice(0, 4);
      setStatus(`系统急售完成，入账 ${formatNumber(result.goldDelta)} 金币。`);
      callbacks.onProfileChanged?.();
      renderAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "急售失败。", true);
      renderAll();
    }
  });

  function render(profile: LocalProfile): void {
    currentProfile = profile;
    goldValue.textContent = profile.gold.toLocaleString("zh-CN");
    candidates = collectMarketCandidates(profile);
    renderAll();
    void refreshListings(profile.profileId);
  }

  function renderAll(): void {
    const listedItemIds = new Set(listings.map((listing) => listing.item.instanceId));
    const available = candidates.filter((item) => !listedItemIds.has(item.instanceId));
    const hasSelectedItem = selectedItemId
      ? available.some((item) => item.instanceId === selectedItemId)
      : false;
    if (!hasSelectedItem) {
      const nextSelection = available[0] ?? null;
      selectedItemId = nextSelection?.instanceId ?? null;
      priceInput.value = nextSelection ? String(suggestPrice(nextSelection)) : "";
    }

    sourceList.replaceChildren(...renderCandidateRows(available));
    renderSelected(available.find((item) => item.instanceId === selectedItemId) ?? null);
    listingList.replaceChildren(...renderListingRows());
    const recentSalesTotal = recentSales.reduce((sum, receipt) => sum + receipt.price, 0);
    salesSummary.textContent = `近${Math.min(4, recentSales.length)}笔成交 / +${formatNumber(recentSalesTotal)} 金币`;
    salesList.replaceChildren(...renderSaleRows());
  }

  function renderCandidateRows(items: LocalProfileItem[]): HTMLElement[] {
    if (items.length === 0) {
      return [empty("暂无可挂物资")];
    }

    return items.map((item) => {
      const row = el("button", `market-source-row${item.instanceId === selectedItemId ? " active" : ""}`) as HTMLButtonElement;
      row.type = "button";
      row.append(itemThumb(item), itemText(item.name, item.rarity ?? "common", formatItemMeta(item)));
      row.addEventListener("click", () => {
        selectedItemId = item.instanceId;
        priceInput.value = String(suggestPrice(item));
        setStatus("");
        renderAll();
      });
      return row;
    });
  }

  function renderSelected(item: LocalProfileItem | null): void {
    if (!item) {
      selectedName.textContent = "未选择物资";
      selectedMeta.textContent = "从左侧选择一件物资";
      selectedStats.replaceChildren();
      selectedHint.textContent = "选择物资后生成建议价";
      createButton.disabled = true;
      quickSellButton.disabled = true;
      priceInput.value = "";
      return;
    }

    selectedName.textContent = item.name;
    selectedMeta.textContent = `${formatRarity(item.rarity)} / ${formatItemMeta(item)}`;
    selectedStats.replaceChildren(...formatStats(item).map((line) => el("div", "market-stat", line)));
    selectedHint.textContent = formatSuggestionHint(item);
    createButton.disabled = false;
    quickSellButton.disabled = false;
  }

  function renderListingRows(): HTMLElement[] {
    if (listings.length === 0) {
      return [empty("还没有挂单")];
    }

    return listings.map((listing) => {
      const row = el("div", "market-listing-row");
      const price = el("input", "market-row-price") as HTMLInputElement;
      price.type = "number";
      price.min = "1";
      price.step = "1";
      price.value = String(listing.price);
      const update = el("button", "market-mini", "改价") as HTMLButtonElement;
      update.type = "button";
      update.addEventListener("click", async () => {
        const profile = currentProfile;
        if (!profile) return;
        try {
          const updated = await updateListing(profile.profileId, listing.listingId, Number.parseInt(price.value, 10));
          listings = listings.map((entry) => entry.listingId === updated.listingId ? updated : entry);
          setStatus("价格已更新。");
          renderAll();
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "改价失败。", true);
        }
      });
      const cancel = el("button", "market-mini danger", "取消") as HTMLButtonElement;
      cancel.type = "button";
      cancel.addEventListener("click", async () => {
        const profile = currentProfile;
        if (!profile) return;
        try {
          await cancelListing(profile.profileId, listing.listingId);
          listings = listings.filter((entry) => entry.listingId !== listing.listingId);
          setStatus("挂单已取消。");
          callbacks.onProfileChanged?.();
          renderAll();
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "取消失败。", true);
        }
      });

      const actions = el("div", "market-listing-actions");
      actions.append(price, update, cancel);
      const text = itemText(listing.item.name, listing.item.rarity ?? "common", formatListingMeta(listing));
      text.append(el("div", "market-row-hint", formatListingSuggestion(listing)));
      row.append(itemThumb(listing.item), text, actions);
      return row;
    });
  }

  function renderSaleRows(): HTMLElement[] {
    if (recentSales.length === 0) {
      return [empty("暂无成交回执")];
    }

    return recentSales.map((receipt) => {
      const row = el("div", "market-sale-row");
      row.append(
        itemThumb(receipt.item),
        itemText(receipt.item.name, receipt.item.rarity ?? "common", `${formatNumber(receipt.price)} 金币 / ${formatRelativeTime(receipt.soldAt)}`)
      );
      return row;
    });
  }

  async function refreshListings(playerId: string): Promise<void> {
    const version = ++requestVersion;
    try {
      const settlement = await settleListings(playerId);
      if (version === requestVersion) {
        listings = settlement.listings;
        goldValue.textContent = settlement.profileGold.toLocaleString("zh-CN");
        recentSales = settlement.sales;
        if (settlement.sold.length > 0) {
          const soldGold = settlement.sold.reduce((sum, receipt) => sum + receipt.price, 0);
          setStatus(`黑市买家成交 ${settlement.sold.length} 件，入账 ${formatNumber(soldGold)} 金币。`);
          callbacks.onProfileChanged?.();
        } else {
          setStatus("");
        }
        renderAll();
      }
    } catch {
      if (version === requestVersion) {
        setStatus("黑市暂时离线，稍后重试。", true);
        listings = [];
        renderAll();
      }
    }
  }

  function setStatus(text: string, isError = false): void {
    status.textContent = text;
    status.classList.toggle("error", isError);
  }

  return {
    element,
    show() { element.hidden = false; },
    hide() { element.hidden = true; },
    render,
  };
}

function collectMarketCandidates(profile: LocalProfile): LocalProfileItem[] {
  const byId = new Map<string, LocalProfileItem>();
  for (const item of profile.pendingReturn?.items ?? []) {
    if (!byId.has(item.instanceId)) byId.set(item.instanceId, item);
  }
  for (const item of profile.inventory.items) {
    if (!byId.has(item.instanceId)) byId.set(item.instanceId, item);
  }
  for (const item of Object.values(profile.equipment)) {
    if (item && !byId.has(item.instanceId)) byId.set(item.instanceId, item);
  }
  for (const page of profile.stash.pages) {
    for (const item of page.items) {
      if (!byId.has(item.instanceId)) byId.set(item.instanceId, item);
    }
  }
  return [...byId.values()];
}

function panelTitle(text: string, meta: string): HTMLElement {
  const head = el("div", "market-panel-title");
  head.append(el("span", undefined, text), el("small", undefined, meta));
  return head;
}

function itemThumb(item: Pick<MarketListingItem, "rarity" | "kind">): HTMLElement {
  const thumb = el("div", `market-item-thumb tier-${item.rarity ?? "common"}`);
  thumb.append(el("div", "mt-shape", item.kind === "weapon" ? "刃" : item.kind === "armor" ? "甲" : "货"));
  return thumb;
}

function itemText(name: string, rarity: string, meta: string): HTMLElement {
  const wrap = el("div", "market-item-text");
  wrap.append(el("div", "item-name", name), el("div", "item-meta", `${rarity.toUpperCase()} / ${meta}`));
  return wrap;
}

function empty(text: string): HTMLElement {
  return el("div", "market-empty", text);
}

function formatItemMeta(item: LocalProfileItem | MarketListingItem): string {
  const size = item.width && item.height ? `${item.width}x${item.height}` : "1x1";
  return `${item.kind ?? "物资"} / ${size}`;
}

function formatListingMeta(listing: MarketListing): string {
  return `${formatNumber(listing.price)} 金币 / ${formatRelativeTime(listing.updatedAt)}`;
}

function formatStats(item: LocalProfileItem): string[] {
  const stats: string[] = [];
  for (const [key, value] of Object.entries(item.modifiers ?? {})) {
    if (typeof value === "number" && value !== 0) stats.push(`${formatStatKey(key)} +${value}`);
  }
  for (const affix of item.affixes ?? []) {
    stats.push(`${formatStatKey(affix.key)} +${affix.value}`);
  }
  return stats.length > 0 ? stats : ["无战斗词条"];
}

function formatStatKey(key: string): string {
  const labels: Record<string, string> = {
    attackPower: "攻击",
    attackSpeed: "攻速",
    maxHp: "生命",
    moveSpeed: "移速",
    damageReduction: "减伤",
    critRate: "暴击",
    dodgeRate: "闪避",
    bleed: "流血",
    slow: "减速"
  };
  return labels[key] ?? key;
}

function suggestPrice(item: Pick<MarketListingItem, "rarity" | "width" | "height" | "modifiers" | "affixes">): number {
  const rarityBase: Record<string, number> = { common: 180, uncommon: 420, rare: 950, epic: 2200 };
  const size = Math.max(1, (item.width ?? 1) * (item.height ?? 1));
  const statCount = Object.values(item.modifiers ?? {}).filter((value) => typeof value === "number" && value !== 0).length
    + (item.affixes?.length ?? 0);
  return Math.round((rarityBase[item.rarity ?? "common"] ?? 300) * size * (1 + statCount * 0.18));
}

function formatSuggestionHint(item: Pick<MarketListingItem, "rarity" | "width" | "height" | "modifiers" | "affixes">): string {
  return `建议挂价 ${formatNumber(suggestPrice(item))} 金币`;
}

function formatListingSuggestion(listing: MarketListing): string {
  const suggested = suggestPrice(listing.item);
  const delta = listing.price - suggested;
  if (delta === 0) {
    return `建议价 ${formatNumber(suggested)}`;
  }
  return `建议价 ${formatNumber(suggested)} / ${formatSignedNumber(delta)}`;
}

function formatRarity(rarity?: string): string {
  return ({ common: "普通", uncommon: "精良", rare: "稀有", epic: "史诗" } as Record<string, string>)[rarity ?? "common"] ?? "物资";
}

function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatNumber(value)}`;
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.floor(minutes / 60)} 小时前`;
}

async function settleListings(playerId: string): Promise<MarketSettlementResult> {
  const response = await fetch(`${resolveServerUrl()}/market/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId })
  });
  if (!response.ok) throw new Error("Failed to settle market listings.");
  return await response.json() as MarketSettlementResult;
}

async function createListing(profileId: string, item: LocalProfileItem, price: number): Promise<MarketListing> {
  const response = await fetch(`${resolveServerUrl()}/market/listings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: profileId,
      itemInstanceId: item.instanceId,
      price
    })
  });
  if (!response.ok) throw new Error("挂单失败。");
  return await response.json() as MarketListing;
}

async function systemSell(profileId: string, item: LocalProfileItem): Promise<SystemSellMarketResult> {
  const response = await fetch(`${resolveServerUrl()}/market/system-sell`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: profileId,
      itemInstanceId: item.instanceId
    })
  });
  if (!response.ok) throw new Error("急售失败。");
  return await response.json() as SystemSellMarketResult;
}

async function updateListing(profileId: string, listingId: string, price: number): Promise<MarketListing> {
  const response = await fetch(`${resolveServerUrl()}/market/listings/${encodeURIComponent(listingId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: profileId, price })
  });
  if (!response.ok) throw new Error("改价失败。");
  return await response.json() as MarketListing;
}

async function cancelListing(profileId: string, listingId: string): Promise<void> {
  const response = await fetch(`${resolveServerUrl()}/market/listings/${encodeURIComponent(listingId)}?playerId=${encodeURIComponent(profileId)}`, {
    method: "DELETE"
  });
  if (!response.ok) throw new Error("取消失败。");
}

function stamp(text: string) {
  return el("div", "stamp-label", text);
}

function title(text: string) {
  return el("h2", "view-title", text);
}

function sub(text: string) {
  return el("div", "view-sub", text);
}
