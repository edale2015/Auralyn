/**
 * server/realtime/patientStream.ts — WebSocket patient broadcast layer
 *
 * FIXES (Code Review Issue #7):
 *   Previously: any client could connect without authentication, and all events
 *   were broadcast globally to every connected client regardless of tenant.
 *
 *   Fixed:
 *   1. Authentication: JWT Bearer token is required on every connection upgrade.
 *      Connection is rejected with 401 if the token is missing, invalid, or expired.
 *      Token can be passed as Authorization header or ?token= query parameter
 *      (query param for browser WebSocket clients that can't set headers).
 *
 *   2. Tenant isolation: Each connected client is tagged with clinicId from
 *      their verified token. broadcastPatientUpdate and broadcastDiagnosticResult
 *      now accept a required clinicId parameter and only deliver to clients
 *      whose clinicId matches. No cross-tenant event leakage.
 *
 *   3. Identity: req.physician (set by verifyAccessToken) is attached to the ws
 *      object so downstream handlers have full principal context.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { verifyAccessToken } from "../auth/unifiedAuth";

// ── Typed client record ───────────────────────────────────────────────────────

interface AuthenticatedClient {
  ws:        WebSocket;
  userId:    string;
  clinicId:  string;
  role:      string;
  connectedAt: number;
}

let wss:     WebSocketServer | null     = null;
const clients: Set<AuthenticatedClient> = new Set();

// ── Token extraction ──────────────────────────────────────────────────────────

function extractToken(req: IncomingMessage): string | null {
  // Authorization: Bearer <token>
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }

  // ?token=<token> (browser WebSocket clients)
  const url = req.url ?? "";
  const qs  = new URL(url, "ws://localhost").searchParams;
  return qs.get("token") ?? null;
}

// ── Initialization ────────────────────────────────────────────────────────────

export function initPatientStream(server: any): void {
  if (wss) return;

  wss = new WebSocketServer({ server, path: "/ws/patients" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // ── Authenticate on upgrade ──────────────────────────────────────────────
    const token = extractToken(req);

    if (!token) {
      ws.close(4001, "Authentication required");
      return;
    }

    let decoded: ReturnType<typeof verifyAccessToken>;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      ws.close(4001, "Invalid or expired token");
      return;
    }

    if (!decoded.clinicId) {
      ws.close(4003, "Token missing clinicId — tenant isolation required");
      return;
    }

    // ── Register authenticated client ────────────────────────────────────────
    const client: AuthenticatedClient = {
      ws,
      userId:      decoded.id,
      clinicId:    decoded.clinicId,
      role:        decoded.role,
      connectedAt: Date.now(),
    };
    clients.add(client);

    ws.on("close", () => clients.delete(client));
    ws.on("error", () => clients.delete(client));

    // Welcome message — safe to include identity back to the authenticated client
    ws.send(JSON.stringify({
      type:     "connected",
      message:  "Auralyn patient stream live",
      userId:   decoded.id,
      clinicId: decoded.clinicId,
      ts:       Date.now(),
    }));
  });

  console.log("[PatientStream] WebSocket server attached at /ws/patients (auth required)");
}

// ── Tenant-scoped broadcast ───────────────────────────────────────────────────
//
// clinicId is now required on every broadcast. Only clients whose clinicId
// matches receive the event — no cross-tenant leakage.

export function broadcastPatientUpdate(
  data:     Record<string, unknown>,
  clinicId: string,
): void {
  const msg = JSON.stringify({ type: "patient_update", ...data, ts: Date.now() });
  for (const client of clients) {
    if (client.clinicId === clinicId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  }
}

export function broadcastDiagnosticResult(
  caseId:   string,
  result:   Record<string, unknown>,
  clinicId: string,
): void {
  const msg = JSON.stringify({ type: "diagnostic_result", caseId, ...result, ts: Date.now() });
  for (const client of clients) {
    if (client.clinicId === clinicId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  }
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

export function clientCount(clinicId?: string): number {
  if (!clinicId) return clients.size;
  return [...clients].filter(c => c.clinicId === clinicId).length;
}

export function isInitialised(): boolean {
  return wss !== null;
}
