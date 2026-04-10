import { broadcast } from "../control/controlBus";

export function shedLoad(load: number): "redirect_to_telemed" | "normal" {
  if (load > 80) return "redirect_to_telemed";
  return "normal";
}

export function recoverSystem(error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  console.log(`[Recovery] Recovering from: ${msg}`);
  broadcast("system_recovery", { error: msg, ts: Date.now() });
}

export function broadcastNational(alert: string): void {
  console.log(`📢 [NATIONAL ALERT]: ${alert}`);
  broadcast("national_alert", { alert, ts: Date.now() });
}
