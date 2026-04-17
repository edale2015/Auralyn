# System Overview — Part B: Shared Data Schema

## Review Prompt

This is the shared data model for the Auralyn triage system.
Review for: missing safety fields, incomplete patient state representation,
fields that could allow dangerous state transitions, and regulatory compliance gaps.

## Files

---

### shared/schema.ts

```ts
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, boolean, jsonb, real, doublePrecision, index, uniqueIndex } from "drizzle-orm/pg-core";
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
}, (t) => ({
  createdAtIdx: index("idx_engine_logs_created_at").on(t.createdAt),
  engineIdx: index("idx_engine_logs_engine").on(t.engine),
}));
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
}, (t) => ({
  traceIdIdx: index("idx_audit_logs_trace_id").on(t.traceId),
  createdAtIdx: index("idx_audit_logs_created_at").on(t.createdAt),
}));
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
}, (t) => ({
  statusIdx: index("idx_patient_sessions_status").on(t.status),
  createdAtIdx: index("idx_patient_sessions_created_at").on(t.createdAt),
}));
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

// FDA experiment log — reproducibility + submission tracking
export const fdaExperiments = pgTable("fda_experiments", {
  id: serial("id").primaryKey(),
  config: jsonb("config").notNull(),
  metrics: jsonb("metrics").notNull(),
  pass: boolean("pass").default(false).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertFdaExperimentSchema = createInsertSchema(fdaExperiments).omit({ id: true, createdAt: true });
export type InsertFdaExperiment = z.infer<typeof insertFdaExperimentSchema>;
export type FdaExperiment = typeof fdaExperiments.$inferSelect;

// Re-export chat models for OpenAI integration
export * from "./models/chat";

// ─── Production Clinic Layer (multi-tenant, FHIR-ready) ────────────────────

export const clinicSites = pgTable("clinic_sites", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").unique(),
  name: varchar("name", { length: 255 }).notNull(),
  ehrVendor: varchar("ehr_vendor", { length: 100 }),
  fhirTenantKey: varchar("fhir_tenant_key", { length: 255 }),
  plan: varchar("plan", { length: 50 }).default("basic").notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertClinicSiteSchema = createInsertSchema(clinicSites).omit({ id: true, createdAt: true });
export type InsertClinicSite = z.infer<typeof insertClinicSiteSchema>;
export type ClinicSite = typeof clinicSites.$inferSelect;

export const clinicPatients = pgTable("clinic_patients", {
  id: serial("id").primaryKey(),
  clinicExternalId: text("clinic_external_id").notNull(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  dob: varchar("dob", { length: 25 }),
  sex: varchar("sex", { length: 50 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  externalPatientId: varchar("external_patient_id", { length: 255 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertClinicPatientSchema = createInsertSchema(clinicPatients).omit({ id: true, createdAt: true });
export type InsertClinicPatient = z.infer<typeof insertClinicPatientSchema>;
export type ClinicPatient = typeof clinicPatients.$inferSelect;

export const clinicEncounters = pgTable("clinic_encounters", {
  id: serial("id").primaryKey(),
  clinicExternalId: text("clinic_external_id").notNull(),
  patientId: integer("patient_id").notNull().references(() => clinicPatients.id),
  complaint: varchar("complaint", { length: 120 }).notNull(),
  encounterStatus: varchar("encounter_status", { length: 50 }).default("created").notNull(),
  intakePayload: jsonb("intake_payload").$type<Record<string, unknown>>().default({}).notNull(),
  triageResult: jsonb("triage_result").$type<Record<string, unknown>>(),
  reviewed: boolean("reviewed").default(false).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertClinicEncounterSchema = createInsertSchema(clinicEncounters).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClinicEncounter = z.infer<typeof insertClinicEncounterSchema>;
export type ClinicEncounter = typeof clinicEncounters.$inferSelect;

export const clinicIntakeSessions = pgTable("clinic_intake_sessions", {
  id: serial("id").primaryKey(),
  clinicExternalId: text("clinic_external_id").notNull(),
  patientId: integer("patient_id").references(() => clinicPatients.id),
  channel: varchar("channel", { length: 50 }).notNull(),
  consented: boolean("consented").default(false).notNull(),
  sessionState: varchar("session_state", { length: 50 }).default("awaiting_consent").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertClinicIntakeSessionSchema = createInsertSchema(clinicIntakeSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClinicIntakeSession = z.infer<typeof insertClinicIntakeSessionSchema>;
export type ClinicIntakeSession = typeof clinicIntakeSessions.$inferSelect;

export const labeledOutcomeStats = pgTable("labeled_outcome_stats", {
  id: serial("id").primaryKey(),
  clinicExternalId: text("clinic_external_id"),
  totalLabeledEncounters: integer("total_labeled_encounters").default(0).notNull(),
  totalGoldenCases: integer("total_golden_cases").default(0).notNull(),
  lastComputedAt: timestamp("last_computed_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertLabeledOutcomeStatsSchema = createInsertSchema(labeledOutcomeStats).omit({ id: true });
export type InsertLabeledOutcomeStats = z.infer<typeof insertLabeledOutcomeStatsSchema>;

// ─── Knowledge Base Admin Tables ─────────────────────────────────────────────

export const kbComplaints = pgTable("kb_complaints", {
  id: serial("id").primaryKey(),
  complaintId: text("complaint_id").notNull().unique(),
  system: text("system").notNull().default("GENERAL"),
  label: text("label").notNull(),
  aliases: text("aliases").array().default([]).notNull(),
  defaultCluster: text("default_cluster"),
  scoringModule: text("scoring_module"),
  graphId: text("graph_id"),
  engineType: text("engine_type").default("STANDARD"),
  enabled: boolean("enabled").default(true).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbComplaintSchema = createInsertSchema(kbComplaints).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbComplaint = z.infer<typeof insertKbComplaintSchema>;
export type KbComplaint = typeof kbComplaints.$inferSelect;

export const kbQuestions = pgTable("kb_questions", {
  id: serial("id").primaryKey(),
  complaintId: text("complaint_id").notNull(),
  questionId: text("question_id").notNull(),
  prompt: text("prompt").notNull(),
  type: text("type").notNull().default("yes_no"),
  required: boolean("required").default(false).notNull(),
  priority: integer("priority").default(50).notNull(),
  category: text("category"),
  askIf: text("ask_if"),
  conditionalOn: jsonb("conditional_on").$type<Record<string, unknown>>().default({}).notNull(),
  linkedDiagnoses: text("linked_diagnoses").array().default([]).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbQuestionSchema = createInsertSchema(kbQuestions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbQuestion = z.infer<typeof insertKbQuestionSchema>;
export type KbQuestion = typeof kbQuestions.$inferSelect;

export const kbModifiers = pgTable("kb_modifiers", {
  id: serial("id").primaryKey(),
  modifierId: text("modifier_id").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  appliesTo: text("applies_to").array().default([]).notNull(),
  addDiagnoses: text("add_diagnoses").array().default([]).notNull(),
  removeDiagnoses: text("remove_diagnoses").array().default([]).notNull(),
  workupChanges: jsonb("workup_changes").$type<Record<string, unknown>>().default({}).notNull(),
  medChanges: jsonb("med_changes").$type<Record<string, unknown>>().default({}).notNull(),
  dispositionThresholdShift: real("disposition_threshold_shift").default(0),
  active: boolean("active").default(true).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbModifierSchema = createInsertSchema(kbModifiers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbModifier = z.infer<typeof insertKbModifierSchema>;
export type KbModifier = typeof kbModifiers.$inferSelect;

export const kbRedFlagRules = pgTable("kb_red_flag_rules", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull().unique(),
  complaintId: text("complaint_id").notNull(),
  label: text("label").notNull(),
  triggerExpr: text("trigger_expr").notNull(),
  severity: text("severity").notNull().default("HARD"),
  action: text("action").notNull().default("ER_SEND"),
  immediateActions: text("immediate_actions"),
  rationale: text("rationale"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbRedFlagRuleSchema = createInsertSchema(kbRedFlagRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbRedFlagRule = z.infer<typeof insertKbRedFlagRuleSchema>;
export type KbRedFlagRule = typeof kbRedFlagRules.$inferSelect;

export const kbWorkupRules = pgTable("kb_workup_rules", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull().unique(),
  complaintId: text("complaint_id").notNull(),
  testName: text("test_name").notNull(),
  testType: text("test_type").notNull().default("labs"),
  triggerExpr: text("trigger_expr"),
  modifierOverrides: jsonb("modifier_overrides").$type<Record<string, unknown>>().default({}).notNull(),
  priority: integer("priority").default(50).notNull(),
  rationale: text("rationale"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbWorkupRuleSchema = createInsertSchema(kbWorkupRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbWorkupRule = z.infer<typeof insertKbWorkupRuleSchema>;
export type KbWorkupRule = typeof kbWorkupRules.$inferSelect;

export const kbDiagnosisRules = pgTable("kb_diagnosis_rules", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull().unique(),
  complaintId: text("complaint_id").notNull(),
  diagnosisId: text("diagnosis_id").notNull(),
  diagnosisLabel: text("diagnosis_label").notNull(),
  icdCode: text("icd_code"),
  baseProbability: real("base_probability").default(0.1).notNull(),
  featureLikelihoods: jsonb("feature_likelihoods").$type<Record<string, number>>().default({}).notNull(),
  cannotMiss: boolean("cannot_miss").default(false).notNull(),
  basePoints: integer("base_points").default(1),
  clusterPriority: integer("cluster_priority").default(50),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbDiagnosisRuleSchema = createInsertSchema(kbDiagnosisRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbDiagnosisRule = z.infer<typeof insertKbDiagnosisRuleSchema>;
export type KbDiagnosisRule = typeof kbDiagnosisRules.$inferSelect;

export const kbTreatmentRules = pgTable("kb_treatment_rules", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull().unique(),
  complaintId: text("complaint_id"),
  diagnosisId: text("diagnosis_id"),
  medicationName: text("medication_name").notNull(),
  medicationGroup: text("medication_group"),
  isFirstLine: boolean("is_first_line").default(true).notNull(),
  adultDose: text("adult_dose"),
  adultMaxDose: text("adult_max_dose"),
  pediatricDose: text("pediatric_dose"),
  route: text("route"),
  renalAdjust: text("renal_adjust"),
  hepaticAdjust: text("hepatic_adjust"),
  pregnancyCategory: text("pregnancy_category"),
  contraindications: text("contraindications"),
  allergyCrossReacts: text("allergy_cross_reacts").array().default([]).notNull(),
  keyInteractions: text("key_interactions"),
  commonSideEffects: text("common_side_effects"),
  notes: text("notes"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbTreatmentRuleSchema = createInsertSchema(kbTreatmentRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbTreatmentRule = z.infer<typeof insertKbTreatmentRuleSchema>;
export type KbTreatmentRule = typeof kbTreatmentRules.$inferSelect;

export const kbDispositionRules = pgTable("kb_disposition_rules", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull().unique(),
  complaintId: text("complaint_id").notNull(),
  priority: integer("priority").default(50).notNull(),
  whenExpr: text("when_expr").notNull(),
  dispositionLevel: text("disposition_level").notNull(),
  rationaleTemplateId: text("rationale_template_id"),
  confidenceHint: text("confidence_hint").default("MODERATE"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbDispositionRuleSchema = createInsertSchema(kbDispositionRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbDispositionRule = z.infer<typeof insertKbDispositionRuleSchema>;
export type KbDispositionRule = typeof kbDispositionRules.$inferSelect;

export const kbPlanTemplates = pgTable("kb_plan_templates", {
  id: serial("id").primaryKey(),
  templateKey: text("template_key").notNull().unique(),
  complaintId: text("complaint_id"),
  diagnosisLabel: text("diagnosis_label").notNull(),
  defaultDisposition: text("default_disposition").notNull(),
  summary: text("summary"),
  homeCare: text("home_care").array().default([]).notNull(),
  followUp: text("follow_up").array().default([]).notNull(),
  returnPrecautions: text("return_precautions").array().default([]).notNull(),
  patientMessage: text("patient_message"),
  dischargeText: text("discharge_text"),
  erPrecautions: text("er_precautions"),
  medicationInstructions: text("medication_instructions"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbPlanTemplateSchema = createInsertSchema(kbPlanTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbPlanTemplate = z.infer<typeof insertKbPlanTemplateSchema>;
export type KbPlanTemplate = typeof kbPlanTemplates.$inferSelect;

export const kbGoldenCases = pgTable("kb_golden_cases", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().unique(),
  complaint: text("complaint").notNull(),
  title: text("title").notNull(),
  structuredInputs: jsonb("structured_inputs").$type<Record<string, unknown>>().default({}).notNull(),
  modifiers: text("modifiers").array().default([]).notNull(),
  clinicalFindings: jsonb("clinical_findings").$type<Record<string, unknown>>().default({}).notNull(),
  workupResults: jsonb("workup_results").$type<Record<string, unknown>>().default({}).notNull(),
  expectedDiagnosis: text("expected_diagnosis").notNull(),
  expectedDifferential: jsonb("expected_differential").$type<string[]>().default([]).notNull(),
  expectedDisposition: text("expected_disposition").notNull(),
  expectedWorkup: text("expected_workup").array().default([]).notNull(),
  expectedTreatment: jsonb("expected_treatment").$type<Record<string, unknown>>().default({}).notNull(),
  expectedRedFlags: text("expected_red_flags").array().default([]).notNull(),
  explanation: text("explanation"),
  version: integer("version").default(1).notNull(),
  author: text("author").default("system"),
  status: text("status").notNull().default("draft"),
  tags: text("tags").array().default([]).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbGoldenCaseSchema = createInsertSchema(kbGoldenCases).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbGoldenCase = z.infer<typeof insertKbGoldenCaseSchema>;
export type KbGoldenCase = typeof kbGoldenCases.$inferSelect;

// ── Phase 3: Normalized feature likelihoods (replaces JSONB blob in kb_diagnosis_rules) ─────────
export const kbFeatureLikelihoods = pgTable("kb_feature_likelihoods", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull(),                     // FK to kb_diagnosis_rules.rule_id
  featureKey: text("feature_key").notNull(),             // e.g. "painful arc", "fever"
  featureValue: text("feature_value").default("yes"),    // "yes" | "no" | "severe" etc.
  likelihood: real("likelihood").notNull(),              // P(feature | diagnosis) 0..1
  weight: real("weight").default(1.0).notNull(),         // optional scaling
  source: text("source").default("ui_edit").notNull(),   // hardcoded_prior | jsonb_migration | ui_edit
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbFeatureLikelihoodSchema = createInsertSchema(kbFeatureLikelihoods).omit({ id: true, createdAt: true });
export type InsertKbFeatureLikelihood = z.infer<typeof insertKbFeatureLikelihoodSchema>;
export type KbFeatureLikelihood = typeof kbFeatureLikelihoods.$inferSelect;

// ── Phase 3: Clinical weights (replaces in-memory weight store) ────────────────────────────────
export const kbClinicalWeights = pgTable("kb_clinical_weights", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),                   // e.g. "prior_weight", "symptom_weight"
  value: real("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbClinicalWeightSchema = createInsertSchema(kbClinicalWeights).omit({ id: true, updatedAt: true });
export type InsertKbClinicalWeight = z.infer<typeof insertKbClinicalWeightSchema>;
export type KbClinicalWeight = typeof kbClinicalWeights.$inferSelect;

// ── Phase 3: Complaint modules (replaces SCORING_MODULE_DISPATCH) ───────────────────────────────
export const kbComplaintModules = pgTable("kb_complaint_modules", {
  id: serial("id").primaryKey(),
  complaintId: text("complaint_id").notNull(),
  moduleType: text("module_type").notNull(),             // scoring | workup | diagnosis | triage
  moduleConfig: jsonb("module_config").$type<Record<string, unknown>>().default({}).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbComplaintModuleSchema = createInsertSchema(kbComplaintModules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbComplaintModule = z.infer<typeof insertKbComplaintModuleSchema>;
export type KbComplaintModule = typeof kbComplaintModules.$inferSelect;

// ── Phase 3: Complaint packs (replaces COMPLAINT_PACK_REGISTRY) ─────────────────────────────────
export const kbComplaintPacks = pgTable("kb_complaint_packs", {
  id: serial("id").primaryKey(),
  complaintId: text("complaint_id").notNull(),
  questions: jsonb("questions").$type<unknown[]>().default([]).notNull(),
  findings: jsonb("findings").$type<unknown[]>().default([]).notNull(),
  modifiers: jsonb("modifiers").$type<unknown[]>().default([]).notNull(),
  version: integer("version").default(1).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbComplaintPackSchema = createInsertSchema(kbComplaintPacks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbComplaintPack = z.infer<typeof insertKbComplaintPackSchema>;
export type KbComplaintPack = typeof kbComplaintPacks.$inferSelect;

// ── Phase 3+: Full probabilistic feature model (replaces kb_feature_likelihoods) ──────────────
export const kbFeatureModels = pgTable("kb_feature_models", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull(),
  featureKey: text("feature_key").notNull(),
  featureType: text("feature_type").notNull().default("boolean"), // boolean | categorical | numeric | range
  pPresent: real("p_present"),          // P(feature present | Dx)
  pAbsent: real("p_absent"),            // P(feature absent | Dx)
  categoricalMap: jsonb("categorical_map").$type<Record<string, number>>(), // {"mild":0.3,"severe":0.9}
  mean: real("mean"),
  stdDev: real("std_dev"),
  minValue: real("min_value"),
  maxValue: real("max_value"),
  weight: real("weight").default(1.0).notNull(),
  isRequired: boolean("is_required").default(false).notNull(),
  source: text("source").default("manual").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbFeatureModelSchema = createInsertSchema(kbFeatureModels).omit({ id: true, createdAt: true });
export type InsertKbFeatureModel = z.infer<typeof insertKbFeatureModelSchema>;
export type KbFeatureModel = typeof kbFeatureModels.$inferSelect;

// ── Phase 3+: Engine routing (replaces SCORING_MODULE_DISPATCH) ─────────────────────────────
export const kbEngineRouting = pgTable("kb_engine_routing", {
  id: serial("id").primaryKey(),
  complaintId: text("complaint_id").notNull(),
  engineType: text("engine_type").notNull().default("bayesian"), // bayesian | rule | hybrid | legacy
  config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
  priority: integer("priority").default(50).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbEngineRoutingSchema = createInsertSchema(kbEngineRouting).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbEngineRouting = z.infer<typeof insertKbEngineRoutingSchema>;
export type KbEngineRouting = typeof kbEngineRouting.$inferSelect;

// ── Advanced Reasoning: Co-morbidity interactions ─────────────────────────────
export const kbDiagnosisInteractions = pgTable("kb_diagnosis_interactions", {
  id: serial("id").primaryKey(),
  dxA: text("dx_a").notNull(),
  dxB: text("dx_b").notNull(),
  interactionType: text("interaction_type").notNull().default("synergy"),
  strength: real("strength").notNull().default(0),
  conditions: jsonb("conditions").$type<Record<string, unknown>>(),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbDiagnosisInteractionSchema = createInsertSchema(kbDiagnosisInteractions).omit({ id: true, createdAt: true });
export type InsertKbDiagnosisInteraction = z.infer<typeof insertKbDiagnosisInteractionSchema>;
export type KbDiagnosisInteraction = typeof kbDiagnosisInteractions.$inferSelect;

export const kbDiagnosisClusters = pgTable("kb_diagnosis_clusters", {
  id: serial("id").primaryKey(),
  clusterId: text("cluster_id").notNull().unique(),
  diagnoses: text("diagnoses").array().notNull().default([]),
  boost: real("boost").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbDiagnosisClusterSchema = createInsertSchema(kbDiagnosisClusters).omit({ id: true, createdAt: true });
export type InsertKbDiagnosisCluster = z.infer<typeof insertKbDiagnosisClusterSchema>;
export type KbDiagnosisCluster = typeof kbDiagnosisClusters.$inferSelect;

// ── Advanced Reasoning: Temporal patterns ─────────────────────────────────────
export const kbTemporalPatterns = pgTable("kb_temporal_patterns", {
  id: serial("id").primaryKey(),
  diagnosis: text("diagnosis").notNull(),
  featureKey: text("feature_key").notNull(),
  patternType: text("pattern_type").notNull(),
  durationHours: integer("duration_hours"),
  likelihood: real("likelihood").notNull().default(1.0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbTemporalPatternSchema = createInsertSchema(kbTemporalPatterns).omit({ id: true, createdAt: true });
export type InsertKbTemporalPattern = z.infer<typeof insertKbTemporalPatternSchema>;
export type KbTemporalPattern = typeof kbTemporalPatterns.$inferSelect;

export const patientTimeSeries = pgTable("patient_time_series", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull(),
  featureKey: text("feature_key").notNull(),
  t: timestamp("t").default(sql`CURRENT_TIMESTAMP`).notNull(),
  value: real("value").notNull(),
  unit: text("unit"),
});
export const insertPatientTimeSeriesSchema = createInsertSchema(patientTimeSeries).omit({ id: true });
export type InsertPatientTimeSeries = z.infer<typeof insertPatientTimeSeriesSchema>;
export type PatientTimeSeries = typeof patientTimeSeries.$inferSelect;

// ── Outcome Learning System ───────────────────────────────────────────────────
export const kbOutcomes = pgTable("kb_outcomes", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull(),
  predictedDx: text("predicted_dx"),
  actualDx: text("actual_dx"),
  predictedDisposition: text("predicted_disposition"),
  actualDisposition: text("actual_disposition"),
  correct: boolean("correct"),
  clinicianOverride: boolean("clinician_override").notNull().default(false),
  outcomeSeverity: text("outcome_severity"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbOutcomeSchema = createInsertSchema(kbOutcomes).omit({ id: true, createdAt: true });
export type InsertKbOutcome = z.infer<typeof insertKbOutcomeSchema>;
export type KbOutcome = typeof kbOutcomes.$inferSelect;

export const kbLearningEvents = pgTable("kb_learning_events", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull(),
  featureKey: text("feature_key").notNull().default("__base__"),
  delta: real("delta").notNull(),
  confidence: real("confidence").notNull().default(0.5),
  source: text("source").notNull().default("simulation"),
  status: text("status").notNull().default("pending"),
  rationale: text("rationale"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  deployedAt: timestamp("deployed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbLearningEventSchema = createInsertSchema(kbLearningEvents).omit({ id: true, createdAt: true });
export type InsertKbLearningEvent = z.infer<typeof insertKbLearningEventSchema>;
export type KbLearningEvent = typeof kbLearningEvents.$inferSelect;

export const kbKnowledgeChanges = pgTable("kb_knowledge_changes", {
  id: serial("id").primaryKey(),
  changeId: text("change_id").notNull().unique(),
  domain: text("domain").notNull(),
  recordId: text("record_id").notNull(),
  action: text("action").notNull(),
  changedBy: text("changed_by").default("system"),
  oldValue: jsonb("old_value").$type<Record<string, unknown>>(),
  newValue: jsonb("new_value").$type<Record<string, unknown>>(),
  rationale: text("rationale"),
  status: text("status").notNull().default("draft"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  deployedAt: timestamp("deployed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbKnowledgeChangeSchema = createInsertSchema(kbKnowledgeChanges).omit({ id: true, createdAt: true });
# [Continues in 01b2_schema_part2.md]
