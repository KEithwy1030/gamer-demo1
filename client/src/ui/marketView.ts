import type { LocalProfile } from "../profile/localProfile";

const MARKET_LISTINGS = [
  { id: "lst01", name: "银漆护符", seller: "雾泽行脚", qty: 1, unitPrice: 6200, expiresIn: "68h 12m", rarity: "epic" },
  { id: "lst02", name: "虚蓝晶", seller: "旧港搬运人", qty: 2, unitPrice: 11400, expiresIn: "14h 04m", rarity: "epic" },
  { id: "lst03", name: "灰铁长剑", seller: "南岭军站", qty: 1, unitPrice: 2400, expiresIn: "71h 33m", rarity: "rare" },
  { id: "lst04", name: "治疗草药", seller: "营地药师", qty: 3, unitPrice: 300, expiresIn: "52h 18m", rarity: "common" },
];

export interface MarketViewApi {
  readonly element: HTMLElement;
  show(): void;
  hide(): void;
  render(profile: LocalProfile): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

export function createMarketView(): MarketViewApi {
  const element = el("section", "view-market");
  element.hidden = true;

  const header = el("div", "view-header");
  const left = el("div");
  left.append(
    stamp("MARKET / 货摊"),
    title("货摊"),
    sub("恢复之前已经存在的局外交易壳层，并兼容当前本地金币数据。"),
  );
  const right = el("div", "view-header-right");
  right.append(stamp("金库"));
  const goldValue = el("div", "stash-gold", "0");
  right.append(goldValue);
  header.append(left, right);

  const tabs = el("div", "market-tabs");
  ["全部挂单", "我的挂单", "营地行情"].forEach((label, index) => {
    const button = el("button", `m-tab${index === 0 ? " active" : ""}`, label) as HTMLButtonElement;
    button.type = "button";
    tabs.append(button);
  });

  const layout = el("div", "market-layout");
  const filters = el("aside", "market-filters");
  const search = el("input", "market-search") as HTMLInputElement;
  search.placeholder = "搜索物资 / 卖家";
  filters.append(search, filterButton("全部", true), filterButton("武器"), filterButton("护甲"), filterButton("战利品"));

  const list = el("div", "market-list");
  const head = el("div", "market-thead");
  ["物资", "卖家", "数量", "单价", "总价", "剩余", "状态"].forEach((text) => {
    head.append(el("div", undefined, text));
  });
  list.append(head);

  MARKET_LISTINGS.forEach((listing) => {
    const row = el("div", "market-row");
    row.innerHTML = `
      <div class="market-cell-item">
        <div class="market-item-thumb tier-${listing.rarity}"><div class="mt-shape"></div></div>
        <div>
          <div class="item-name">${listing.name}</div>
          <div class="item-meta">${listing.rarity.toUpperCase()} / 营地旧货</div>
        </div>
      </div>
      <div class="m-seller">${listing.seller}</div>
      <div class="m-qty">${listing.qty}</div>
      <div class="m-price">${formatNumber(listing.unitPrice)}</div>
      <div class="m-total hot">${formatNumber(listing.unitPrice * listing.qty)}</div>
      <div class="m-exp">${listing.expiresIn}</div>
      <div><button class="m-buy ghost" type="button" disabled>交易待接线</button></div>
    `;
    list.append(row);
  });

  layout.append(filters, list);
  element.append(header, tabs, layout);

  return {
    element,
    show() { element.hidden = false; },
    hide() { element.hidden = true; },
    render(profile: LocalProfile) {
      goldValue.textContent = profile.gold.toLocaleString("zh-CN");
    },
  };
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

function filterButton(text: string, active = false) {
  const node = el("button", `filter-btn${active ? " active" : ""}`, text) as HTMLButtonElement;
  node.type = "button";
  return node;
}

function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}
