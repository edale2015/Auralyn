import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, boolean, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Physicians (users who can approve cases)
export const physicians = pgTable("physicians", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  specialty: text("specialty"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPhysicianSchema = createInsertSchema(physicians).omit({
  id: true,
  createdAt: true,
});

export type InsertPhysician = z.infer<typeof insertPhysicianSchema>;
export type Physician = typeof physicians.$inferSelect;

// Patients (from WhatsApp)
export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPatientSchema = createInsertSchema(patients).omit({
  id: true,
  createdAt: true,
});

export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patients.$inferSelect;

// Encounters (medical cases)
export const encounters = pgTable("encounters", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id),
  chiefComplaint: text("chief_complaint"),
  conversationHistory: text("conversation_history"), // JSON string of WhatsApp messages
  aiDiagnosis: text("ai_diagnosis"),
  aiDisposition: text("ai_disposition"),
  aiConfidence: integer("ai_confidence"), // 0-100
  status: text("status").notNull().default("gathering_info"), // gathering_info, in_progress, pending_review, approved, rejected
  urgencyLevel: text("urgency_level").default("routine"), // routine, urgent, emergent
  physicianId: integer("physician_id").references(() => physicians.id),
  physicianDiagnosis: text("physician_diagnosis"),
  physicianDisposition: text("physician_disposition"),
  physicianNotes: text("physician_notes"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  // ENT Flu Flow fields
  system: text("system"), // e.g., "ENT"
  complaint: text("complaint"), // e.g., "FLU_LIKE_URI"
  specialty: text("specialty"), // e.g., "ENT"
  flowId: text("flow_id"), // e.g., "ENT_FLU_LIKE_V1"
  flowIndex: integer("flow_index").default(0), // current question index
  answers: text("answers"), // JSON string of collected answers
  proposal: text("proposal"), // JSON string of computed proposal
  physicianSummary: text("physician_summary"), // JSON string of summary for physician
  // Intake case linking
  intakeCaseId: text("intake_case_id"), // links to intake case from portal workflow
  intakeLinkEvents: text("intake_link_events"), // JSON array of link/unlink audit events
  intakeLinkedAt: timestamp("intake_linked_at"), // when the intake case was last linked
  intakeToken: text("intake_token"), // token for patient intake link
  intakeCode: text("intake_code"), // 6-digit verification code for intake
  intakeExpiresAt: text("intake_expires_at"), // expiration timestamp for intake link
});

export const insertEncounterSchema = createInsertSchema(encounters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
});

export type InsertEncounter = z.infer<typeof insertEncounterSchema>;
export type Encounter = typeof encounters.$inferSelect;

