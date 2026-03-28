import { getEngines, resetEngineStatus, heartbeatEngine, registerEngine } from "./healthRegistry";
import { trackLatency, detectDegradation } from "./trendMonitor";

const healLog: Array<{ ts: number; engine: string; action: string }> = [];

function logHeal(engine: string, action: string) {
  healLog.push({ ts: Date.now(), engine, action });
  if (healLog.length > 100) healLog.shift();
  console.log(`[AutoHealer] ${action} → ${engine}`);
}

export function autoHeal(): string[] {
  const actions: string[] = [];
  const engines = getEngines();

  for (const e of engines) {
    if (e.status === "red") {
      resetEngineStatus(e.name);
      heartbeatEngine(e.name);
      logHeal(e.name, "reset_red→green");
      actions.push(`Healed engine: ${e.name}`);
    }

    const staleSec = (Date.now() - e.lastHeartbeat) / 1000;
    if (staleSec > 60 && e.status !== "red") {
      e.status = "yellow";
      logHeal(e.name, "marked_stale_yellow");
      actions.push(`Stale engine flagged: ${e.name}`);
    }
  }

  const degraded = detectDegradation();
  for (const d of degraded) {
    logHeal(d.name, `trend_${d.trend}_avg${d.avgLatencyMs}ms`);
    actions.push(`Degradation detected: ${d.name} avg=${d.avgLatencyMs}ms trend=${d.trend}`);
  }

  return actions;
}

export function getHealLog() {
  return healLog.slice().reverse();
}

let healTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoHealer() {
  if (healTimer) return;
  healTimer = setInterval(() => autoHeal(), 15_000);
  console.log("[AutoHealer] Started (15s interval)");
}

export function stopAutoHealer() {
  if (healTimer) { clearInterval(healTimer); healTimer = null; }
}
