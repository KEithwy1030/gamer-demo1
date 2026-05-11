import { bootstrapLobbyApp } from "./app";
import type { MatchInventoryState } from "./game/matchRuntime";
import { createNetworkLobbyController } from "./network";
import { createResultsOverlay } from "./results";
import {
  createGameClientController,
  type GameClientController
} from "./scenes";
import { createInventoryPanel } from "./ui/InventoryPanel";
import { attachViewportScaler } from "./ui/viewportScaler";
import type { LocalProfile } from "./profile/localProfile";
import { getServerProfile, loadServerProfile } from "./profile/profileClient";
import "./styles/mobile.css";

declare global {
  interface Window {
    __P0B_TEST_HOOKS__?: {
      suppressAutoStartExtract: boolean;
      sendMoveInput(direction: { x: number; y: number }): void;
      startExtract(): void;
      getSnapshot?(): {
        selfPlayerId: string | null;
        matchSnapshot: ReturnType<GameClientController["getMatchSnapshot"]>;
      };
    };
  }
}

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  void mountClientShell(app);
}

function shouldEnableP0BTestHooks(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return false;
  }

  const search = new URLSearchParams(window.location.search);
  return search.get("devRoomPreset") === "extract" || search.get("p0bTestHooks") === "1";
}

function clearP0BTestHooks(): void {
  if (typeof window !== "undefined" && "__P0B_TEST_HOOKS__" in window) {
    delete window.__P0B_TEST_HOOKS__;
  }
}

function installP0BTestHooks(gameController: GameClientController): () => void {
  if (!shouldEnableP0BTestHooks()) {
    clearP0BTestHooks();
    return clearP0BTestHooks;
  }

  let forcedMoveDirection: { x: number; y: number } | null = null;
  const moveInterval = window.setInterval(() => {
    if (forcedMoveDirection) {
      gameController.sendMoveInput(forcedMoveDirection);
    }
  }, 50);

  window.__P0B_TEST_HOOKS__ = {
    suppressAutoStartExtract: true,
    sendMoveInput(direction) {
      forcedMoveDirection = { x: direction.x, y: direction.y };
      gameController.sendMoveInput(forcedMoveDirection);
    },
    startExtract() {
      gameController.startExtract();
    },
    getSnapshot() {
      return {
        selfPlayerId: gameController.getSelfPlayerId(),
        matchSnapshot: gameController.getMatchSnapshot()
      };
    }
  };

  return () => {
    forcedMoveDirection = null;
    window.clearInterval(moveInterval);
    clearP0BTestHooks();
  };
}

async function mountClientShell(appRoot: HTMLDivElement): Promise<void> {
  let sessionVersion = 0;
  let profile: LocalProfile = await loadServerProfile();
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
  clearP0BTestHooks();

  await createSession();

  async function createSession(): Promise<void> {
    const myVersion = ++sessionVersion;
    let lastInventory: MatchInventoryState | null = null;
    let gameController: GameClientController | null = null;
    let cleanupP0BTestHooks = clearP0BTestHooks;
    let lobbyApp: Awaited<ReturnType<typeof bootstrapLobbyApp>> | null = null;

    const lobbyRoot = document.createElement("div");
    const gameRoot = document.createElement("div");
    const gameViewport = document.createElement("div");
    const sceneRoot = document.createElement("div");

    lobbyRoot.style.minHeight = "100vh";
    gameRoot.className = "game-scale-frame";
    gameRoot.hidden = true;
    gameViewport.className = "game-scale-canvas";
    sceneRoot.className = "game-scene-root";
    const gameScaler = attachViewportScaler(gameRoot, gameViewport, {
      designWidth: 1280,
      designHeight: 720,
      maxScale: Number.POSITIVE_INFINITY,
      centerY: true
    });

    const resultsOverlay = createResultsOverlay({
      onReturnToLobby: async () => {
        if (myVersion !== sessionVersion) {
          return;
        }

        try {
          profile = await getServerProfile(profile.profileId);
        } catch {
          // Keep the last known profile so the player can still return to the lobby shell.
        }

        pendingLobbyInfoMessage = profile.lastRun?.result === "success"
          ? "本局回收已入库，继续整备后可以再次出征。"
          : "本局损失已记录，调整装束后再尝试一次。";

        try {
          gameController?.network.leaveRoom();
        } catch {
          // Ignore local teardown errors and continue rebuilding the shell.
        }

        cleanupP0BTestHooks();
        gameController?.destroy();
        gameController = null;
        gameScaler.destroy();
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
      onMove: (payload) => {
        gameController?.network.sendMoveItem(payload);
      },
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

    gameViewport.append(sceneRoot, inventoryPanel.element, resultsOverlay.element);
    gameRoot.append(gameViewport);
    appRoot.replaceChildren(lobbyRoot, gameRoot);

    gameController = createGameClientController({
      parent: sceneRoot,
      serverUrl: import.meta.env.VITE_SERVER_URL,
      onInventoryChange: (inventory) => {
        lastInventory = inventory;
        inventoryPanel.render(inventory);
      },
      onSettlement: (payload) => {
        void refreshProfileAfterSettlement();
        resultsOverlay.show(payload);
      },
      onToggleInventory: () => {
        toggleInventoryPanel();
      }
    });
    cleanupP0BTestHooks = installP0BTestHooks(gameController);

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
      cleanupP0BTestHooks();
      appRoot.innerHTML = `<pre style="color:#fca5a5;padding:24px">${String(error)}</pre>`;
    }
  }

  async function refreshProfileAfterSettlement(): Promise<void> {
    try {
      profile = await getServerProfile(profile.profileId);
    } catch {
      // The settlement result remains visible; the lobby will retry loading the profile on the next session.
    }
  }
}
