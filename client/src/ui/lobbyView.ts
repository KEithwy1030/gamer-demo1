import type {
  LobbyState,
  RoomState,
  LobbyTab,
  LobbyRuntimeApi,
  LobbyController,
} from "../app/lobbyTypes";
import { DEFAULT_ROOM_CAPACITY, MAX_ROOM_CAPACITY } from "@gamer/shared";
import { LobbyBackground } from "./lobbyBackground";
import { createStashView, type StashViewApi } from "./stashView";
import { createMarketView, type MarketViewApi } from "./marketView";
import { attachViewportScaler, type ViewportScaler } from "./viewportScaler";
import { buildSettlementCopy } from "../results/ResultsOverlay";
import {
  getProfileLoadoutCount,
  getProfilePrimaryWeapon,
  getProfileStashItemCount,
  type LocalProfileMovePayload
} from "../profile/localProfile";

interface LobbyViewCallbacks {
  onPlayerNameChange(value: string): void;
  onRoomCodeInputChange(value: string): void;
  onCreateRoom(): void;
  onJoinRoom(): void;
  onLeaveRoom(): void;
  onCapacityChange(capacity: number): void;
  onStartMatch(): void;
  onBotDifficultyChange(difficulty: LobbyState["botDifficulty"]): void;
  onTabChange(activeTab: LobbyTab): void;
  onStashMoveItem(payload: LocalProfileMovePayload): void;
  onMarketProfileChanged(): void;
}

const MAX_VISIBLE_SLOTS = MAX_ROOM_CAPACITY;

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  textContent?: string,
) => {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;
  return element;
};

export class LobbyView {
  readonly element: HTMLElement;
  private readonly background: LobbyBackground;
  private readonly scaler: ViewportScaler;
  private readonly callbacks: LobbyViewCallbacks;
  private readonly runtimeApi: LobbyRuntimeApi;
  private readonly hallView: HTMLElement;
  private readonly stashView: StashViewApi;
  private readonly marketView: MarketViewApi;
  private readonly tabButtons: Record<LobbyTab, HTMLButtonElement>;
  private readonly playerNameInput: HTMLInputElement;
  private readonly roomCodeInput: HTMLInputElement;
  private readonly errorBanner: HTMLDivElement;
  private readonly infoBanner: HTMLDivElement;
  private readonly squadCount: HTMLElement;
  private readonly roomCodeValue: HTMLElement;
  private readonly roomCodeCopy: HTMLButtonElement;
  private readonly playerList: HTMLElement;
  private readonly capacitySelect: HTMLSelectElement;
  private readonly createButton: HTMLButtonElement;
  private readonly joinButton: HTMLButtonElement;
  private readonly leaveButton: HTMLButtonElement;
  private readonly deployButton: HTMLButtonElement;
  private readonly deployButtonLabel: HTMLElement;
  private readonly deployButtonSub: HTMLElement;
  private readonly botButtons: HTMLButtonElement[];
  private readonly botDifficultySelect: HTMLSelectElement;
  private readonly phaseDot: HTMLElement;
  private readonly accountName: HTMLElement;
  private readonly accountMeta: HTMLElement;
  private readonly roomModeValue: HTMLElement;
  private readonly roomPlayerValue: HTMLElement;
  private readonly loadoutWeapon: HTMLElement;
  private readonly loadoutWeaponTier: HTMLElement;
  private readonly stashGold: HTMLElement;
  private readonly stashItems: HTMLElement;
  private readonly stashDifficulty: HTMLElement;
  private readonly resultVerdict: HTMLElement;
  private readonly resultRoute: HTMLElement;
  private readonly resultKills: HTMLElement;
  private readonly resultDuration: HTMLElement;
  private readonly resultGold: HTMLElement;
  private readonly recoveredItems: HTMLElement;

