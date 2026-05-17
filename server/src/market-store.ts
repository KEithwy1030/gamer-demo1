import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  CreateMarketListingPayload,
  MarketListing,
  MarketListingItem,
  MarketSettlementReceipt,
  MarketSettlementResult,
  SystemSellMarketPayload,
  SystemSellMarketResult,
  UpdateMarketListingPayload
} from "@gamer/shared";
import type { ProfileStore } from "./profile-store.js";
import { getItemTemplate } from "./inventory/catalog.js";

const DEFAULT_DATA_FILE = path.resolve(process.cwd(), "server/data/market-listings.json");
const DEFAULT_BUYER_SETTLEMENT_MS = 45_000;
const BUYER_MAX_PRICE_RATIO = 1.15;

export class MarketStore {
  private readonly listingsByPlayerId = new Map<string, MarketListing[]>();
  private readonly saleHistoryByPlayerId = new Map<string, MarketSettlementReceipt[]>();

  constructor(
    private readonly profileStore: ProfileStore,
    private readonly filePath = process.env.MARKET_STORE_PATH ?? DEFAULT_DATA_FILE,
    private readonly buyerSettlementMs = normalizeSettlementMs(process.env.MARKET_BUYER_SETTLEMENT_MS)
  ) {
    this.load();
  }

  list(playerId: string): MarketListing[] {
    return (this.listingsByPlayerId.get(playerId) ?? []).map(cloneListing);
  }

  listSales(playerId: string): MarketSettlementReceipt[] {
    return (this.saleHistoryByPlayerId.get(playerId) ?? []).map((receipt) => ({ ...receipt, item: { ...receipt.item } }));
  }

  create(payload: CreateMarketListingPayload): MarketListing {
    const playerId = requirePlayerId(payload.playerId);
    const itemInstanceId = String(payload.itemInstanceId ?? "").trim();
    if (!itemInstanceId) {
      throw new Error("itemInstanceId is required.");
    }
    const item = this.profileStore.removeItemForMarket(playerId, itemInstanceId);
    const template = safeTemplate(item.definitionId);
    const now = Date.now();
    const listing: MarketListing = {
      listingId: `listing-${randomUUID()}`,
      playerId,
      item: buildListingItem(item, template),
      price: normalizePrice(payload.price),
      createdAt: now,
      updatedAt: now
    };

    const listings = this.listingsByPlayerId.get(listing.playerId) ?? [];
    listings.push(listing);
    this.listingsByPlayerId.set(listing.playerId, listings);
    this.save();
    return cloneListing(listing);
  }

  sellToSystem(payload: SystemSellMarketPayload): SystemSellMarketResult {
    const playerId = requirePlayerId(payload.playerId);
    const itemInstanceId = String(payload.itemInstanceId ?? "").trim();
    if (!itemInstanceId) {
      throw new Error("itemInstanceId is required.");
    }
    const item = this.profileStore.removeItemForMarket(playerId, itemInstanceId);
    const template = safeTemplate(item.definitionId);
    const listingItem = buildListingItem(item, template);
    const goldDelta = estimateSystemSellPrice(listingItem);
    const profile = this.profileStore.addGold(playerId, goldDelta);
    const receipt: MarketSettlementReceipt = {
      listingId: `system-${randomUUID()}`,
      item: listingItem,
      price: goldDelta,
      soldAt: Date.now()
    };
    const history = this.saleHistoryByPlayerId.get(playerId) ?? [];
    history.unshift(receipt);
    this.saleHistoryByPlayerId.set(playerId, history.slice(0, 8));
    this.save();
    return {
      item: listingItem,
      goldDelta,
      profileGold: profile.gold,
      receipt
    };
  }

  settle(playerId: string): MarketSettlementResult {
    const ownerId = requirePlayerId(playerId);
    const now = Date.now();
    const listings = this.listingsByPlayerId.get(ownerId) ?? [];
    const sold: MarketSettlementReceipt[] = [];
    const active: MarketListing[] = [];

    for (const listing of listings) {
      if (shouldSystemBuyerPurchase(listing, now, this.buyerSettlementMs)) {
        sold.push({
          listingId: listing.listingId,
          item: cloneListing(listing).item,
          price: listing.price,
          soldAt: now
        });
      } else {
        active.push(listing);
      }
    }

    let profileGold = this.profileStore.get(ownerId).gold;
    for (const receipt of sold) {
      profileGold = this.profileStore.addGold(ownerId, receipt.price).gold;
    }
    if (sold.length > 0) {
      const history = this.saleHistoryByPlayerId.get(ownerId) ?? [];
      history.unshift(...sold);
      this.saleHistoryByPlayerId.set(ownerId, history.slice(0, 8));
    }

    if (active.length > 0) {
      this.listingsByPlayerId.set(ownerId, active);
    } else {
      this.listingsByPlayerId.delete(ownerId);
    }
    if (sold.length > 0) {
      this.save();
    }

    return {
      listings: active.map(cloneListing),
      sold,
      sales: this.listSales(ownerId).slice(0, 4),
      profileGold
    };
  }

