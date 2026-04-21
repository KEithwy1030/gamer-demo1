import type { SettlementPayload } from "../../../shared/src/index";
import "../styles/results.css";
import type { ResultOverlayState } from "./types";
import { translateItemName } from "../ui/itemPresentation";

export interface ResultsOverlayApi {
  readonly element: HTMLElement;
  show(settlement: SettlementPayload): void;
  hide(): void;
  setReturning(isReturning: boolean): void;
}

export interface ResultsOverlayOptions {
  onReturnToLobby?: () => void | Promise<void>;
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
    title.textContent = settlement.result === "success" ? "撤离成功" : "行动失败";
    subtitle.textContent = buildSubtitle(settlement);
    replaceStats(stats, settlement);
    replaceItems(itemsList, settlement.extractedItems);
  }
}

function buildSubtitle(settlement: SettlementPayload): string {
  const reason = settlement.reason ?? (settlement.result === "success" ? "成功撤离" : "未知原因");
  return `结算说明：${reason}`;
}

function replaceStats(container: HTMLElement, settlement: SettlementPayload): void {
  container.replaceChildren(
    createStatRow("生存时间", formatDuration(settlement.survivedSeconds)),
    createStatRow("击杀玩家", `${settlement.playerKills}`),
    createStatRow("击杀怪物", `${settlement.monsterKills}`),
    createStatRow("回收金币", `${settlement.extractedGold}`),
    createStatRow("战利品估值", `${settlement.extractedTreasureValue}`)
  );
}

function replaceItems(container: HTMLElement, items: string[]): void {
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "未回收任何物资";
    container.replaceChildren(empty);
    return;
  }

  container.replaceChildren(
    ...items.map((item) => {
      const entry = document.createElement("li");
      entry.textContent = translateItemName(item);
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
