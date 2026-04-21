import type {
  LobbyController,
  LobbyRuntimeApi,
  LobbyState,
  RoomState,
} from "../app/lobbyTypes";
import { LobbyBackground } from "./lobbyBackground";

interface LobbyViewCallbacks {
  onPlayerNameChange(value: string): void;
  onRoomCodeInputChange(value: string): void;
  onCreateRoom(): void;
  onJoinRoom(): void;
  onLeaveRoom(): void;
  onCapacityChange(capacity: number): void;
  onStartMatch(): void;
}

const MAX_VISIBLE_SLOTS = 6;

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  textContent?: string,
) => {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (textContent) {
    element.textContent = textContent;
  }
  return element;
};

const createBrandMark = () => {
  const wrap = createElement("div");
  wrap.innerHTML = `
    <svg class="brand-mark" width="36" height="36" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M20 2 L38 12 L38 28 L20 38 L2 28 L2 12 Z" stroke="currentColor" stroke-width="1.5"/>
      <path d="M20 8 L32 15 L32 25 L20 32 L8 25 L8 15 Z" stroke="currentColor" stroke-width="1" opacity="0.5"/>
      <circle cx="20" cy="20" r="2" fill="currentColor"/>
      <path d="M20 12 L20 16 M20 24 L20 28 M12 20 L16 20 M24 20 L28 20" stroke="currentColor" stroke-width="1.2"/>
    </svg>
  `.trim();
  return wrap.firstElementChild as SVGElement;
};

const createPanelHead = (index: string, title: string, meta: string) => {
  const head = createElement("div", "panel-head");
  const left = createElement("div");
  left.append(
    createElement("span", "panel-head-id", index),
    document.createTextNode(` / ${title}`),
  );
  head.append(left, createElement("div", undefined, meta));
  return head;
};

export class LobbyView {
  readonly element: HTMLElement;
  private readonly background: LobbyBackground;

  private readonly callbacks: LobbyViewCallbacks;
  private readonly controller: LobbyController;
  private readonly runtimeApi: LobbyRuntimeApi;
  private readonly playerNameInput: HTMLInputElement;
  private readonly roomCodeInput: HTMLInputElement;
  private readonly errorBanner: HTMLDivElement;
  private readonly infoBanner: HTMLDivElement;
  private readonly squadCount: HTMLElement;
  private readonly roomCodeValue: HTMLElement;
  private readonly roomCodeCopy: HTMLButtonElement;
  private readonly playerList: HTMLElement;
  private readonly createButton: HTMLButtonElement;
  private readonly deployButton: HTMLButtonElement;
  private readonly deployButtonLabel: HTMLElement;
  private readonly deployButtonSub: HTMLElement;
  private readonly soloButton: HTMLButtonElement;
  private readonly joinButton: HTMLButtonElement;
  private readonly leaveButton: HTMLButtonElement;
  private readonly quickMatchButtons: HTMLButtonElement[];
  private readonly quickMatchEta: HTMLElement;
  private readonly phaseDot: HTMLElement;
  private readonly accountName: HTMLElement;
  private readonly accountMeta: HTMLElement;
  private readonly roomModeValue: HTMLElement;
  private readonly roomPlayerValue: HTMLElement;
  private readonly roomDangerValue: HTMLElement;
  private readonly roomTrafficValue: HTMLElement;
  private readonly loadoutWeapon: HTMLElement;
  private readonly loadoutWeaponTier: HTMLElement;
  private readonly loadoutArmor: HTMLElement[];
  private readonly stashGold: HTMLElement;
  private readonly stashItems: HTMLElement;
  private readonly stashInsurance: HTMLElement;
  private readonly resultVerdict: HTMLElement;
  private readonly resultRoute: HTMLElement;
  private readonly resultKills: HTMLElement;
  private readonly resultDuration: HTMLElement;
  private readonly resultGold: HTMLElement;
  private readonly recoveredItems: HTMLElement;
  private readonly tickerFeedInner: HTMLElement;