// Orders (prescriptions, referrals, labs, etc.)
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  encounterId: integer("encounter_id").notNull().references(() => encounters.id),
  orderType: text("order_type").notNull(), // prescription, lab, imaging, referral
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  aiGenerated: boolean("ai_generated").default(true),
  physicianApproved: boolean("physician_approved").default(false),
  physicianId: integer("physician_id").references(() => physicians.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// WhatsApp Messages Log
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: serial("id").primaryKey(),
  encounterId: integer("encounter_id").references(() => encounters.id),
  patientId: integer("patient_id").notNull().references(() => patients.id),
  direction: text("direction").notNull(), // inbound, outbound
  messageBody: text("message_body").notNull(),
  messageSid: text("message_sid"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertWhatsappMessageSchema = createInsertSchema(whatsappMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertWhatsappMessage = z.infer<typeof insertWhatsappMessageSchema>;
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;

// Legacy users table for compatibility
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Outcome learning records
export const outcomes = pgTable("outcomes", {
  id: serial("id").primaryKey(),
  input: jsonb("input"),
  predicted: text("predicted"),
  actual: text("actual"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertOutcomeSchema = createInsertSchema(outcomes).omit({ id: true, createdAt: true });
export type InsertOutcome = z.infer<typeof insertOutcomeSchema>;
export type Outcome = typeof outcomes.$inferSelect;

// Diagnosis weights (learning system)
export const weights = pgTable("weights", {
  id: serial("id").primaryKey(),
  diagnosis: text("diagnosis").notNull().unique(),
  value: real("value").default(1.0),
});
export const insertWeightSchema = createInsertSchema(weights).omit({ id: true });
export type InsertWeight = z.infer<typeof insertWeightSchema>;
export type Weight = typeof weights.$inferSelect;

// Engine execution logs (monitoring)
export const engineLogs = pgTable("engine_logs", {
  id: serial("id").primaryKey(),
  engine: text("engine").notNull(),
  status: text("status").notNull(),
  latencyMs: integer("latency_ms"),
  error: text("error"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertEngineLogSchema = createInsertSchema(engineLogs).omit({ id: true, createdAt: true });
export type InsertEngineLog = z.infer<typeof insertEngineLogSchema>;
export type EngineLog = typeof engineLogs.$inferSelect;

// Digital twin simulation runs
export const simulations = pgTable("simulations", {
  id: serial("id").primaryKey(),
  input: jsonb("input"),
  result: jsonb("result"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertSimulationSchema = createInsertSchema(simulations).omit({ id: true, createdAt: true });
export type InsertSimulation = z.infer<typeof insertSimulationSchema>;
export type Simulation = typeof simulations.$inferSelect;

// Immutable audit trace logs (with SHA-256 hash chain)
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  traceId: text("trace_id").notNull(),
  step: text("step").notNull(),
  input: jsonb("input"),
  output: jsonb("output"),
  metadata: jsonb("metadata"),
  hash: text("hash"),
  prevHash: text("prev_hash"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Model versioning — snapshot of diagnosis weights after each learning cycle
export const modelVersions = pgTable("model_versions", {
  id: serial("id").primaryKey(),
  weights: jsonb("weights").notNull(),
  cycleCount: integer("cycle_count"),
  triggeredBy: text("triggered_by"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertModelVersionSchema = createInsertSchema(modelVersions).omit({ id: true, createdAt: true });
export type InsertModelVersion = z.infer<typeof insertModelVersionSchema>;
export type ModelVersion = typeof modelVersions.$inferSelect;

// Patient sessions (persistent queue — replaces in-memory store)
export const patientSessions = pgTable("patient_sessions", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  riskLevel: text("risk_level"),
  safetyFlags: jsonb("safety_flags").default([]),
  disposition: jsonb("disposition"),
  approvedBy: text("approved_by"),
  overrideData: jsonb("override_data"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export type PatientSessionRow = typeof patientSessions.$inferSelect;

// Alert log (high-risk SMS alerts sent to on-call physician)
export const alertLogs = pgTable("alert_logs", {
  id: serial("id").primaryKey(),
  patientId: text("patient_id").notNull(),
  riskLevel: text("risk_level").notNull(),
  reasons: jsonb("reasons").notNull(),
  channel: text("channel").notNull(),
  traceId: text("trace_id"),
  sentAt: timestamp("sent_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export type AlertLog = typeof alertLogs.$inferSelect;

// Full system snapshots — replayable decision state
export const systemSnapshots = pgTable("system_snapshots", {
  id: serial("id").primaryKey(),
  traceId: text("trace_id"),
  patientId: text("patient_id"),
  state: jsonb("state").notNull(),
  complaint: text("complaint"),
  autonomyMode: text("autonomy_mode"),
  safetyLevel: text("safety_level"),
  confidence: real("confidence"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertSystemSnapshotSchema = createInsertSchema(systemSnapshots).omit({ id: true, createdAt: true });
export type InsertSystemSnapshot = z.infer<typeof insertSystemSnapshotSchema>;
export type SystemSnapshot = typeof systemSnapshots.$inferSelect;

// Autonomy performance tracking — FDA evidence, trust metric, tuning engine
export const autonomyMetrics = pgTable("autonomy_metrics", {
  id: serial("id").primaryKey(),
  traceId: text("trace_id"),
  complaint: text("complaint"),
  mode: text("mode").notNull(),
  dispositionGiven: text("disposition_given"),
  confidence: real("confidence"),
  wasOverridden: boolean("was_overridden").default(false).notNull(),
  safetyTriggered: boolean("safety_triggered").default(false).notNull(),
  guardrailsTriggered: text("guardrails_triggered").array().default([]),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertAutonomyMetricSchema = createInsertSchema(autonomyMetrics).omit({ id: true, createdAt: true });
export type InsertAutonomyMetric = z.infer<typeof insertAutonomyMetricSchema>;
export type AutonomyMetric = typeof autonomyMetrics.$inferSelect;

// Idempotency keys — prevent duplicate POSTs from retries or ALB replays
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  response: jsonb("response").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Re-export chat models for OpenAI integration
export * from "./models/chat";
