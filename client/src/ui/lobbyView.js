var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { LobbyBackground } from "./lobbyBackground";
const MAX_VISIBLE_SLOTS = 6;
const createElement = (tagName, className, textContent) => {
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
  return wrap.firstElementChild;
};
const createPanelHead = (index, title, meta) => {
  const head = createElement("div", "panel-head");
  const left = createElement("div");
  left.append(
    createElement("span", "panel-head-id", index),
    document.createTextNode(` / ${title}`)
  );
  head.append(left, createElement("div", void 0, meta));
  return head;
};
class LobbyView {
  constructor(controller, runtimeApi, callbacks) {
    __publicField(this, "element");
    __publicField(this, "background");
    __publicField(this, "callbacks");
    __publicField(this, "controller");
    __publicField(this, "runtimeApi");
    __publicField(this, "playerNameInput");
    __publicField(this, "roomCodeInput");
    __publicField(this, "errorBanner");
    __publicField(this, "infoBanner");
    __publicField(this, "squadCount");
    __publicField(this, "roomCodeValue");
    __publicField(this, "roomCodeCopy");
    __publicField(this, "playerList");
    __publicField(this, "createButton");
    __publicField(this, "deployButton");
    __publicField(this, "deployButtonLabel");
    __publicField(this, "deployButtonSub");
    __publicField(this, "soloButton");
    __publicField(this, "joinButton");
    __publicField(this, "leaveButton");
    __publicField(this, "quickMatchButtons");
    __publicField(this, "quickMatchEta");
    __publicField(this, "phaseDot");
    __publicField(this, "accountName");
    __publicField(this, "accountMeta");
    __publicField(this, "roomModeValue");
    __publicField(this, "roomPlayerValue");
    __publicField(this, "roomDangerValue");
    __publicField(this, "roomTrafficValue");
    __publicField(this, "loadoutWeapon");
    __publicField(this, "loadoutWeaponTier");
    __publicField(this, "loadoutArmor");
    __publicField(this, "stashGold");
    __publicField(this, "stashItems");
    __publicField(this, "stashInsurance");
    __publicField(this, "resultVerdict");
    __publicField(this, "resultRoute");
    __publicField(this, "resultKills");
    __publicField(this, "resultDuration");
    __publicField(this, "resultGold");
    __publicField(this, "recoveredItems");
    __publicField(this, "tickerFeedInner");
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
      createElement("div", "brand-name", "\u6D41\u8352\u4E4B\u8DEF"),
      createElement("div", "brand-sub", "\u8425\u5730 / \u706B\u5149\u672A\u7184")
    );
    brand.append(createBrandMark(), brandText);
    const nav = createElement("nav", "nav");
    nav.append(
      createNavItem("\u5927\u5385", true),
      createDisabledNav("\u884C\u56CA"),
      createDisabledNav("\u8D27\u644A")
    );
    const topbarRight = createElement("div", "topbar-right");
    this.phaseDot = createElement("div", "status-dot", "\u8425\u5730\u5F85\u547D / \u901A\u9053\u672A\u5F00\u542F");
    const account = createElement("div", "account");
    account.append(createElement("div", "account-avatar", "VK"));
    const accountInfo = createElement("div", "account-info");
    this.accountName = createElement("div", "account-name", "\u672A\u547D\u540D\u6E38\u51FB\u8005");
    this.accountMeta = createElement("div", "account-meta", "\u7B49\u5F85\u5EFA\u7ACB\u9891\u9053");
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
      createElement("div", "squad-title", "\u540C\u884C"),
      createElement("div", "stamp-label", "03 : \u7F16\u6210\u961F\u4F0D")
    );
    this.squadCount = createElement("div", "squad-count", "0/0 / 0 \u5C31\u7EEA");
    squadHead.append(squadHeadLeft, this.squadCount);
    squadPanel.append(squadHead);
    const roomCode = createElement("div", "room-code");
    const roomCodeLeft = createElement("div");
    roomCodeLeft.append(
      createElement("div", "room-code-label", "\u9891\u9053\u4EE3\u7801"),
      this.roomCodeValue = createElement("div", "room-code-value", "------")
    );
    this.roomCodeCopy = createElement("button", "room-code-copy", "\u590D\u5236\u4EE3\u7801");
    this.roomCodeCopy.type = "button";
    this.roomCodeCopy.addEventListener("click", async () => {
      const value = this.roomCodeValue.textContent?.trim();
      if (!value || value === "------") {
        return;
      }
      try {
        await navigator.clipboard?.writeText(value);
      } catch {
      }
    });
    roomCode.append(roomCodeLeft, this.roomCodeCopy);
    squadPanel.append(roomCode);
    this.playerList = createElement("div");
    squadPanel.append(this.playerList);
    const capacityRow = createElement("div", "room-code");
    const capacityLeft = createElement("div");
    capacityLeft.append(
      createElement("div", "room-code-label", "\u5C0F\u961F\u4E0A\u9650"),
      createElement("div", "room-code-value", "\u8C03\u6574\u4EBA\u6570")
    );
    const capacitySelect = createElement("select", "code-input");
    [2, 3, 4, 5, 6].forEach((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value} \u4EBA`;
      capacitySelect.append(option);
    });
    capacitySelect.addEventListener("change", () => {
      this.callbacks.onCapacityChange(Number(capacitySelect.value));
    });
    capacityRow.append(capacityLeft, capacitySelect);
    squadPanel.append(capacityRow);
    const leaveButton = createElement("button", "squad-invite", "\u79BB\u5F00\u9891\u9053");
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
          <text x="60" y="50">\u5317\u5CAD / \u5C01\u9501\u533A / \u7F57\u76D8 N 43\xB0</text>
        </g>
        <g stroke="#E8602C" stroke-opacity="0.3" fill="none">
          <circle cx="620" cy="120" r="4" fill="#E8602C" fill-opacity="0.6"/>
          <circle cx="620" cy="120" r="14"/>
          <circle cx="620" cy="120" r="26" stroke-opacity="0.15"/>
        </g>
      </svg>
    `.trim();
    deploy.append(deployTerrain.firstElementChild);
    const deployInner = createElement("div", "deploy-inner");
    const deployHeadRow = createElement("div", "deploy-head-row");
    const deployHeadLeft = createElement("div");
    deployHeadLeft.append(
      createElement("div", "deploy-eyebrow", "\u5F53\u524D\u6218\u573A / \u7B2C\u5341\u56DB\u5468"),
      createElement("h1", "deploy-title", "\u8150\u571F\u8352\u5C97"),
      createElement(
        "div",
        "deploy-sub",
        "\u4E09\u738B\u4E71\u6218\u540E\u9057\u5F03\u7684\u8352\u91CE\u6218\u573A\u3002\u6EB6\u6CB3\u6709\u5C38\u6BD2\uFF0C\u53EA\u5269\u4E24\u6761\u65E7\u77F3\u62F1\u6865\u53EF\u4F9B\u7A7F\u8D8A\u56DE\u8425\u3002"
      )
    );
    const deployStamps = createElement("div", "deploy-stamps");
    deployStamps.append(
      createElement("span", "hot", "\u4EA4\u6218\u8005\u6B63\u4ECE\u51BB\u571F\u82CF\u9192"),
      createElement("span", void 0, "\u7B2C\u516D\u65E5 / \u9EC4\u660F\u524D\u540E"),
      createElement("span", void 0, "\u5C01\u9053\u8BA1\u65F6 / 02:17:44")
    );
    deployHeadRow.append(deployHeadLeft, deployStamps);
    const metaStrip = createElement("div", "deploy-meta-strip");
    this.roomModeValue = appendDmCell(metaStrip, "\u5F53\u524D\u72B6\u6001", "\u5F85\u96C6\u7ED3");
    this.roomPlayerValue = appendDmCell(metaStrip, "\u961F\u4F0D\u4EBA\u6570", "0 / 0");
    this.roomDangerValue = appendDmCell(metaStrip, "\u5371\u9669\u7B49\u7EA7", "IV / \u9AD8", "warn");
    this.roomTrafficValue = appendDmCell(metaStrip, "\u573A\u5185\u6E38\u51FB\u8005", "117", "hot");
    deployInner.append(deployHeadRow, metaStrip);
    deploy.append(deployInner);
    centerStack.append(deploy);
    const ctaRow = createElement("div", "cta-row");
    this.deployButton = createElement("button", "btn-primary waiting");
    this.deployButton.type = "button";
    const deployButtonText = createElement("span");
    this.deployButtonLabel = createElement("span", void 0, "\u7B49\u5F85\u540C\u884C");
    this.deployButtonSub = createElement("span", "btn-sub", "0/0 \u5F85\u53D1 / \u6309\u5175\u4E0D\u52A8");
    deployButtonText.append(this.deployButtonLabel, this.deployButtonSub);
    this.deployButton.append(deployButtonText, createElement("span", "arrow", "\u25B6"));
    this.deployButton.addEventListener("click", () => {
      const state = this.runtimeApi.getState();
      if (state.currentRoom) {
        this.callbacks.onStartMatch();
      } else {
        this.callbacks.onCreateRoom();
      }
    });
    this.soloButton = createElement("button", "btn-secondary");
    this.soloButton.type = "button";
    this.soloButton.disabled = true;
    this.soloButton.innerHTML = `\u5355\u4EBA\u5165\u573A<span class="btn-sub">\u529F\u80FD\u6682\u672A\u5F00\u653E</span>`;
    ctaRow.append(this.deployButton, this.soloButton);
    centerStack.append(ctaRow);
    const joinRow = createElement("div", "join-row");
    const joinCard = createElement("div", "join-card");
    const joinCardTitle = createElement("div", "join-card-title");
    joinCardTitle.append(
      createElement("span", void 0, "\u6839\u636E\u4EE3\u7801\u52A0\u5165"),
      createElement("span", "kicker", "6 \u4F4D\u7F16\u7801")
    );
    const nameCardTitle = createElement("div", "join-card-title");
    nameCardTitle.append(
      createElement("span", void 0, "\u884C\u52A8\u4EE3\u53F7"),
      createElement("span", "kicker", "\u8FDB\u5165\u9891\u9053\u524D\u786E\u8BA4")
    );
    const nameInputRow = createElement("div", "code-input-row");
    this.playerNameInput = createElement("input", "code-input");
    this.playerNameInput.placeholder = "\u8F93\u5165\u4F60\u7684\u4EE3\u53F7";
    this.playerNameInput.maxLength = 18;
    this.playerNameInput.addEventListener("input", () => {
      this.callbacks.onPlayerNameChange(this.playerNameInput.value);
    });
    this.createButton = createElement("button", "code-go", "\u521B\u5EFA");
    this.createButton.type = "button";
    this.createButton.addEventListener("click", () => this.callbacks.onCreateRoom());
    nameInputRow.append(this.playerNameInput, this.createButton);
    joinCard.append(nameCardTitle, nameInputRow);
    const codeCard = createElement("div", "join-card");
    const codeCardTitle = createElement("div", "join-card-title");
    codeCardTitle.append(
      createElement("span", void 0, "\u6839\u636E\u4EE3\u7801\u52A0\u5165"),
      createElement("span", "kicker", "\u623F\u4E3B\u5206\u4EAB")
    );
    const codeInputRow = createElement("div", "code-input-row");
    this.roomCodeInput = createElement("input", "code-input");
    this.roomCodeInput.placeholder = "\u4F8B\u5982 A1B2C3";
    this.roomCodeInput.maxLength = 6;
    this.roomCodeInput.addEventListener("input", () => {
      this.callbacks.onRoomCodeInputChange(this.roomCodeInput.value);
    });
    this.joinButton = createElement("button", "code-go", "\u542F\u5C01 \u25B6");
    this.joinButton.type = "button";
    this.joinButton.addEventListener("click", () => this.callbacks.onJoinRoom());
    codeInputRow.append(this.roomCodeInput, this.joinButton);
    codeCard.append(
      codeCardTitle,
      codeInputRow,
      createElement("div", "qm-eta", "\u4ECE\u623F\u4E3B\u590D\u5236\u7684\u9891\u9053\u4EE3\u7801\u53EF\u76F4\u63A5\u7C98\u8D34\u5230\u8FD9\u91CC")
    );
    const matchCard = createElement("div", "join-card");
    const matchCardTitle = createElement("div", "join-card-title");
    matchCardTitle.append(
      createElement("span", void 0, "\u81EA\u52A8\u7F16\u961F"),
      createElement("span", "kicker", "\u6682\u4E0D\u63A5\u7EBF")
    );
    const qmRow = createElement("div", "qm-row");
    this.quickMatchButtons = ["\u5E38\u89C4", "\u52A0\u96BE", "\u5B64\u72FC"].map((label, index) => {
      const button = createElement("button", `qm-btn ${index === 0 ? "active" : ""}`, label);
      button.type = "button";
      button.disabled = true;
      qmRow.append(button);
      return button;
    });
    const qmMeta = createElement("div");
    qmMeta.style.display = "flex";
    qmMeta.style.justifyContent = "space-between";
    qmMeta.style.alignItems = "center";
    this.quickMatchEta = createElement("span", "qm-eta", "\u5E73\u5747\u7B49\u5F85 / \u5373\u5C06\u5F00\u653E");
    qmMeta.append(
      this.quickMatchEta,
      createElement("span", "qm-eta", "\u8FD9\u8F6E\u4EC5\u4FDD\u7559\u5C55\u793A")
    );
    matchCard.append(matchCardTitle, qmRow, qmMeta);
    joinRow.append(joinCard, codeCard, matchCard);
    centerStack.append(joinRow);
    this.errorBanner = createElement("div", "banner banner--error");
    this.infoBanner = createElement("div", "banner banner--info");
    centerStack.append(this.errorBanner, this.infoBanner);
    const rightStack = createElement("div", "right-stack");
    grid.append(rightStack);
    const loadoutPanel = createElement("div", "panel");
    loadoutPanel.append(createPanelHead("04", "\u88C5\u675F / \u5F53\u524D\u9884\u8BBE", "\u5F85\u53D1"));
    const loadoutRow = createElement("div", "loadout-row");
    const primarySlot = createElement("div", "loadout-slot primary");
    primarySlot.append(
      buildLoadoutText("\u6B66\u5668", "\u7070\u94C1\u957F\u5251"),
      this.loadoutWeaponTier = createElement("div", "loadout-tier tier-rare", "A / \u5DF2\u78E8\u5229"),
      createGlyph("loadout-glyph", "\u5203")
    );
    this.loadoutWeapon = primarySlot.querySelector(".loadout-name");
    loadoutRow.append(primarySlot);
    this.loadoutArmor = [
      buildArmorSlot(loadoutRow, "\u5934\u76D4", "\u4E34\u65F6\u5360\u4F4D"),
      buildArmorSlot(loadoutRow, "\u80F8\u7532", "\u4E34\u65F6\u5360\u4F4D"),
      buildArmorSlot(loadoutRow, "\u62A4\u624B", "\u4E34\u65F6\u5360\u4F4D"),
      buildArmorSlot(loadoutRow, "\u9774\u5C65", "\u4E34\u65F6\u5360\u4F4D")
    ];
    loadoutPanel.append(loadoutRow);
    const stashRow = createElement("div", "stash-row");
    this.stashGold = appendStashCell(stashRow, "\u91D1\u5E01", "184,520", "hot");
    this.stashItems = appendStashCell(stashRow, "\u884C\u56CA\u7269\u4EF6", "287");
    this.stashInsurance = appendStashCell(stashRow, "\u4FDD\u7BA1\u4F4D", "4", "warn");
    loadoutPanel.append(stashRow);
    rightStack.append(loadoutPanel);
    const runPanel = createElement("div", "panel");
    runPanel.append(createPanelHead("05", "\u4E0A\u5C40 / \u5F52\u9014\u624B\u672D", "24 \u5206\u949F\u524D"));
    const runCard = createElement("div", "run-card");
    const verdict = createElement("div", "run-verdict");
    const verdictTextWrap = createElement("div");
    this.resultVerdict = createElement("div", "run-verdict-text extracted", "\u5DF2\u8131\u8EAB");
    verdictTextWrap.append(this.resultVerdict);
    this.resultRoute = createElement("div", "run-verdict-meta", "\u8150\u571F\u8352\u5C97\n\u7ECF\u7531 \u65E7\u77F3\u62F1\u6865");
    verdict.append(verdictTextWrap, this.resultRoute);
    const runStats = createElement("div", "run-stats");
    this.resultKills = appendRunStat(runStats, "\u65A9\u83B7", "4");
    this.resultDuration = appendRunStat(runStats, "\u5B58\u6D3B", "31:12");
    this.resultGold = appendRunStat(runStats, "\u91D1\u5E01", "+24,800", "color: var(--signal);");
    const recovered = createElement("div", "run-recovered");
    recovered.append(createElement("span", "stamp-label", "\u6536\u83B7"));
    this.recoveredItems = createElement("div", "run-recovered-items");
    ["\u94F6\u6F06\u62A4\u7B26", "\u865A\u84DD\u6676", "\u6CBB\u7597\u8349\u836F \xD7 3", "\u94C1\u7BAD \xD7 48"].forEach((item, index) => {
      const chip = createElement("span", `run-item ${index < 2 ? "rare" : ""}`, item);
      this.recoveredItems.append(chip);
    });
    recovered.append(this.recoveredItems);
    runCard.append(verdict, runStats, recovered);
    runPanel.append(runCard);
    rightStack.append(runPanel);
    const ticker = createElement("div", "ticker");
    ticker.append(
      buildTickerItem("\u8425\u5730", "\u5357\u5CAD / \u4E8C\u53F7"),
      createElement("span", "ticker-sep", "|"),
      buildTickerItem("\u5019\u4F34", "00:47", "hot"),
      createElement("span", "ticker-sep", "|"),
      buildTickerItem("\u4FE1\u4F7F", "28 \u5C01"),
      createElement("span", "ticker-sep", "|"),
      buildTickerItem("\u5C01\u9053", "02:17:44", "warn"),
      createElement("span", "ticker-sep", "|")
    );
    const tickerFeed = createElement("div", "ticker-feed");
    this.tickerFeedInner = createElement("div", "ticker-feed-inner");
    const feedEntries = [
      ["\u8131\u8EAB", "\u6709\u6E38\u51FB\u8005\u5E26\u7740 14 \u4EF6\u6218\u5229\u54C1\u4ECE\u8150\u571F\u8352\u5C97\u8FD4\u56DE / +28,400 \u91D1", "hot"],
      ["\u7A00\u73CD", "\u94F6\u6F06\u62A4\u7B26\u4E0E\u865A\u84DD\u6676\u8FD1\u65E5\u5728\u8425\u5730\u4E2D\u6301\u7EED\u70ED\u5356", "rare"],
      ["\u4EFB\u52A1", "\u7B2C\u516D\u5468\u4F7F\u56E2\u5C06\u5728 14:22:08 \u540E\u8F6E\u6362\u5C01\u9501\u533A\u8DEF\u7EBF", "hot"],
      ["\u635F\u5931", "\u4E00\u652F\u56DB\u4EBA\u5C0F\u961F\u5728\u65E7\u6865\u53E3\u56E2\u706D\uFF0C\u9057\u5931\u5927\u91CF\u7269\u8D44", "loss"]
    ];
    [...feedEntries, ...feedEntries].forEach(([tag, msg, type]) => {
      const item = createElement("div", "ticker-feed-item");
      item.append(createElement("span", `tag ${type}`, `${tag} \u25B6`), document.createTextNode(msg));
      this.tickerFeedInner.append(item);
    });
    tickerFeed.append(this.tickerFeedInner);
    ticker.append(tickerFeed);
    stage.append(ticker);
  }
  render(state) {
    this.playerNameInput.value = state.playerName;
    this.roomCodeInput.value = state.roomCodeInput;
    this.errorBanner.textContent = state.errorMessage ?? "";
    this.errorBanner.hidden = !state.errorMessage;
    this.infoBanner.textContent = state.infoMessage ?? "";
    this.infoBanner.hidden = !state.infoMessage;
    const roomState = state.currentRoom;
    const playerName = state.playerName.trim() || "\u672A\u547D\u540D\u6E38\u51FB\u8005";
    this.accountName.textContent = playerName;
    if (!roomState) {
      this.phaseDot.textContent = state.isBusy ? "\u8425\u5730\u8054\u7EDC / \u5EFA\u7ACB\u901A\u4FE1\u4E2D" : "\u8425\u5730\u5F85\u547D / \u672A\u52A0\u5165\u9891\u9053";
      this.accountMeta.textContent = "\u6E38\u51FB\u8005 / \u5F85\u547D\u4E2D";
      this.squadCount.textContent = "0/0 / 0 \u5C31\u7EEA";
      this.roomCodeValue.textContent = "------";
      this.roomCodeCopy.disabled = true;
      this.playerList.replaceChildren(...renderEmptySlots(MAX_VISIBLE_SLOTS));
      this.deployButton.className = "btn-primary";
      this.deployButtonLabel.textContent = "\u521B\u5EFA\u9891\u9053";
      this.deployButtonSub.textContent = "\u5148\u5EFA\u7ACB\u623F\u95F4\uFF0C\u518D\u7B49\u5F85\u5C0F\u961F\u96C6\u7ED3";
      this.deployButton.disabled = state.isBusy;
      this.soloButton.disabled = true;
      this.joinButton.disabled = state.isBusy;
      this.createButton.disabled = state.isBusy;
      this.leaveButton.disabled = true;
      this.roomModeValue.textContent = "\u5F85\u96C6\u7ED3";
      this.roomPlayerValue.textContent = "0 / 0";
      this.resultVerdict.textContent = "\u5F85\u51FA\u5F81";
      this.resultVerdict.className = "run-verdict-text";
      this.resultRoute.innerHTML = "\u5C01\u9501\u533A\u5C1A\u672A\u9009\u5B9A<br/>\u7B49\u5F85\u5EFA\u7ACB\u9891\u9053";
      return;
    }
    const visibleCapacity = Math.max(roomState.capacity, roomState.players.length);
    const readyCount = roomState.players.filter((player) => player.isHost || player.isReady).length;
    const localPlayer = roomState.players.find((player) => player.id === roomState.localPlayerId) ?? null;
    const isHost = Boolean(localPlayer?.isHost);
    const isStarting = roomState.status === "starting";
    this.phaseDot.textContent = isStarting ? "\u8425\u5730\u8054\u7EDC / \u6B63\u5728\u90E8\u7F72" : "\u8425\u5730\u8054\u7EDC / \u9891\u9053\u5728\u7EBF";
    this.accountMeta.textContent = isHost ? "\u623F\u4E3B / \u6307\u6325\u4E2D" : "\u961F\u5458 / \u5F85\u547D\u4E2D";
    this.squadCount.textContent = `${roomState.players.length}/${visibleCapacity} / ${readyCount} \u5C31\u7EEA`;
    this.roomCodeValue.textContent = roomState.roomCode;
    this.roomCodeCopy.disabled = false;
    this.playerList.replaceChildren(...renderRoomSlots(roomState, visibleCapacity));
    this.deployButton.className = `btn-primary ${isStarting ? "waiting" : readyCount === roomState.players.length ? "ready flash-hot" : ""}`.trim();
    this.deployButtonLabel.textContent = isStarting ? "\u6B63\u5728\u51FA\u5F81" : isHost ? "\u7ACB\u5373\u51FA\u5F81" : "\u7B49\u5F85\u540C\u884C";
    this.deployButtonSub.textContent = isStarting ? "\u5168\u961F\u5DF2\u9501\u5B9A / \u6B63\u5728\u8FDB\u5165\u5730\u56FE" : isHost ? `${readyCount}/${roomState.players.length} \u5C31\u7EEA / \u623F\u4E3B\u53EF\u5F00\u59CB\u90E8\u7F72` : `${readyCount}/${roomState.players.length} \u5C31\u7EEA / \u7B49\u5F85\u623F\u4E3B\u4E0B\u4EE4`;
    this.deployButton.disabled = state.isBusy || isStarting || !isHost;
    this.createButton.disabled = state.isBusy;
    this.joinButton.disabled = state.isBusy;
    this.leaveButton.disabled = state.isBusy;
    this.roomModeValue.textContent = isStarting ? "\u90E8\u7F72\u4E2D" : "\u9891\u9053\u5728\u7EBF";
    this.roomPlayerValue.textContent = `${roomState.players.length} / ${roomState.capacity}`;
    this.resultVerdict.textContent = isStarting ? "\u5DF2\u51FA\u5F81" : "\u5F85\u90E8\u7F72";
    this.resultVerdict.className = `run-verdict-text ${isStarting ? "extracted" : ""}`.trim();
    this.resultRoute.innerHTML = `${roomState.roomCode}<br/>${isHost ? "\u7531\u4F60\u53D1\u8D77\u672C\u5C40\u90E8\u7F72" : "\u7B49\u5F85\u623F\u4E3B\u53D1\u8D77\u672C\u5C40\u90E8\u7F72"}`;
  }
  destroy() {
    this.background.stop();
  }
}
function createNavItem(label, active = false) {
  const button = createElement("button", `nav-item${active ? " active" : ""}`, label);
  button.type = "button";
  button.disabled = !active;
  return button;
}
function createDisabledNav(label) {
  const button = createElement("button", "nav-item", label);
  button.type = "button";
  button.disabled = true;
  return button;
}
function appendDmCell(parent, label, value, extraClass) {
  const cell = createElement("div", "dm-cell");
  const labelNode = createElement("div", "dm-label", label);
  const valueNode = createElement("div", `dm-value${extraClass ? ` ${extraClass}` : ""}`, value);
  cell.append(labelNode, valueNode);
  parent.append(cell);
  return valueNode;
}
function buildTickerItem(label, value, valueClass) {
  const item = createElement("div", "ticker-item");
  item.append(
    createElement("span", void 0, label),
    createElement("span", `v${valueClass ? ` ${valueClass}` : ""}`, value)
  );
  return item;
}
function buildLoadoutText(kind, name) {
  const wrap = createElement("div");
  wrap.append(
    createElement("div", "loadout-kind", kind),
    createElement("div", "loadout-name", name)
  );
  return wrap;
}
function createGlyph(className, text) {
  return createElement("div", className, text);
}
function buildArmorSlot(parent, kind, name) {
  const slot = createElement("div", "loadout-slot");
  const nameNode = createElement("div", "loadout-name", name);
  slot.append(
    buildLoadoutText(kind, name),
    createElement("div", "loadout-tier", "\u7B49\u5F85\u63A5\u5165"),
    createGlyph("loadout-glyph", "\u7532")
  );
  parent.append(slot);
  return nameNode;
}
function appendStashCell(parent, label, value, extraClass) {
  const cell = createElement("div", "stash-cell");
  const valueNode = createElement("div", `stash-v${extraClass ? ` ${extraClass}` : ""}`, value);
  cell.append(valueNode, createElement("div", "stash-l", label));
  parent.append(cell);
  return valueNode;
}
function appendRunStat(parent, label, value, styleText) {
  const cell = createElement("div", "run-stat");
  const valueNode = createElement("div", "run-stat-v", value);
  if (styleText) {
    valueNode.style.cssText = styleText;
  }
  cell.append(valueNode, createElement("div", "run-stat-l", label));
  parent.append(cell);
  return valueNode;
}
function renderEmptySlots(count) {
  return Array.from({ length: count }, (_, index) => {
    const slot = createElement("div", "slot");
    slot.append(
      createElement("div", "slot-avatar empty", "\u2014"),
      (() => {
        const info = createElement("div", "slot-info");
        info.append(
          createElement("div", "slot-name empty", `\u7A7A\u4F4D ${String(index + 1).padStart(2, "0")} / \u7B49\u5F85\u6E38\u51FB\u8005`),
          createElement("div", "slot-meta", "\u5EFA\u7ACB\u9891\u9053\u540E\u53EF\u52A0\u5165\u961F\u4F0D")
        );
        return info;
      })(),
      createElement("div", "slot-state empty", "\u7A7A\u4F4D")
    );
    return slot;
  });
}
function renderRoomSlots(roomState, count) {
  const slots = [];
  for (let index = 0; index < count; index += 1) {
    const player = roomState.players[index];
    if (!player) {
      slots.push(...renderEmptySlots(1));
      continue;
    }
    const slot = createElement("div", "slot");
    const stateClass = player.isHost ? "host" : player.isReady ? "ready" : "wait";
    const stateLabel = player.isHost ? "\u9886\u961F" : player.isReady ? "\u5F85\u53D1" : "\u6574\u88C5";
    slot.append(
      createElement("div", `slot-avatar ${player.isHost || player.isReady ? "ready" : ""}`, initialsFromName(player.name)),
      (() => {
        const info = createElement("div", "slot-info");
        info.append(
          createElement("div", "slot-name", player.name.toUpperCase()),
          createElement("div", "slot-meta", player.isHost ? "\u623F\u4E3B / \u5F53\u524D\u9891\u9053\u6307\u6325" : `\u961F\u5458 ${index + 1} / \u7B49\u5F85\u90E8\u7F72`)
        );
        return info;
      })(),
      createElement("div", `slot-state ${stateClass}`, stateLabel)
    );
    slots.push(slot);
  }
  return slots;
}
function initialsFromName(name) {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }
  return trimmed.slice(0, 2).toUpperCase();
}
export {
  LobbyView
};
