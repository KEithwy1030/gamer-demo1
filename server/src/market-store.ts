import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  CreateMarketListingPayload,
  MarketListing,
  UpdateMarketListingPayload
} from "@gamer/shared";
import type { ProfileStore } from "./profile-store.js";
import { getItemTemplate } from "./inventory/catalog.js";

const DEFAULT_DATA_FILE = path.resolve(process.cwd(), "server/data/market-listings.json");

export class MarketStore {
  private readonly listingsByPlayerId = new Map<string, MarketListing[]>();

  constructor(
    private readonly profileStore: ProfileStore,
    private readonly filePath = process.env.MARKET_STORE_PATH ?? DEFAULT_DATA_FILE
  ) {
    this.load();
  }

  list(playerId: string): MarketListing[] {
    return (this.listingsByPlayerId.get(playerId) ?? []).map(cloneListing);
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
      item: {
        instanceId: item.instanceId,
        definitionId: item.definitionId,
        name: item.name ?? item.definitionId,
        kind: item.kind,
        rarity: item.rarity,
        width: template?.width,
        height: template?.height,
        modifiers: item.modifiers ? { ...item.modifiers } : undefined,
        affixes: item.affixes ? item.affixes.map((affix) => ({ ...affix })) : undefined
      },
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
      const records = isRecord(parsed) && Array.isArray(parsed.listings) ? parsed.listings : [];
      for (const raw of records) {
        const listing = normalizeListing(raw);
        if (!listing) {
          continue;
        }
        const listings = this.listingsByPlayerId.get(listing.playerId) ?? [];
        listings.push(listing);
        this.listingsByPlayerId.set(listing.playerId, listings);
      }
    } catch {
      this.listingsByPlayerId.clear();
    }
  }

  private save(): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const listings = [...this.listingsByPlayerId.values()].flat().map(cloneListing);
    writeFileSync(this.filePath, JSON.stringify({ listings }, null, 2), "utf8");
  }
}

function safeTemplate(templateId: string): ReturnType<typeof getItemTemplate> | undefined {
  try {
    return getItemTemplate(templateId);
  } catch {
    return undefined;
  }
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

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
