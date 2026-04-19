import { bootstrapLobbyApp } from "./app";
import type { MatchInventoryState } from "./game/matchRuntime";
import { createNetworkLobbyController } from "./network";
import { createResultsOverlay } from "./results";
import {
  createGameClientController,
  type GameClientController
} from "./scenes";
import { createInventoryPanel } from "./ui/InventoryPanel";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  void mountClientShell(app);
}

async function mountClientShell(appRoot: HTMLDivElement): Promise<void> {
  let sessionVersion = 0;

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

        try {
          gameController?.network.leaveRoom();
        } catch {
          // Ignore local teardown errors and continue rebuilding the shell.
        }

        gameController?.destroy();
        gameController = null;
        inventoryPanel.render(null);
        inventoryPanel.element.hidden = true;
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
      }
    });
    inventoryPanel.element.hidden = true;

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
        resultsOverlay.show(payload);
      }
    });

    const lobbyController = createNetworkLobbyController(
      gameController.network,
      (payload) => {
        resultsOverlay.hide();
        inventoryPanel.render(lastInventory);
        inventoryPanel.element.hidden = false;
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
        controller: lobbyController
      });
    } catch (error) {
      appRoot.innerHTML = `<pre style="color:#fca5a5;padding:24px">${String(error)}</pre>`;
    }
  }
}
