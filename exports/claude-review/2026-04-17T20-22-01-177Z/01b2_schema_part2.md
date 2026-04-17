# System Overview — Part B2: Shared Data Schema (continued)

## Review Prompt

Continuation of the shared data model review from Part B1.
Same focus: missing safety fields, incomplete patient state, dangerous state transitions, regulatory gaps.

## Files (continued)

---

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
```

