import { LobbyBackground } from "./lobbyBackground";
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
const createInfoRow = (label, value) => {
    const row = createElement("div", "lobby-stat");
    const labelNode = createElement("span", "lobby-stat__label", label);
    const valueNode = createElement("strong", "lobby-stat__value", value);
    row.append(labelNode, valueNode);
    return row;
};
const renderPlayers = (roomState, playerList) => {
    playerList.replaceChildren();
    roomState.players.forEach((player, index) => {
        const item = createElement("li", "player-card");
        if (player.id === roomState.localPlayerId) {
            item.dataset.local = "true";
        }
        // Avatar
        const avatar = createElement("div", "player-card__avatar");
        const avatarImg = createElement("img");
        avatarImg.src = "/assets/player.svg"; // Use SVG for clean scaling
        avatarImg.style.width = "24px";
        avatarImg.style.height = "24px";
        avatar.append(avatarImg);
        const identity = createElement("div", "player-card__identity");
        const name = createElement("strong", "player-card__name", player.name);
        const meta = createElement("span", "player-card__meta", player.isHost
            ? "房主"
            : `队员 ${index + 1}`);
        identity.append(name, meta);
        item.append(avatar, identity);
        if (player.id === roomState.localPlayerId) {
            item.append(createElement("span", "player-card__badge", "自己"));
        }
        playerList.append(item);
    });
};
export class LobbyView {
    element;
    background;
    callbacks;
    controller;
    runtimeApi;
    playerNameInput;
    roomCodeInput;
    errorBanner;
    infoBanner;
    roomSection;
    roomCodeValue;
    playerCountValue;
    playerList;
    capacitySelect;
    hostControls;
    startButton;
    leaveButton;
    phasePill;
    constructor(controller, runtimeApi, callbacks) {
        this.controller = controller;
        this.runtimeApi = runtimeApi;
        this.callbacks = callbacks;
        this.background = new LobbyBackground();
        this.background.start();
        this.element = createElement("div", "lobby-shell");
        this.element.prepend(this.background.element);
        const hero = createElement("section", "hero-panel");
    const heroEyebrow = createElement("p", "hero-panel__eyebrow", "Demo 1 / 撤离行动");
        const heroTitle = createElement("h1", "hero-panel__title", "搜打撤离");
        const heroBody = createElement("p", "hero-panel__body", "在废土封锁区集结你的小队，闯入危险区域，抢到战利品并活着撤离。");
        const heroTags = createElement("div", "hero-panel__tags");
        ["像素风", "多人联机", "高风险撤离"].forEach((text) => {
            heroTags.append(createElement("span", "hero-tag", text));
        });
        hero.append(heroEyebrow, heroTitle, heroBody, heroTags);
        const content = createElement("section", "lobby-grid");
        const actionCard = createElement("div", "panel");
    actionCard.append(createElement("p", "panel__eyebrow", "终端接入"), createElement("h2", "panel__title", "准备就绪"));
        const form = createElement("div", "input-stack");
        const nameLabel = createElement("label", "field");
    nameLabel.append(createElement("span", "field__label", "代号"));
        this.playerNameInput = createElement("input", "field__input");
        this.playerNameInput.placeholder = "输入你的代号";
        this.playerNameInput.maxLength = 18;
        this.playerNameInput.autocomplete = "off";
        this.playerNameInput.addEventListener("input", () => {
            this.callbacks.onPlayerNameChange(this.playerNameInput.value);
        });
        nameLabel.append(this.playerNameInput);
        const roomLabel = createElement("label", "field");
    roomLabel.append(createElement("span", "field__label", "频道代码"));
        this.roomCodeInput = createElement("input", "field__input field__input--code");
        this.roomCodeInput.placeholder = "例如 A1B2C3";
        this.roomCodeInput.maxLength = 6;
        this.roomCodeInput.autocomplete = "off";
        this.roomCodeInput.addEventListener("input", () => {
            this.callbacks.onRoomCodeInputChange(this.roomCodeInput.value);
        });
        roomLabel.append(this.roomCodeInput);
        const actionRow = createElement("div", "button-row");
        const createButton = createElement("button", "button button--primary", "创建频道");
        createButton.type = "button";
        createButton.addEventListener("click", () => this.callbacks.onCreateRoom());
        const joinButton = createElement("button", "button button--ghost", "加入频道");
        joinButton.type = "button";
        joinButton.addEventListener("click", () => this.callbacks.onJoinRoom());
        actionRow.append(createButton, joinButton);
        this.errorBanner = createElement("div", "banner banner--error");
        this.infoBanner = createElement("div", "banner banner--info");
        form.append(nameLabel, roomLabel, actionRow, this.errorBanner, this.infoBanner);
        actionCard.append(form);
        this.roomSection = createElement("div", "panel panel--room");
        const roomHeading = createElement("div", "room-header");
        const roomHeadingText = createElement("div");
    roomHeadingText.append(createElement("p", "panel__eyebrow", "战术频道"), createElement("h2", "panel__title", "小队集结"));
    this.phasePill = createElement("span", "status-pill", "待命中");
        roomHeading.append(roomHeadingText, this.phasePill);
        const stats = createElement("div", "room-stats");
        this.roomCodeValue = createInfoRow("频道代码", "------");
        this.playerCountValue = createInfoRow("小队成员", "0 / 0");
        stats.append(this.roomCodeValue, this.playerCountValue);
        const playersWrap = createElement("div", "player-list-wrap");
    playersWrap.append(createElement("div", "section-heading", "队伍名单"));
        this.playerList = createElement("ol", "player-list");
        playersWrap.append(this.playerList);
        this.hostControls = createElement("div", "host-controls");
        const hostControlRow = createElement("div", "host-controls__row");
        const capacityField = createElement("label", "field");
        capacityField.style.marginBottom = "0";
        capacityField.append(createElement("span", "field__label", "小队上限"));
        this.capacitySelect = createElement("select", "field__input");
        this.capacitySelect.style.padding = "8px";
        [2, 3, 4].forEach((value) => {
            const option = document.createElement("option");
            option.value = String(value);
            option.textContent = `${value} 人`;
            this.capacitySelect.append(option);
        });
        this.capacitySelect.addEventListener("change", () => {
            this.callbacks.onCapacityChange(Number(this.capacitySelect.value));
        });
        capacityField.append(this.capacitySelect);
        const startButtonWrap = createElement("div", "start-button-wrap");
        this.startButton = createElement("button", "button button--primary button--start", "开始部署");
        this.startButton.type = "button";
        this.startButton.addEventListener("click", () => this.callbacks.onStartMatch());
        startButtonWrap.append(this.startButton);
        this.leaveButton = createElement("button", "button button--ghost", "离开频道");
        this.leaveButton.type = "button";
        this.leaveButton.style.marginTop = "16px";
        this.leaveButton.style.width = "100%";
        this.leaveButton.addEventListener("click", () => this.callbacks.onLeaveRoom());
        hostControlRow.append(capacityField, startButtonWrap);
        this.hostControls.append(hostControlRow, this.leaveButton);
        this.roomSection.append(roomHeading, stats, playersWrap, this.hostControls);
        content.append(actionCard, this.roomSection);
        this.element.append(hero, content);
    }
    render(state) {
        this.playerNameInput.value = state.playerName;
        this.roomCodeInput.value = state.roomCodeInput;
        this.errorBanner.textContent = state.errorMessage ?? "";
        this.errorBanner.hidden = !state.errorMessage;
        this.infoBanner.textContent = state.infoMessage ?? "";
        this.infoBanner.hidden = !state.infoMessage;
        const roomState = state.currentRoom;
        this.roomSection.dataset.empty = roomState ? "false" : "true";
        if (!roomState) {
            this.roomCodeValue.querySelector(".lobby-stat__value").textContent = "------";
            this.playerCountValue.querySelector(".lobby-stat__value").textContent = "0 / 0";
            this.phasePill.textContent = "离线";
            this.playerList.replaceChildren(createElement("li", "player-list__placeholder", "等待小队建立..."));
            this.hostControls.dataset.host = "false";
            this.capacitySelect.disabled = true;
            this.startButton.disabled = true;
            this.leaveButton.disabled = true;
            return;
        }
        const localPlayer = roomState.players.find((player) => player.id === roomState.localPlayerId) ?? null;
        const isHost = Boolean(localPlayer?.isHost);
        this.roomCodeValue.querySelector(".lobby-stat__value").textContent = roomState.roomCode;
        this.playerCountValue.querySelector(".lobby-stat__value").textContent =
            `${roomState.players.length} / ${roomState.capacity}`;
        this.phasePill.textContent = roomState.status === "starting" ? "部署中" : "已就绪";
        renderPlayers(roomState, this.playerList);
        this.hostControls.dataset.host = String(isHost);
        this.capacitySelect.disabled = !isHost || state.isBusy;
        this.capacitySelect.value = String(roomState.capacity);
        this.startButton.disabled = !isHost || state.isBusy || roomState.players.length < 1;
        this.leaveButton.disabled = state.isBusy;
    }
    destroy() {
        this.background.stop();
    }
}