  constructor(_controller: LobbyController, runtimeApi: LobbyRuntimeApi, callbacks: LobbyViewCallbacks) {
    this.runtimeApi = runtimeApi;
    this.callbacks = callbacks;
    this.background = new LobbyBackground();
    this.background.start();

    this.element = createElement("div", "grain");
    this.element.prepend(this.background.element);

    const stage = createElement("div", "stage");
    this.element.append(stage);
    this.scaler = attachViewportScaler(this.element, stage, {
      designWidth: 1600,
      designHeight: 900
    });

    const topbar = createElement("div", "topbar");
    const brand = createElement("div", "brand");
    const brandText = createElement("div");
    brandText.append(
      createElement("div", "brand-name", "流荒之路"),
      createElement("div", "brand-sub", "营地 / 火光未熄"),
    );
    const mark = createElement("div");
    mark.innerHTML = `<svg class="brand-mark" width="36" height="36" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 2 L38 12 L38 28 L20 38 L2 28 L2 12 Z" stroke="currentColor" stroke-width="1.5"/><path d="M20 8 L32 15 L32 25 L20 32 L8 25 L8 15 Z" stroke="currentColor" stroke-width="1" opacity="0.5"/><circle cx="20" cy="20" r="2" fill="currentColor"/></svg>`;
    brand.append(mark.firstElementChild as Element, brandText);

    const nav = createElement("nav", "nav");
    this.tabButtons = {
      hall: this.createNavButton("大厅", "hall"),
      stash: this.createNavButton("行囊", "stash"),
      market: this.createNavButton("黑市", "market"),
    };
    nav.append(this.tabButtons.hall, this.tabButtons.stash, this.tabButtons.market);

    const topbarRight = createElement("div", "topbar-right");
    this.phaseDot = createElement("div", "status-dot", "营地待命 / 未加入频道");
    const account = createElement("div", "account");
    account.append(createElement("div", "account-avatar", "VK"));
    const accountInfo = createElement("div", "account-info");
    this.accountName = createElement("div", "account-name", "未命名游击者");
    this.accountMeta = createElement("div", "account-meta", "等待建立频道");
    accountInfo.append(this.accountName, this.accountMeta);
    account.append(accountInfo);
    topbarRight.append(this.phaseDot, account);
    topbar.append(brand, nav, topbarRight);
    stage.append(topbar);

    const viewStack = createElement("div", "lobby-view-stack");
    stage.append(viewStack);

    this.hallView = createElement("div", "hall-view");
    viewStack.append(this.hallView);

    const grid = createElement("div", "grid");
    this.hallView.append(grid);

    const leftPanel = createElement("div", "panel");
    const squadHead = createElement("div", "squad-head");
    const squadHeadLeft = createElement("div");
    squadHeadLeft.append(
      createElement("div", "squad-title", "同行"),
      createElement("div", "stamp-label", "03 : 编成队伍"),
    );
    this.squadCount = createElement("div", "squad-count", "0/0 / 0 就绪");
    squadHead.append(squadHeadLeft, this.squadCount);
    leftPanel.append(squadHead);

    const roomCode = createElement("div", "room-code");
    const roomCodeLeft = createElement("div");
    roomCodeLeft.append(
      createElement("div", "room-code-label", "频道代码"),
      (this.roomCodeValue = createElement("div", "room-code-value", "------")),
    );
    this.roomCodeCopy = createElement("button", "room-code-copy", "复制代码") as HTMLButtonElement;
    this.roomCodeCopy.type = "button";
    this.roomCodeCopy.addEventListener("click", async () => {
      const value = this.roomCodeValue.textContent?.trim();
      if (!value || value === "------") return;
      try {
        await navigator.clipboard?.writeText(value);
      } catch {
        // ignore
      }
    });
    roomCode.append(roomCodeLeft, this.roomCodeCopy);
    leftPanel.append(roomCode);

    this.playerList = createElement("div");
    leftPanel.append(this.playerList);

    const capacityRow = createElement("div", "room-code");
    const capacityLeft = createElement("div");
    capacityLeft.append(
      createElement("div", "room-code-label", "小队上限"),
      createElement("div", "room-code-value", "调整人数"),
    );
    this.capacitySelect = createElement("select", "code-input") as HTMLSelectElement;
    Array.from({ length: MAX_ROOM_CAPACITY }, (_, index) => index + 1).forEach((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value} 人`;
      this.capacitySelect.append(option);
    });
    this.capacitySelect.addEventListener("change", () => this.callbacks.onCapacityChange(Number(this.capacitySelect.value)));
    capacityRow.append(capacityLeft, this.capacitySelect);
    leftPanel.append(capacityRow);

    this.leaveButton = createElement("button", "squad-invite", "离开频道") as HTMLButtonElement;
    this.leaveButton.type = "button";
    this.leaveButton.addEventListener("click", () => this.callbacks.onLeaveRoom());
    leftPanel.append(this.leaveButton);
    grid.append(leftPanel);

    const centerStack = createElement("div", "center-stack");
    grid.append(centerStack);

    const deploy = createElement("div", "deploy");
    deploy.innerHTML = `
      <div class="deploy-inner">
        <div class="deploy-head-row">
          <div>
            <div class="deploy-eyebrow">当前战场 / 第十四周</div>
            <h1 class="deploy-title">腐土荒岗</h1>
            <div class="deploy-sub">三王乱战后遗弃的荒野战场。溶河有尸毒，只剩两条旧石拱桥可供穿越回营。</div>
          </div>
          <div class="deploy-stamps">
            <span class="hot">交战者正从冻土苏醒</span>
            <span>第六日 / 黄昏前后</span>
            <span>封道计时 / 02:17:44</span>
          </div>
        </div>
      </div>
    `.trim();
    const metaStrip = createElement("div", "deploy-meta-strip");
    this.roomModeValue = appendMetaCell(metaStrip, "当前状态", "待集结");
    this.roomPlayerValue = appendMetaCell(metaStrip, "队伍人数", "0 / 0");
    appendMetaCell(metaStrip, "危险等级", "IV / 高", "warn");
    appendMetaCell(metaStrip, "场内游击者", "117", "hot");
    deploy.querySelector(".deploy-inner")?.append(metaStrip);
    centerStack.append(deploy);

    const ctaRow = createElement("div", "cta-row");
    this.deployButton = createElement("button", "btn-primary") as HTMLButtonElement;
    this.deployButton.type = "button";
    const deployText = createElement("span");
    this.deployButtonLabel = createElement("span", undefined, "创建频道");
    this.deployButtonSub = createElement("span", "btn-sub", "先建立频道，再等待小队集结");
    deployText.append(this.deployButtonLabel, this.deployButtonSub);
    this.deployButton.append(deployText, createElement("span", "arrow", "▶"));
    this.deployButton.addEventListener("click", () => {
      const state = this.runtimeApi.getState();
      if (state.currentRoom) {
        this.callbacks.onStartMatch();
      } else {
        this.callbacks.onCreateRoom();
      }
    });
    const soloButton = createElement("button", "btn-secondary") as HTMLButtonElement;
    soloButton.type = "button";
    soloButton.disabled = true;
    soloButton.innerHTML = `单人入场<span class="btn-sub">功能暂未开放</span>`;
    ctaRow.append(this.deployButton, soloButton);
    centerStack.append(ctaRow);

    const joinRow = createElement("div", "join-row");

    const nameCard = createElement("div", "join-card");
    const nameTitle = createElement("div", "join-card-title");
    nameTitle.append(createElement("span", undefined, "行动代号"), createElement("span", "kicker", "进入频道前确认"));
    const nameInputRow = createElement("div", "code-input-row");
    this.playerNameInput = createElement("input", "code-input") as HTMLInputElement;
    this.playerNameInput.placeholder = "输入你的代号";
    this.playerNameInput.maxLength = 18;
    this.playerNameInput.addEventListener("input", () => this.callbacks.onPlayerNameChange(this.playerNameInput.value));
    this.createButton = createElement("button", "code-go", "创建") as HTMLButtonElement;
    this.createButton.type = "button";
    this.createButton.addEventListener("click", () => this.callbacks.onCreateRoom());
    nameInputRow.append(this.playerNameInput, this.createButton);
    nameCard.append(nameTitle, nameInputRow);

    const codeCard = createElement("div", "join-card");
    const codeTitle = createElement("div", "join-card-title");
    codeTitle.append(createElement("span", undefined, "根据代码加入"), createElement("span", "kicker", "房主分享"));
    const codeInputRow = createElement("div", "code-input-row");
    this.roomCodeInput = createElement("input", "code-input") as HTMLInputElement;
    this.roomCodeInput.placeholder = "例如 南岭路42";
    this.roomCodeInput.maxLength = 8;
    this.roomCodeInput.addEventListener("input", () => this.callbacks.onRoomCodeInputChange(this.roomCodeInput.value));
    this.joinButton = createElement("button", "code-go", "加入 ▶") as HTMLButtonElement;
    this.joinButton.type = "button";
    this.joinButton.addEventListener("click", () => this.callbacks.onJoinRoom());
    codeInputRow.append(this.roomCodeInput, this.joinButton);
    codeCard.append(codeTitle, codeInputRow, createElement("div", "qm-eta", "从房主复制的频道代码可直接粘贴到这里"));

    const botCard = createElement("div", "join-card");
    const botTitle = createElement("div", "join-card-title");
    botTitle.append(createElement("span", undefined, "Bot 难度"), createElement("span", "kicker", "仅影响敌对队伍"));
    const botRow = createElement("div", "qm-row");
    this.botButtons = ["简单", "中等", "困难"].map((label, index) => {
      const button = createElement("button", `qm-btn ${index === 1 ? "active" : ""}`, label) as HTMLButtonElement;
      button.type = "button";
      button.addEventListener("click", () => {
        const value = index === 0 ? "easy" : index === 1 ? "normal" : "hard";
        this.callbacks.onBotDifficultyChange(value);
      });
      botRow.append(button);
      return button;
    });
    this.botDifficultySelect = createElement("select", "code-input") as HTMLSelectElement;
    [
      ["easy", "Bot 简单"],
      ["normal", "Bot 中等"],
      ["hard", "Bot 困难"],
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      this.botDifficultySelect.append(option);
    });
    this.botDifficultySelect.addEventListener("change", () => this.callbacks.onBotDifficultyChange(this.botDifficultySelect.value as LobbyState["botDifficulty"]));
    botCard.append(botTitle, botRow, this.botDifficultySelect, createElement("div", "qm-eta", "开发测试阶段不向本队补 Bot"));

    joinRow.append(nameCard, codeCard, botCard);
    centerStack.append(joinRow);

    this.errorBanner = createElement("div", "banner banner--error") as HTMLDivElement;
    this.infoBanner = createElement("div", "banner banner--info") as HTMLDivElement;
    centerStack.append(this.errorBanner, this.infoBanner);

    const rightPanel = createElement("div", "right-stack");
    grid.append(rightPanel);

    const loadoutPanel = createElement("div", "panel");
    loadoutPanel.append(createPanelHead("04", "装束 / 当前预设", "待发"));
    const loadoutRow = createElement("div", "loadout-row");
    const primarySlot = createElement("div", "loadout-slot primary");
    primarySlot.append(
      buildLoadoutText("武器", "灰铁长剑"),
      (this.loadoutWeaponTier = createElement("div", "loadout-tier tier-rare", "基础出战")),
      createElement("div", "loadout-glyph", "刃"),
    );
    this.loadoutWeapon = primarySlot.querySelector(".loadout-name") as HTMLElement;
    loadoutRow.append(primarySlot, buildArmorSlot("头盔", "待接入"), buildArmorSlot("胸甲", "待接入"), buildArmorSlot("护手", "待接入"), buildArmorSlot("靴履", "待接入"));
    loadoutPanel.append(loadoutRow);
    const stashRow = createElement("div", "stash-row");
    this.stashGold = appendStashCell(stashRow, "金币", "0", "hot");
    this.stashItems = appendStashCell(stashRow, "行囊物件", "0");
    this.stashDifficulty = appendStashCell(stashRow, "敌队 Bot", "中等", "warn");
    loadoutPanel.append(stashRow);
    rightPanel.append(loadoutPanel);

    const resultPanel = createElement("div", "panel");
    resultPanel.append(createPanelHead("05", "上局 / 归途手札", "等待本次行动"));
    const runCard = createElement("div", "run-card");
    const verdict = createElement("div", "run-verdict");
    const verdictWrap = createElement("div");
    this.resultVerdict = createElement("div", "run-verdict-text", "待出征");
    verdictWrap.append(this.resultVerdict);
    this.resultRoute = createElement("div", "run-verdict-meta", "封锁区尚未选定\n等待建立频道");
    verdict.append(verdictWrap, this.resultRoute);
    const runStats = createElement("div", "run-stats");
    this.resultKills = appendRunStat(runStats, "斩获", "0 / 0");
    this.resultDuration = appendRunStat(runStats, "存活", "00:00");
    this.resultGold = appendRunStat(runStats, "收益", "+0", "color: var(--signal);");
    const recovered = createElement("div", "run-recovered");
    recovered.append(createElement("span", "stamp-label", "收获"));
    this.recoveredItems = createElement("div", "run-recovered-items");
    this.recoveredItems.append(createElement("span", "run-item", "等待本次结算"));
    recovered.append(this.recoveredItems);
    runCard.append(verdict, runStats, recovered);
    resultPanel.append(runCard);
    rightPanel.append(resultPanel);

    const ticker = createElement("div", "ticker");
    ticker.append(
      buildTickerItem("营地", "南岭 / 二号"),
      createElement("span", "ticker-sep", "|"),
      buildTickerItem("候伴", "00:47", "hot"),
      createElement("span", "ticker-sep", "|"),
      buildTickerItem("信使", "28 封"),
      createElement("span", "ticker-sep", "|"),
      buildTickerItem("封道", "02:17:44", "warn"),
    );
    this.hallView.append(ticker);

    this.stashView = createStashView({
      onMoveItem: (payload) => this.callbacks.onStashMoveItem(payload)
    });
    this.marketView = createMarketView({
      onProfileChanged: () => this.callbacks.onMarketProfileChanged()
    });
    viewStack.append(this.stashView.element, this.marketView.element);
  }

  render(state: LobbyState) {
    this.playerNameInput.value = state.playerName;
    this.roomCodeInput.value = state.roomCodeInput;
    this.botDifficultySelect.value = state.botDifficulty;
    this.capacitySelect.value = String(state.currentRoom?.capacity ?? DEFAULT_ROOM_CAPACITY);
    this.botButtons.forEach((button, index) => {
      const value = index === 0 ? "easy" : index === 1 ? "normal" : "hard";
      button.classList.toggle("active", state.botDifficulty === value);
    });

    this.setActiveTab(state.activeTab);
    this.stashView.render(state.profile);
    this.marketView.render(state.profile);

    const loadoutCount = getProfileLoadoutCount(state.profile);
    this.loadoutWeapon.textContent = getProfilePrimaryWeapon(state.profile);
    this.loadoutWeaponTier.textContent = loadoutCount > 1 ? `${loadoutCount} 件可用` : "基础出战";
    this.stashGold.textContent = state.profile.gold.toLocaleString("zh-CN");
    this.stashItems.textContent = String(getProfileStashItemCount(state.profile));
    this.stashDifficulty.textContent = state.botDifficulty === "easy" ? "简单" : state.botDifficulty === "hard" ? "困难" : "中等";

    if (state.profile.lastRun) {
      const runCopy = buildSettlementCopy({
        result: state.profile.lastRun.result,
        reason: state.profile.lastRun.reason,
        survivedSeconds: state.profile.lastRun.survivedSeconds,
        playerKills: state.profile.lastRun.playerKills,
        monsterKills: state.profile.lastRun.monsterKills,
        extractedGold: Math.max(0, state.profile.lastRun.goldDelta),
        extractedTreasureValue: 0,
        extractedItems: state.profile.lastRun.items,
        retainedItems: state.profile.lastRun.items,
        lostItems: [],
        loadoutLost: state.profile.lastRun.result === "failure",
        profileGoldDelta: state.profile.lastRun.goldDelta,
      });
      this.resultVerdict.textContent = runCopy.title;
      this.resultVerdict.className = `run-verdict-text ${state.profile.lastRun.result === "success" ? "extracted" : "down"}`.trim();
      this.resultRoute.innerHTML = `腐土荒岗<br/>${runCopy.lobbySummary}`;
      this.resultKills.textContent = `${state.profile.lastRun.playerKills}/${state.profile.lastRun.monsterKills}`;
      this.resultDuration.textContent = formatDuration(state.profile.lastRun.survivedSeconds);
      this.resultGold.textContent = `${state.profile.lastRun.goldDelta >= 0 ? "+" : ""}${state.profile.lastRun.goldDelta.toLocaleString("zh-CN")}`;
      this.recoveredItems.replaceChildren(
        ...(state.profile.lastRun.items.length > 0 ? state.profile.lastRun.items.slice(0, 4) : ["无带回物资"]).map((item) => createElement("span", "run-item", item)),
      );
    }

    this.errorBanner.textContent = state.errorMessage ?? "";
    this.errorBanner.hidden = !state.errorMessage;
    this.infoBanner.textContent = state.infoMessage ?? "";
    this.infoBanner.hidden = !state.infoMessage;
    this.accountName.textContent = state.playerName.trim() || "未命名游击者";

    const roomState = state.currentRoom;
    if (!roomState) {
      this.phaseDot.textContent = state.isBusy ? "营地联络 / 建立通信中" : "营地待命 / 未加入频道";
      this.accountMeta.textContent = "游击者 / 待命中";
      this.squadCount.textContent = "0/0 / 0 就绪";
      this.roomCodeValue.textContent = "------";
      this.roomCodeCopy.disabled = true;
      this.playerList.replaceChildren(...renderEmptySlots(MAX_VISIBLE_SLOTS));
      this.capacitySelect.value = String(DEFAULT_ROOM_CAPACITY);
      this.deployButtonLabel.textContent = state.isBusy ? "正在建立频道" : "创建频道";
      this.deployButtonSub.textContent = state.infoMessage?.includes("入库") || state.infoMessage?.includes("损失")
        ? "上一局已完成结算，整理装束后可以再次出征"
        : "先建立频道，再等待小队集结";
      this.deployButton.disabled = state.isBusy;
      this.joinButton.disabled = state.isBusy;
      this.createButton.disabled = state.isBusy;
      this.leaveButton.disabled = true;
      this.roomModeValue.textContent = "待集结";
      this.roomPlayerValue.textContent = "0 / 0";
      if (!state.profile.lastRun) {
        this.resultVerdict.textContent = "待出征";
        this.resultVerdict.className = "run-verdict-text";
        this.resultRoute.innerHTML = "封锁区尚未选定<br/>等待建立频道";
        this.resultKills.textContent = "0 / 0";
        this.resultDuration.textContent = "00:00";
        this.resultGold.textContent = "+0";
        this.recoveredItems.replaceChildren(createElement("span", "run-item", "等待本次结算"));
      }
      return;
    }

    const visibleCapacity = Math.max(roomState.capacity, roomState.players.length);
    const readyCount = roomState.players.filter((player) => player.isHost || player.isReady).length;
    const localPlayer = roomState.players.find((player) => player.id === roomState.localPlayerId) ?? null;
    const isHost = Boolean(localPlayer?.isHost);
    const isStarting = roomState.status === "starting";

    this.phaseDot.textContent = isStarting ? "营地联络 / 正在部署" : "营地联络 / 频道在线";
    this.accountMeta.textContent = isHost ? "房主 / 指挥中" : "队员 / 待命中";
    this.squadCount.textContent = `${roomState.players.length}/${visibleCapacity} / ${readyCount} 就绪`;
    this.roomCodeValue.textContent = roomState.roomCode;
    this.roomCodeCopy.disabled = false;
    this.playerList.replaceChildren(...renderRoomSlots(roomState, visibleCapacity));
    this.capacitySelect.value = String(roomState.capacity);

    const ctaCopy = getDeployCtaCopy({
      isBusy: state.isBusy,
      isStarting,
      isHost,
      readyCount,
      playerCount: roomState.players.length,
    });
    this.deployButtonLabel.textContent = ctaCopy.label;
    this.deployButtonSub.textContent = ctaCopy.sub;
    this.deployButton.disabled = state.isBusy || isStarting || !isHost;
    this.createButton.disabled = state.isBusy;
    this.joinButton.disabled = state.isBusy;
    this.leaveButton.disabled = state.isBusy;
    this.roomModeValue.textContent = isStarting ? "部署中" : "频道在线";
    this.roomPlayerValue.textContent = `${roomState.players.length} / ${roomState.capacity}`;
    this.resultVerdict.textContent = isStarting ? "已出征" : "待部署";
    this.resultVerdict.className = `run-verdict-text ${isStarting ? "extracted" : ""}`.trim();
    this.resultRoute.innerHTML = `${roomState.roomCode}<br/>${isHost ? "由你发起本局部署" : "等待房主发起本局部署"}`;
  }

  destroy() {
    this.scaler.destroy();
    this.background.stop();
  }

  private createNavButton(label: string, tab: LobbyTab): HTMLButtonElement {
    const button = createElement("button", "nav-item", label) as HTMLButtonElement;
    button.type = "button";
    button.addEventListener("click", () => this.callbacks.onTabChange(tab));
    return button;
  }

  private setActiveTab(nextTab: LobbyTab): void {
    this.hallView.hidden = nextTab !== "hall";
    if (nextTab === "stash") this.stashView.show(); else this.stashView.hide();
    if (nextTab === "market") this.marketView.show(); else this.marketView.hide();
    (Object.keys(this.tabButtons) as LobbyTab[]).forEach((tab) => {
      this.tabButtons[tab].classList.toggle("active", tab === nextTab);
      this.tabButtons[tab].setAttribute("aria-pressed", tab === nextTab ? "true" : "false");
    });
  }
}

function createPanelHead(index: string, title: string, meta: string) {
  const head = createElement("div", "panel-head");
  const left = createElement("div");
  left.append(createElement("span", "panel-head-id", index), document.createTextNode(` / ${title}`));
  head.append(left, createElement("div", undefined, meta));
  return head;
}

function buildLoadoutText(kind: string, name: string) {
  const wrap = createElement("div");
  wrap.append(createElement("div", "loadout-kind", kind), createElement("div", "loadout-name", name));
  return wrap;
}

function buildArmorSlot(kind: string, name: string) {
  const slot = createElement("div", "loadout-slot");
  slot.append(buildLoadoutText(kind, name), createElement("div", "loadout-tier", "等待接入"), createElement("div", "loadout-glyph", "甲"));
  return slot;
}

function appendMetaCell(parent: HTMLElement, label: string, value: string, extraClass?: string) {
  const cell = createElement("div", "dm-cell");
  const valueNode = createElement("div", `dm-value${extraClass ? ` ${extraClass}` : ""}`, value);
  cell.append(createElement("div", "dm-label", label), valueNode);
  parent.append(cell);
  return valueNode;
}

function appendStashCell(parent: HTMLElement, label: string, value: string, extraClass?: string) {
  const cell = createElement("div", "stash-cell");
  const valueNode = createElement("div", `stash-v${extraClass ? ` ${extraClass}` : ""}`, value);
  cell.append(valueNode, createElement("div", "stash-l", label));
  parent.append(cell);
  return valueNode;
}

function appendRunStat(parent: HTMLElement, label: string, value: string, styleText?: string) {
  const cell = createElement("div", "run-stat");
  const valueNode = createElement("div", "run-stat-v", value);
  if (styleText) valueNode.style.cssText = styleText;
  cell.append(valueNode, createElement("div", "run-stat-l", label));
  parent.append(cell);
  return valueNode;
}

function buildTickerItem(label: string, value: string, valueClass?: string) {
  const item = createElement("div", "ticker-item");
  item.append(createElement("span", undefined, label), createElement("span", `v${valueClass ? ` ${valueClass}` : ""}`, value));
  return item;
}

function renderEmptySlots(count: number, startIndex = 0) {
  return Array.from({ length: count }, (_, index) => {
    const slot = createElement("div", "slot");
    const info = createElement("div", "slot-info");
    info.append(
      createElement("div", "slot-name empty", `空位 ${String(startIndex + index + 1).padStart(2, "0")} / 等待游击者`),
      createElement("div", "slot-meta", "建立频道后可加入队伍"),
    );
    slot.append(createElement("div", "slot-avatar empty", "—"), info, createElement("div", "slot-state empty", "空位"));
    return slot;
  });
}

function renderRoomSlots(roomState: RoomState, count: number) {
  const slots: HTMLElement[] = [];
  for (let index = 0; index < count; index += 1) {
    const player = roomState.players[index];
    if (!player) {
      slots.push(...renderEmptySlots(1, index));
      continue;
    }
    const slot = createElement("div", "slot");
    const stateClass = player.isHost ? "host" : player.isReady ? "ready" : "wait";
    const stateLabel = player.isHost ? "领队" : player.isReady ? "待发" : "整装";
    const info = createElement("div", "slot-info");
    info.append(
      createElement("div", "slot-name", player.name.toUpperCase()),
      createElement("div", "slot-meta", player.isHost ? "房主 / 当前频道指挥" : `队员 ${index + 1} / 等待部署`),
    );
    slot.append(createElement("div", `slot-avatar ${player.isHost || player.isReady ? "ready" : ""}`, initialsFromName(player.name)), info, createElement("div", `slot-state ${stateClass}`, stateLabel));
    slots.push(slot);
  }
  return slots;
}

function initialsFromName(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : "?";
}

function getDeployCtaCopy(input: {
  isBusy: boolean;
  isStarting: boolean;
  isHost: boolean;
  readyCount: number;
  playerCount: number;
}) {
  if (input.isStarting) return { label: "正在出征", sub: "全队已锁定 / 正在进入地图" };
  if (input.isHost) return { label: input.isBusy ? "正在部署" : "立即出征", sub: `${input.readyCount}/${input.playerCount} 就绪 / 房主可开始部署` };
  return { label: input.isBusy ? "同步频道中" : "等待房主", sub: `${input.readyCount}/${input.playerCount} 就绪 / 等待房主下令` };
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60));
  const seconds = Math.max(0, totalSeconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
