import { clientEventBus } from "../../../core/event-bus";
import type { GameAudioController } from "../../../audio/gameAudio";

export function mountExtractAudio(audio: GameAudioController, getSelfPlayerId: () => string | null): () => void {
  const onBeaconLit = () => {
    audio.play("warning");
  };
  const onExtractOpened = () => {
    audio.play("warning");
  };
  const onExtractChannelStarted = (payload: { playerId?: string }) => {
    audio.play(payload.playerId === getSelfPlayerId() ? "warning" : "thud");
  };
  const onExtractChannelTicked = () => {
    // The visual ring carries progress; audio stays on start/interrupt/success.
  };
  const onExtractChannelInterrupted = (payload: { playerId?: string }) => {
    if (payload.playerId === getSelfPlayerId()) audio.play("warning");
  };
  const onExtractSucceeded = (payload: { playerId?: string }) => {
    if (payload.playerId === getSelfPlayerId()) audio.play("extract");
  };

  clientEventBus.on("BeaconLit", onBeaconLit);
  clientEventBus.on("ExtractOpened", onExtractOpened);
  clientEventBus.on("ExtractChannelStarted", onExtractChannelStarted);
  clientEventBus.on("ExtractChannelTicked", onExtractChannelTicked);
  clientEventBus.on("ExtractChannelInterrupted", onExtractChannelInterrupted);
  clientEventBus.on("ExtractSucceeded", onExtractSucceeded);

  return () => {
    clientEventBus.off("BeaconLit", onBeaconLit);
    clientEventBus.off("ExtractOpened", onExtractOpened);
    clientEventBus.off("ExtractChannelStarted", onExtractChannelStarted);
    clientEventBus.off("ExtractChannelTicked", onExtractChannelTicked);
    clientEventBus.off("ExtractChannelInterrupted", onExtractChannelInterrupted);
    clientEventBus.off("ExtractSucceeded", onExtractSucceeded);
  };
}
