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
export type InsertKbKnowledgeChange = z.infer<typeof insertKbKnowledgeChangeSchema>;
export type KbKnowledgeChange = typeof kbKnowledgeChanges.$inferSelect;
export type LabeledOutcomeStats = typeof labeledOutcomeStats.$inferSelect;

// ── Clinical Control Tower Tables ─────────────────────────────────────────────

export const kbConfidenceRules = pgTable("kb_confidence_rules", {
  id: serial("id").primaryKey(),
  complaintId: text("complaint_id"),
  minConfidence: real("min_confidence").notNull(),
  action: text("action").notNull(),
  description: text("description"),
  priority: integer("priority").default(1).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbConfidenceRuleSchema = createInsertSchema(kbConfidenceRules).omit({ id: true, createdAt: true });
export type KbConfidenceRule = typeof kbConfidenceRules.$inferSelect;

export const kbDiagnosisRisk = pgTable("kb_diagnosis_risk", {
  id: serial("id").primaryKey(),
  diagnosis: text("diagnosis").notNull().unique(),
  minDisposition: text("min_disposition").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbDiagnosisRiskSchema = createInsertSchema(kbDiagnosisRisk).omit({ id: true, createdAt: true });
export type KbDiagnosisRisk = typeof kbDiagnosisRisk.$inferSelect;

export const kbWorkupCosts = pgTable("kb_workup_costs", {
  id: serial("id").primaryKey(),
  testName: text("test_name").notNull().unique(),
  cost: real("cost").notNull().default(0),
  sensitivity: real("sensitivity"),
  specificity: real("specificity"),
  turnaroundMinutes: integer("turnaround_minutes"),
  riskScore: real("risk_score").default(0),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbWorkupCostSchema = createInsertSchema(kbWorkupCosts).omit({ id: true, createdAt: true });
export type KbWorkupCost = typeof kbWorkupCosts.$inferSelect;

export const kbTestUtility = pgTable("kb_test_utility", {
  id: serial("id").primaryKey(),
  testName: text("test_name").notNull(),
  diagnosis: text("diagnosis").notNull(),
  infoGain: real("info_gain").notNull().default(0),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbTestUtilitySchema = createInsertSchema(kbTestUtility).omit({ id: true, createdAt: true });
export type KbTestUtility = typeof kbTestUtility.$inferSelect;

export const kbQuestionUtility = pgTable("kb_question_utility", {
  id: serial("id").primaryKey(),
  questionKey: text("question_key").notNull(),
  diagnosis: text("diagnosis").notNull(),
  infoGain: real("info_gain").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbQuestionUtilitySchema = createInsertSchema(kbQuestionUtility).omit({ id: true, createdAt: true });
export type KbQuestionUtility = typeof kbQuestionUtility.$inferSelect;

// ── Robotic Exam & Patient Stream Tables ─────────────────────────────────────

export const robotDevices = pgTable("robot_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceId: text("device_id").notNull().unique(),
  type: text("type").notNull(),
  status: text("status").notNull().default("offline"),
  lastSeen: timestamp("last_seen").default(sql`CURRENT_TIMESTAMP`),
});
export type RobotDevice = typeof robotDevices.$inferSelect;

export const robotCommands = pgTable("robot_commands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceId: text("device_id").notNull(),
  command: text("command").notNull(),
  payload: jsonb("payload"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});
export type RobotCommand = typeof robotCommands.$inferSelect;

export const robotResults = pgTable("robot_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceId: text("device_id").notNull(),
  resultType: text("result_type").notNull(),
  data: jsonb("data"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});
export type RobotResult = typeof robotResults.$inferSelect;

export const patientLiveStream = pgTable("patient_live_stream", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: text("patient_id").notNull(),
  featureKey: text("feature_key").notNull(),
  value: real("value").notNull(),
  timestamp: timestamp("timestamp").default(sql`CURRENT_TIMESTAMP`),
});
export type PatientLiveStream = typeof patientLiveStream.$inferSelect;

export const patientState = pgTable("patient_state", {
  patientId: text("patient_id").primaryKey(),
  currentDx: text("current_dx"),
  currentDisposition: text("current_disposition"),
  riskScore: real("risk_score").default(0),
  lastUpdated: timestamp("last_updated").default(sql`CURRENT_TIMESTAMP`),
});
export type PatientState = typeof patientState.$inferSelect;

export const patientMultimodalInputs = pgTable("patient_multimodal_inputs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: text("patient_id").notNull(),
  type: text("type").notNull(),
  content: text("content"),
  processed: jsonb("processed"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});
export type PatientMultimodalInput = typeof patientMultimodalInputs.$inferSelect;

export const kbDeteriorationRules = pgTable("kb_deterioration_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  featureKey: text("feature_key").notNull(),
  threshold: real("threshold").notNull(),
  trend: text("trend").notNull(),
  action: text("action").notNull(),
  riskWeight: real("risk_weight").notNull().default(1.0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});
export const insertKbDeteriorationRuleSchema = createInsertSchema(kbDeteriorationRules).omit({ id: true, createdAt: true });
export type KbDeteriorationRule = typeof kbDeteriorationRules.$inferSelect;

// ── Clinical Rules — Versioned KB Tier-1 Foundation ───────────────────────────
// Each row is one immutable version of a clinical decision rule.
// Active rule = isActive=true + no expiryDate (or expiryDate in future).
// Superseded rules are expired (expiryDate set) but never deleted for audit trail.
export const clinicalRules = pgTable("clinical_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleKey: text("rule_key").notNull(),
  version: integer("version").notNull().default(1),
  complaintCluster: text("complaint_cluster").notNull(),
  ruleType: text("rule_type").notNull(),
  snomedCode: text("snomed_code"),
  evidenceSource: text("evidence_source"),
  ruleBody: jsonb("rule_body").notNull(),
  authoredBy: text("authored_by").notNull().default("system"),
  approvedBy: text("approved_by"),
  effectiveDate: timestamp("effective_date").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiryDate: timestamp("expiry_date"),
  isActive: boolean("is_active").notNull().default(true),
  tenantId: text("tenant_id"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertClinicalRuleSchema = createInsertSchema(clinicalRules).omit({ id: true, createdAt: true });
export type InsertClinicalRule = z.infer<typeof insertClinicalRuleSchema>;
export type ClinicalRule = typeof clinicalRules.$inferSelect;

// ── Meta-KB Entity Store (Production Upgrade Patch) ──────────────────────────
// A versioned, generic entity store sitting on top of the domain-specific KB tables.
// kbSources tracks provenance; kbEntityStore holds the current version of any KB entity;
// kbEntityVersions provides an immutable audit trail of all changes.

export const kbSources = pgTable("kb_sources", {
  id: serial("id").primaryKey(),
  sourceKey: text("source_key").notNull(),
  sourceType: text("source_type").notNull(),  // "csv" | "json" | "manual" | "llm"
  name: text("name").notNull(),
  description: text("description"),
  isAuthoritative: boolean("is_authoritative").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("uq_kb_sources_key").on(t.sourceKey)]);

export const insertKbSourceSchema = createInsertSchema(kbSources).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbSource = z.infer<typeof insertKbSourceSchema>;
export type KbSource = typeof kbSources.$inferSelect;

export const kbEntityStore = pgTable("kb_entity_store", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),  // "complaint" | "red_flag_rule" | "workup_rule" etc.
  entityKey: text("entity_key").notNull(),     // domain-unique key, e.g. "sore_throat"
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),  // "draft" | "active" | "deprecated"
  version: integer("version").notNull().default(1),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  currentContent: jsonb("current_content").$type<Record<string, unknown>>().notNull().default({}),
  sourceId: integer("source_id").references(() => kbSources.id),
  createdBy: text("created_by").default("system"),
  updatedBy: text("updated_by").default("system"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("uq_kb_entity_type_key").on(t.entityType, t.entityKey)]);

export const insertKbEntityStoreSchema = createInsertSchema(kbEntityStore).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbEntityStore = z.infer<typeof insertKbEntityStoreSchema>;
export type KbEntityStore = typeof kbEntityStore.$inferSelect;

export const kbEntityVersions = pgTable("kb_entity_versions", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => kbEntityStore.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  changeSummary: text("change_summary"),
  changedBy: text("changed_by").default("system"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertKbEntityVersionSchema = createInsertSchema(kbEntityVersions).omit({ id: true, createdAt: true });
export type InsertKbEntityVersion = z.infer<typeof insertKbEntityVersionSchema>;
export type KbEntityVersion = typeof kbEntityVersions.$inferSelect;

// ── Golden Case Run Persistence (Production Upgrade Patch) ────────────────────
// Separate from kbGoldenCases (which stores the case definitions), these tables
// record the history of every monitor run and the aggregate coverage matrix.

export const goldenCaseRuns = pgTable("golden_case_runs", {
  id: serial("id").primaryKey(),
  goldenCaseId: integer("golden_case_id").notNull().references(() => kbGoldenCases.id, { onDelete: "cascade" }),
  runBatch: text("run_batch").notNull(),          // ISO timestamp string identifying the batch
  systemVersion: text("system_version").notNull().default("1.0.0"),
  engineVersion: text("engine_version").notNull().default("1.0.0"),
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
  score: real("score").notNull().default(0),
  passed: boolean("passed").notNull().default(false),
  failReason: text("fail_reason"),
  runAt: timestamp("run_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertGoldenCaseRunSchema = createInsertSchema(goldenCaseRuns).omit({ id: true, runAt: true });
export type InsertGoldenCaseRun = z.infer<typeof insertGoldenCaseRunSchema>;
export type GoldenCaseRun = typeof goldenCaseRuns.$inferSelect;

export const goldenCaseCoverage = pgTable("golden_case_coverage", {
  id: serial("id").primaryKey(),
  complaint: text("complaint").notNull(),
  riskBand: text("risk_band").notNull(),    // "low" | "medium" | "high" | "critical"
  ageBand: text("age_band").notNull(),      // "pediatric" | "adult" | "elderly"
  count: integer("count").notNull().default(0),
  targetCount: integer("target_count").notNull().default(3),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("uq_golden_coverage").on(t.complaint, t.riskBand, t.ageBand)]);

export const insertGoldenCaseCoverageSchema = createInsertSchema(goldenCaseCoverage).omit({ id: true, updatedAt: true });
export type InsertGoldenCaseCoverage = z.infer<typeof insertGoldenCaseCoverageSchema>;
export type GoldenCaseCoverage = typeof goldenCaseCoverage.$inferSelect;

// ── BullMQ Job Tracking via Drizzle (Production Upgrade Patch) ────────────────
// Drizzle-backed job record store; the existing raw-SQL `jobs` table via jobRepo.ts
// remains untouched for backward compat. This table is written to by the new
// queues/bullmq/jobTracker.ts and exposed via /api/queues routes.

export const queueJobs = pgTable("queue_jobs", {
  id: serial("id").primaryKey(),
  queueName: text("queue_name").notNull(),
  jobId: text("job_id").notNull(),
  jobName: text("job_name").notNull(),
  status: text("status").notNull().default("queued"),  // "queued" | "processing" | "completed" | "failed"
  attemptsMade: integer("attempts_made").notNull().default(0),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"),
  clinicId: text("clinic_id"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("uq_queue_jobs_job_id").on(t.queueName, t.jobId)]);

export const insertQueueJobSchema = createInsertSchema(queueJobs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQueueJob = z.infer<typeof insertQueueJobSchema>;
export type QueueJob = typeof queueJobs.$inferSelect;

// ── Safety Gate Configuration ─────────────────────────────────────────────────
//
// Versioned, DB-persisted safety thresholds.
//
// FDA 21 CFR Part 11 requires that configuration changes to safety-critical
// thresholds be versioned, auditable, and authorized. Magic numbers in source
// code satisfy none of those requirements — this table is the alternative.
//
// Rules:
//  - Only one row may have is_active = true at any time (enforced at app level)
//  - Thresholds must satisfy: risk_threshold < hard_stop_threshold
//  - Every row requires approved_by and approval_note before activation
//  - Never DELETE rows — soft-replace only (deactivate old, insert new)

export const safetyConfigs = pgTable(
  "safety_configs",
  {
    id:                   serial("id").primaryKey(),
    version:              text("version").notNull().unique(),
    isActive:             boolean("is_active").notNull().default(false),

    riskThreshold:        real("risk_threshold").notNull(),
    hardStopThreshold:    real("hard_stop_threshold").notNull(),
    uncertaintyThreshold: real("uncertainty_threshold").notNull(),

    approvedBy:           text("approved_by").notNull(),
    approvalNote:         text("approval_note"),
    createdAt:            timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    activatedAt:          timestamp("activated_at", { withTimezone: true }),
  },
  (table) => [
    index("safety_configs_active_idx").on(table.isActive),
  ]
);

export const insertSafetyConfigSchema = createInsertSchema(safetyConfigs).omit({
  id: true,
  createdAt: true,
});
export type InsertSafetyConfig = z.infer<typeof insertSafetyConfigSchema>;
export type SafetyConfig = typeof safetyConfigs.$inferSelect;

// ── Self-Improvement Governance ──────────────────────────────────────────────

export const ACTION_STATUSES = ["proposed", "pending_review", "approved", "applied", "rejected", "failed"] as const;
export type ActionStatus = typeof ACTION_STATUSES[number];

export const agentThresholdRecords = pgTable(
  "agent_threshold_records",
  {
    id:           serial("id").primaryKey(),
    agent:        text("agent").notNull(),
    parameter:    text("parameter").notNull(),
    currentValue: doublePrecision("current_value").notNull(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedBy:    text("updated_by").notNull().default("system"),
  },
  (t) => [
    uniqueIndex("agent_threshold_records_agent_param_uidx").on(t.agent, t.parameter),
    index("agent_threshold_records_agent_idx").on(t.agent),
  ]
);
export const insertAgentThresholdSchema = createInsertSchema(agentThresholdRecords).omit({ id: true, updatedAt: true });
export type InsertAgentThreshold = z.infer<typeof insertAgentThresholdSchema>;
export type AgentThresholdRecord = typeof agentThresholdRecords.$inferSelect;

export const improvementActions = pgTable(
  "improvement_actions",
  {
    id:            serial("id").primaryKey(),
    agent:         text("agent").notNull(),
    action:        text("action").notNull(),
    parameter:     text("parameter").notNull(),
    fromValue:     doublePrecision("from_value"),
    toValue:       doublePrecision("to_value"),
    reason:        text("reason").notNull(),
    status:        text("status").notNull().default("proposed"),
    proposedAt:    timestamp("proposed_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    decidedAt:     timestamp("decided_at", { withTimezone: true }),
    decidedBy:     text("decided_by"),
    metric:        jsonb("metric"),
    errorMessage:  text("error_message"),
  },
  (t) => [
    index("improvement_actions_status_idx").on(t.status),
    index("improvement_actions_agent_idx").on(t.agent),
    index("improvement_actions_proposed_at_idx").on(t.proposedAt),
  ]
);
export const insertImprovementActionSchema = createInsertSchema(improvementActions).omit({ id: true, proposedAt: true });
export type InsertImprovementAction = z.infer<typeof insertImprovementActionSchema>;
export type ImprovementAction = typeof improvementActions.$inferSelect;

export const improvementReviews = pgTable(
  "improvement_reviews",
  {
    id:         serial("id").primaryKey(),
    actionId:   integer("action_id").notNull().references(() => improvementActions.id),
    reviewerId: text("reviewer_id").notNull(),
    decision:   text("decision").notNull(),
    note:       text("note"),
    decidedAt:  timestamp("decided_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("improvement_reviews_action_idx").on(t.actionId),
    index("improvement_reviews_reviewer_idx").on(t.reviewerId),
  ]
);
export const insertImprovementReviewSchema = createInsertSchema(improvementReviews).omit({ id: true, decidedAt: true });
export type InsertImprovementReview = z.infer<typeof insertImprovementReviewSchema>;
export type ImprovementReview = typeof improvementReviews.$inferSelect;

export const improvementCycleLog = pgTable(
  "improvement_cycle_log",
  {
    id:               serial("id").primaryKey(),
    ranAt:            timestamp("ran_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    actionsProposed:  integer("actions_proposed").notNull().default(0),
    actionsApplied:   integer("actions_applied").notNull().default(0),
    actionsRejected:  integer("actions_rejected").notNull().default(0),
    durationMs:       integer("duration_ms").notNull().default(0),
    error:            text("error"),
  },
  (t) => [
    index("improvement_cycle_log_ran_at_idx").on(t.ranAt),
  ]
);
export const insertImprovementCycleLogSchema = createInsertSchema(improvementCycleLog).omit({ id: true, ranAt: true });
export type InsertImprovementCycleLog = z.infer<typeof insertImprovementCycleLogSchema>;
export type ImprovementCycleLog = typeof improvementCycleLog.$inferSelect;

// ─── Canonical Pathways (KB admin — batch 26/27) ──────────────────────────────
export const canonicalPathways = pgTable("canonical_pathways", {
  pathwayId:            text("pathway_id").primaryKey(),
  sourceType:           text("source_type").notNull(),
  complaintId:          text("complaint_id").notNull(),
  syndromeId:           text("syndrome_id").notNull(),
  label:                text("label").notNull(),
  requiredFeatures:     jsonb("required_features").$type<string[]>().notNull().default([]),
  positiveWeights:      jsonb("positive_weights").$type<Record<string, number>>().notNull().default({}),
  negativeWeights:      jsonb("negative_weights").$type<Record<string, number>>().notNull().default({}),
  exclusions:           jsonb("exclusions").$type<string[]>().notNull().default([]),
  treatmentClass:       text("treatment_class").notNull(),
  medicationKey:        text("medication_key"),
  canonicalDisposition: text("canonical_disposition").notNull(),
  rationale:            jsonb("rationale").$type<string[]>().notNull().default([]),
  active:               boolean("active").notNull().default(true),
  createdBy:            text("created_by").notNull(),
  updatedBy:            text("updated_by").notNull(),
  retiredBy:            text("retired_by"),
  retirementReason:     text("retirement_reason"),
  retiredAt:            timestamp("retired_at"),
  createdAt:            timestamp("created_at").defaultNow().notNull(),
  updatedAt:            timestamp("updated_at").defaultNow().notNull(),
});
export const insertCanonicalPathwaySchema = createInsertSchema(canonicalPathways).omit({ createdAt: true, updatedAt: true });
export type InsertCanonicalPathway = z.infer<typeof insertCanonicalPathwaySchema>;
export type CanonicalPathway = typeof canonicalPathways.$inferSelect;

// ─── Phenotype Registry (batch 27) ───────────────────────────────────────────
export const phenotypeRegistry = pgTable("phenotype_registry", {
  phenotypeHash:           text("phenotype_hash").primaryKey(),
  complaintId:             text("complaint_id").notNull(),
  canonicalSyndromeId:     text("canonical_syndrome_id"),
  canonicalMedicationKey:  text("canonical_medication_key"),
  canonicalDisposition:    text("canonical_disposition").notNull(),
  confidence:              text("confidence").notNull(),
  seenCount:               integer("seen_count").notNull().default(1),
  firstSeenAt:             timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt:              timestamp("last_seen_at").defaultNow().notNull(),
});
export const insertPhenotypeRegistrySchema = createInsertSchema(phenotypeRegistry).omit({ firstSeenAt: true, lastSeenAt: true });
export type InsertPhenotypeRegistry = z.infer<typeof insertPhenotypeRegistrySchema>;
export type PhenotypeRegistryEntry = typeof phenotypeRegistry.$inferSelect;

// ─── KB Physician Overrides (batch 26 — kb_physician_overrides) ──────────────
export const kbPhysicianOverrides = pgTable("kb_physician_overrides", {
  id:                serial("id").primaryKey(),
  overrideId:        text("override_id").notNull().unique(),
  patientId:         text("patient_id").notNull(),
  complaint:         text("complaint").notNull(),
  systemDecision:    text("system_decision").notNull(),
  physicianDecision: text("physician_decision").notNull(),
  reason:            text("reason").notNull(),
  discrepancy:       boolean("discrepancy").notNull().default(false),
  actorId:           text("actor_id").notNull(),
  traceId:           text("trace_id").notNull(),
  createdAt:         timestamp("created_at").defaultNow(),
});
export const insertKbPhysicianOverrideSchema = createInsertSchema(kbPhysicianOverrides).omit({ id: true, createdAt: true });
export type InsertKbPhysicianOverride = z.infer<typeof insertKbPhysicianOverrideSchema>;
export type KbPhysicianOverride = typeof kbPhysicianOverrides.$inferSelect;

// ─── Guideline Documents — existing table (matches DB: id serial, source text, etc.) ──
export const guidelineDocuments = pgTable("guideline_documents", {
  id:        serial("id").primaryKey(),
  source:    text("source").notNull().default("manual"),
  title:     text("title"),
  content:   text("content").notNull(),
  parsed:    jsonb("parsed"),
  status:    text("status").notNull().default("processed"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type GuidelineDocument = typeof guidelineDocuments.$inferSelect;

// ─── Batch 57 — PageIndex Clinical Reasoning (Article 30) ────────────────────

// clinical_doc_nodes — hierarchical tree nodes from PageIndexBuilder
export const clinicalDocNodes = pgTable("clinical_doc_nodes", {
  id:           serial("id").primaryKey(),
  documentId:   integer("document_id").notNull(),
  nodeId:       text("node_id").notNull(),
  title:        text("title").notNull(),
  startPage:    integer("start_page").notNull().default(0),
  endPage:      integer("end_page").notNull().default(0),
  summary:      text("summary").default(""),
  content:      text("content").default(""),
  parentNodeId: text("parent_node_id"),
  depth:        integer("depth").notNull().default(0),
  createdAt:    timestamp("created_at").defaultNow(),
});
export const insertClinicalDocNodeSchema = createInsertSchema(clinicalDocNodes).omit({ id: true, createdAt: true });
export type InsertClinicalDocNode = z.infer<typeof insertClinicalDocNodeSchema>;
export type ClinicalDocNode = typeof clinicalDocNodes.$inferSelect;

// clinical_reasoning_queries — query log with node selection and answer
export const clinicalReasoningQueries = pgTable("clinical_reasoning_queries", {
  id:            serial("id").primaryKey(),
  documentId:    integer("document_id").notNull(),
  question:      text("question").notNull(),
  selectedNode:  text("selected_node"),
  answer:        text("answer"),
  confidence:    real("confidence"),
  retrievalMode: text("retrieval_mode").notNull().default("keyword"),
  createdAt:     timestamp("created_at").defaultNow(),
});
export const insertClinicalReasoningQuerySchema = createInsertSchema(clinicalReasoningQueries).omit({ id: true, createdAt: true });
export type InsertClinicalReasoningQuery = z.infer<typeof insertClinicalReasoningQuerySchema>;
export type ClinicalReasoningQuery = typeof clinicalReasoningQueries.$inferSelect;

// clinical_cross_ref_logs — cross-reference resolution audit trail
export const clinicalCrossRefLogs = pgTable("clinical_cross_ref_logs", {
  id:           serial("id").primaryKey(),
  queryId:      integer("query_id").notNull(),
  reference:    text("reference").notNull(),
  resolvedNode: text("resolved_node"),
  resolved:     boolean("resolved").notNull().default(false),
  createdAt:    timestamp("created_at").defaultNow(),
});
export const insertClinicalCrossRefLogSchema = createInsertSchema(clinicalCrossRefLogs).omit({ id: true, createdAt: true });
export type InsertClinicalCrossRefLog = z.infer<typeof insertClinicalCrossRefLogSchema>;
export type ClinicalCrossRefLog = typeof clinicalCrossRefLogs.$inferSelect;

// knowledge_documents — hybrid retrieval knowledge store (BM25 + vector + RRF)
export const knowledgeDocuments = pgTable("knowledge_documents", {
  id:        serial("id").primaryKey(),
  docId:     text("doc_id").notNull().unique(),
  title:     text("title"),
  content:   text("content").notNull(),
  embedding: real("embedding").array(),
  source:    text("source").notNull().default("manual"),
  metadata:  jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertKnowledgeDocumentSchema = createInsertSchema(knowledgeDocuments).omit({ id: true, createdAt: true });
export type InsertKnowledgeDocument = z.infer<typeof insertKnowledgeDocumentSchema>;
export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;

// rag_evaluations — RAGAS-style evaluation results for CI regression tracking
export const ragEvaluations = pgTable("rag_evaluations", {
  id:               serial("id").primaryKey(),
  question:         text("question").notNull(),
  answer:           text("answer").notNull(),
  faithfulness:     real("faithfulness"),
  answerRelevancy:  real("answer_relevancy"),
  contextPrecision: real("context_precision"),
  overallScore:     real("overall_score"),
  pass:             boolean("pass").notNull().default(false),
  groundTruth:      text("ground_truth"),
  retrievalCount:   integer("retrieval_count").notNull().default(0),
  cacheHit:         boolean("cache_hit").notNull().default(false),
  createdAt:        timestamp("created_at").defaultNow(),
});
export const insertRagEvaluationSchema = createInsertSchema(ragEvaluations).omit({ id: true, createdAt: true });
export type InsertRagEvaluation = z.infer<typeof insertRagEvaluationSchema>;
export type RagEvaluation = typeof ragEvaluations.$inferSelect;

// agent_artifacts — typed structured outputs from agent fleet / best-of-N (Batch 59)
export const agentArtifacts = pgTable("agent_artifacts", {
  id:        text("id").primaryKey(),            // UUID string (set by app)
  type:      text("type").notNull(),             // fleet_result | best_of_n_result | ...
  content:   text("content").notNull(),          // JSON-serialized artifact
  agentId:   text("agent_id").notNull(),
  patientId: text("patient_id"),
  metadata:  jsonb("metadata"),
  status:    text("status").notNull().default("pending_review"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertAgentArtifactSchema = createInsertSchema(agentArtifacts).omit({ createdAt: true });
export type InsertAgentArtifact = z.infer<typeof insertAgentArtifactSchema>;
export type AgentArtifact = typeof agentArtifacts.$inferSelect;

// ── Batch-1 Remediation: Persist governance, traces, audit-verification ────────

// governance_items — durable record of every governance approval/rejection
// Replaces in-memory governanceQueue. Required for HIPAA + FDA 21 CFR Part 11.
export const governanceItems = pgTable("governance_items", {
  id:         text("id").primaryKey(),
  sheet:      text("sheet").notNull(),
  change:     jsonb("change").notNull(),
  status:     text("status").notNull().default("pending"),  // pending | approved | rejected
  risk:       text("risk").notNull(),
  reason:     text("reason"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});
export const insertGovernanceItemSchema = createInsertSchema(governanceItems).omit({ createdAt: true });
export type InsertGovernanceItem = z.infer<typeof insertGovernanceItemSchema>;
export type GovernanceItem = typeof governanceItems.$inferSelect;

// execution_traces — durable AI reasoning trace for every clinical decision
// Replaces in-memory 200-cap store. Required for FDA audit + malpractice defense.
export const executionTraces = pgTable("execution_traces", {
  id:        text("id").primaryKey(),
  patientId: text("patient_id"),
  complaint: text("complaint"),
  steps:     jsonb("steps").notNull(),
  totalMs:   integer("total_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  patientIdx:   index("idx_exec_traces_patient").on(t.patientId),
  createdAtIdx: index("idx_exec_traces_created").on(t.createdAt),
}));
export type ExecutionTraceRow = typeof executionTraces.$inferSelect;

// audit_verification_runs — persisted scheduled verification results
// Replaces in-memory 90-day cap. Required for 45 CFR §164.312(b) compliance.
export const auditVerificationRuns = pgTable("audit_verification_runs", {
  id:          text("id").primaryKey(),
  frequency:   text("frequency").notNull(),         // nightly | weekly
  triggeredBy: text("triggered_by").notNull(),       // scheduled | manual | incident
  verified:    boolean("verified").notNull(),
  recordsChecked: integer("records_checked").notNull(),
  durationMs:  integer("duration_ms").notNull(),
  brokenAt:    jsonb("broken_at"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  createdAtIdx: index("idx_audit_verify_created").on(t.createdAt),
}));
export type AuditVerificationRun = typeof auditVerificationRuns.$inferSelect;

// agent_memory_log — persistent agent memory across runs (Batch 59)
export const agentMemoryLog = pgTable("agent_memory_log", {
  id:         serial("id").primaryKey(),
  agentId:    text("agent_id").notNull(),
  memoryType: text("memory_type").notNull(),     // clinical_decision | outcome | physician_override | ...
  content:    text("content").notNull(),
  importance: real("importance").notNull().default(0.5),
  context:    jsonb("context"),
  createdAt:  timestamp("created_at").defaultNow(),
});
export const insertAgentMemorySchema = createInsertSchema(agentMemoryLog).omit({ id: true, createdAt: true });
export type InsertAgentMemory = z.infer<typeof insertAgentMemorySchema>;
export type AgentMemory = typeof agentMemoryLog.$inferSelect;

// ── KB Governance Tables ─────────────────────────────────────────────────────

// kb_population_priors — Bayesian prior multipliers per population segment
// (e.g., elderly, pediatric, immunocompromised). Queried at triage time to
// adjust differential probability for the patient's demographic cluster.
export const kbPopulationPriors = pgTable("kb_population_priors", {
  id:             serial("id").primaryKey(),
  populationFlag: text("population_flag").notNull(),
  diagnosisKey:   text("diagnosis_key").notNull(),
  multiplier:     real("multiplier").notNull().default(1.0),
  rationale:      text("rationale"),
  active:         boolean("active").notNull().default(true),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
  updatedAt:      timestamp("updated_at").defaultNow().notNull(),
});
export const insertKbPopulationPriorSchema = createInsertSchema(kbPopulationPriors).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbPopulationPrior = z.infer<typeof insertKbPopulationPriorSchema>;
export type KbPopulationPrior = typeof kbPopulationPriors.$inferSelect;

// kb_review_queue — Pending KB entity changes awaiting physician/admin approval.
// New entities land as "draft" (kbRepository.ts FIX) and must be reviewed here
// before they are activated. Provides Draft → Approve/Reject lifecycle.
export const kbReviewQueue = pgTable("kb_review_queue", {
  id:          serial("id").primaryKey(),
  entityType:  text("entity_type").notNull(),
  entityKey:   text("entity_key").notNull(),
  version:     integer("version").notNull(),
  proposedBy:  text("proposed_by").notNull(),
  status:      text("status").notNull().default("pending"),   // pending | approved | rejected
  rationale:   text("rationale"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  reviewedBy:  text("reviewed_by"),
  reviewedAt:  timestamp("reviewed_at"),
});
export const insertKbReviewQueueSchema = createInsertSchema(kbReviewQueue).omit({ id: true, createdAt: true });
export type InsertKbReviewQueue = z.infer<typeof insertKbReviewQueueSchema>;
export type KbReviewQueueItem = typeof kbReviewQueue.$inferSelect;

// kb_audit_trail — Immutable log of every KB governance action.
// Captures CREATE, UPDATE, APPROVE, REJECT, ROLLBACK with full payload for FDA audit.
export const kbAuditTrail = pgTable("kb_audit_trail", {
  id:          serial("id").primaryKey(),
  entityType:  text("entity_type"),
  entityKey:   text("entity_key"),
  version:     integer("version"),
  action:      text("action"),           // CREATE | UPDATE | APPROVE | REJECT | ROLLBACK | SUBMIT_REVIEW
  actorId:     text("actor_id"),
  payload:     jsonb("payload"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});
export const insertKbAuditTrailSchema = createInsertSchema(kbAuditTrail).omit({ id: true, createdAt: true });
export type InsertKbAuditTrail = z.infer<typeof insertKbAuditTrailSchema>;
export type KbAuditTrailEntry = typeof kbAuditTrail.$inferSelect;

// ── ICU Predictor + Digital Twin (Batch 6 security/architecture wave) ─────────

export const patientSnapshots = pgTable(
  "patient_snapshots",
  {
    id:        serial("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    clinicId:  text("clinic_id"),
    complaint: text("complaint"),
    ageYears:  integer("age_years"),
    vitals:    jsonb("vitals").$type<Record<string, unknown>>().notNull().default({}),
    labs:      jsonb("labs").$type<Record<string, unknown>>().notNull().default({}),
    timeline:  jsonb("timeline").$type<Array<Record<string, unknown>>>().notNull().default([]),
    source:    text("source").notNull().default("command_center_v3"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    patientIdx: index("patient_snapshots_patient_idx").on(t.patientId, t.createdAt),
  })
);
export const insertPatientSnapshotSchema = createInsertSchema(patientSnapshots).omit({ id: true, createdAt: true });
export type InsertPatientSnapshot = z.infer<typeof insertPatientSnapshotSchema>;
export type PatientSnapshot = typeof patientSnapshots.$inferSelect;

export const icuPredictions = pgTable(
  "icu_predictions",
  {
    id:                     serial("id").primaryKey(),
    patientId:              text("patient_id").notNull(),
    clinicId:               text("clinic_id"),
    modelVersion:           text("model_version").notNull().default("icu-v3-news2-lactate"),
    riskScore:              real("risk_score").notNull(),
    riskBand:               text("risk_band").notNull(),
    recommendedLevel:       text("recommended_level").notNull(),
    explanation:            jsonb("explanation").$type<Array<{ factor: string; value: number | string; impact: number; note: string }>>().notNull().default([]),
    features:               jsonb("features").$type<Record<string, unknown>>().notNull().default({}),
    requiresPhysicianReview:boolean("requires_physician_review").notNull().default(true),
    createdAt:              timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    patientIdx: index("icu_predictions_patient_idx").on(t.patientId, t.createdAt),
  })
);
export const insertIcuPredictionSchema = createInsertSchema(icuPredictions).omit({ id: true, createdAt: true });
export type InsertIcuPrediction = z.infer<typeof insertIcuPredictionSchema>;
export type IcuPrediction = typeof icuPredictions.$inferSelect;

export const digitalTwinRuns = pgTable(
  "digital_twin_runs",
  {
    id:                serial("id").primaryKey(),
    patientId:         text("patient_id").notNull(),
    clinicId:          text("clinic_id"),
    scenarioName:      text("scenario_name").notNull(),
    horizonHours:      integer("horizon_hours").notNull().default(12),
    inputs:            jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
    output:            jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
    riskDelta:         real("risk_delta").notNull().default(0),
    recommendedAction: text("recommended_action"),
    createdBy:         text("created_by").notNull(),
    createdAt:         timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    patientIdx: index("digital_twin_runs_patient_idx").on(t.patientId, t.createdAt),
  })
);
export const insertDigitalTwinRunSchema = createInsertSchema(digitalTwinRuns).omit({ id: true, createdAt: true });
export type InsertDigitalTwinRun = z.infer<typeof insertDigitalTwinRunSchema>;
export type DigitalTwinRun = typeof digitalTwinRuns.$inferSelect;

// ─── Clinical Knowledge Base ───────────────────────────────────────────────
export const clinicalKnowledge = pgTable("clinical_knowledge", {
  id:        serial("id").primaryKey(),
  title:     text("title").notNull(),
  content:   text("content").notNull(),
  category:  text("category").notNull().default("general"),
  source:    text("source").notNull().default("internal"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
export const insertClinicalKnowledgeSchema = createInsertSchema(clinicalKnowledge).omit({ id: true, updatedAt: true });
export type InsertClinicalKnowledge = z.infer<typeof insertClinicalKnowledgeSchema>;
export type ClinicalKnowledge = typeof clinicalKnowledge.$inferSelect;

// ─── Physician Review Queue ────────────────────────────────────────────────
export const physicianReviewQueue = pgTable("physician_review_queue", {
  id:               serial("id").primaryKey(),
  query:            text("query").notNull(),
  proposedAnswer:   text("proposed_answer").notNull(),
  finalAnswer:      text("final_answer"),
  confidenceScore:  integer("confidence_score").notNull(),
  confidenceLevel:  text("confidence_level").notNull(),
  sourceCount:      integer("source_count").notNull(),
  hedgeWordCount:   integer("hedge_word_count").notNull().default(0),
  patientContextId: text("patient_context_id"),
  requestedBy:      text("requested_by"),
  status:           text("status").notNull().default("pending"),
  reviewedBy:       text("reviewed_by"),
  reviewNote:       text("review_note"),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow(),
  reviewedAt:       timestamp("reviewed_at", { withTimezone: true }),
});
export const insertPhysicianReviewQueueSchema = createInsertSchema(physicianReviewQueue).omit({ id: true, createdAt: true });
export type InsertPhysicianReviewQueue = z.infer<typeof insertPhysicianReviewQueueSchema>;
export type PhysicianReviewQueue = typeof physicianReviewQueue.$inferSelect;

// ─── Clinical Answer Audit ─────────────────────────────────────────────────
export const clinicalAnswerAudit = pgTable("clinical_answer_audit", {
  id:        text("id").primaryKey(),
  payload:   jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type ClinicalAnswerAudit = typeof clinicalAnswerAudit.$inferSelect;

// ─── Cross-Model Review Pipeline ──────────────────────────────────────────

export const crossModelReviews = pgTable("cross_model_reviews", {
  id:                   serial("id").primaryKey(),
  articleId:            integer("article_id"),
  claudeRecommendations: text("claude_recommendations").notNull(),
  relevantCode:         jsonb("relevant_code").$type<Record<string, string>>().default({}),
  articleSummary:       text("article_summary"),
  openaiSummary:        text("openai_summary"),
  openaiReview:         jsonb("openai_review").$type<any>(),
  status:               text("status").notNull().default("pending"),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type CrossModelReview = typeof crossModelReviews.$inferSelect;

export const reviewSlices = pgTable("review_slices", {
  id:         serial("id").primaryKey(),
  sliceId:    text("slice_id").notNull(),
  title:      text("title").notNull(),
  prompt:     text("prompt").notNull(),
  files:      jsonb("files").$type<string[]>().notNull().default([]),
  exportPath: text("export_path"),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type ReviewSlice = typeof reviewSlices.$inferSelect;

export const claudeSliceReviews = pgTable("claude_slice_reviews", {
  id:             serial("id").primaryKey(),
  reviewSliceId:  integer("review_slice_id").notNull(),
  claudeFindings: text("claude_findings").notNull(),
  status:         text("status").notNull().default("completed"),
  createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type ClaudeSliceReview = typeof claudeSliceReviews.$inferSelect;

export const openaiSliceReviews = pgTable("openai_slice_reviews", {
  id:                  serial("id").primaryKey(),
  reviewSliceId:       integer("review_slice_id").notNull(),
  claudeSliceReviewId: integer("claude_slice_review_id").notNull(),
  summaryForUser:      text("summary_for_user").notNull(),
  reviewJson:          jsonb("review_json").$type<any>().notNull(),
  overallVerdict:      text("overall_verdict").notNull(),
  status:              text("status").notNull().default("completed"),
  createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type OpenaiSliceReview = typeof openaiSliceReviews.$inferSelect;

export const sliceProposals = pgTable("slice_proposals", {
  id:                  serial("id").primaryKey(),
  reviewSliceId:       integer("review_slice_id").notNull(),
  openaiSliceReviewId: integer("openai_slice_review_id").notNull(),
  title:               text("title").notNull(),
  rationale:           text("rationale").notNull(),
  affectedFiles:       jsonb("affected_files").$type<string[]>().default([]),
  patchBundle:         jsonb("patch_bundle").$type<Record<string, string>>().default({}),
  validationPlan:      jsonb("validation_plan").$type<string[]>().default([]),
  validationStatus:    text("validation_status").notNull().default("pending"),
  approved:            boolean("approved").notNull().default(false),
  approvedBy:          text("approved_by"),
  githubBranch:        text("github_branch"),
  githubPrUrl:         text("github_pr_url"),
  replitStatus:        text("replit_status").notNull().default("pending"),
  createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type SliceProposal = typeof sliceProposals.$inferSelect;

// ─── Research Pipeline ─────────────────────────────────────────────────────

export const researchArticles = pgTable("research_articles", {
  id:          serial("id").primaryKey(),
  source:      text("source").notNull().default("medium"),
  title:       text("title").notNull(),
  url:         text("url").notNull().unique(),
  author:      text("author"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  excerpt:     text("excerpt"),
  tags:        jsonb("tags").$type<string[]>().default([]),
  raw:         jsonb("raw"),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const insertResearchArticleSchema = createInsertSchema(researchArticles).omit({ id: true, createdAt: true });
export type InsertResearchArticle = z.infer<typeof insertResearchArticleSchema>;
export type ResearchArticle = typeof researchArticles.$inferSelect;

export const researchReviews = pgTable("research_reviews", {
  id:                  serial("id").primaryKey(),
  articleId:           integer("article_id").notNull(),
  relevanceScore:      integer("relevance_score").notNull(),
  trustScore:          integer("trust_score").notNull(),
  noveltyScore:        integer("novelty_score").notNull(),
  actionabilityScore:  integer("actionability_score").notNull(),
  verdict:             text("verdict").notNull(),
  reasons:             jsonb("reasons").$type<string[]>().default([]),
  createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type ResearchReview = typeof researchReviews.$inferSelect;

export const researchSummaries = pgTable("research_summaries", {
  id:         serial("id").primaryKey(),
  articleId:  integer("article_id").notNull(),
  summary:    text("summary").notNull(),
  takeaways:  jsonb("takeaways").$type<string[]>().default([]),
  createdAt:  timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type ResearchSummary = typeof researchSummaries.$inferSelect;

export const proposedUpgrades = pgTable("proposed_upgrades", {
  id:                    serial("id").primaryKey(),
  articleId:             integer("article_id").notNull(),
  title:                 text("title").notNull(),
  rationale:             text("rationale").notNull(),
  affectedFiles:         jsonb("affected_files").$type<string[]>().default([]),
  patchBundle:           jsonb("patch_bundle").$type<Record<string, string>>().default({}),
  validationPlan:        jsonb("validation_plan").$type<string[]>().default([]),
  validationStatus:      text("validation_status").notNull().default("pending"),
  requiresHumanApproval: boolean("requires_human_approval").notNull().default(true),
  approved:              boolean("approved").notNull().default(false),
  approvedBy:            text("approved_by"),
  createdAt:             timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type ProposedUpgrade = typeof proposedUpgrades.$inferSelect;

export const githubExports = pgTable("github_exports", {
  id:                 serial("id").primaryKey(),
  proposedUpgradeId:  integer("proposed_upgrade_id").notNull(),
  branchName:         text("branch_name").notNull(),
  commitSha:          text("commit_sha"),
  prNumber:           integer("pr_number"),
  prUrl:              text("pr_url"),
  status:             text("status").notNull().default("pending"),
  createdAt:          timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type GithubExport = typeof githubExports.$inferSelect;

// ─── Agent Handoff Pipeline ────────────────────────────────────────────────
// Full automated pipeline: Medium scan → OpenAI code proposal → AI safety review
// → OpenAI refinement → human approval → Replit agent implementation.

export const agentHandoffs = pgTable("agent_handoffs", {
  id:                   serial("id").primaryKey(),
  articleId:            integer("article_id").notNull(),
  articleTitle:         text("article_title").notNull(),
  articleUrl:           text("article_url").notNull(),
  articleSummary:       text("article_summary"),

  // Step A: GPT-4o Code Architect — first concrete implementation pass
  openaiCodeProposal:   jsonb("openai_code_proposal").$type<{
    files: { path: string; content: string; explanation: string }[];
    summary: string;
    concerns: string[];
  } | null>().default(null),

  // Step B: Claude Safety Review — adversarial HIPAA/FDA/clinical safety check
  claudeCodeReview:     jsonb("claude_code_review").$type<{
    overallVerdict: "approve" | "revise" | "reject";
    concerns: string[];
    suggestions: string[];
    safetyFlags: string[];
    hipaaRisks: string[];
    fdaRisks: string[];
  } | null>().default(null),

  // Step B2: Claude Slice Review — import-aware architecture & coupling analysis
  claudeSliceReview:    jsonb("claude_slice_review").$type<{
    architectureNotes: string[];
    couplingRisks: string[];
    interfaceRisks: string[];
    specificRecommendations: string[];
    openQuestions: string[];
    blastRadius: string[];
    confidenceScore: number;
    verdict: "proceed" | "caution" | "hold";
  } | null>().default(null),

  // Step C: GPT-4o Refiner — improved code addressing both Claude reviews
  openaiRefinedCode:    jsonb("openai_refined_code").$type<{
    files: { path: string; content: string; explanation: string }[];
    changesSummary: string;
    resolvedConcerns: string[];
    remainingRisks: string[];
  } | null>().default(null),

  // Pipeline status
  pipelineStatus:       text("pipeline_status").notNull().default("running"),
  // running | awaiting_approval | approved | implementing | implemented | rejected | failed

  humanApprovedBy:      text("human_approved_by"),
  humanApprovedAt:      timestamp("human_approved_at", { withTimezone: true }),
  agentNotes:           text("agent_notes"),
  createdAt:            timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type AgentHandoff = typeof agentHandoffs.$inferSelect;

// ── Lab panels (CBC / CMP / ABG) ──────────────────────────────────────────────
export const labPanels = pgTable("lab_panels", {
  id:                    serial("id").primaryKey(),
  encounterId:           integer("encounter_id").references(() => encounters.id),
  clinicEncounterId:     integer("clinic_encounter_id").references(() => clinicEncounters.id),
  panelType:             text("panel_type").notNull(),           // "CBC" | "CMP" | "ABG" | "MIXED"
  collectedAt:           timestamp("collected_at").notNull(),
  // CBC
  wbc:                   real("wbc"),                            // ×10³/µL
  rbc:                   real("rbc"),                            // ×10⁶/µL
  hgb:                   real("hgb"),                            // g/dL
  hct:                   real("hct"),                            // %
  plt:                   real("plt"),                            // ×10³/µL
  neutPct:               real("neut_pct"),                       // %
  bandPct:               real("band_pct"),                       // %
  // CMP
  sodium:                real("sodium"),                         // mEq/L
  potassium:             real("potassium"),                      // mEq/L
  chloride:              real("chloride"),                       // mEq/L
  bicarbonate:           real("bicarbonate"),                    // mEq/L
  bun:                   real("bun"),                            // mg/dL
  creatinine:            real("creatinine"),                     // mg/dL
  glucose:               real("glucose"),                        // mg/dL
  calcium:               real("calcium"),                        // mg/dL
  albumin:               real("albumin"),                        // g/dL
  totalBilirubin:        real("total_bilirubin"),                // mg/dL
  alt:                   real("alt"),                            // U/L
  ast:                   real("ast"),                            // U/L
  // ABG
  ph:                    real("ph"),
  pco2:                  real("pco2"),                           // mmHg
  po2:                   real("po2"),                            // mmHg
  hco3:                  real("hco3"),                           // mEq/L
  baseExcess:            real("base_excess"),                    // mEq/L
  sao2:                  real("sao2"),                           // %
  lactate:               real("lactate"),                        // mmol/L
  fio2:                  real("fio2"),                           // fraction 0–1
  // Extras
  procalcitonin:         real("procalcitonin"),                  // ng/mL
  crp:                   real("crp"),                            // mg/dL
  inrPt:                 real("inr_pt"),                         // INR
  notes:                 text("notes"),
  createdBy:             text("created_by"),
  createdAt:             timestamp("created_at").notNull().defaultNow(),
});
export const insertLabPanelSchema = createInsertSchema(labPanels).omit({ id: true, createdAt: true });
export type InsertLabPanel = z.infer<typeof insertLabPanelSchema>;
export type LabPanel = typeof labPanels.$inferSelect;

// ── Ventilator snapshots ────────────────────────────────────────────────────
export const ventilatorSnapshots = pgTable("ventilator_snapshots", {
  id:                    serial("id").primaryKey(),
  encounterId:           integer("encounter_id").references(() => encounters.id),
  clinicEncounterId:     integer("clinic_encounter_id").references(() => clinicEncounters.id),
  recordedAt:            timestamp("recorded_at").notNull(),
  mode:                  text("mode"),                           // AC/VC | SIMV | PSV | CPAP | BiPAP
  fiO2:                  real("fi_o2"),                          // 0.21–1.0
  peep:                  real("peep"),                           // cmH₂O
  tidalVolume:           real("tidal_volume"),                   // mL
  setRate:               real("set_rate"),                       // /min
  peakPressure:          real("peak_pressure"),                  // cmH₂O
  plateauPressure:       real("plateau_pressure"),               // cmH₂O
  meanAirwayPressure:    real("mean_airway_pressure"),           // cmH₂O
  dynamicCompliance:     real("dynamic_compliance"),             // mL/cmH₂O
  resistance:            real("resistance"),                     // cmH₂O/L/s
  minuteVentilation:     real("minute_ventilation"),             // L/min
  pfRatio:               real("pf_ratio"),                       // PaO₂/FiO₂ — computed
  drivingPressure:       real("driving_pressure"),               // plateau − PEEP
  pvLoopPoints:          jsonb("pv_loop_points"),                // [{v,p}] for curve rendering
  createdAt:             timestamp("created_at").notNull().defaultNow(),
});
export const insertVentilatorSnapshotSchema = createInsertSchema(ventilatorSnapshots).omit({ id: true, createdAt: true });
export type InsertVentilatorSnapshot = z.infer<typeof insertVentilatorSnapshotSchema>;
export type VentilatorSnapshot = typeof ventilatorSnapshots.$inferSelect;

// ── SOFA score time series ──────────────────────────────────────────────────
export const sofaScores = pgTable("sofa_scores", {
  id:                    serial("id").primaryKey(),
  encounterId:           integer("encounter_id").references(() => encounters.id),
  clinicEncounterId:     integer("clinic_encounter_id").references(() => clinicEncounters.id),
  scoredAt:              timestamp("scored_at").notNull(),
  // Component scores 0–4
  respiratoryScore:      integer("respiratory_score").notNull(),
  coagulationScore:      integer("coagulation_score").notNull(),
  liverScore:            integer("liver_score").notNull(),
  cardiovascularScore:   integer("cardiovascular_score").notNull(),
  cnsScore:              integer("cns_score").notNull(),
  renalScore:            integer("renal_score").notNull(),
  totalScore:            integer("total_score").notNull(),
  delta:                 integer("delta"),                        // vs. prior score
  interpretation:        text("interpretation"),                  // LOW_RISK | MODERATE | HIGH | CRITICAL
  pfRatio:               real("pf_ratio"),
  createdAt:             timestamp("created_at").notNull().defaultNow(),
});
export const insertSofaScoreSchema = createInsertSchema(sofaScores).omit({ id: true, createdAt: true });
export type InsertSofaScore = z.infer<typeof insertSofaScoreSchema>;
export type SofaScore = typeof sofaScores.$inferSelect;

// ── Bayesian trajectory records ─────────────────────────────────────────────
export const bayesianTrajectoryRecords = pgTable("bayesian_trajectory_records", {
  id:                    serial("id").primaryKey(),
  encounterId:           integer("encounter_id").references(() => encounters.id),
  computedAt:            timestamp("computed_at").notNull(),
  priorMean:             real("prior_mean").notNull(),            // prior Β(α,β) mean
  posteriorMean:         real("posterior_mean").notNull(),        // updated mean
  posteriorLower:        real("posterior_lower").notNull(),       // 95% CI lower
  posteriorUpper:        real("posterior_upper").notNull(),       // 95% CI upper
  observations:          jsonb("observations").notNull().default([]),
  trend:                 text("trend").notNull(),                 // improving|stable|worsening|rapidly_worsening
  horizonRisk:           jsonb("horizon_risk").notNull().default({}), // {h1,h4,h12,h24} probs
  sofaDelta:             integer("sofa_delta"),
  flags:                 jsonb("flags").notNull().default([]),
  createdAt:             timestamp("created_at").notNull().defaultNow(),
});
export const insertBayesianTrajectorySchema = createInsertSchema(bayesianTrajectoryRecords).omit({ id: true, createdAt: true });
export type InsertBayesianTrajectory = z.infer<typeof insertBayesianTrajectorySchema>;
export type BayesianTrajectoryRecord = typeof bayesianTrajectoryRecords.$inferSelect;

// ── Agent loop state (persistent across restarts) ─────────────────────────────
export const agentLoopState = pgTable("agent_loop_state", {
  id:          text("id").primaryKey().default("main"),
  running:     boolean("running").notNull().default(false),
  cycleCount:  integer("cycle_count").notNull().default(0),
  lastCycleAt: timestamp("last_cycle_at"),
  startedAt:   timestamp("started_at"),
  errors:      integer("errors").notNull().default(0),
  updatedAt:   timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type AgentLoopState = typeof agentLoopState.$inferSelect;

// ── Agent cycle results (persisted ring buffer) ───────────────────────────────
export const agentCycleResults = pgTable("agent_cycle_results", {
  id:             serial("id").primaryKey(),
  patientId:      text("patient_id").notNull(),
  clinicSiteId:   text("clinic_site_id"),
  risk:           jsonb("risk").notNull().default({}),
  icu:            jsonb("icu").notNull().default({}),
  safety:         jsonb("safety").notNull().default({}),
  routing:        jsonb("routing").notNull().default({}),
  insights:       jsonb("insights").notNull().default([]),
  auditHash:      text("audit_hash"),
  resultRedacted: jsonb("result_redacted").notNull().default({}),
  createdAt:      timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type AgentCycleResult = typeof agentCycleResults.$inferSelect;