  constructor(controller: LobbyController, runtimeApi: LobbyRuntimeApi, callbacks: LobbyViewCallbacks) {
    this.controller = controller;
    this.runtimeApi = runtimeApi;
    this.callbacks = callbacks;

    this.background = new LobbyBackground();
    this.background.start();

    this.element = createElement("div", "grain");
    this.element.prepend(this.background.element);

    const stage = createElement("div", "stage");
    this.element.append(stage);

    const topbar = createElement("div", "topbar");
    const brand = createElement("div", "brand");
    const brandText = createElement("div");
    brandText.append(
      createElement("div", "brand-name", "流荒之路"),
      createElement("div", "brand-sub", "营地 / 火光未熄"),
    );
    brand.append(createBrandMark(), brandText);

    const nav = createElement("nav", "nav");
    nav.append(
      createNavItem("大厅", true),
      createDisabledNav("行囊"),
      createDisabledNav("货摊"),
    );

    const topbarRight = createElement("div", "topbar-right");
    this.phaseDot = createElement("div", "status-dot", "营地待命 / 通道未开启");
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

    const grid = createElement("div", "grid");
    stage.append(grid);

    const squadPanel = createElement("div", "panel");
    const squadHead = createElement("div", "squad-head");
    const squadHeadLeft = createElement("div");
    squadHeadLeft.append(
      createElement("div", "squad-title", "同行"),
      createElement("div", "stamp-label", "03 : 编成队伍"),
    );
    this.squadCount = createElement("div", "squad-count", "0/0 / 0 就绪");
    squadHead.append(squadHeadLeft, this.squadCount);
    squadPanel.append(squadHead);

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
      if (!value || value === "------") {
        return;
      }
      try {
        await navigator.clipboard?.writeText(value);
      } catch {
        // Ignore clipboard failure; this is convenience only.
      }
    });
    roomCode.append(roomCodeLeft, this.roomCodeCopy);
    squadPanel.append(roomCode);

    this.playerList = createElement("div");
    squadPanel.append(this.playerList);

    const capacityRow = createElement("div", "room-code");
    const capacityLeft = createElement("div");
    capacityLeft.append(
      createElement("div", "room-code-label", "小队上限"),
      createElement("div", "room-code-value", "调整人数"),
    );
    const capacitySelect = createElement("select", "code-input") as HTMLSelectElement;
    [2, 3, 4, 5, 6].forEach((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value} 人`;
      capacitySelect.append(option);
    });
    capacitySelect.addEventListener("change", () => {
      this.callbacks.onCapacityChange(Number(capacitySelect.value));
    });
    capacityRow.append(capacityLeft, capacitySelect);
    squadPanel.append(capacityRow);

    const leaveButton = createElement("button", "squad-invite", "离开频道") as HTMLButtonElement;
    leaveButton.type = "button";
    leaveButton.addEventListener("click", () => this.callbacks.onLeaveRoom());
    squadPanel.append(leaveButton);
    this.leaveButton = leaveButton;

    grid.append(squadPanel);

    const centerStack = createElement("div", "center-stack");
    grid.append(centerStack);

    const deploy = createElement("div", "deploy");
    const deployTerrain = createElement("div");
    deployTerrain.innerHTML = `
      <svg class="deploy-terrain" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g fill="none" stroke="#E8DFC8" stroke-opacity="0.14" stroke-width="0.8">
          <path d="M 0 300 Q 120 260 240 280 T 480 240 T 760 270"/>
          <path d="M 0 330 Q 120 290 240 310 T 480 270 T 760 300"/>
          <path d="M 0 360 Q 120 320 240 340 T 480 300 T 760 330"/>
        </g>
        <g font-family="JetBrains Mono, monospace" font-size="10" fill="#E8DFC8" fill-opacity="0.22" letter-spacing="3">
          <text x="60" y="50">北岭 / 封锁区 / 罗盘 N 43°</text>
        </g>
        <g stroke="#E8602C" stroke-opacity="0.3" fill="none">
          <circle cx="620" cy="120" r="4" fill="#E8602C" fill-opacity="0.6"/>
          <circle cx="620" cy="120" r="14"/>
          <circle cx="620" cy="120" r="26" stroke-opacity="0.15"/>
        </g>
      </svg>
    `.trim();
    deploy.append(deployTerrain.firstElementChild as SVGElement);

    const deployInner = createElement("div", "deploy-inner");
    const deployHeadRow = createElement("div", "deploy-head-row");
    const deployHeadLeft = createElement("div");
    deployHeadLeft.append(
      createElement("div", "deploy-eyebrow", "当前战场 / 第十四周"),
      createElement("h1", "deploy-title", "腐土荒岗"),
      createElement(
        "div",
        "deploy-sub",
        "三王乱战后遗弃的荒野战场。溶河有尸毒，只剩两条旧石拱桥可供穿越回营。",
      ),
    );
    const deployStamps = createElement("div", "deploy-stamps");
    deployStamps.append(
      createElement("span", "hot", "交战者正从冻土苏醒"),
      createElement("span", undefined, "第六日 / 黄昏前后"),
      createElement("span", undefined, "封道计时 / 02:17:44"),
    );
    deployHeadRow.append(deployHeadLeft, deployStamps);

    const metaStrip = createElement("div", "deploy-meta-strip");
    this.roomModeValue = appendDmCell(metaStrip, "当前状态", "待集结");
    this.roomPlayerValue = appendDmCell(metaStrip, "队伍人数", "0 / 0");
    this.roomDangerValue = appendDmCell(metaStrip, "危险等级", "IV / 高", "warn");
    this.roomTrafficValue = appendDmCell(metaStrip, "场内游击者", "117", "hot");

    deployInner.append(deployHeadRow, metaStrip);
    deploy.append(deployInner);
    centerStack.append(deploy);

    const ctaRow = createElement("div", "cta-row");
    this.deployButton = createElement("button", "btn-primary waiting") as HTMLButtonElement;
    this.deployButton.type = "button";
    const deployButtonText = createElement("span");
    this.deployButtonLabel = createElement("span", undefined, "等待同行");
    this.deployButtonSub = createElement("span", "btn-sub", "0/0 待发 / 按兵不动");
    deployButtonText.append(this.deployButtonLabel, this.deployButtonSub);
    this.deployButton.append(deployButtonText, createElement("span", "arrow", "▶"));
    this.deployButton.addEventListener("click", () => {
      const state = this.runtimeApi.getState();
      if (state.currentRoom) {
        this.callbacks.onStartMatch();
      } else {
        this.callbacks.onCreateRoom();
      }
    });
    this.soloButton = createElement("button", "btn-secondary") as HTMLButtonElement;
    this.soloButton.type = "button";
    this.soloButton.disabled = true;
    this.soloButton.innerHTML = `单人入场<span class="btn-sub">功能暂未开放</span>`;
    ctaRow.append(this.deployButton, this.soloButton);
    centerStack.append(ctaRow);

    const joinRow = createElement("div", "join-row");
    const joinCard = createElement("div", "join-card");
    const joinCardTitle = createElement("div", "join-card-title");
    joinCardTitle.append(
      createElement("span", undefined, "根据代码加入"),
      createElement("span", "kicker", "6 位编码"),
    );
    const nameCardTitle = createElement("div", "join-card-title");
    nameCardTitle.append(
      createElement("span", undefined, "行动代号"),
      createElement("span", "kicker", "进入频道前确认"),
    );
    const nameInputRow = createElement("div", "code-input-row");
    this.playerNameInput = createElement("input", "code-input") as HTMLInputElement;
    this.playerNameInput.placeholder = "输入你的代号";
    this.playerNameInput.maxLength = 18;
    this.playerNameInput.addEventListener("input", () => {
      this.callbacks.onPlayerNameChange(this.playerNameInput.value);
    });
    this.createButton = createElement("button", "code-go", "创建") as HTMLButtonElement;
    this.createButton.type = "button";
    this.createButton.addEventListener("click", () => this.callbacks.onCreateRoom());
    nameInputRow.append(this.playerNameInput, this.createButton);

    joinCard.append(nameCardTitle, nameInputRow);

    const codeCard = createElement("div", "join-card");
    const codeCardTitle = createElement("div", "join-card-title");
    codeCardTitle.append(
      createElement("span", undefined, "根据代码加入"),
      createElement("span", "kicker", "房主分享"),
    );
    const codeInputRow = createElement("div", "code-input-row");
    this.roomCodeInput = createElement("input", "code-input") as HTMLInputElement;
    this.roomCodeInput.placeholder = "例如 A1B2C3";
    this.roomCodeInput.maxLength = 6;
    this.roomCodeInput.addEventListener("input", () => {
      this.callbacks.onRoomCodeInputChange(this.roomCodeInput.value);
    });
    this.joinButton = createElement("button", "code-go", "启封 ▶") as HTMLButtonElement;
    this.joinButton.type = "button";
    this.joinButton.addEventListener("click", () => this.callbacks.onJoinRoom());
    codeInputRow.append(this.roomCodeInput, this.joinButton);
    codeCard.append(
      codeCardTitle,
      codeInputRow,
      createElement("div", "qm-eta", "从房主复制的频道代码可直接粘贴到这里"),
    );

    const matchCard = createElement("div", "join-card");
    const matchCardTitle = createElement("div", "join-card-title");
    matchCardTitle.append(
      createElement("span", undefined, "自动编队"),
      createElement("span", "kicker", "暂不接线"),
    );
    const qmRow = createElement("div", "qm-row");
    this.quickMatchButtons = ["常规", "加难", "孤狼"].map((label, index) => {
      const button = createElement("button", `qm-btn ${index === 0 ? "active" : ""}`, label) as HTMLButtonElement;
      button.type = "button";
      button.disabled = true;
      qmRow.append(button);
      return button;
    });
    const qmMeta = createElement("div");
    qmMeta.style.display = "flex";
    qmMeta.style.justifyContent = "space-between";
    qmMeta.style.alignItems = "center";
    this.quickMatchEta = createElement("span", "qm-eta", "平均等待 / 即将开放");
    qmMeta.append(
      this.quickMatchEta,
      createElement("span", "qm-eta", "这轮仅保留展示"),
    );
    matchCard.append(matchCardTitle, qmRow, qmMeta);
    joinRow.append(joinCard, codeCard, matchCard);
    centerStack.append(joinRow);

    this.errorBanner = createElement("div", "banner banner--error") as HTMLDivElement;
    this.infoBanner = createElement("div", "banner banner--info") as HTMLDivElement;
    centerStack.append(this.errorBanner, this.infoBanner);

    const rightStack = createElement("div", "right-stack");
    grid.append(rightStack);

    const loadoutPanel = createElement("div", "panel");
    loadoutPanel.append(createPanelHead("04", "装束 / 当前预设", "待发"));
    const loadoutRow = createElement("div", "loadout-row");
    const primarySlot = createElement("div", "loadout-slot primary");
    primarySlot.append(
      buildLoadoutText("武器", "灰铁长剑"),
      (this.loadoutWeaponTier = createElement("div", "loadout-tier tier-rare", "A / 已磨利")),
      createGlyph("loadout-glyph", "刃"),
    );
    this.loadoutWeapon = primarySlot.querySelector(".loadout-name") as HTMLElement;
    loadoutRow.append(primarySlot);
    this.loadoutArmor = [
      buildArmorSlot(loadoutRow, "头盔", "临时占位"),
      buildArmorSlot(loadoutRow, "胸甲", "临时占位"),
      buildArmorSlot(loadoutRow, "护手", "临时占位"),
      buildArmorSlot(loadoutRow, "靴履", "临时占位"),
    ];
    loadoutPanel.append(loadoutRow);

    const stashRow = createElement("div", "stash-row");
    this.stashGold = appendStashCell(stashRow, "金币", "184,520", "hot");
    this.stashItems = appendStashCell(stashRow, "行囊物件", "287");
    this.stashInsurance = appendStashCell(stashRow, "保管位", "4", "warn");
    loadoutPanel.append(stashRow);
    rightStack.append(loadoutPanel);

    const runPanel = createElement("div", "panel");
    runPanel.append(createPanelHead("05", "上局 / 归途手札", "24 分钟前"));
    const runCard = createElement("div", "run-card");
    const verdict = createElement("div", "run-verdict");
    const verdictTextWrap = createElement("div");
    this.resultVerdict = createElement("div", "run-verdict-text extracted", "已脱身");
    verdictTextWrap.append(this.resultVerdict);
    this.resultRoute = createElement("div", "run-verdict-meta", "腐土荒岗\n经由 旧石拱桥");
    verdict.append(verdictTextWrap, this.resultRoute);
    const runStats = createElement("div", "run-stats");
    this.resultKills = appendRunStat(runStats, "斩获", "4");
    this.resultDuration = appendRunStat(runStats, "存活", "31:12");
    this.resultGold = appendRunStat(runStats, "金币", "+24,800", "color: var(--signal);");
    const recovered = createElement("div", "run-recovered");
    recovered.append(createElement("span", "stamp-label", "收获"));
    this.recoveredItems = createElement("div", "run-recovered-items");
    ["银漆护符", "虚蓝晶", "治疗草药 × 3", "铁箭 × 48"].forEach((item, index) => {
      const chip = createElement("span", `run-item ${index < 2 ? "rare" : ""}`, item);
      this.recoveredItems.append(chip);
    });
    recovered.append(this.recoveredItems);
    runCard.append(verdict, runStats, recovered);
    runPanel.append(runCard);
    rightStack.append(runPanel);

    const ticker = createElement("div", "ticker");
    ticker.append(
      buildTickerItem("营地", "南岭 / 二号"),
      createElement("span", "ticker-sep", "|"),
      buildTickerItem("候伴", "00:47", "hot"),
      createElement("span", "ticker-sep", "|"),
      buildTickerItem("信使", "28 封"),
      createElement("span", "ticker-sep", "|"),
      buildTickerItem("封道", "02:17:44", "warn"),
      createElement("span", "ticker-sep", "|"),
    );
    const tickerFeed = createElement("div", "ticker-feed");
    this.tickerFeedInner = createElement("div", "ticker-feed-inner");
    const feedEntries = [
      ["脱身", "有游击者带着 14 件战利品从腐土荒岗返回 / +28,400 金", "hot"],
      ["稀珍", "银漆护符与虚蓝晶近日在营地中持续热卖", "rare"],
      ["任务", "第六周使团将在 14:22:08 后轮换封锁区路线", "hot"],
      ["损失", "一支四人小队在旧桥口团灭，遗失大量物资", "loss"],
    ] as const;
    [...feedEntries, ...feedEntries].forEach(([tag, msg, type]) => {
      const item = createElement("div", "ticker-feed-item");
      item.append(createElement("span", `tag ${type}`, `${tag} ▶`), document.createTextNode(msg));
      this.tickerFeedInner.append(item);
    });
    tickerFeed.append(this.tickerFeedInner);
    ticker.append(tickerFeed);
    stage.append(ticker);
  }

  render(state: LobbyState) {
    this.playerNameInput.value = state.playerName;
    this.roomCodeInput.value = state.roomCodeInput;

    this.errorBanner.textContent = state.errorMessage ?? "";
    this.errorBanner.hidden = !state.errorMessage;
    this.infoBanner.textContent = state.infoMessage ?? "";
    this.infoBanner.hidden = !state.infoMessage;

    const roomState = state.currentRoom;
    const playerName = state.playerName.trim() || "未命名游击者";
    this.accountName.textContent = playerName;

    if (!roomState) {
      this.phaseDot.textContent = state.isBusy ? "营地联络 / 建立通信中" : "营地待命 / 未加入频道";
      this.accountMeta.textContent = "游击者 / 待命中";
      this.squadCount.textContent = "0/0 / 0 就绪";
      this.roomCodeValue.textContent = "------";
      this.roomCodeCopy.disabled = true;
      this.playerList.replaceChildren(...renderEmptySlots(MAX_VISIBLE_SLOTS));
      this.deployButton.className = "btn-primary";
      this.deployButtonLabel.textContent = "创建频道";
      this.deployButtonSub.textContent = "先建立房间，再等待小队集结";
      this.deployButton.disabled = state.isBusy;
      this.soloButton.disabled = true;
      this.joinButton.disabled = state.isBusy;
      this.createButton.disabled = state.isBusy;
      this.leaveButton.disabled = true;
      this.roomModeValue.textContent = "待集结";
      this.roomPlayerValue.textContent = "0 / 0";
      this.resultVerdict.textContent = "待出征";
      this.resultVerdict.className = "run-verdict-text";
      this.resultRoute.innerHTML = "封锁区尚未选定<br/>等待建立频道";
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

    this.deployButton.className = `btn-primary ${isStarting ? "waiting" : readyCount === roomState.players.length ? "ready flash-hot" : ""}`.trim();
    this.deployButtonLabel.textContent = isStarting
      ? "正在出征"
      : isHost
        ? "立即出征"
        : "等待同行";
    this.deployButtonSub.textContent = isStarting
      ? "全队已锁定 / 正在进入地图"
      : isHost
        ? `${readyCount}/${roomState.players.length} 就绪 / 房主可开始部署`
        : `${readyCount}/${roomState.players.length} 就绪 / 等待房主下令`;
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
    this.background.stop();
  }
}

function createNavItem(label: string, active = false): HTMLButtonElement {
  const button = createElement("button", `nav-item${active ? " active" : ""}`, label) as HTMLButtonElement;
  button.type = "button";
  button.disabled = !active;
  return button;
}

function createDisabledNav(label: string): HTMLButtonElement {
  const button = createElement("button", "nav-item", label) as HTMLButtonElement;
  button.type = "button";
  button.disabled = true;
  return button;
}

function appendDmCell(parent: HTMLElement, label: string, value: string, extraClass?: string) {
  const cell = createElement("div", "dm-cell");
  const labelNode = createElement("div", "dm-label", label);
  const valueNode = createElement("div", `dm-value${extraClass ? ` ${extraClass}` : ""}`, value);
  cell.append(labelNode, valueNode);
  parent.append(cell);
  return valueNode;
}

function buildTickerItem(label: string, value: string, valueClass?: string) {
  const item = createElement("div", "ticker-item");
  item.append(
    createElement("span", undefined, label),
    createElement("span", `v${valueClass ? ` ${valueClass}` : ""}`, value),
  );
  return item;
}

function buildLoadoutText(kind: string, name: string) {
  const wrap = createElement("div");
  wrap.append(
    createElement("div", "loadout-kind", kind),
    createElement("div", "loadout-name", name),
  );
  return wrap;
}

function createGlyph(className: string, text: string) {
  return createElement("div", className, text);
}

function buildArmorSlot(parent: HTMLElement, kind: string, name: string) {
  const slot = createElement("div", "loadout-slot");
  const nameNode = createElement("div", "loadout-name", name);
  slot.append(
    buildLoadoutText(kind, name),
    createElement("div", "loadout-tier", "等待接入"),
    createGlyph("loadout-glyph", "甲"),
  );
  parent.append(slot);
  return nameNode;
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
  if (styleText) {
    valueNode.style.cssText = styleText;
  }
  cell.append(valueNode, createElement("div", "run-stat-l", label));
  parent.append(cell);
  return valueNode;
}

function renderEmptySlots(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const slot = createElement("div", "slot");
    slot.append(
      createElement("div", "slot-avatar empty", "—"),
      (() => {
        const info = createElement("div", "slot-info");
        info.append(
          createElement("div", "slot-name empty", `空位 ${String(index + 1).padStart(2, "0")} / 等待游击者`),
          createElement("div", "slot-meta", "建立频道后可加入队伍"),
        );
        return info;
      })(),
      createElement("div", "slot-state empty", "空位"),
    );
    return slot;
  });
}

function renderRoomSlots(roomState: RoomState, count: number) {
  const slots: HTMLElement[] = [];
  for (let index = 0; index < count; index += 1) {
    const player = roomState.players[index];
    if (!player) {
      slots.push(...renderEmptySlots(1));
      continue;
    }

    const slot = createElement("div", "slot");
    const stateClass = player.isHost ? "host" : player.isReady ? "ready" : "wait";
    const stateLabel = player.isHost ? "领队" : player.isReady ? "待发" : "整装";
    slot.append(
      createElement("div", `slot-avatar ${player.isHost || player.isReady ? "ready" : ""}`, initialsFromName(player.name)),
      (() => {
        const info = createElement("div", "slot-info");
        info.append(
          createElement("div", "slot-name", player.name.toUpperCase()),
          createElement("div", "slot-meta", player.isHost ? "房主 / 当前频道指挥" : `队员 ${index + 1} / 等待部署`),
        );
        return info;
      })(),
      createElement("div", `slot-state ${stateClass}`, stateLabel),
    );
    slots.push(slot);
  }
  return slots;
}

function initialsFromName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }
  return trimmed.slice(0, 2).toUpperCase();
}