  update(listingId: string, payload: UpdateMarketListingPayload): MarketListing {
    const playerId = requirePlayerId(payload.playerId);
    const listings = this.listingsByPlayerId.get(playerId) ?? [];
    const listing = listings.find((entry) => entry.listingId === listingId);
    if (!listing) {
      throw new Error("Market listing not found.");
    }

    listing.price = normalizePrice(payload.price);
    listing.updatedAt = Date.now();
    this.save();
    return cloneListing(listing);
  }

  cancel(playerId: string, listingId: string): void {
    const ownerId = requirePlayerId(playerId);
    const listings = this.listingsByPlayerId.get(ownerId) ?? [];
    const nextListings = listings.filter((entry) => entry.listingId !== listingId);
    if (nextListings.length === listings.length) {
      throw new Error("Market listing not found.");
    }
    const listing = listings.find((entry) => entry.listingId === listingId);
    if (listing) {
      this.profileStore.returnMarketItem(ownerId, {
        instanceId: listing.item.instanceId,
        definitionId: listing.item.definitionId ?? "starter_sword",
        kind: listing.item.kind as any,
        rarity: listing.item.rarity as any,
        name: listing.item.name,
        modifiers: listing.item.modifiers ? { ...listing.item.modifiers } : undefined,
        affixes: listing.item.affixes ? listing.item.affixes.map((affix) => ({ ...affix })) as any : undefined
      });
    }

    if (nextListings.length > 0) {
      this.listingsByPlayerId.set(ownerId, nextListings);
    } else {
      this.listingsByPlayerId.delete(ownerId);
    }
    this.save();
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown;
      const listingRecords = isRecord(parsed) && Array.isArray(parsed.listings) ? parsed.listings : [];
      const saleRecords = isRecord(parsed) && Array.isArray(parsed.sales) ? parsed.sales : [];
      for (const raw of listingRecords) {
        const listing = normalizeListing(raw);
        if (!listing) {
          continue;
        }
        const listings = this.listingsByPlayerId.get(listing.playerId) ?? [];
        listings.push(listing);
        this.listingsByPlayerId.set(listing.playerId, listings);
      }
      for (const raw of saleRecords) {
        const sale = normalizeSaleReceipt(raw);
        if (!sale) {
          continue;
        }
        const receipts = this.saleHistoryByPlayerId.get(sale.playerId) ?? [];
        receipts.push(sale.receipt);
        this.saleHistoryByPlayerId.set(sale.playerId, receipts);
      }
    } catch {
      this.listingsByPlayerId.clear();
      this.saleHistoryByPlayerId.clear();
    }
  }

  private save(): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const listings = [...this.listingsByPlayerId.values()].flat().map(cloneListing);
    const sales = [...this.saleHistoryByPlayerId.entries()].flatMap(([playerId, receipts]) => receipts.map((receipt) => ({
      playerId,
      receipt: cloneSaleReceipt(receipt)
    })));
    writeFileSync(this.filePath, JSON.stringify({ listings, sales }, null, 2), "utf8");
  }
}

function safeTemplate(templateId: string): ReturnType<typeof getItemTemplate> | undefined {
  try {
    return getItemTemplate(templateId);
  } catch {
    return undefined;
  }
}

function buildListingItem(
  item: ReturnType<ProfileStore["removeItemForMarket"]>,
  template: ReturnType<typeof getItemTemplate> | undefined
): MarketListingItem {
  return {
    instanceId: item.instanceId,
    definitionId: item.definitionId,
    name: item.name ?? item.definitionId,
    kind: item.kind,
    rarity: item.rarity,
    width: template?.width,
    height: template?.height,
    modifiers: item.modifiers ? { ...item.modifiers } : undefined,
    affixes: item.affixes ? item.affixes.map((affix) => ({ ...affix })) : undefined
  };
}

function estimateSystemSellPrice(item: MarketListingItem): number {
  return Math.max(1, Math.floor(estimateOpenMarketPrice(item) * 0.55));
}

function estimateOpenMarketPrice(item: MarketListingItem): number {
  const rarityBase: Record<string, number> = { common: 180, uncommon: 420, rare: 950, epic: 2200 };
  const size = Math.max(1, (item.width ?? 1) * (item.height ?? 1));
  const statCount = Object.values(item.modifiers ?? {}).filter((value) => typeof value === "number" && value !== 0).length
    + (item.affixes?.length ?? 0);
  return Math.round((rarityBase[item.rarity ?? "common"] ?? 300) * size * (1 + statCount * 0.18));
}

