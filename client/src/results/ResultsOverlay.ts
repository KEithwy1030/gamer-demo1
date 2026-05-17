import type { SettlementItemDetail, SettlementPayload } from "@gamer/shared";
import "../styles/results.css";
import type { ResultOverlayState } from "./types";
import { getItemPresentation } from "../ui/itemPresentation";
import { buildNextRunPrompt } from "./replayPrompt";

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
  buildCommit: string;
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

  const buildTag = document.createElement("p");
  buildTag.className = "results-build";

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

  const nextRun = document.createElement("div");
  nextRun.className = "results-next-run";

  const nextRunLabel = document.createElement("p");
  nextRunLabel.className = "results-next-run__label";
  nextRunLabel.textContent = "下一局目标";

  const nextRunText = document.createElement("p");
  nextRunText.className = "results-next-run__text";

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

  const copyNoteButton = document.createElement("button");
  copyNoteButton.type = "button";
  copyNoteButton.className = "results-dismiss results-dismiss--secondary";
  copyNoteButton.textContent = "复制测评记录";
  copyNoteButton.addEventListener("click", async () => {
    if (copyNoteButton.disabled || !latestSettlement) {
      return;
    }
    try {
      await navigator.clipboard?.writeText(buildPlaytestNote(latestSettlement));
      copyNoteButton.textContent = "已复制";
      window.setTimeout(() => {
        if (!copyNoteButton.disabled) {
          copyNoteButton.textContent = "复制测评记录";
        }
      }, 1200);
    } catch {
      // ignore clipboard failures
    }
  });

  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.className = "results-dismiss results-dismiss--secondary";
  dismissButton.textContent = "关闭报告";
  dismissButton.addEventListener("click", () => {
    api.hide();
  });

  nextRun.append(nextRunLabel, nextRunText);
  actions.append(copyNoteButton, returnButton, dismissButton);
  itemsSection.append(itemsLabel, itemsList);
  card.append(eyebrow, buildTag, title, subtitle, stats, itemsSection, nextRun, actions);
  element.append(card);
  let latestSettlement: SettlementPayload | null = null;

  const api: ResultsOverlayApi = {
    element,
    show(settlement) {
      latestSettlement = settlement;
      render({
        visible: true,
        settlement
      });
    },
    hide() {
      latestSettlement = null;
      render({
        visible: false,
        settlement: null
      });
    },
    setReturning(isReturning) {
      returnButton.disabled = isReturning;
      dismissButton.disabled = isReturning;
      copyNoteButton.disabled = isReturning || !latestSettlement;
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
    buildTag.textContent = `Build: ${copy.buildCommit}`;
    title.textContent = copy.title;
    subtitle.textContent = copy.subtitle;
    replaceStats(stats, settlement);
    replaceItems(itemsList, settlement.result === "success" ? settlement.extractedItemDetails ?? [] : settlement.lostItemDetails ?? []);
    nextRunText.textContent = buildNextRunPrompt(settlement);
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
    lobbySummary,
    buildCommit: getBuildCommit()
  };
}

export function buildPlaytestNote(settlement: SettlementPayload): string {
  const copy = buildSettlementCopy(settlement);
  const itemCount = settlement.result === "success" ? settlement.extractedItems.length : settlement.lostItems.length;
  const itemValue = sumSettlementItemValue(settlement.result === "success" ? settlement.extractedItemDetails : settlement.lostItemDetails);
  const nextRunPrompt = buildNextRunPrompt(settlement);
  return [
    `Manual playtest - ${new Date().toISOString().slice(0, 10)}`,
    `Build: ${getBuildCommit()}`,
    `Outcome: ${settlement.result}`,
    `Duration: ${formatDuration(settlement.survivedSeconds)}`,
    `Reason: ${copy.summaryReason}`,
    `Pressure phase: ${formatPressurePhase(settlement.survivedSeconds)}`,
    `Player kills: ${settlement.playerKills}`,
    `Monster kills: ${settlement.monsterKills}`,
    `Combat contacts: ${settlement.playerKills + settlement.monsterKills}`,
    `Recovered gold: ${settlement.extractedGold}`,
    `Recovered treasure value: ${settlement.extractedTreasureValue}`,
    `Net delta: ${formatSignedNumber(settlement.profileGoldDelta)}`,
    `Item count: ${itemCount}`,
    `Item detail value: ${itemValue}`,
    `Loadout lost: ${settlement.loadoutLost ? "yes" : "no"}`,
    `Inventory decision recorded: ${itemCount > 0 ? "yes - review greed/value tradeoff" : "no - note why loot did not matter"}`,
    `Next run prompt: ${nextRunPrompt}`,
    "Key timestamps:",
    "- 00:00 spawn / first search target:",
    "- 02:00 first combat or pickup:",
    "- 05:00 risk pull / contested resource:",
    "- 08:00 corpse-fog or extraction pressure:",
    "- End settlement / stash / market follow-through:",
    "Scores: loop clarity _, combat _, greed _, extract _, death _, market _, visual _, replay _",
    "Decision that mattered:",
    "Issue list:",
    "Next tuning recommendation:"
  ].join("\n");
}

export function buildManualPlaytestTemplate(): string {
  return [
    `Manual playtest - ${new Date().toISOString().slice(0, 10)}`,
    `Build: ${getBuildCommit()}`,
    "Outcome: extracted | died | timeout | crash",
    "Duration:",
    "Reason:",
    "Pressure phase:",
    "Player kills:",
    "Monster kills:",
    "Combat contacts:",
    "Recovered gold:",
    "Recovered treasure value:",
    "Net delta:",
    "Item count:",
    "Item detail value:",
    "Loadout lost:",
    "Inventory decision recorded:",
    "Next run prompt:",
    "Key timestamps:",
    "- 00:00 spawn / first search target:",
    "- 02:00 first combat or pickup:",
    "- 05:00 risk pull / contested resource:",
    "- 08:00 corpse-fog or extraction pressure:",
    "- End settlement / stash / market follow-through:",
    "Scores: loop clarity _, combat _, greed _, extract _, death _, market _, visual _, replay _",
    "Decision that mattered:",
    "Issue list:",
    "Next tuning recommendation:"
  ].join("\n");
}

export function getBuildCommit(): string {
  return import.meta.env.VITE_APP_COMMIT || "<commit>";
}

function formatPressurePhase(survivedSeconds: number): string {
  if (survivedSeconds >= 720) {
    return "12:00+ lethal fog";
  }
  if (survivedSeconds >= 480) {
    return "08:00-12:00 extraction pressure";
  }
  if (survivedSeconds >= 300) {
    return "05:00-08:00 contested buildup";
  }
  return "00:00-05:00 search buildup";
}

function sumSettlementItemValue(items: SettlementItemDetail[] | undefined): number {
  return (items ?? []).reduce((sum, item) => sum + item.goldValue + item.treasureValue, 0);
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
        <span class="results-item-card__icon">${presentation.iconSvg}</span>
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
