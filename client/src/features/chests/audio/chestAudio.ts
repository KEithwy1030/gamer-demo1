import { clientEventBus } from "../../../core/event-bus";
import type { GameAudioController } from "../../../audio/gameAudio";

export function mountChestAudio(audio: GameAudioController, getSelfPlayerId: () => string | null): () => void {
  const onChestRummageStarted = (payload: { playerId?: string; qualityTier?: string }) => {
    if (payload.playerId !== getSelfPlayerId()) return;
    audio.play("chest");
    if (payload.qualityTier === "rich") audio.play("warning");
  };
  const onChestRummageTicked = () => {
    audio.play("rummage-tick");
  };
  const onChestRummageInterrupted = (payload: { playerId?: string }) => {
    if (payload.playerId === getSelfPlayerId()) audio.play("warning");
  };
  const onChestOpened = (payload: { playerId?: string }) => {
    if (payload.playerId === getSelfPlayerId()) audio.play("pickup");
  };

  clientEventBus.on("ChestRummageStarted", onChestRummageStarted);
  clientEventBus.on("ChestRummageTicked", onChestRummageTicked);
  clientEventBus.on("ChestRummageInterrupted", onChestRummageInterrupted);
  clientEventBus.on("ChestOpened", onChestOpened);

  return () => {
    clientEventBus.off("ChestRummageStarted", onChestRummageStarted);
    clientEventBus.off("ChestRummageTicked", onChestRummageTicked);
    clientEventBus.off("ChestRummageInterrupted", onChestRummageInterrupted);
    clientEventBus.off("ChestOpened", onChestOpened);
  };
}
