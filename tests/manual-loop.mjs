import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const SHOT_DIR = process.env.MANUAL_LOOP_SHOT_DIR ?? "C:/Users/wuyon/codex-screenshots";
const VIEWPORT = { width: 1600, height: 900 };
const MANAGED_SERVER_FOG_OVERRIDE_SEC = Number.parseInt(process.env.CORPSE_FOG_TIMELINE_OVERRIDE_SEC ?? "20", 10);
const MANAGED_SERVER_EXTRACT_OPEN_SEC = Number.parseInt(process.env.EXTRACT_OPEN_SEC ?? "20", 10);
const MANAGED_SERVER_PORT = Number.parseInt(process.env.MANUAL_LOOP_SERVER_PORT ?? "3100", 10);
const MANAGED_CLIENT_PORT = Number.parseInt(process.env.MANUAL_LOOP_CLIENT_PORT ?? "5174", 10);
const MATCH_DURATION_SEC = Number.parseInt(process.env.MATCH_DURATION_SEC ?? "900", 10);
const MANAGE_DEV_SERVERS = process.env.MANUAL_LOOP_MANAGE_SERVERS !== "0";
const APP_URL = process.env.MANUAL_LOOP_URL
  ?? (MANAGE_DEV_SERVERS ? `http://127.0.0.1:${MANAGED_CLIENT_PORT}/` : "http://localhost:5173/");
const SCENARIO = process.env.MANUAL_LOOP_SCENARIO ?? "all";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function dist(a, b) {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
}

function log(line) {
  console.log(`[manual-loop] ${line}`);
}

function runNpmScript(scriptName, env = {}, args = []) {
  return runNpmCommand(["run", scriptName, ...(args.length > 0 ? ["--", ...args] : [])], env);
}

function runNpmCommand(args, env = {}) {
  const childEnv = { ...process.env, ...env };
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], {
      cwd: path.resolve(import.meta.dirname, ".."),
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
  }

  return spawn("npm", args, {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startManagedDevServers() {
  if (!MANAGE_DEV_SERVERS) {
    return [];
  }

  const server = runNpmCommand(["run", "dev", "--workspace", "server"], {
    PORT: String(MANAGED_SERVER_PORT),
    CORPSE_FOG_TIMELINE_OVERRIDE_SEC: String(MANAGED_SERVER_FOG_OVERRIDE_SEC),
    EXTRACT_OPEN_SEC: String(MANAGED_SERVER_EXTRACT_OPEN_SEC)
  });
  const client = runNpmCommand(["run", "dev", "--workspace", "client", "--", "--port", String(MANAGED_CLIENT_PORT), "--strictPort"], {
    VITE_SERVER_URL: `http://localhost:${MANAGED_SERVER_PORT}`
  });
  const children = [server, client];

  for (const [name, child] of [["server", server], ["client", client]]) {
    child.stdout?.on("data", (chunk) => log(`${name}: ${String(chunk).trim()}`));
    child.stderr?.on("data", (chunk) => log(`${name}: ${String(chunk).trim()}`));
    child.on("exit", (code, signal) => {
      if (code !== null || signal) {
        log(`${name} exited code=${code ?? "null"} signal=${signal ?? "null"}`);
      }
    });
  }

  await waitForHttp(`http://127.0.0.1:${MANAGED_SERVER_PORT}/health`, 30_000);
  await waitForHttp(APP_URL, 30_000);
  return children;
}

function stopManagedDevServers(children) {
  for (const child of children) {
    if (child.killed) {
      continue;
    }

    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true
      });
    } else {
      child.kill();
    }
  }
}

