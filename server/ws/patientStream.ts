import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";

let wss: WebSocketServer | null = null;

export function startPatientStreamSocket(server: Server) {
  if (wss) return;
  wss = new WebSocketServer({ server, path: "/ws/patient-stream" });

  wss.on("connection", (ws: WebSocket) => {
    ws.send(JSON.stringify({ type: "connected", ts: Date.now() }));
    ws.on("error", () => {});
  });
}

export function broadcastPatientEvent(payload: object) {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch {}
    }
  }
}
