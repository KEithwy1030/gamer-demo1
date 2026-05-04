import { bootstrapLobbyApp } from "./app";
import type { MatchInventoryState } from "./game/matchRuntime";
import { createNetworkLobbyController } from "./network";
import { createResultsOverlay } from "./results";
import {
  createGameClientController,
  type GameClientController
} from "./scenes";
import { createInventoryPanel } from "./ui/InventoryPanel";
import { applySettlementToProfile, loadLocalProfile, type LocalProfile } from "./profile/localProfile";
import "./styles/mobile.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  void mountClientShell(app);
}

async function mountClientShell(appRoot: HTMLDivElement): Promise<void> {
  let sessionVersion = 0;
  let profile: LocalProfile = loadLocalProfile();
  let pendingLobbyInfoMessage: string | null = null;

  // Handle orientation changes for mobile portrait mode
  const handleOrientationChange = () => {
    const isPortrait = window.innerHeight > window.innerWidth;
    document.body.classList.toggle('portrait-mode', isPortrait);
    document.body.classList.toggle('landscape-mode', !isPortrait);
  };

  window.addEventListener('resize', handleOrientationChange);
  window.addEventListener('orientationchange', handleOrientationChange);
  handleOrientationChange(); // Initial check

  await createSession();

  async function createSession(): Promise<void> {
    const myVersion = ++sessionVersion;
    let lastInventory: MatchInventoryState | null = null;
    let gameController: GameClientController | null = null;
    let lobbyApp: Awaited<ReturnType<typeof bootstrapLobbyApp>> | null = null;

    const lobbyRoot = document.createElement("div");
    const gameRoot = document.createElement("div");
    const sceneRoot = document.createElement("div");

    lobbyRoot.style.minHeight = "100vh";
    gameRoot.style.width = "100%";
    gameRoot.style.height = "100vh";
    gameRoot.style.position = "relative";
    gameRoot.style.overflow = "hidden";
    gameRoot.hidden = true;
    sceneRoot.style.width = "100%";
    sceneRoot.style.height = "100%";

    const resultsOverlay = createResultsOverlay({
      onReturnToLobby: async () => {
        if (myVersion !== sessionVersion) {
          return;
        }

        pendingLobbyInfoMessage = profile.lastRun?.result === "success"
          ? "本局回收已入库，继续整备后可以再次出征。"
          : "本局损失已记录，调整装束后再尝试一次。";

        try {
          gameController?.network.leaveRoom();
        } catch {
          // Ignore local teardown errors and continue rebuilding the shell.
        }

        gameController?.destroy();
        gameController = null;
        inventoryPanel.destroy();
        inventoryPanel.render(null);
        setInventoryAvailable(false);
        resultsOverlay.hide();
        gameRoot.hidden = true;
        lobbyRoot.hidden = false;

        await createSession();
      }
    });

    const inventoryPanel = createInventoryPanel({
      onEquip: (instanceId) => {
        gameController?.network.sendEquipItem({ itemInstanceId: instanceId });
      },
      onUnequip: (instanceId) => {
        gameController?.network.sendUnequipItem({ itemInstanceId: instanceId });
      },
      onDrop: (instanceId) => {
        gameController?.network.sendDropItem({ itemInstanceId: instanceId });
      },
      onUse: (instanceId) => {
        gameController?.network.sendUseItem({ itemInstanceId: instanceId });
      }
    });
    const setInventoryAvailable = (available: boolean) => {
      inventoryPanel.element.hidden = !available;
      if (!available) {
        inventoryPanel.element.classList.add("inventory-panel--collapsed");
      }

      const launcher = document.querySelector(".inventory-mobile-toggle");
      if (launcher instanceof HTMLElement) {
        launcher.hidden = true;
        launcher.style.display = "none";
      }
    };

    const toggleInventoryPanel = () => {
      if (inventoryPanel.element.hidden) {
        return;
      }

      const launcher = document.querySelector(".inventory-mobile-toggle");
      if (launcher instanceof HTMLElement) {
        launcher.click();
      }
    };

    setInventoryAvailable(false);

    gameRoot.append(sceneRoot, inventoryPanel.element, resultsOverlay.element);
    appRoot.replaceChildren(lobbyRoot, gameRoot);

    gameController = createGameClientController({
      parent: sceneRoot,
      serverUrl: import.meta.env.VITE_SERVER_URL,
      onInventoryChange: (inventory) => {
        lastInventory = inventory;
        inventoryPanel.render(inventory);
      },
      onSettlement: (payload) => {
        profile = applySettlementToProfile(profile, payload, lastInventory);
        resultsOverlay.show(payload);
      },
      onToggleInventory: () => {
        toggleInventoryPanel();
      }
    });

    const lobbyController = createNetworkLobbyController(
      gameController.network,
      (payload) => {
        resultsOverlay.hide();
        inventoryPanel.render(lastInventory);
        setInventoryAvailable(true);
        lobbyRoot.hidden = true;
        gameRoot.hidden = false;
        
        // Stop lobby background animations
        lobbyApp?.destroy();
        
        gameController?.enterMatch(payload);
      }
    );

    try {
      lobbyApp = await bootstrapLobbyApp({
        root: lobbyRoot,
        controller: lobbyController,
        profile,
        initialState: pendingLobbyInfoMessage ? { infoMessage: pendingLobbyInfoMessage } : undefined,
        onProfileChange: (nextProfile) => {
          profile = nextProfile;
        }
      });
      pendingLobbyInfoMessage = null;
    } catch (error) {
      appRoot.innerHTML = `<pre style="color:#fca5a5;padding:24px">${String(error)}</pre>`;
    }
  }
}