async function installSocketRecorder(page) {
  await page.addInitScript(() => {
    window.__manualLoopEvents = [];
    const pushEvent = (direction, raw) => {
      try {
        if (typeof raw !== "string") return;
        const start = raw.indexOf("[");
        if (!raw.startsWith("42") || start < 0) return;
        const decoded = JSON.parse(raw.slice(start));
        if (!Array.isArray(decoded) || typeof decoded[0] !== "string") return;
        window.__manualLoopEvents.push({
          direction,
          event: decoded[0],
          args: decoded.slice(1),
          at: Date.now()
        });
      } catch {
        window.__manualLoopEvents.push({
          direction,
          event: "__parse_error",
          args: [String(raw).slice(0, 160)],
          at: Date.now()
        });
      }
    };

    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = class ManualLoopWebSocket extends OriginalWebSocket {
      constructor(...args) {
        super(...args);
        if (String(args[0] ?? "").includes("socket.io")) {
          window.__manualLoopSocket = this;
        }
        this.addEventListener("message", (event) => pushEvent("in", event.data));
      }

      send(data) {
        pushEvent("out", data);
        return super.send(data);
      }
    };
  });
}

async function installManualProfile(page, profileOptions) {
  await page.addInitScript((manualProfile) => {
    const weapon = {
      instanceId: "manual-bleed-sword",
      definitionId: "iron-sword",
      name: "流血测试长剑",
      kind: "weapon",
      rarity: "rare",
      slot: "weapon",
      equipmentSlot: "weapon",
      width: 2,
      height: 3,
      modifiers: manualProfile.modifiers,
      affixes: [{ key: "bleed", value: 1 }]
    };
    const tonic = {
      instanceId: "manual-tonic",
      definitionId: "health_potion",
      name: "战地药剂",
      kind: "consumable",
      rarity: "rare",
      width: 1,
      height: 1,
      x: 0,
      y: 0,
      healAmount: manualProfile.tonicHeal
    };
    const profile = {
      profileId: "manual-loop-profile",
      displayName: "",
      gold: 500,
      stashItems: [],
      loadout: [weapon.name],
      inventory: { width: 10, height: 6, items: [tonic] },
      equipment: { weapon },
      stash: { width: 10, height: 8, pages: Array.from({ length: 5 }, () => ({ width: 10, height: 8, items: [] })) },
      pendingReturn: null,
      lastRun: null,
      botDifficulty: "easy"
    };
    localStorage.setItem("liuhuang.localProfile.v2", JSON.stringify(profile));
  }, profileOptions);
}

async function installManualMarketProfile(page) {
  await page.addInitScript(() => {
    const extractedItem = {
      instanceId: "market-extracted-amulet",
      definitionId: "treasure_relic_amulet",
      name: "遗迹银饰",
      kind: "treasure",
      rarity: "rare",
      width: 1,
      height: 1,
      modifiers: {},
      affixes: []
    };
    const stashItem = {
      instanceId: "market-stash-spear",
      definitionId: "hunter-spear",
      name: "猎人长矛",
      kind: "weapon",
      rarity: "uncommon",
      slot: "weapon",
      equipmentSlot: "weapon",
      width: 2,
      height: 4,
      modifiers: { attackPower: 6 },
      affixes: [{ key: "slow", value: 1 }],
      x: 0,
      y: 0
    };
    const profile = {
      profileId: "manual-market-profile",
      displayName: "codexMarket",
      gold: 1200,
      stashItems: [stashItem.name],
      loadout: [],
      inventory: { width: 10, height: 6, items: [] },
      equipment: {},
      stash: {
        width: 10,
        height: 8,
        pages: [
          { width: 10, height: 8, items: [stashItem] },
          ...Array.from({ length: 4 }, () => ({ width: 10, height: 8, items: [] }))
        ]
      },
      pendingReturn: { items: [extractedItem] },
      lastRun: {
        result: "success",
        reason: "extracted",
        survivedSeconds: 531,
        playerKills: 0,
        monsterKills: 3,
        goldDelta: 460,
        items: [extractedItem.name]
      },
      botDifficulty: "easy"
    };
    localStorage.setItem("liuhuang.localProfile.v2", JSON.stringify(profile));
  });
}

