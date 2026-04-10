import { broadcast } from "../control/controlBus";

// ── Conversation Memory ──────────────────────────────────────────────────────
const memory: Record<string, Array<{ role: string; text: string; ts: number }>> = {};

export function saveConversation(userId: string, msg: { role: string; text: string }): void {
  if (!memory[userId]) memory[userId] = [];
  memory[userId].push({ ...msg, ts: Date.now() });
  if (memory[userId].length > 200) memory[userId].shift();
}

export function getConversation(userId: string): Array<{ role: string; text: string; ts: number }> {
  return memory[userId] ?? [];
}

export function clearConversation(userId: string): void {
  delete memory[userId];
}

// ── System Heartbeat ─────────────────────────────────────────────────────────
export interface HeartbeatSnapshot {
  ts: number;
  uptimeSeconds: number;
  heapUsedMb: number;
  heapTotalMb: number;
  rss: number;
}

export function heartbeat(): HeartbeatSnapshot {
  const mem = process.memoryUsage();
  return {
    ts: Date.now(),
    uptimeSeconds: Math.round(process.uptime()),
    heapUsedMb: Math.round(mem.heapUsed / 1_048_576),
    heapTotalMb: Math.round(mem.heapTotal / 1_048_576),
    rss: Math.round(mem.rss / 1_048_576),
  };
}

// ── Maintenance Loop ─────────────────────────────────────────────────────────
let _maintenanceHandle: ReturnType<typeof setInterval> | null = null;

export function maintenanceLoop(intervalMs = 3_600_000): void {
  if (_maintenanceHandle) return;
  _maintenanceHandle = setInterval(() => {
    console.log("[Maintenance] Running: validate templates, retrain, clear cache");
    broadcast("maintenance_cycle", { ts: Date.now() });
  }, intervalMs);
  console.log(`[Maintenance] Loop started — every ${intervalMs / 1000}s`);
}

export function stopMaintenanceLoop(): void {
  if (_maintenanceHandle) {
    clearInterval(_maintenanceHandle);
    _maintenanceHandle = null;
  }
}

// ── Adaptive Triage Budget ───────────────────────────────────────────────────
export function triageBudget(vitals?: {
  systolicBp?: number;
  oxygenSaturation?: number;
  heartRate?: number;
}): number {
  let level = 1;
  if (!vitals) return level;
  if (vitals.systolicBp !== undefined && vitals.systolicBp < 100) level += 2;
  if (vitals.oxygenSaturation !== undefined && vitals.oxygenSaturation < 92) level += 2;
  if (vitals.heartRate !== undefined && vitals.heartRate > 130) level += 1;
  return level;
}

// ── Patient Routing Optimizer ────────────────────────────────────────────────
export interface Facility {
  name: string;
  distance: number;
  load: number;
  [key: string]: unknown;
}

export function optimalFacility(facilities: Facility[]): Facility | null {
  if (!facilities.length) return null;
  return [...facilities].sort(
    (a, b) => (a.distance + a.load) - (b.distance + b.load)
  )[0];
}
