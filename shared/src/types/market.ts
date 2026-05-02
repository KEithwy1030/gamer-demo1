import type { InventoryItemInstance } from "./inventory";

export interface MarketListingItem {
  instanceId: string;
  definitionId?: string;
  name: string;
  kind?: string;
  rarity?: string;
  width?: number;
  height?: number;
  modifiers?: InventoryItemInstance["modifiers"];
  affixes?: Array<{ key: string; value: number }>;
}

export interface MarketListing {
  listingId: string;
  playerId: string;
  item: MarketListingItem;
  price: number;
  createdAt: number;
  updatedAt: number;
}

export interface MarketListingsPayload {
  listings: MarketListing[];
}

export interface CreateMarketListingPayload {
  playerId: string;
  item: MarketListingItem;
  price: number;
}

export interface UpdateMarketListingPayload {
  playerId: string;
  price: number;
}
