/**
 * Scheduling Engine — Appointment and clinical scheduling
 * Supports priority queuing, wait-time estimation, and provider capacity.
 */

import { randomUUID } from "crypto";

export type AppointmentType = "URGENT" | "FOLLOW_UP" | "NEW_PATIENT" | "PROCEDURE" | "TELEHEALTH";
export type AppointmentStatus  = "SCHEDULED" | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type Priority = 1 | 2 | 3 | 4 | 5; // 1=critical, 5=routine

export interface Appointment {
  id:          string;
  patientId:   string;
  patientName: string;
  type:        AppointmentType;
  priority:    Priority;
  providerId:  string;
  scheduledAt: string;       // ISO
  durationMin: number;
  status:      AppointmentStatus;
  complaint?:  string;
  createdAt:   string;
}

export interface BookingRequest {
  patientId:   string;
  patientName: string;
  type:        AppointmentType;
  priority?:   Priority;
  providerId:  string;
  scheduledAt: string;
  durationMin?: number;
  complaint?:  string;
}

export interface WaitTimeEstimate {
  patientId:     string;
  estimatedWait: number;   // minutes
  queuePosition: number;
  priority:      Priority;
}

// In-memory store (replace with DB in production)
const appointments = new Map<string, Appointment>();

// Seed with some realistic appointments
const PROVIDERS = ["DR_PATEL", "DR_CHEN", "DR_JOHNSON", "NP_WILLIAMS"];
const seed: BookingRequest[] = [
  { patientId: "P001", patientName: "Maria Rivera",   type: "URGENT",    priority: 1, providerId: "DR_PATEL",   scheduledAt: new Date(Date.now() + 15  * 60000).toISOString(), durationMin: 30, complaint: "chest pain" },
  { patientId: "P002", patientName: "James Lee",      type: "FOLLOW_UP", priority: 3, providerId: "DR_CHEN",    scheduledAt: new Date(Date.now() + 60  * 60000).toISOString(), durationMin: 20, complaint: "diabetes check" },
  { patientId: "P003", patientName: "Sarah Cohen",    type: "NEW_PATIENT",priority:4, providerId: "NP_WILLIAMS",scheduledAt: new Date(Date.now() + 120 * 60000).toISOString(), durationMin: 45 },
  { patientId: "P004", patientName: "Robert Kim",     type: "URGENT",    priority: 2, providerId: "DR_JOHNSON", scheduledAt: new Date(Date.now() + 10  * 60000).toISOString(), durationMin: 25, complaint: "shortness of breath" },
];
for (const s of seed) bookAppointment(s);

export function bookAppointment(req: BookingRequest): Appointment {
  const appt: Appointment = {
    id:          randomUUID(),
    patientId:   req.patientId,
    patientName: req.patientName,
    type:        req.type,
    priority:    req.priority ?? 3,
    providerId:  req.providerId,
    scheduledAt: req.scheduledAt,
    durationMin: req.durationMin ?? 30,
    status:      "SCHEDULED",
    complaint:   req.complaint,
    createdAt:   new Date().toISOString(),
  };
  appointments.set(appt.id, appt);
  return appt;
}

export function cancelAppointment(id: string): boolean {
  const appt = appointments.get(id);
  if (!appt) return false;
  appt.status = "CANCELLED";
  return true;
}

export function updateStatus(id: string, status: AppointmentStatus): boolean {
  const appt = appointments.get(id);
  if (!appt) return false;
  appt.status = status;
  return true;
}

export function listAppointments(filter?: { providerId?: string; status?: AppointmentStatus; date?: string }): Appointment[] {
  let list = [...appointments.values()];
  if (filter?.providerId) list = list.filter((a) => a.providerId === filter.providerId);
  if (filter?.status)     list = list.filter((a) => a.status === filter.status);
  if (filter?.date) {
    const prefix = filter.date.slice(0, 10);
    list = list.filter((a) => a.scheduledAt.startsWith(prefix));
  }
  return list.sort((a, b) => a.priority - b.priority || a.scheduledAt.localeCompare(b.scheduledAt));
}

export function estimateWaitTime(patientId: string, priority: Priority): WaitTimeEstimate {
  const queue = listAppointments({ status: "SCHEDULED" })
    .filter((a) => a.priority <= priority && a.patientId !== patientId);
  const waitMin = queue.reduce((sum, a) => sum + a.durationMin, 0);
  return { patientId, estimatedWait: waitMin, queuePosition: queue.length + 1, priority };
}

export function getScheduleSummary() {
  const all     = [...appointments.values()];
  const byStatus: Record<string, number> = {};
  for (const a of all) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  const urgent  = all.filter((a) => a.priority <= 2 && a.status === "SCHEDULED");
  const avgWait = urgent.length ? Math.round(urgent.reduce((s, a) => s + a.durationMin, 0) / urgent.length) : 0;
  return { total: all.length, byStatus, urgentQueued: urgent.length, avgUrgentWaitMin: avgWait, providers: PROVIDERS };
}
