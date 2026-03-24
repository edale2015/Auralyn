import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { subscribeToRooms, getAllRooms, type Room } from "./roomManager";

let wss: WebSocketServer | null = null;

export function initOrchestrationSocket(server: Server): void {
  if (wss) return;

  wss = new WebSocketServer({ server, path: "/ws/orchestration" });

  wss.on("connection", (ws: WebSocket) => {
    ws.send(JSON.stringify({ type: "snapshot", rooms: getAllRooms() }));

    const unsub = subscribeToRooms((rooms: Room[]) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "rooms_update", rooms, ts: Date.now() }));
        } catch (_) {}
      }
    });

    ws.on("close", unsub);
    ws.on("error", unsub);
  });

  console.log("[OrchestrationSocket] Multi-room dashboard initialized at /ws/orchestration");
}

export function broadcastRoomUpdate(rooms: Room[]): void {
  if (!wss) return;
  const msg = JSON.stringify({ type: "rooms_update", rooms, ts: Date.now() });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch (_) {}
    }
  }
}
