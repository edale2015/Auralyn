/**
 * followUpSchema.ts
 *
 * Three new Postgres tables for the chronic disease follow-up subsystem.
 * Matches established schema.ts patterns exactly:
 *   - serial PK, integer FKs, timestamp defaults, jsonb for flexible fields
 *   - createInsertSchema + z.infer for type-safe inserts
 *   - No pg_cron dependency — scheduling via BullMQ delayed jobs
 */

import { pgTable, serial, text, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { sql }                from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z }                  from "zod";

// ─── Table 1: follow_up_protocols ─────────────────────────────────────────────

export const followUpProtocols = pgTable("follow_up_protocols", {
  id:           serial("id").primaryKey(),
  complaintSlug: text("complaint_slug").notNull(),
  name:          text("name").notNull(),
  scheduleDays:  jsonb("schedule_days").notNull(),
  questions:     jsonb("questions").notNull(),
  escalationThreshold: real("escalation_threshold").default(0.7).notNull(),
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

export const followUpEnrollments = pgTable("follow_up_enrollments", {
  id:           serial("id").primaryKey(),
  caseId:       text("case_id").notNull(),
  patientPhone: text("patient_phone").notNull(),
  patientName:  text("patient_name").default("Patient").notNull(),
  protocolId:   integer("protocol_id")
    .notNull()
    .references(() => followUpProtocols.id),
  complaintSlug: text("complaint_slug").notNull(),
  status: text("status").default("active").notNull(),
  currentCheckIn: integer("current_check_in").default(0).notNull(),
  totalCheckIns:  integer("total_check_ins").notNull(),
  nextJobId:    text("next_job_id"),
  dischargedAt: timestamp("discharged_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastResponseAt: timestamp("last_response_at"),
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

export const followUpResponses = pgTable("follow_up_responses", {
  id:           serial("id").primaryKey(),
  enrollmentId: integer("enrollment_id")
    .notNull()
    .references(() => followUpEnrollments.id),
  checkInIndex: integer("check_in_index").notNull(),
  responseText: text("response_text"),
  parsedAnswers: jsonb("parsed_answers"),
  deteriorationScore: real("deterioration_score"),
  escalated:    boolean("escalated").default(false).notNull(),
  responseType: text("response_type").default("responded").notNull(),
  outcomeConfirmed: boolean("outcome_confirmed"),
  sentAt:       timestamp("sent_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  respondedAt:  timestamp("responded_at"),
  createdAt:    timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertFollowUpResponseSchema = createInsertSchema(followUpResponses).omit({
  id: true, createdAt: true,
});
export type InsertFollowUpResponse = z.infer<typeof insertFollowUpResponseSchema>;
export type FollowUpResponse       = typeof followUpResponses.$inferSelect;
