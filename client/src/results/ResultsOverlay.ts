import type { SettlementItemDetail, SettlementPayload } from "@gamer/shared";
import "../styles/results.css";
import type { ResultOverlayState } from "./types";
import { getItemPresentation } from "../ui/itemPresentation";

export interface ResultsOverlayApi {
  readonly element: HTMLElement;
  show(settlement: SettlementPayload): void;
  hide(): void;
  setReturning(isReturning: boolean): void;
}

export interface ResultsOverlayOptions {
  onReturnToLobby?: () => void | Promise<void>;
}

export interface SettlementCopy {
  title: string;
  subtitle: string;
  summaryReason: string;
  lobbySummary: string;
}

export function createResultsOverlay(options: ResultsOverlayOptions = {}): ResultsOverlayApi {
  const element = document.createElement("section");
  element.className = "results-overlay";
  element.hidden = true;

  const card = document.createElement("div");
  card.className = "results-card";

  const eyebrow = document.createElement("p");
  eyebrow.className = "results-eyebrow";
  eyebrow.textContent = "结算回收";

  const title = document.createElement("h2");
  title.className = "results-title";

  const subtitle = document.createElement("p");
  subtitle.className = "results-subtitle";

  const stats = document.createElement("dl");
  stats.className = "results-stats";

  const itemsSection = document.createElement("div");
  itemsSection.className = "results-items";

  const itemsLabel = document.createElement("p");
  itemsLabel.className = "results-items-label";
  itemsLabel.textContent = "回收物资";

  const itemsList = document.createElement("ul");
  itemsList.className = "results-items-list";

  const actions = document.createElement("div");
  actions.className = "results-actions";

  const returnButton = document.createElement("button");
  returnButton.type = "button";
  returnButton.className = "results-dismiss";
  returnButton.textContent = "返回大厅";
  returnButton.addEventListener("click", async () => {
    if (returnButton.disabled) {
      return;
    }

    api.setReturning(true);
    try {
      api.hide();
      await options.onReturnToLobby?.();
    } finally {
      api.setReturning(false);
    }
  });

  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.className = "results-dismiss results-dismiss--secondary";
  dismissButton.textContent = "关闭报告";
  dismissButton.addEventListener("click", () => {
    api.hide();
  });

  actions.append(returnButton, dismissButton);
  itemsSection.append(itemsLabel, itemsList);
  card.append(eyebrow, title, subtitle, stats, itemsSection, actions);
  element.append(card);

  const api: ResultsOverlayApi = {
    element,
    show(settlement) {
      render({
        visible: true,
        settlement
      });
    },
    hide() {
      render({
        visible: false,
        settlement: null
      });
    },
    setReturning(isReturning) {
      returnButton.disabled = isReturning;
      dismissButton.disabled = isReturning;
      returnButton.textContent = isReturning ? "正在返回..." : "返回大厅";
    }
  };

  return api;

  function render(state: ResultOverlayState): void {
    element.hidden = !state.visible;

    if (!state.visible || !state.settlement) {
      return;
    }

    const { settlement } = state;
    const copy = buildSettlementCopy(settlement);
    title.textContent = copy.title;
    subtitle.textContent = copy.subtitle;
    replaceStats(stats, settlement);
    replaceItems(itemsList, settlement.result === "success" ? settlement.extractedItemDetails ?? [] : settlement.lostItemDetails ?? []);
  }
}

export function buildSettlementCopy(settlement: SettlementPayload): SettlementCopy {
  const summaryReason = formatSettlementReason(settlement);
  const lobbySummary = settlement.result === "success"
    ? `成功带出 ${settlement.extractedItems.length} 件物资，局外净收益 ${formatSignedNumber(settlement.profileGoldDelta)}。`
    : `本局失利，局外净收益 ${formatSignedNumber(settlement.profileGoldDelta)}。`;
  return {
    title: settlement.result === "success" ? "撤离成功" : "行动失败",
    subtitle: settlement.result === "success"
      ? `你已带着物资脱离封锁区。${summaryReason}`
      : `本局未能带出物资。${summaryReason}`,
    summaryReason,
    lobbySummary
  };
}

function formatSettlementReason(settlement: SettlementPayload): string {
  if (settlement.reason === "extracted") {
    return "撤离通道已完成回收。";
  }
  if (settlement.reason === "timeout") {
    return "封锁区关闭前未能完成撤离，已带收益清零。";
  }
  if (settlement.reason === "killed") {
    return "你在撤离前被击倒，携带物资全部遗落。";
  }
  if (settlement.reason === "corpseFog") {
    return "被尸毒吞没，携带物资全部遗落。";
  }
  return settlement.result === "success" ? "本局回收已记入营地。" : "本局损失已计入营地记录。";
}

function replaceStats(container: HTMLElement, settlement: SettlementPayload): void {
  container.replaceChildren(
    createStatRow("生存时间", formatDuration(settlement.survivedSeconds)),
    createStatRow("击杀玩家", `${settlement.playerKills}`),
    createStatRow("击杀怪物", `${settlement.monsterKills}`),
    createStatRow("回收金币", `${settlement.extractedGold}`),
    createStatRow("高价值估值", `${settlement.extractedTreasureValue}`),
    createStatRow("净收益", formatSignedNumber(settlement.profileGoldDelta))
  );
}

function replaceItems(container: HTMLElement, items: SettlementItemDetail[]): void {
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "results-item-card results-item-card--empty";
    empty.textContent = "未带回物资";
    container.replaceChildren(empty);
    return;
  }

  container.replaceChildren(
    ...items.map((item) => {
      const entry = document.createElement("li");
      const presentation = getItemPresentation({
        definitionId: item.definitionId,
        name: item.name,
        kind: item.kind,
        rarity: item.rarity
      });
      entry.className = `results-item-card results-item-card--${presentation.variant}`;
      entry.setAttribute("data-rarity", item.rarity ?? "common");
      entry.innerHTML = `
        <span class="results-item-card__icon">${presentation.icon}</span>
        <span class="results-item-card__body">
          <span class="results-item-card__name">${escapeHtml(item.name)}</span>
          <span class="results-item-card__meta">${escapeHtml(presentation.detailLabel)}</span>
        </span>
        <span class="results-item-card__value">${formatItemValue(item)}</span>
      `;
      return entry;
    })
  );
}

function createStatRow(label: string, value: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value;
  fragment.append(dt, dd);
  return fragment;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60));
  const seconds = Math.max(0, totalSeconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toLocaleString("zh-CN")}`;
}

function formatItemValue(item: SettlementItemDetail): string {
  if (item.treasureValue > 0) {
    return `${item.treasureValue.toLocaleString("zh-CN")}+`;
  }
  if (item.goldValue > 0) {
    return `${item.goldValue.toLocaleString("zh-CN")}g`;
  }
  return item.rarity ?? "common";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
