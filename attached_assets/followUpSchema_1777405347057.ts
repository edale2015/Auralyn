/**
 * followUpSchema.ts
 * Drop into: shared/followUpSchema.ts
 *
 * Three new Postgres tables for the chronic disease follow-up subsystem.
 * Matches established schema.ts patterns exactly:
 *   - serial PK, integer FKs, timestamp defaults, jsonb for flexible fields
 *   - createInsertSchema + z.infer for type-safe inserts
 *   - No pg_cron dependency — scheduling via BullMQ delayed jobs
 *
 * Import into shared/schema.ts or directly wherever db is initialized:
 *   export * from "./followUpSchema";
 */

import { pgTable, serial, text, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { sql }                from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z }                  from "zod";

// ─── Table 1: follow_up_protocols ─────────────────────────────────────────────
// Admin-defined protocol per complaint slug.
// Each protocol defines the schedule and question set for follow-up.
// Managed via the Knowledge Base admin (Google Sheets sync or direct DB).

export const followUpProtocols = pgTable("follow_up_protocols", {
  id:           serial("id").primaryKey(),

  // Which complaint slug this protocol applies to
  complaintSlug: text("complaint_slug").notNull(),  // e.g. "hypertensive_urgency"

  // Human-readable protocol name
  name:          text("name").notNull(),             // e.g. "Post-Hypertensive Urgency"

  // JSON array of check-in days after discharge: [3, 7, 30]
  scheduleDays:  jsonb("schedule_days").notNull(),   // number[]

  // JSON array of follow-up questions sent at each check-in
  // Each question: { id, text, type: "yn"|"scale"|"text", escalateIf?: string }
  questions:     jsonb("questions").notNull(),

  // Escalation threshold — if response score >= this, alert physician
  escalationThreshold: real("escalation_threshold").default(0.7).notNull(),

  // Whether this protocol is active
  active:        boolean("active").default(true).notNull(),

  createdAt:     timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt:     timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertFollowUpProtocolSchema = createInsertSchema(followUpProtocols).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertFollowUpProtocol = z.infer<typeof insertFollowUpProtocolSchema>;
export type FollowUpProtocol       = typeof followUpProtocols.$inferSelect;


// ─── Table 2: follow_up_enrollments ──────────────────────────────────────────
// One row per patient-case enrolled in a follow-up protocol.
// Created at case discharge when the complaint matches a protocol.

export const followUpEnrollments = pgTable("follow_up_enrollments", {
  id:           serial("id").primaryKey(),

  // Case identity — Firestore caseId (string, no FK to Postgres encounters)
  caseId:       text("case_id").notNull(),

  // Patient contact — WhatsApp phone from source.threadId
  patientPhone: text("patient_phone").notNull(),

  // Patient name for personalised messages
  patientName:  text("patient_name").default("Patient").notNull(),

  // Which protocol is running
  protocolId:   integer("protocol_id")
    .notNull()
    .references(() => followUpProtocols.id),

  // Complaint slug (denormalised for fast query without join)
  complaintSlug: text("complaint_slug").notNull(),

  // Enrollment status
  status: text("status")
    .default("active")
    .notNull(),
    // "active" | "completed" | "escalated" | "unresponsive" | "withdrawn"

  // Which check-in index we're on (0 = first, 1 = second, etc.)
  currentCheckIn: integer("current_check_in").default(0).notNull(),

  // Total check-ins in this protocol (copied from protocol.scheduleDays.length)
  totalCheckIns:  integer("total_check_ins").notNull(),

  // BullMQ job ID for the next scheduled message (for cancellation)
  nextJobId:    text("next_job_id"),

  // Timestamp of discharge / enrollment
  dischargedAt: timestamp("discharged_at").default(sql`CURRENT_TIMESTAMP`).notNull(),

  // Timestamp of last patient response
  lastResponseAt: timestamp("last_response_at"),

  // Physician who discharged — for escalation routing
  physicianId:  text("physician_id"),

  createdAt:    timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt:    timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertFollowUpEnrollmentSchema = createInsertSchema(followUpEnrollments).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertFollowUpEnrollment = z.infer<typeof insertFollowUpEnrollmentSchema>;
export type FollowUpEnrollment       = typeof followUpEnrollments.$inferSelect;


// ─── Table 3: follow_up_responses ────────────────────────────────────────────
// One row per patient response to a follow-up message.
// Also records no-response (timeout) events for audit completeness.

export const followUpResponses = pgTable("follow_up_responses", {
  id:           serial("id").primaryKey(),

  enrollmentId: integer("enrollment_id")
    .notNull()
    .references(() => followUpEnrollments.id),

  // Which check-in this response belongs to (0-indexed)
  checkInIndex: integer("check_in_index").notNull(),

  // Raw patient response text (from WhatsApp inbound)
  responseText: text("response_text"),

  // Parsed structured response: { questionId → answer }
  parsedAnswers: jsonb("parsed_answers"),

  // AI-computed deterioration score 0.0–1.0
  // >= protocol.escalationThreshold → physician alert
  deteriorationScore: real("deterioration_score"),

  // Whether this response triggered a physician escalation alert
  escalated:    boolean("escalated").default(false).notNull(),

  // "responded" | "no_response" | "partial"
  responseType: text("response_type").default("responded").notNull(),

  // Outcome confirmation — did the patient recover as expected?
  outcomeConfirmed: boolean("outcome_confirmed"),

  // Sent at (when the follow-up message was sent to patient)
  sentAt:       timestamp("sent_at").default(sql`CURRENT_TIMESTAMP`).notNull(),

  // Responded at (when patient replied — null if no_response)
  respondedAt:  timestamp("responded_at"),

  createdAt:    timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertFollowUpResponseSchema = createInsertSchema(followUpResponses).omit({
  id: true, createdAt: true,
});
export type InsertFollowUpResponse = z.infer<typeof insertFollowUpResponseSchema>;
export type FollowUpResponse       = typeof followUpResponses.$inferSelect;
