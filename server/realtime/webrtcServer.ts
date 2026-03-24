import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { runMultimodalFlow } from "../multimodal/orchestrator";
import { trace } from "../lib/traceLogger";

type RTCMessageType =
  | "offer"
  | "answer"
  | "ice_candidate"
  | "ping"
  | "multimodal"
  | "subscribe"
  | "room_join"
  | "room_leave";

interface RTCMessage {
  type: RTCMessageType;
  roomId?: string;
  peerId?: string;
  payload?: Record<string, unknown>;
}

interface PeerSession {
  ws: WebSocket;
  peerId: string;
  roomId?: string;
  joinedAt: number;
}

let wss: WebSocketServer | null = null;
const peers = new Map<string, PeerSession>();
const rooms = new Map<string, Set<string>>();

let stats = { totalConnections: 0, totalMessages: 0, activeRooms: 0 };

export function initWebRTCServer(server: Server): void {
  if (wss) return;

  wss = new WebSocketServer({ server, path: "/ws/webrtc" });

  wss.on("connection", (ws: WebSocket, req) => {
    const peerId = `peer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session: PeerSession = { ws, peerId, joinedAt: Date.now() };
    peers.set(peerId, session);
    stats.totalConnections++;

    trace("webrtc_server", "peer_connected", { peerId, ip: req.socket.remoteAddress });

    ws.send(JSON.stringify({ type: "connected", peerId }));

    ws.on("message", async (raw) => {
      stats.totalMessages++;
      let msg: RTCMessage;

      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", error: "invalid_json" }));
        return;
      }

      switch (msg.type) {
        case "ping":
          ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
          break;

        case "room_join": {
          const roomId = msg.roomId ?? "default";
          session.roomId = roomId;
          if (!rooms.has(roomId)) rooms.set(roomId, new Set());
          rooms.get(roomId)!.add(peerId);
          stats.activeRooms = rooms.size;

          broadcastToRoom(roomId, { type: "peer_joined", peerId }, peerId);
          ws.send(JSON.stringify({ type: "room_joined", roomId, peers: [...(rooms.get(roomId) ?? [])].filter((p) => p !== peerId) }));
          trace("webrtc_server", "room_join", { peerId, roomId });
          break;
        }

        case "room_leave": {
          if (session.roomId) {
            leaveRoom(peerId, session.roomId);
            ws.send(JSON.stringify({ type: "room_left", roomId: session.roomId }));
          }
          break;
        }

        case "offer":
        case "answer":
        case "ice_candidate": {
          const targetId = msg.peerId;
          if (!targetId) { ws.send(JSON.stringify({ type: "error", error: "peerId required for signaling" })); break; }
          const target = peers.get(targetId);
          if (!target || target.ws.readyState !== WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "error", error: "peer_not_found", targetId }));
            break;
          }
          target.ws.send(JSON.stringify({ type: msg.type, from: peerId, payload: msg.payload }));
          trace("webrtc_server", `signal_${msg.type}`, { from: peerId, to: targetId });
          break;
        }

        case "multimodal": {
          try {
            const input = msg.payload ?? {};
            const result = await runMultimodalFlow({
              text: input.text as string | undefined,
              imageUrl: input.imageUrl as string | undefined,
              audioTranscript: input.audioTranscript as string | undefined,
              patientId: input.patientId as string | undefined,
              complaint: input.complaint as string | undefined,
            });
            ws.send(JSON.stringify({ type: "multimodal_result", result }));
          } catch (err: any) {
            ws.send(JSON.stringify({ type: "error", error: err.message }));
          }
          break;
        }

        default:
          ws.send(JSON.stringify({ type: "error", error: `unknown_type:${msg.type}` }));
      }
    });

    ws.on("close", () => {
      if (session.roomId) leaveRoom(peerId, session.roomId);
      peers.delete(peerId);
      trace("webrtc_server", "peer_disconnected", { peerId });
    });
  });

  console.log("[WebRTC] Signaling server initialized at /ws/webrtc");
}

function broadcastToRoom(roomId: string, msg: Record<string, unknown>, excludePeerId?: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const payload = JSON.stringify(msg);
  for (const pid of room) {
    if (pid === excludePeerId) continue;
    const peer = peers.get(pid);
    if (peer?.ws.readyState === WebSocket.OPEN) peer.ws.send(payload);
  }
}

function leaveRoom(peerId: string, roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  room.delete(peerId);
  if (room.size === 0) rooms.delete(roomId);
  else broadcastToRoom(roomId, { type: "peer_left", peerId });
  stats.activeRooms = rooms.size;
}

export function getWebRTCStats() {
  return {
    ...stats,
    connectedPeers: peers.size,
    activeRooms: rooms.size,
    rooms: [...rooms.entries()].map(([id, set]) => ({ id, peers: set.size })),
    initialized: Boolean(wss),
  };
}
