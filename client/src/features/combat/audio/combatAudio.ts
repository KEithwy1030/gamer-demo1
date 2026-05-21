import { clientEventBus } from "../../../core/event-bus";

export function mountCombatAudio(): () => void {
  const onPlayerAttacked = (payload: unknown) => {
    console.log("[bus] PlayerAttacked received:", payload);
  };
  const onPlayerDamaged = (payload: unknown) => {
    console.log("[bus] PlayerDamaged received:", payload);
  };
  const onPlayerCriticalHit = (payload: unknown) => {
    console.log("[bus] PlayerCriticalHit received:", payload);
  };
  const onPlayerDied = (payload: unknown) => {
    console.log("[bus] PlayerDied received:", payload);
  };

  clientEventBus.on("PlayerAttacked", onPlayerAttacked);
  clientEventBus.on("PlayerDamaged", onPlayerDamaged);
  clientEventBus.on("PlayerCriticalHit", onPlayerCriticalHit);
  clientEventBus.on("PlayerDied", onPlayerDied);

  return () => {
    clientEventBus.off("PlayerAttacked", onPlayerAttacked);
    clientEventBus.off("PlayerDamaged", onPlayerDamaged);
    clientEventBus.off("PlayerCriticalHit", onPlayerCriticalHit);
    clientEventBus.off("PlayerDied", onPlayerDied);
  };
}
