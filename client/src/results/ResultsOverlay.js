import "../styles/results.css";
import { translateItemName } from "../ui/itemPresentation";
export function createResultsOverlay(options = {}) {
    const element = document.createElement("section");
    element.className = "results-overlay";
    element.hidden = true;
    const card = document.createElement("div");
    card.className = "results-card";
    const eyebrow = document.createElement("p");
    eyebrow.className = "results-eyebrow";
    eyebrow.textContent = "行动结算";
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
    itemsLabel.textContent = "带出物品";
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
        }
        finally {
            api.setReturning(false);
        }
    });
    const dismissButton = document.createElement("button");
    dismissButton.type = "button";
    dismissButton.className = "results-dismiss results-dismiss--secondary";
    dismissButton.textContent = "关闭";
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
            returnButton.textContent = isReturning ? "正在返回..." : "返回大厅";
        }
    };
    return api;
    function render(state) {
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
function buildSubtitle(settlement) {
    const reason = settlement.reason ?? (settlement.result === "success" ? "成功撤离" : "未知原因");
    return `原因：${reason}`;
}
function replaceStats(container, settlement) {
    container.replaceChildren(createStatRow("存活时间", formatDuration(settlement.survivedSeconds)), createStatRow("击杀玩家", `${settlement.playerKills}`), createStatRow("击杀怪物", `${settlement.monsterKills}`), createStatRow("带出金币", `${settlement.extractedGold}`), createStatRow("宝物价值", `${settlement.extractedTreasureValue}`));
}
function replaceItems(container, items) {
    if (items.length === 0) {
        const empty = document.createElement("li");
        empty.textContent = "未带出任何物品";
        container.replaceChildren(empty);
        return;
    }
    container.replaceChildren(...items.map((item) => {
        const entry = document.createElement("li");
        entry.textContent = translateItemName(item);
        return entry;
    }));
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
