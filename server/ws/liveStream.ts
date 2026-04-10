import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { simBus, getLiveSnapshot, isRunning } from "../simulation/liveSimulator";

let wss: WebSocketServer | null = null;
let _connCount = 0;

function broadcast(payload: object): void {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch {}
    }
  }
}

export function startLiveStream(server: Server): void {
  if (wss) return;

  wss = new WebSocketServer({ server, path: "/ws/live-simulation" });

  simBus.on("update", (snapshot) => {
    broadcast({ type: "sim_tick", ...snapshot });
  });

  wss.on("connection", (ws: WebSocket) => {
    _connCount++;

    ws.send(JSON.stringify({
      type:      "connected",
      ts:        Date.now(),
      running:   isRunning(),
      snapshot:  getLiveSnapshot(),
    }));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        }
      } catch {}
    });

    ws.on("close",  () => { _connCount = Math.max(0, _connCount - 1); });
    ws.on("error",  () => {});
  });

  console.log("[LiveStream] WebSocket live simulation at /ws/live-simulation");
}

export function getLiveStreamStats(): { connections: number; running: boolean } {
  return { connections: _connCount, running: isRunning() };
}
