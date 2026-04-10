import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { controlBus } from "./controlBus";

export function startControlStream(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws/control" });

  wss.on("connection", (ws: WebSocket) => {
    const handler = (data: unknown) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    };

    controlBus.on("update", handler);

    ws.on("close", () => controlBus.off("update", handler));
    ws.on("error", () => controlBus.off("update", handler));

    ws.send(JSON.stringify({ event: "connected", ts: Date.now() }));
  });

  console.log("[ControlStream] Unified WebSocket at /ws/control");
}
