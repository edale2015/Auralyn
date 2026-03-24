import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { runMultimodalFlow } from "./orchestrator";
import { auditLog } from "../security/auditLogger";

let wss: WebSocketServer | null = null;

export interface RealtimeMessage {
  type: "text" | "image" | "audio" | "video" | "ping";
  sessionId?: string;
  patientId?: string;
  text?: string;
  imageUrl?: string;
  audioTranscript?: string;
  videoFrame?: string;
  complaint?: string;
}

export function initRealtimeGateway(server: Server): void {
  if (wss) return;

  wss = new WebSocketServer({ server, path: "/ws/multimodal" });

  wss.on("connection", (ws: WebSocket, req) => {
    const ip = req.socket.remoteAddress;
    auditLog({ actor: "realtime_gateway", action: "client_connected", details: { ip } });

    let sessionId: string | undefined;

    ws.on("message", async (rawData) => {
      let input: RealtimeMessage;
      try {
        input = JSON.parse(rawData.toString());
      } catch {
        ws.send(JSON.stringify({ error: "invalid_json" }));
        return;
      }

      if (input.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        return;
      }

      if (input.sessionId) sessionId = input.sessionId;

      try {
        const result = await runMultimodalFlow({
          text: input.text,
          imageUrl: input.imageUrl,
          audioTranscript: input.audioTranscript,
          videoFrame: input.videoFrame,
          patientId: input.patientId,
          complaint: input.complaint,
        });

        ws.send(JSON.stringify({ type: "result", sessionId, result, ts: Date.now() }));

        if (result.requiresEscalation) {
          ws.send(JSON.stringify({ type: "escalation", nextStep: result.nextStep, redFlags: result.structured.redFlags, ts: Date.now() }));
        }
      } catch (err: any) {
        ws.send(JSON.stringify({ type: "error", error: err.message, ts: Date.now() }));
      }
    });

    ws.on("close", () => {
      auditLog({ actor: "realtime_gateway", action: "client_disconnected", details: { sessionId } });
    });

    ws.send(JSON.stringify({ type: "connected", message: "Multimodal gateway ready", ts: Date.now() }));
  });

  console.log("[RealtimeGateway] Multimodal WebSocket gateway initialized at /ws/multimodal");
}

export function broadcastAlert(payload: object): void {
  if (!wss) return;
  const msg = JSON.stringify({ type: "alert", ...payload, ts: Date.now() });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

export function getGatewayStats(): { clients: number; initialized: boolean } {
  return { clients: wss?.clients.size ?? 0, initialized: Boolean(wss) };
}
