export const GAME_CANVAS_SELECTOR = "canvas:not(.lobby-background)";

export async function installAgentRecorder(page) {
  await page.addInitScript(() => {
    window.__AGENT_PLAYER_EVENTS__ = [];
    const pushEvent = (direction, raw) => {
      const entry = {
        ts: Date.now(),
        direction,
        name: null,
        payload: null
      };
      try {
        if (typeof raw === "string" && raw.startsWith("42")) {
          const parsed = JSON.parse(raw.slice(2));
          if (Array.isArray(parsed)) {
            entry.name = parsed[0] ?? null;
            entry.payload = parsed[1] ?? null;
          }
        }
      } catch (error) {
        entry.parseError = String(error);
      }
      window.__AGENT_PLAYER_EVENTS__.push(entry);
    };

    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class AgentPlayerRecorderWebSocket extends NativeWebSocket {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", (event) => pushEvent("in", event.data));
      }

      send(data) {
        pushEvent("out", data);
        return super.send(data);
      }
    };
  });
}

export async function getRecordedEvents(page) {
  return await page.evaluate(() => window.__AGENT_PLAYER_EVENTS__ ?? []);
}

export async function waitForEventAfter(page, names, afterTs = 0, timeoutMs = 20_000) {
  const eventNames = Array.isArray(names) ? names : [names];
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const event = await page.evaluate(({ eventNames: wanted, minTs }) => {
      return (window.__AGENT_PLAYER_EVENTS__ ?? []).find((entry) => (
        entry.ts >= minTs && wanted.includes(entry.name)
      )) ?? null;
    }, { eventNames, minTs: afterTs });
    if (event) return event;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for any of ${eventNames.join(", ")}`);
}

export async function getHookSnapshot(page) {
  return await page.evaluate(() => {
    const hooks = window.__P0B_TEST_HOOKS__;
    return {
      hooksType: typeof hooks,
      selfPlayerId: hooks?.getSnapshot?.()?.selfPlayerId ?? null,
      matchSnapshot: hooks?.getSnapshot?.()?.matchSnapshot ?? null
    };
  });
}

export function findSelfPosition(snapshot) {
  const selfId = snapshot?.selfPlayerId;
  const players = snapshot?.matchSnapshot?.players;
  if (!selfId || !Array.isArray(players)) return null;
  const self = players.find((player) => player.id === selfId);
  if (!self || typeof self.x !== "number" || typeof self.y !== "number") return null;
  return {
    x: Math.round(self.x),
    y: Math.round(self.y)
  };
}

export async function sendHookMove(page, direction, ms) {
  await page.evaluate((dir) => window.__P0B_TEST_HOOKS__?.sendMoveInput(dir), direction);
  await sleep(ms);
  await page.evaluate(() => window.__P0B_TEST_HOOKS__?.sendMoveInput({ x: 0, y: 0 }));
  await sleep(250);
}

export function distance(left, right) {
  if (!left || !right) return 0;
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
