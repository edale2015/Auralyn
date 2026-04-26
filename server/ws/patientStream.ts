import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import { authenticateWsRequest, type RequestUser } from "../security/session";
import { sanitizeAgentCycleForSocket } from "../security/phi";

let wss: WebSocketServer | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
const clientUsers = new WeakMap<WebSocket, RequestUser>();

function allowedOrigins(): string[] {
  return (process.env.ALLOWED_WS_ORIGINS || process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function sameHostOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  const explicit = allowedOrigins();
  if (!origin) return process.env.NODE_ENV !== "production";
  if (explicit.length === 0) return sameHostOrigin(req);
  return explicit.includes(origin);
}

function closePolicy(ws: WebSocket, reason: string): void {
  try {
    ws.close(1008, reason.slice(0, 120));
  } catch {
    try { ws.terminate(); } catch {}
  }
}

function installHeartbeat(server: WebSocketServer): void {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = setInterval(() => {
    for (const ws of server.clients) {
      const anyWs = ws as WebSocket & { isAlive?: boolean };
      if (anyWs.isAlive === false) {
        try { ws.terminate(); } catch {}
        continue;
      }
      anyWs.isAlive = false;
      try { ws.ping(); } catch {}
    }
  }, 30_000);
}

export function startPatientStreamSocket(server: Server) {
  if (wss) return;

  wss = new WebSocketServer({
    server,
    path: "/ws/patient-stream",
    maxPayload: 16 * 1024,
  });

  installHeartbeat(wss);

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const anyWs = ws as WebSocket & { isAlive?: boolean };
    anyWs.isAlive = true;

    if (!isAllowedOrigin(req)) {
      closePolicy(ws, "Origin not allowed");
      return;
    }

    const user = authenticateWsRequest(req);
    if (!user) {
      closePolicy(ws, "Authentication required");
      return;
    }

    clientUsers.set(ws, user);

    ws.send(JSON.stringify({
      type: "connected",
      ts: Date.now(),
      role: user.role,
      phiMode: process.env.AURALYN_WS_ALLOW_VITALS === "true" ? "limited-clinical" : "redacted",
    }));

    ws.on("pong", () => { anyWs.isAlive = true; });
    ws.on("error", () => {});

    ws.on("message", (raw) => {
      // This endpoint is broadcast-only. Accept tiny ping messages; reject anything else.
      if (raw.length > 1024) {
        closePolicy(ws, "Message too large");
        return;
      }
      try {
        const parsed = JSON.parse(String(raw));
        if (parsed?.type === "ping") ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      } catch {
        // Ignore malformed client chatter rather than echoing it.
      }
    });
  });

  wss.on("close", () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  });
}

export function broadcastPatientEvent(payload: object) {
  if (!wss) return;
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    const user = clientUsers.get(client);
    if (!user) continue;
    try {
      client.send(JSON.stringify(sanitizeAgentCycleForSocket(payload, user)));
    } catch {
      // Never throw from a broadcast path.
    }
  }
}

export function getPatientStreamStats() {
  return {
    running: !!wss,
    clients: wss?.clients.size ?? 0,
    phiMode: process.env.AURALYN_WS_ALLOW_VITALS === "true" ? "limited-clinical" : "redacted",
  };
}