function shouldSystemBuyerPurchase(listing: MarketListing, now: number, buyerSettlementMs: number): boolean {
  const matured = now - listing.updatedAt >= buyerSettlementMs;
  const fairPrice = listing.price <= Math.ceil(estimateOpenMarketPrice(listing.item) * BUYER_MAX_PRICE_RATIO);
  return matured && fairPrice;
}

function normalizeSettlementMs(value: string | undefined): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_BUYER_SETTLEMENT_MS;
}

function requirePlayerId(value: string | undefined): string {
  const playerId = String(value ?? "").trim();
  if (!playerId) {
    throw new Error("playerId is required.");
  }
  return playerId;
}

function normalizePrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Price must be a positive number.");
  }

  return Math.max(1, Math.floor(value));
}

function cloneListing(listing: MarketListing): MarketListing {
  return {
    ...listing,
    item: {
      ...listing.item,
      modifiers: listing.item.modifiers ? { ...listing.item.modifiers } : undefined,
      affixes: listing.item.affixes ? listing.item.affixes.map((affix) => ({ ...affix })) : undefined
    }
  };
}

function cloneSaleReceipt(receipt: MarketSettlementReceipt): MarketSettlementReceipt {
  return {
    ...receipt,
    item: {
      ...receipt.item
    }
  };
}

function normalizeListing(raw: unknown): MarketListing | undefined {
  if (!isRecord(raw) || !isRecord(raw.item)) {
    return undefined;
  }
  const listingId = typeof raw.listingId === "string" && raw.listingId ? raw.listingId : `listing-${randomUUID()}`;
  const playerId = typeof raw.playerId === "string" && raw.playerId.trim() ? raw.playerId : undefined;
  const instanceId = typeof raw.item.instanceId === "string" && raw.item.instanceId.trim() ? raw.item.instanceId : undefined;
  if (!playerId || !instanceId) {
    return undefined;
  }
  return {
    listingId,
    playerId,
    item: {
      instanceId,
      definitionId: typeof raw.item.definitionId === "string" ? raw.item.definitionId : undefined,
      name: typeof raw.item.name === "string" && raw.item.name ? raw.item.name : instanceId,
      kind: typeof raw.item.kind === "string" ? raw.item.kind : undefined,
      rarity: typeof raw.item.rarity === "string" ? raw.item.rarity : undefined,
      modifiers: isRecord(raw.item.modifiers) ? { ...raw.item.modifiers } as any : undefined,
      affixes: Array.isArray(raw.item.affixes)
        ? raw.item.affixes.flatMap((affix) => isRecord(affix) && typeof affix.key === "string" && typeof affix.value === "number"
          ? [{ key: affix.key, value: affix.value }]
          : [])
        : undefined
    },
    price: normalizePrice(typeof raw.price === "number" ? raw.price : 1),
    createdAt: typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now()
  };
}

function normalizeSaleReceipt(raw: unknown): { playerId: string; receipt: MarketSettlementReceipt } | undefined {
  if (!isRecord(raw) || !isRecord(raw.receipt)) {
    return undefined;
  }
  const playerId = typeof raw.playerId === "string" && raw.playerId.trim() ? raw.playerId : undefined;
  const listingId = typeof raw.receipt.listingId === "string" && raw.receipt.listingId.trim() ? raw.receipt.listingId : undefined;
  if (!playerId || !listingId) {
    return undefined;
  }
  return {
    playerId,
    receipt: {
      listingId,
      item: {
        instanceId: typeof raw.receipt.item?.instanceId === "string" ? raw.receipt.item.instanceId : listingId,
        definitionId: typeof raw.receipt.item?.definitionId === "string" ? raw.receipt.item.definitionId : undefined,
        name: typeof raw.receipt.item?.name === "string" ? raw.receipt.item.name : listingId,
        kind: typeof raw.receipt.item?.kind === "string" ? raw.receipt.item.kind : undefined,
        rarity: typeof raw.receipt.item?.rarity === "string" ? raw.receipt.item.rarity : undefined,
        width: typeof raw.receipt.item?.width === "number" ? raw.receipt.item.width : undefined,
        height: typeof raw.receipt.item?.height === "number" ? raw.receipt.item.height : undefined,
        modifiers: isRecord(raw.receipt.item?.modifiers) ? { ...raw.receipt.item.modifiers } as any : undefined,
        affixes: Array.isArray(raw.receipt.item?.affixes)
          ? raw.receipt.item.affixes.flatMap((affix: unknown) => isRecord(affix) && typeof affix.key === "string" && typeof affix.value === "number"
            ? [{ key: affix.key, value: affix.value }]
            : [])
          : undefined
      },
      price: normalizePrice(typeof raw.receipt.price === "number" ? raw.receipt.price : 1),
      soldAt: typeof raw.receipt.soldAt === "number" && Number.isFinite(raw.receipt.soldAt) ? raw.receipt.soldAt : Date.now()
    }
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
