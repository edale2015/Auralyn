/**
 * Patient Stream — WebSocket broadcast layer.
 * Attaches to the existing HTTP server so no extra port is needed.
 * Clients connect to the same ws://host/ as the web app.
 */

import { WebSocketServer, WebSocket } from "ws";

let wss: WebSocketServer | null = null;
let clients: Set<WebSocket> = new Set();

export function initPatientStream(server: any): void {
  if (wss) return; // already initialised

  wss = new WebSocketServer({ server, path: "/ws/patients" });

  wss.on("connection", (ws) => {
    clients.add(ws);

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", () => {
      clients.delete(ws);
    });

    // Send a welcome ping so the client knows it's connected
    ws.send(JSON.stringify({ type: "connected", message: "Auralyn patient stream live", ts: Date.now() }));
  });

  console.log("[PatientStream] WebSocket server attached at /ws/patients");
}

export function broadcastPatientUpdate(data: Record<string, unknown>): void {
  const msg = JSON.stringify({ type: "patient_update", ...data, ts: Date.now() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

export function broadcastDiagnosticResult(caseId: string, result: Record<string, unknown>): void {
  const msg = JSON.stringify({ type: "diagnostic_result", caseId, ...result, ts: Date.now() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

export function clientCount(): number {
  return clients.size;
}

export function isInitialised(): boolean {
  return wss !== null;
}
