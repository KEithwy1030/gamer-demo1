import type { SettlementItemDetail, SettlementPayload } from "@gamer/shared";

export function buildNextRunPrompt(settlement: SettlementPayload): string {
  const itemValue = sumSettlementItemValue(settlement.result === "success" ? settlement.extractedItemDetails : settlement.lostItemDetails);

  if (settlement.result === "success") {
    if (itemValue >= 300 || settlement.profileGoldDelta >= 300) {
      return "先去黑市处理高价值物资，再带一件保命补给挑战争夺箱。";
    }

    if (settlement.survivedSeconds >= 480) {
      return "这次撤离节奏成立，下一局尝试多贪一个资源点但别错过 12 分钟前撤离。";
    }

    return "带出物资后别空跑，下一局把背包格子留给珍品和消耗品。";
  }

  if (settlement.reason === "corpseFog" || settlement.survivedSeconds >= 720) {
    return "下一局提前在 8 分钟转向撤离，尸毒抗性药只用来补最后一段路。";
  }

  if (settlement.loadoutLost || settlement.reason === "killed") {
    return "下一局轻装进场，先补武器和止血，再找击杀你的路线复仇。";
  }

  return "下一局先完成一次搜索和撤离，不要让空背包进入结算。";
}

function sumSettlementItemValue(items: SettlementItemDetail[] | undefined): number {
  return (items ?? []).reduce((sum, item) => sum + item.goldValue + item.treasureValue, 0);
}
