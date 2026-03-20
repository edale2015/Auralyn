import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { subscribeToTower } from "./eventBus";
import { getState } from "./aggregator";

let wss: WebSocketServer | null = null;

export function initControlTowerSocket(httpServer: Server): void {
  wss = new WebSocketServer({ server: httpServer, path: "/ws/control-tower" });

  wss.on("connection", (client: WebSocket, _req: IncomingMessage) => {
    const snapshot = JSON.stringify({ type: "SNAPSHOT", data: getState() });
    if (client.readyState === WebSocket.OPEN) {
      client.send(snapshot);
    }

    client.on("error", () => {});
  });

  subscribeToTower((event) => {
    if (!wss) return;
    const msg = JSON.stringify({ type: "EVENT", event, state: getState() });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(msg); } catch (_) {}
      }
    });
  });

  console.log("[ControlTower] WebSocket initialized at /ws/control-tower");
}

export function getConnectedClients(): number {
  return wss?.clients.size ?? 0;
}
