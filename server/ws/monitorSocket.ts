import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { getEngines, getSkills } from "../monitoring/healthRegistry";
import { detectDegradation } from "../monitoring/trendMonitor";

let wss: WebSocketServer | null = null;

function broadcast(payload: object) {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch {}
    }
  }
}

export function startMonitorSocket(server: Server) {
  if (wss) return;
  wss = new WebSocketServer({ server, path: "/ws/monitor" });

  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({
      type: "monitor_update",
      engines:     getEngines(),
      skills:      getSkills(),
      degradation: detectDegradation(),
      ts:          Date.now(),
    }));

    const interval = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) { clearInterval(interval); return; }
      try {
        ws.send(JSON.stringify({
          type:        "monitor_update",
          engines:     getEngines(),
          skills:      getSkills(),
          degradation: detectDegradation(),
          ts:          Date.now(),
        }));
      } catch { clearInterval(interval); }
    }, 2000);

    ws.on("close", () => clearInterval(interval));
    ws.on("error", () => { clearInterval(interval); ws.terminate(); });
  });

  console.log("[MonitorSocket] Live monitor WebSocket initialized at /ws/monitor");
}

export function pushMonitorUpdate() {
  broadcast({
    type:        "monitor_update",
    engines:     getEngines(),
    skills:      getSkills(),
    degradation: detectDegradation(),
    ts:          Date.now(),
  });
}
