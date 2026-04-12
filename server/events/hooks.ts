import { bus } from "./eventBus";

export interface ControlTowerLogEntry {
  tool:      string;
  input:     Record<string, unknown>;
  output:    unknown;
  timestamp: string;
  sessionId?: string;
}

const _controlTowerLog: ControlTowerLogEntry[] = [];
const MAX_LOG_ENTRIES = 1000;

function logToControlTower(entry: ControlTowerLogEntry): void {
  _controlTowerLog.unshift(entry);
  if (_controlTowerLog.length > MAX_LOG_ENTRIES) {
    _controlTowerLog.splice(MAX_LOG_ENTRIES);
  }
}

export function getControlTowerLog(limit = 50): ControlTowerLogEntry[] {
  return _controlTowerLog.slice(0, limit);
}

// Wire: every tool_use result is captured for control tower
bus.on("post_tool_use", (payload) => {
  logToControlTower({
    tool:      (payload.toolCall as any)?.name ?? "unknown",
    input:     (payload.toolCall as any)?.input ?? {},
    output:    payload.output,
    sessionId: payload.sessionId as string | undefined,
    timestamp: new Date().toISOString(),
  });
});

// Wire: session lifecycle events
bus.on("session_start", (payload) => {
  logToControlTower({
    tool:      "__session_start",
    input:     { sessionId: payload.sessionId },
    output:    { complaint: payload.complaint },
    sessionId: payload.sessionId as string | undefined,
    timestamp: new Date().toISOString(),
  });
});

bus.on("session_end", (payload) => {
  logToControlTower({
    tool:      "__session_end",
    input:     { sessionId: payload.sessionId },
    output:    { iterations: payload.iterations },
    sessionId: payload.sessionId as string | undefined,
    timestamp: new Date().toISOString(),
  });
});
