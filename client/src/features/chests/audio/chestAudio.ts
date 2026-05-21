import { clientEventBus } from "../../../core/event-bus";

export function mountChestAudio(): () => void {
  const onChestRummageStarted = (payload: unknown) => {
    console.log("[bus] ChestRummageStarted received:", payload);
  };
  const onChestRummageTicked = (payload: unknown) => {
    console.log("[bus] ChestRummageTicked received:", payload);
  };
  const onChestRummageInterrupted = (payload: unknown) => {
    console.log("[bus] ChestRummageInterrupted received:", payload);
  };
  const onChestOpened = (payload: unknown) => {
    console.log("[bus] ChestOpened received:", payload);
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
