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

export interface MarketSettlementReceipt {
  listingId: string;
  item: MarketListingItem;
  price: number;
  soldAt: number;
}

export interface MarketSettlementResult {
  listings: MarketListing[];
  sold: MarketSettlementReceipt[];
  profileGold: number;
}

export interface CreateMarketListingPayload {
  playerId: string;
  itemInstanceId: string;
  price: number;
}

export interface UpdateMarketListingPayload {
  playerId: string;
  price: number;
}

export interface SystemSellMarketPayload {
  playerId: string;
  itemInstanceId: string;
}

export interface SystemSellMarketResult {
  item: MarketListingItem;
  goldDelta: number;
  profileGold: number;
}
