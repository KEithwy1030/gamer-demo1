import { clientEventBus } from "../../../core/event-bus";
import type { GameAudioController } from "../../../audio/gameAudio";

const CELEBRATED_RARITIES = new Set(["rare", "epic"]);

/** rare+ 掉落落地时的高光 sting；保险袋存入确认音。 */
export function mountLootAudio(audio: GameAudioController, getSelfPlayerId: () => string | null): () => void {
  const onLootSpawned = (payload: { item: { rarity?: string } }) => {
    if (CELEBRATED_RARITIES.has(payload.item.rarity ?? "")) {
      audio.play("rare-drop");
    }
  };

  const onItemSecured = (payload: { playerId?: string }) => {
    if (payload.playerId === getSelfPlayerId()) {
      audio.play("secured");
    }
  };

  clientEventBus.on("LootSpawned", onLootSpawned);
  clientEventBus.on("ItemSecured", onItemSecured);

  return () => {
    clientEventBus.off("LootSpawned", onLootSpawned);
    clientEventBus.off("ItemSecured", onItemSecured);
  };
}
