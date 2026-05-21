import { clientEventBus } from "../../../core/event-bus";

export function mountExtractAudio(): () => void {
  const onBeaconLit = (payload: unknown) => {
    console.log("[bus] BeaconLit received:", payload);
  };
  const onExtractOpened = (payload: unknown) => {
    console.log("[bus] ExtractOpened received:", payload);
  };
  const onExtractChannelStarted = (payload: unknown) => {
    console.log("[bus] ExtractChannelStarted received:", payload);
  };
  const onExtractChannelTicked = (payload: unknown) => {
    console.log("[bus] ExtractChannelTicked received:", payload);
  };
  const onExtractChannelInterrupted = (payload: unknown) => {
    console.log("[bus] ExtractChannelInterrupted received:", payload);
  };
  const onExtractSucceeded = (payload: unknown) => {
    console.log("[bus] ExtractSucceeded received:", payload);
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
