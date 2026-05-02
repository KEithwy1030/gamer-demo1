import { randomUUID } from "node:crypto";
import type {
  CreateMarketListingPayload,
  MarketListing,
  UpdateMarketListingPayload
} from "@gamer/shared";

export class MarketStore {
  private readonly listingsByPlayerId = new Map<string, MarketListing[]>();

  list(playerId: string): MarketListing[] {
    return (this.listingsByPlayerId.get(playerId) ?? []).map(cloneListing);
  }

  create(payload: CreateMarketListingPayload): MarketListing {
    const now = Date.now();
    const listing: MarketListing = {
      listingId: `listing-${randomUUID()}`,
      playerId: requirePlayerId(payload.playerId),
      item: { ...payload.item },
      price: normalizePrice(payload.price),
      createdAt: now,
      updatedAt: now
    };

    const listings = this.listingsByPlayerId.get(listing.playerId) ?? [];
    listings.push(listing);
    this.listingsByPlayerId.set(listing.playerId, listings);
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
    return cloneListing(listing);
  }

  cancel(playerId: string, listingId: string): void {
    const ownerId = requirePlayerId(playerId);
    const listings = this.listingsByPlayerId.get(ownerId) ?? [];
    const nextListings = listings.filter((entry) => entry.listingId !== listingId);
    if (nextListings.length === listings.length) {
      throw new Error("Market listing not found.");
    }

    if (nextListings.length > 0) {
      this.listingsByPlayerId.set(ownerId, nextListings);
    } else {
      this.listingsByPlayerId.delete(ownerId);
    }
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
