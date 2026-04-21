import "../styles/results.css";
import { translateItemName } from "../ui/itemPresentation";
function createResultsOverlay(options = {}) {
  const element = document.createElement("section");
  element.className = "results-overlay";
  element.hidden = true;
  const card = document.createElement("div");
  card.className = "results-card";
  const eyebrow = document.createElement("p");
  eyebrow.className = "results-eyebrow";
  eyebrow.textContent = "\u7ED3\u7B97\u56DE\u6536";
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
  itemsLabel.textContent = "\u56DE\u6536\u7269\u8D44";
  const itemsList = document.createElement("ul");
  itemsList.className = "results-items-list";
  const actions = document.createElement("div");
  actions.className = "results-actions";
  const returnButton = document.createElement("button");
  returnButton.type = "button";
  returnButton.className = "results-dismiss";
  returnButton.textContent = "\u8FD4\u56DE\u5927\u5385";
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
  dismissButton.textContent = "\u5173\u95ED\u62A5\u544A";
  dismissButton.addEventListener("click", () => {
    api.hide();
  });
  actions.append(returnButton, dismissButton);
  itemsSection.append(itemsLabel, itemsList);
  card.append(eyebrow, title, subtitle, stats, itemsSection, actions);
  element.append(card);
  const api = {
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
      returnButton.textContent = isReturning ? "\u6B63\u5728\u8FD4\u56DE..." : "\u8FD4\u56DE\u5927\u5385";
    }
  };
  return api;
  function render(state) {
    element.hidden = !state.visible;
    if (!state.visible || !state.settlement) {
      return;
    }
    const { settlement } = state;
    title.textContent = settlement.result === "success" ? "\u64A4\u79BB\u6210\u529F" : "\u884C\u52A8\u5931\u8D25";
    subtitle.textContent = buildSubtitle(settlement);
    replaceStats(stats, settlement);
    replaceItems(itemsList, settlement.extractedItems);
  }
}
function buildSubtitle(settlement) {
  const reason = settlement.reason ?? (settlement.result === "success" ? "\u6210\u529F\u64A4\u79BB" : "\u672A\u77E5\u539F\u56E0");
  return `\u7ED3\u7B97\u8BF4\u660E\uFF1A${reason}`;
}
function replaceStats(container, settlement) {
  container.replaceChildren(
    createStatRow("\u751F\u5B58\u65F6\u95F4", formatDuration(settlement.survivedSeconds)),
    createStatRow("\u51FB\u6740\u73A9\u5BB6", `${settlement.playerKills}`),
    createStatRow("\u51FB\u6740\u602A\u7269", `${settlement.monsterKills}`),
    createStatRow("\u56DE\u6536\u91D1\u5E01", `${settlement.extractedGold}`),
    createStatRow("\u6218\u5229\u54C1\u4F30\u503C", `${settlement.extractedTreasureValue}`)
  );
}
function replaceItems(container, items) {
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "\u672A\u56DE\u6536\u4EFB\u4F55\u7269\u8D44";
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
function createStatRow(label, value) {
  const fragment = document.createDocumentFragment();
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value;
  fragment.append(dt, dd);
  return fragment;
}
function formatDuration(totalSeconds) {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60));
  const seconds = Math.max(0, totalSeconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
export {
  createResultsOverlay
};