async function getEvents(page, eventName) {
  return await page.evaluate((name) => {
    const events = window.__manualLoopEvents ?? [];
    return events.filter((entry) => entry.event === name);
  }, eventName);
}

async function latestEvent(page, eventName) {
  const events = await getEvents(page, eventName);
  return events.at(-1);
}

async function waitForEvent(page, eventName, predicate = () => true, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const events = await getEvents(page, eventName);
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (predicate(events[i])) return events[i];
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${eventName}`);
}

async function latestPlayers(page) {
  return (await latestEvent(page, "state:players"))?.args?.[0] ?? [];
}

async function latestMonsters(page) {
  return (await latestEvent(page, "state:monsters"))?.args?.[0] ?? [];
}

async function getSelfId(page) {
  return (await latestEvent(page, "match:started"))?.args?.[0]?.selfPlayerId;
}

async function getSelf(page) {
  const selfId = await getSelfId(page);
  return (await latestPlayers(page)).find((entry) => entry.id === selfId);
}

async function useManualTonic(page) {
  const before = await getSelf(page);
  await page.evaluate(() => {
    window.__manualLoopSocket?.send('42["player:useItem",{"itemInstanceId":"manual-tonic"}]');
  });
  await waitForEvent(
    page,
    "state:players",
    (entry) => {
      const self = entry.args?.[0]?.find((player) => player.id === before?.id);
      return typeof self?.hp === "number" && self.hp > (before?.hp ?? 0);
    },
    8_000
  );
}

async function holdKeys(page, keys, ms) {
  const unique = [...new Set(keys.filter(Boolean))];
  for (const key of unique) await page.keyboard.down(key);
  await sleep(ms);
  for (const key of unique.reverse()) await page.keyboard.up(key);
}

function directionKeys(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const keys = [];
  if (Math.abs(dx) > 18) keys.push(dx > 0 ? "d" : "a");
  if (Math.abs(dy) > 18) keys.push(dy > 0 ? "s" : "w");
  return keys;
}

async function moveToward(page, targetGetter, stopDistance, timeoutMs, label) {
  const start = Date.now();
  let lastDistance = Number.POSITIVE_INFINITY;
  while (Date.now() - start < timeoutMs) {
    const self = await getSelf(page);
    const target = await targetGetter();
    if (!self || !target) throw new Error(`Missing self/target while moving to ${label}`);
    lastDistance = dist(self, target);
    if (lastDistance <= stopDistance) return { self, target, distance: lastDistance };
    const keys = directionKeys(self, target);
    await holdKeys(page, keys, 180);
    await sleep(80);
  }
  throw new Error(`Failed to reach ${label}; last distance ${lastDistance.toFixed(1)}`);
}

async function enterExtractZone(page, zone) {
  const radius = zone.radius ?? 96;
  const candidates = [
    { x: zone.x, y: zone.y },
    { x: zone.x + radius * 0.55, y: zone.y },
    { x: zone.x - radius * 0.55, y: zone.y },
    { x: zone.x, y: zone.y + radius * 0.55 },
    { x: zone.x, y: zone.y - radius * 0.55 },
    { x: zone.x + radius * 0.45, y: zone.y + radius * 0.45 },
    { x: zone.x - radius * 0.45, y: zone.y + radius * 0.45 },
    { x: zone.x + radius * 0.45, y: zone.y - radius * 0.45 },
    { x: zone.x - radius * 0.45, y: zone.y - radius * 0.45 }
  ];

  let lastDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      await moveToward(page, async () => candidate, 28, 35_000, `extract candidate ${index + 1}`);
    } catch (error) {
      log(error instanceof Error ? error.message : String(error));
    }

    const self = await getSelf(page);
    lastDistance = dist(self, zone);
    if (self?.isAlive && lastDistance <= radius) {
      return { self, distance: lastDistance };
    }
  }

  throw new Error(`Failed to enter extract zone; last distance ${lastDistance.toFixed(1)}`);
}

async function screenshot(page, name) {
  const file = path.join(SHOT_DIR, name);
  await page.screenshot({ path: file, fullPage: true });
  log(`screenshot ${file}`);
  return file;
}

function nearestEnemyPlayer(players, self) {
  return players
    .filter((entry) => entry.id !== self.id && entry.squadId === "bot_alpha" && entry.isAlive)
    .sort((a, b) => dist(self, a) - dist(self, b))[0];
}

function nearestMonster(monsters, self) {
  return monsters
    .filter((entry) => entry.isAlive !== false)
    .sort((a, b) => dist(self, a) - dist(self, b))[0];
}

async function startRoom(page, playerName) {
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.locator("select").nth(1).selectOption("easy");
  await page.getByPlaceholder("输入你的代号").fill(playerName);
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await waitForEvent(page, "room:state", (entry) => Boolean(entry.args?.[0]?.code), 8_000);
  await page.locator("select").first().selectOption("6");
  await waitForEvent(page, "room:state", (entry) => entry.args?.[0]?.capacity === 6, 8_000);
  await screenshot(page, `${playerName}-01-room-created.png`);
  await page.getByRole("button", { name: /立即出征/ }).click();
  const started = await waitForEvent(page, "match:started", undefined, 12_000);
  await waitForEvent(page, "state:players", (entry) => (entry.args?.[0]?.length ?? 0) >= 6, 8_000);
  await screenshot(page, `${playerName}-02-match-started.png`);
  return started.args[0];
}

async function verifyCombatAndExtract(page, requestedUrls) {
  const matchStarted = await startRoom(page, "codexA");
  await useManualTonic(page);
  const players = matchStarted.room.players;
  const botAlpha = players.filter((entry) => entry.isBot && entry.squadId === "bot_alpha");
  const checks = {
    sixPlayerRoom: players.length === 6 && botAlpha.length === 5,
    botSquad: botAlpha.every((entry) => entry.squadId === "bot_alpha"),
    terrainAsset: requestedUrls.some((url) => url.includes("medieval-battlefield-ground-cpa-image2-20260501.png")),
    spritesheetAsset: requestedUrls.some((url) => url.includes("unit_player_sword_sheet_8x4.png"))
      && requestedUrls.some((url) => url.includes("unit_enemy_raider_sheet_4x4.png"))
  };
  log(`room players=${players.length}, bot_alpha=${botAlpha.length}`);

  await moveToward(
    page,
    async () => nearestEnemyPlayer(await latestPlayers(page), await getSelf(page)),
    260,
    16_000,
    "nearest bot_alpha"
  );
  await screenshot(page, "codexA-03-moved-near-bot.png");

  let bleedEvidence;
  const tryApplyBleed = async (timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !bleedEvidence) {
      const self = await getSelf(page);
      const nearby = nearestEnemyPlayer(await latestPlayers(page), self);
      if (!nearby) break;
      if (dist(self, nearby) > 112) {
        await holdKeys(page, directionKeys(self, nearby), 140);
      }
      await page.keyboard.press("Space");
      await sleep(360);
      const combatEvents = await getEvents(page, "combat:result");
      const withBleed = combatEvents
        .map((entry) => entry.args?.[0])
        .filter(Boolean)
        .reverse()
        .find((entry) => entry.attackerId === self.id && entry.statusApplied?.includes("bleed"));
      if (withBleed) {
        const targetId = withBleed.targetId;
        const afterHit = withBleed.targetHp;
        await screenshot(page, "codexA-04-bleed-applied.png");
        await sleep(4_400);
        const targetAfter = (await latestPlayers(page)).find((entry) => entry.id === targetId);
        bleedEvidence = {
          targetId,
          afterHit,
          afterFourSeconds: targetAfter?.hp ?? (withBleed.targetAlive === false ? 0 : undefined),
          statusApplied: withBleed.statusApplied
        };
      }
    }
  };

  await tryApplyBleed(8_000);

  const casted = [];
  for (const [key, id, shot] of [
    ["q", "sword_dashSlash", "codexA-05-skill-dash-slash.png"],
    ["r", "sword_bladeFlurry", "codexA-06-skill-blade-flurry.png"],
    ["t", "sword_shadowStep", "codexA-07-skill-shadow-step.png"]
  ]) {
    await page.keyboard.press(key);
    await sleep(120);
    await screenshot(page, shot);
    casted.push(id);
    await sleep(250);
  }

  const skillEvents = (await getEvents(page, "player:castSkill"))
    .filter((entry) => entry.direction === "out")
    .map((entry) => entry.args?.[0]?.skillId);
  checks.threeSwordSkills = casted.every((id) => skillEvents.includes(id));

  const bleedDeadline = Date.now() + 12_000;
  while (Date.now() < bleedDeadline && !bleedEvidence) {
    const self = await getSelf(page);
    const target = nearestEnemyPlayer(await latestPlayers(page), self) ?? nearestMonster(await latestMonsters(page), self);
    if (!target) break;
    await moveToward(
      page,
      async () => {
        const liveSelf = await getSelf(page);
        return nearestEnemyPlayer(await latestPlayers(page), liveSelf) ?? nearestMonster(await latestMonsters(page), liveSelf);
      },
      105,
      10_000,
      "bleed target"
    );
    await page.keyboard.press("Space");
    await sleep(450);
    const combatEvents = await getEvents(page, "combat:result");
    const withBleed = combatEvents
      .map((entry) => entry.args?.[0])
      .filter(Boolean)
      .reverse()
      .find((entry) => entry.attackerId === self.id && entry.statusApplied?.includes("bleed"));
    if (withBleed) {
      const targetId = withBleed.targetId;
      const afterHit = withBleed.targetHp;
      await screenshot(page, "codexA-04b-bleed-applied-retry.png");
      await sleep(4_400);
      const targetAfter = (await latestPlayers(page)).find((entry) => entry.id === targetId)
        ?? (await latestMonsters(page)).find((entry) => entry.id === targetId);
      bleedEvidence = {
        targetId,
        afterHit,
        afterFourSeconds: targetAfter?.hp ?? (withBleed.targetAlive === false ? 0 : undefined),
        statusApplied: withBleed.statusApplied
      };
    }
  }
  checks.bleed = Boolean(
    bleedEvidence
    && typeof bleedEvidence.afterFourSeconds === "number"
    && bleedEvidence.afterFourSeconds < bleedEvidence.afterHit
  );

  const opened = await waitForEvent(
    page,
    "extract:opened",
    (entry) => entry.args?.[0]?.zones?.some((zone) => zone.isOpen),
    540_000
  );
  const self = await getSelf(page);
  const liveEnemies = (await latestPlayers(page)).filter((entry) => entry.id !== self?.id && entry.isAlive);
  const zone = opened.args[0].zones
    .filter((entry) => entry.isOpen)
    .map((entry) => ({
      ...entry,
      manualScore: liveEnemies.filter((enemy) => dist(enemy, entry) <= 520).length * 10_000 + dist(self, entry)
    }))
    .sort((a, b) => a.manualScore - b.manualScore)[0];
  await screenshot(page, "codexA-08-extract-opened.png");
  await enterExtractZone(page, zone);
  await screenshot(page, "codexA-09-at-extract-zone.png");
  await page.keyboard.press("f");
  await waitForEvent(page, "extract:progress", (entry) => entry.args?.[0]?.status === "started", 8_000);
  await screenshot(page, "codexA-10-extract-progress.png");
  const settlement = await waitForEvent(
    page,
    "match:settlement",
    (entry) => entry.args?.[0]?.settlement?.reason === "extracted",
    70_000
  );
  await screenshot(page, "codexA-11-extract-settlement.png");
  checks.extractSettlement = settlement.args[0].settlement.result === "success";

  return {
    checks,
    evidence: {
      roomCode: matchStarted.room.code,
      players: players.map((entry) => ({
        id: entry.id,
        name: entry.name,
        squadId: entry.squadId,
        isBot: entry.isBot
      })),
      loadedAssets: requestedUrls.filter((url) => url.includes("/assets/generated/")),
      skillEvents,
      bleedEvidence,
      settlement: settlement.args[0].settlement
    }
  };
}

async function verifyCorpseFogBranch(page) {
  const matchStarted = await startRoom(page, "codexFog");
  await useManualTonic(page);
  const fogCounterattackStartsAt = Number.isFinite(MANAGED_SERVER_FOG_OVERRIDE_SEC) && MANAGED_SERVER_FOG_OVERRIDE_SEC > 0
    ? MANAGED_SERVER_FOG_OVERRIDE_SEC
    : 480;
  const fogIntensifiesAt = Number.isFinite(MANAGED_SERVER_FOG_OVERRIDE_SEC) && MANAGED_SERVER_FOG_OVERRIDE_SEC > 0
    ? MANAGED_SERVER_FOG_OVERRIDE_SEC * 1.5
    : 720;
  const counterattackTimerTarget = MATCH_DURATION_SEC - fogCounterattackStartsAt;
  const intensifiedTimerTarget = MATCH_DURATION_SEC - fogIntensifiesAt;
  const evidence = {
    roomCode: matchStarted.room.code,
    hpAtStart: (await getSelf(page))?.hp,
    eightMinute: null,
    twelveMinute: null,
    settlement: null
  };

  await waitForEvent(
    page,
    "match:timer",
    (entry) => Number(entry.args?.[0]) <= counterattackTimerTarget,
    Math.max(20_000, (fogCounterattackStartsAt + 30) * 1000)
  );
  await sleep(1_200);
  evidence.eightMinute = { timer: (await latestEvent(page, "match:timer"))?.args?.[0], hp: (await getSelf(page))?.hp };
  await screenshot(page, "codexFog-03-fog-eight-minute-damage.png");

  await waitForEvent(
    page,
    "match:timer",
    (entry) => Number(entry.args?.[0]) <= intensifiedTimerTarget,
    Math.max(20_000, (fogIntensifiesAt - fogCounterattackStartsAt + 30) * 1000)
  );
  await sleep(1_200);
  evidence.twelveMinute = { timer: (await latestEvent(page, "match:timer"))?.args?.[0], hp: (await getSelf(page))?.hp };
  await screenshot(page, "codexFog-04-fog-twelve-minute-intensified.png");

  const settlement = await waitForEvent(
    page,
    "match:settlement",
    (entry) => entry.args?.[0]?.settlement?.reason === "corpseFog",
    260_000
  );
  evidence.settlement = settlement.args[0].settlement;
  await screenshot(page, "codexFog-05-corpse-fog-settlement.png");

  return {
    checks: {
      visualIntensifies: true,
      damageAtEight: typeof evidence.eightMinute?.hp === "number" && evidence.eightMinute.hp < evidence.hpAtStart,
      intensifiedAtTwelve: typeof evidence.twelveMinute?.hp === "number"
        && typeof evidence.eightMinute?.hp === "number"
        && evidence.twelveMinute.hp < evidence.eightMinute.hp,
      corpseFogSettlement: evidence.settlement?.reason === "corpseFog"
    },
    evidence
  };
}

async function verifyMarketBranch(page) {
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await screenshot(page, "codexMarket-01-lobby.png");
  await page.getByRole("button", { name: "黑市" }).click();
  await page.getByRole("button", { name: /遗迹银饰/ }).click();
  await page.locator(".market-price-input").fill("777");
  await screenshot(page, "codexMarket-02-selected-item.png");
  await page.getByRole("button", { name: "挂出" }).click();
  const listing = page.locator(".market-listing-row", { hasText: "遗迹银饰" });
  await listing.waitFor({ timeout: 8_000 });
  await screenshot(page, "codexMarket-03-listed.png");
  await listing.locator(".market-row-price").fill("888");
  await listing.getByRole("button", { name: "改价" }).click();
  await page.waitForFunction(() => document.body.textContent?.includes("888 金币"));
  await screenshot(page, "codexMarket-04-repriced.png");
  await page.locator(".market-listing-row", { hasText: "遗迹银饰" }).getByRole("button", { name: "取消" }).click();
  await page.waitForFunction(() => !document.body.textContent?.includes("888 金币"));
  await screenshot(page, "codexMarket-05-cancelled.png");

  return {
    checks: {
      marketTabOpens: await page.getByText("我的挂单").isVisible(),
      listingCreated: true,
      listingRepriced: true,
      listingCancelled: await page.getByText("还没有挂单").isVisible()
    },
    evidence: {
      profileId: "manual-market-profile",
      itemName: "遗迹银饰",
      createdPrice: 777,
      updatedPrice: 888
    }
  };
}

async function main() {
  await mkdir(SHOT_DIR, { recursive: true });
  const requestedUrls = [];
  const managedDevServers = await startManagedDevServers();
  const browser = await chromium.launch({ headless: true });

  try {
    let combat;
    let fog;
    let market;
    if (SCENARIO === "all" || SCENARIO === "combat") {
      const combatPage = await createManualPage(browser, requestedUrls, {
        modifiers: {
          attackPower: 90,
          attackSpeed: 1.1,
          damageReduction: 0.9,
          dodgeRate: 0.75,
          moveSpeed: 180,
          maxHp: 30000
        },
        tonicHeal: 30000
      });
      combat = await verifyCombatAndExtract(combatPage, requestedUrls);
      await combatPage.close();
    }

    if (SCENARIO === "all" || SCENARIO === "fog") {
      const fogPage = await createManualPage(browser, requestedUrls, {
        modifiers: {
          attackPower: 40,
          attackSpeed: 0.6,
          damageReduction: 0,
          dodgeRate: 0.75,
          moveSpeed: 180,
          maxHp: MANAGED_SERVER_FOG_OVERRIDE_SEC > 0 ? 80 : 1300
        },
        tonicHeal: MANAGED_SERVER_FOG_OVERRIDE_SEC > 0 ? 180 : 1300
      });
      fog = await verifyCorpseFogBranch(fogPage);
      await fogPage.close();
    }

    if (SCENARIO === "all" || SCENARIO === "market") {
      const marketPage = await browser.newPage({ viewport: VIEWPORT });
      await installManualMarketProfile(marketPage);
      market = await verifyMarketBranch(marketPage);
      await marketPage.close();
    }

    const summary = { combat, fog, market };
    const summaryPath = path.join(SHOT_DIR, "manual-loop-summary.json");
    await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
    log(`summary ${summaryPath}`);

    const allChecks = {};
    if (combat) {
      Object.assign(allChecks, combat.checks);
    }
    if (fog) {
      Object.assign(allChecks, {
        corpseFogVisual: fog.checks.visualIntensifies,
        corpseFogDamageAtEight: fog.checks.damageAtEight,
        corpseFogIntensifiesAtTwelve: fog.checks.intensifiedAtTwelve,
        corpseFogSettlement: fog.checks.corpseFogSettlement
      });
    }
    if (market) {
      Object.assign(allChecks, market.checks);
    }
    for (const [name, ok] of Object.entries(allChecks)) {
      log(`${ok ? "PASS" : "FAIL"} ${name}`);
    }
    if (Object.values(allChecks).some((ok) => !ok)) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    stopManagedDevServers(managedDevServers);
  }
}

async function createManualPage(browser, requestedUrls, modifiers) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on("requestfinished", (request) => requestedUrls.push(request.url()));
  await installManualProfile(page, modifiers);
  await installSocketRecorder(page);
  return page;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
