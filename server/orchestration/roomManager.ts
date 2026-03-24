import { auditLog } from "../security/auditLogger";

export type RoomStatus = "waiting" | "active" | "pending_review" | "escalated" | "complete";

export interface Room {
  caseId: string;
  patientId?: string;
  complaint: string;
  status: RoomStatus;
  riskScore: number;
  protocolId?: string;
  currentStep?: string;
  lastUpdate: number;
  createdAt: number;
  physicianId?: string;
  channel?: "web" | "phone" | "whatsapp" | "telegram";
  flags?: string[];
  context?: Record<string, unknown>;
}

const rooms = new Map<string, Room>();
const subscribers: Array<(rooms: Room[]) => void> = [];

export function upsertRoom(caseId: string, data: Partial<Room>): Room {
  const existing = rooms.get(caseId);
  const now = Date.now();

  const updated: Room = {
    caseId,
    complaint: "unknown",
    status: "waiting",
    riskScore: 0,
    lastUpdate: now,
    createdAt: existing?.createdAt ?? now,
    ...existing,
    ...data,
  };

  rooms.set(caseId, updated);

  auditLog({
    actor: "room_manager",
    action: "room_upserted",
    entityType: "room",
    entityId: caseId,
    patientId: updated.patientId,
    details: { status: updated.status, riskScore: updated.riskScore },
  });

  notifySubscribers();
  return updated;
}

export function getRoom(caseId: string): Room | undefined {
  return rooms.get(caseId);
}

export function deleteRoom(caseId: string): boolean {
  const existed = rooms.has(caseId);
  if (existed) {
    rooms.delete(caseId);
    notifySubscribers();
  }
  return existed;
}

export function getAllRooms(): Room[] {
  return [...rooms.values()].sort((a, b) => b.riskScore - a.riskScore);
}

export function getRoomsByStatus(status: RoomStatus): Room[] {
  return getAllRooms().filter((r) => r.status === status);
}

export function getRoomSummary(): {
  total: number;
  byStatus: Record<RoomStatus, number>;
  highRisk: number;
  escalated: number;
} {
  const all = getAllRooms();
  const byStatus = { waiting: 0, active: 0, pending_review: 0, escalated: 0, complete: 0 };
  for (const r of all) byStatus[r.status]++;

  return {
    total: all.length,
    byStatus,
    highRisk: all.filter((r) => r.riskScore >= 0.7).length,
    escalated: byStatus.escalated,
  };
}

export function subscribeToRooms(fn: (rooms: Room[]) => void): () => void {
  subscribers.push(fn);
  return () => {
    const idx = subscribers.indexOf(fn);
    if (idx >= 0) subscribers.splice(idx, 1);
  };
}

function notifySubscribers(): void {
  const snapshot = getAllRooms();
  for (const fn of subscribers) {
    try { fn(snapshot); } catch (_) {}
  }
}

function seedDemoRooms(): void {
  const demos: Array<Partial<Room> & { caseId: string }> = [
    { caseId: "case-001", complaint: "sore_throat", status: "active", riskScore: 0.72, channel: "web", protocolId: "sore_throat_v1" },
    { caseId: "case-002", complaint: "ear_pain", status: "pending_review", riskScore: 0.45, channel: "phone", protocolId: "ear_pain_v1" },
    { caseId: "case-003", complaint: "flu_like", status: "waiting", riskScore: 0.2, channel: "whatsapp", protocolId: "flu_v1" },
    { caseId: "case-004", complaint: "rash", status: "escalated", riskScore: 0.91, channel: "telegram", flags: ["anaphylaxis_risk"] },
    { caseId: "case-005", complaint: "sore_throat", status: "complete", riskScore: 0.3, channel: "web" },
  ];
  for (const d of demos) upsertRoom(d.caseId, d);
}

seedDemoRooms();
