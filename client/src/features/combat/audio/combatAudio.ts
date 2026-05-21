import { clientEventBus } from "../../../core/event-bus";
import type { GameAudioController } from "../../../audio/gameAudio";

export function mountCombatAudio(audio: GameAudioController, getSelfPlayerId: () => string | null): () => void {
  const onPlayerAttacked = (payload: { playerId?: string }) => {
    if (payload.playerId === getSelfPlayerId()) audio.play("attack");
  };
  const onPlayerDamaged = (payload: { targetId?: string; amount?: number }) => {
    if ((payload.amount ?? 0) <= 0) return;
    audio.play(payload.targetId === getSelfPlayerId() ? "hurt" : "hit");
  };
  const onPlayerCriticalHit = () => {
    audio.play("hit");
  };
  const onPlayerDied = (payload: { playerId?: string }) => {
    if (payload.playerId === getSelfPlayerId()) audio.play("death");
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
