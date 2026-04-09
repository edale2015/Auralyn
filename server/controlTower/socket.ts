/**
 * Control Tower WebSocket — Packet 16 rewrite
 *
 * Fixes applied vs the original:
 *  1. Ping/pong heartbeat (30s interval) — dead connections detected and
 *     terminated within one heartbeat cycle instead of accumulating forever.
 *  2. isAlive flag — set on pong, cleared on each ping. Connection is
 *     terminated if it doesn't respond before the next ping.
 *  3. Backpressure guard — client.send() is skipped when bufferedAmount
 *     exceeds 256 KB, preventing memory blow-up on slow clients.
 *  4. Error logging — client errors are logged (not silently swallowed).
 *     The empty handler was preventing Node.js from treating the error as
 *     an uncaught EventEmitter error, but it also hid real problems.
 *  5. Cleanup on close — isAlive tracking reference is released on disconnect.
 */

import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { subscribeToTower } from "./eventBus";
import { getState } from "./aggregator";

let wss: WebSocketServer | null = null;

const HEARTBEAT_INTERVAL_MS = 30_000;
const BACKPRESSURE_LIMIT_BYTES = 256 * 1024;

type LiveClient = WebSocket & { isAlive?: boolean };

function safeSend(client: LiveClient, msg: string): void {
  if (client.readyState !== WebSocket.OPEN) return;
  if ((client.bufferedAmount ?? 0) > BACKPRESSURE_LIMIT_BYTES) {
    console.warn("[ControlTower] Skipping send — client buffer full");
    return;
  }
  try {
    client.send(msg);
  } catch (err) {
    console.error("[ControlTower] send error:", (err as Error).message);
  }
}

export function initControlTowerSocket(httpServer: Server): void {
  wss = new WebSocketServer({ server: httpServer, path: "/ws/control-tower" });

  const heartbeat = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((raw) => {
      const client = raw as LiveClient;
      if (client.isAlive === false) {
        client.terminate();
        return;
      }
      client.isAlive = false;
      client.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (raw: WebSocket, _req: IncomingMessage) => {
    const client = raw as LiveClient;
    client.isAlive = true;

    const snapshot = JSON.stringify({ type: "SNAPSHOT", data: getState() });
    safeSend(client, snapshot);

    client.on("pong", () => {
      client.isAlive = true;
    });

    client.on("error", (err) => {
      console.error("[ControlTower] client error:", err.message);
    });

    client.on("close", () => {
      client.isAlive = false;
    });
  });

  subscribeToTower((event) => {
    if (!wss) return;
    const msg = JSON.stringify({ type: "EVENT", event, state: getState() });
    wss.clients.forEach((raw) => safeSend(raw as LiveClient, msg));
  });

  console.log("[ControlTower] WebSocket initialized at /ws/control-tower");
}

export function getConnectedClients(): number {
  return wss?.clients.size ?? 0;
}
