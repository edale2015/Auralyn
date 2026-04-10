import { EventEmitter } from "events";

export interface SimSnapshot {
  timestamp:   number;
  tick:        number;
  patients:    number;
  er:          number;
  critical:    number;
  telemed:     number;
  waitMinutes: number;
  load:        "low" | "normal" | "high" | "critical";
  erRate:      number;
}

export const simBus = new EventEmitter();
simBus.setMaxListeners(100);

let _timer:   ReturnType<typeof setInterval> | null = null;
let _tick = 0;
let _latest: SimSnapshot | null = null;

function makeSnapshot(tick: number): SimSnapshot {
  const timeOfDay = (new Date().getHours());
  const rushFactor = (timeOfDay >= 8 && timeOfDay <= 20) ? 1.4 : 0.7;

  const patients  = Math.floor((15 + Math.random() * 30) * rushFactor);
  const er        = Math.floor(patients * (0.12 + Math.random() * 0.1));
  const critical  = Math.floor(er * (0.2 + Math.random() * 0.2));
  const telemed   = Math.floor(patients * (0.25 + Math.random() * 0.15));
  const waitMin   = Math.round(5 + (patients / 50) * 55 + Math.random() * 10);

  const load: SimSnapshot["load"] =
    patients > 42 ? "critical" :
    patients > 30 ? "high" :
    patients > 15 ? "normal" : "low";

  return {
    timestamp:   Date.now(),
    tick,
    patients,
    er,
    critical,
    telemed,
    waitMinutes: waitMin,
    load,
    erRate:      patients > 0 ? Math.round((er / patients) * 1000) / 1000 : 0,
  };
}

export function startLiveSimulation(intervalMs = 1000): void {
  if (_timer) return;

  _timer = setInterval(() => {
    const snapshot = makeSnapshot(++_tick);
    _latest = snapshot;
    simBus.emit("update", snapshot);
  }, intervalMs);

  console.log(`[LiveSim] Simulation tick started (${intervalMs}ms interval)`);
}

export function stopLiveSimulation(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
  console.log("[LiveSim] Simulation stopped");
}

export function getLiveSnapshot(): SimSnapshot | null {
  return _latest;
}

export function getTickCount(): number {
  return _tick;
}

export function isRunning(): boolean {
  return _timer !== null;
}
