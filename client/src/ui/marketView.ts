import type { PlayerProfilePayload } from "@gamer/shared";

const MARKET_LISTINGS = [
  { id: "lst01", name: "镶银长剑", seller: "游荡者·淡影", qty: 1, unitPrice: 24800, expiresIn: "68h 12m", rarity: "epic" },
  { id: "lst02", name: "破锵锁子甲", seller: "游荡者·子午", qty: 1, unitPrice: 11400, expiresIn: "14h 04m", rarity: "epic" },
  { id: "lst03", name: "银漆护符", seller: "游荡者·老猫", qty: 2, unitPrice: 6200, expiresIn: "71h 33m", rarity: "epic" },
  { id: "lst04", name: "驰羊皮靴", seller: "游荡者·霜", qty: 1, unitPrice: 1400, expiresIn: "52h 18m", rarity: "rare" },
];

export class MarketView {
  readonly element: HTMLElement;

  private readonly stashGold: HTMLElement;

  constructor() {
    this.element = document.createElement("section");
    this.element.className = "view-market";
    this.element.hidden = true;

    const header = document.createElement("div");
    header.className = "view-header";

    const headerLeft = document.createElement("div");
    const label = document.createElement("div");
    label.className = "stamp-label";
    label.textContent = "摊 · MARKET";
    const title = document.createElement("h2");
    title.className = "view-title";
    title.textContent = "货摊";
    const sub = document.createElement("div");
    sub.className = "view-sub";
    sub.textContent = "游荡者互市 · 当前阶段仅恢复 Claude Design 页面，不接交易后端";
    headerLeft.append(label, title, sub);

    const headerRight = document.createElement("div");
    headerRight.className = "view-header-right";
    const goldLabel = document.createElement("div");
    goldLabel.className = "stamp-label";
    goldLabel.textContent = "金币";
    this.stashGold = document.createElement("div");
    this.stashGold.className = "stash-gold";
    this.stashGold.textContent = "⛁ 0";
    headerRight.append(goldLabel, this.stashGold);

    header.append(headerLeft, headerRight);

    const tabs = document.createElement("div");
    tabs.className = "market-tabs";
    for (const text of ["全部挂单 · 4", "我的挂单 · 0", "发布挂单"]) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `m-tab${text.startsWith("全部") ? " active" : ""}`;
      tab.textContent = text;
      tabs.append(tab);
    }

    const layout = document.createElement("div");
    layout.className = "market-layout";

    const filters = document.createElement("aside");
    filters.className = "market-filters";
    const search = document.createElement("input");
    search.className = "market-search";
    search.placeholder = "搜物品 / 卖家…";
    filters.append(search);
    for (const labelText of ["类别", "全部", "武器", "材料", "消耗"]) {
      const node = document.createElement(labelText.length <= 2 ? "button" : "div");
      node.textContent = labelText;
      if (node instanceof HTMLButtonElement) {
        node.type = "button";
        node.className = `filter-btn${labelText === "全部" ? " active" : ""}`;
      } else {
        node.className = "stamp-label stash-capacity-label";
      }
      filters.append(node);
    }

    const list = document.createElement("div");
    list.className = "market-list";
    const headerRow = document.createElement("div");
    headerRow.className = "market-thead";
    for (const text of ["物品", "卖家", "数量", "单价", "总价", "剩余", ""]) {
      const cell = document.createElement("div");
      cell.textContent = text;
      headerRow.append(cell);
    }
    list.append(headerRow);

    for (const listing of MARKET_LISTINGS) {
      const row = document.createElement("div");
      row.className = "market-row";
      row.innerHTML = `
        <div class="market-cell-item">
          <div class="market-item-thumb tier-${listing.rarity}">
            <div class="mt-shape"></div>
          </div>
          <div>
            <div class="item-name">${listing.name}</div>
            <div class="item-meta">${listing.rarity === "epic" ? "S" : "A"} · 模拟挂单</div>
          </div>
        </div>
        <div class="m-seller">${listing.seller}</div>
        <div class="m-qty">${listing.qty}</div>
        <div class="m-price">⛁ ${formatCompactNumber(listing.unitPrice)}</div>
        <div class="m-total hot">⛁ ${formatCompactNumber(listing.unitPrice * listing.qty)}</div>
        <div class="m-exp">${listing.expiresIn}</div>
        <div><button class="m-buy ghost" type="button" disabled>暂未接入</button></div>
      `;
      list.append(row);
    }

    layout.append(filters, list);
    this.element.append(header, tabs, layout);
  }

  show(): void {
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
  }

  render(profile: PlayerProfilePayload | null): void {
    this.stashGold.textContent = `⛁ ${formatCompactNumber(profile?.stashGold ?? 0)}`;
  }
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value)));
}
