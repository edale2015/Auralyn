# 20-Block Claude Review Map for Med-Scribe

Use each block as a separate Claude packet. Paste only the listed files plus the minimum relevant types. Do **not** paste secrets, `.env` data, PHI, tokens, or production payloads.

## Universal packet wrapper

```text

Block name:
[NAME]

My understanding of what this block does:
[2-5 sentence description]

Runtime context:
TypeScript / Express / React / PostgreSQL / Redis / etc.

Constraints:
- preserve existing behavior unless clearly broken
- do not invent new dependencies
- do not redesign the whole app
- optimize for correctness, simplicity, and production safety

Relevant types:
[ONLY THE NEEDED TYPES]

Original code:
[ONLY THE TARGET FILES]
```

---

## Block 1: Bayesian Differential + Hybrid Scoring

**Why this block matters:** Highest-stakes algorithmic block for ranking differentials and reasoning confidence.


**Files to include:**

- `server/clinical/bayesianEngine.ts`

- `server/clinical/scoringEngine.ts`

- `server/clinical/hybridReasoning.ts`


**Claude prompt:**
```text
Review and reimplement this clinical scoring / reasoning block from scratch. Preserve functional intent unless there is a clear bug or safety issue. Optimize for correctness, determinism, explainability, and simplicity. Output: A) what the original does B) concerns/weaknesses C) rewritten code D) comparison E) recommended tests.
```


**Actual code excerpts from this block:**


### `server/clinical/bayesianEngine.ts`
```ts
/**
 * Bayesian Differential Diagnosis Engine
 *
 * Implements a Naive Bayes classifier for differential diagnosis.
 * Can be used standalone or as a scoring layer within the
 * hybrid-reasoning/hybridController.ts ensemble.
 *
 * The existing server/core/engines/bayesianEngine.ts handles training
 * on outcomes. This module provides:
 *  1. A symptom-to-diagnosis prior probability table (clinical literature)
 *  2. Bayesian posterior update given observed symptoms
 *  3. Ranked differential output with confidence bands
 */

export interface DiagnosisPrior {
  diagnosis: string;
  baseProbability: number;                     // P(D) — unconditional prevalence
  featureLikelihoods: Record<string, number>;  // P(symptom | D)
  // Provenance — populated when loaded from kb_diagnosis_rules
  ruleId?: string;
  version?: number;
  tableName?: string;
```


### `server/clinical/scoringEngine.ts`
```ts
export interface CentorInput {
  fever: boolean;
  tonsillarExudate: boolean;
  tenderNodes: boolean;
  cough: boolean;
  age?: number;
}

export interface Curb65Input {
  confusion: boolean;
  urea: number;
  respRate: number;
  systolicBp: number;
  age: number;
}

export interface SoreThroatRiskInput extends CentorInput {
  rapidAntigenTest?: "positive" | "negative" | "not_done";
  symptoms_days?: number;
}

export interface PneumoniaRiskInput extends Curb65Input {
```


### `server/clinical/hybridReasoning.ts`
```ts
import { normalizeDiagnosis } from "../ontology/diagnosisOntology";
import { runDifferential, PRIORS_COUNT } from "./bayesianEngine";

export interface HybridReasoningResult {
  topDiagnosis: string;
  topDiagnosisCanonical?: string;
  topDiagnosisId?: string;
  confidence: number;
  differential: Array<{ dx: string; id?: string; score: number; label?: string }>;
  fusionTriggered: boolean;
  fusionPattern?: string;
  explainability: string;
  reasoningMode: "deterministic_fusion" | "bayesian" | "hybrid";
}

const FUSION_PATTERNS = [
  // ── Shoulder neurovascular emergency — highest priority ───────────────────
  {
    name: "SHOULDER_VASCULAR_EMERGENCY",
    symptoms: ["shoulder pain", "trauma", "no pulse"],
    diagnosis: "S40.011A",
    label: "Shoulder injury with vascular compromise",
```

---

## Block 2: Safety Gates + Escalation

**Why this block matters:** Safety-critical gatekeeper logic for block/review/hard-stop decisions.


**Files to include:**

- `server/clinical/safetyGate.ts`

- `server/clinical/escalationGuard.ts`

- `server/clinical/guardrails.ts`


**Claude prompt:**
```text
Review and reimplement this patient-safety gate block from scratch. Preserve feature intent, improve correctness, edge-case handling, and explicit escalation logic. Do not weaken safety behavior without explaining why. Output summary, weaknesses, rewritten code, comparison, and boundary-condition tests.
```


**Actual code excerpts from this block:**


### `server/clinical/safetyGate.ts`
```ts
import { auditLog } from "../security/auditLogger";

export interface SafetyGateInput {
  riskScore: number;
  uncertainty?: number;
  action?: string;
  patientId?: string;
  actorId?: string;
}

export interface SafetyGateResult {
  allowed: boolean;
  reason?: string;
  requiredAction?: "physician_review" | "confidence_boost" | "hard_stop";
}

const RISK_THRESHOLD = 0.6;
const UNCERTAINTY_THRESHOLD = 0.3;
const HARD_STOP_THRESHOLD = 0.95;

export function clinicalSafetyGate(decision: SafetyGateInput): SafetyGateResult {
  if (decision.riskScore >= HARD_STOP_THRESHOLD) {
```


### `server/clinical/escalationGuard.ts`
```ts
import { logSecureEvent } from "../ops/secureAudit";

interface EscalationWindow {
  windowMs: number;
  erCount: number;
  totalCount: number;
  lastReset: number;
}

const window: EscalationWindow = {
  windowMs: 60 * 60 * 1000,
  erCount: 0,
  totalCount: 0,
  lastReset: Date.now(),
};

const ER_RATE_THRESHOLD = 0.40;
const MAX_ER_HOURLY = 120;

function resetWindowIfNeeded() {
  if (Date.now() - window.lastReset > window.windowMs) {
    window.erCount = 0;
```


### `server/clinical/guardrails.ts`
```ts
export interface ClinicalAction {
  type: string;
  riskScore: number;
  requiresConsent?: boolean;
  invasive?: boolean;
  toolRequired?: string;
  patientId?: string;
}

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
  requiresPhysicianOverride?: boolean;
  warnings?: string[];
}

const HIGH_RISK_THRESHOLD = 0.7;
const MODERATE_RISK_THRESHOLD = 0.4;

const INVASIVE_ACTIONS = new Set([
  "otoscopy",
  "oral_exam",
```

---

## Block 3: Final Clinical Pipeline Orchestration

**Why this block matters:** Core sequencing layer connecting intake, reasoning, safety, explainability, logging, and learning.


**Files to include:**

- `server/clinical/finalPipeline.ts`

- `server/clinical/runFullClinicalFlow.ts`

- `server/clinical/safetyPipeline.ts`


**Claude prompt:**
```text
Review and reimplement this clinical orchestration block from scratch. Focus on sequencing correctness, explicit handoffs, failure behavior, readability, and maintainability. Preserve intended behavior unless there is a clear bug. Output summary, weaknesses, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/clinical/finalPipeline.ts`
```ts
/**
 * Final Governed Pipeline (Section 8) — v1.1.0
 *
 * 8-stage authoritative clinical flow:
 *   1. NLP Intake              — normalise free-text → canonical ICD-10
 *   1.5 Multi-Complaint Fusion — detect high-acuity compound syndromes (NEW)
 *   2. Hybrid Reasoning        — deterministic fusion first, Bayesian fallback
 *   3. Safety Pipeline         — Sepsis / PEWS / OB / Mental-Health gate
 *   4. Explainability          — 1-line physician summary
 *   5. Versioned RLHF Proposal — never autonomous, always gated
 *   6. Security Log            — audit every invocation
 *   7. Human-Factors Emit      — INTAKE_REVIEWED telemetry
 *   8. FHIR Sync Trigger       — async publish to EHR worker (non-blocking)
 */

import { structuredIntake }           from "./nlpIntake";
import { hybridReasoning }            from "./hybridReasoning";
import { safetyPipeline }             from "./safetyPipeline";
import { generateSummary }            from "./physicianSummary";
import { fuseComplaints }             from "./multiComplaintFusion";
import { proposeWeightUpdate }        from "../learning/versionedRLHF";
import { logSecurityEvent }           from "../ops/security";
```


### `server/clinical/runFullClinicalFlow.ts`
```ts
/**
 * Hardened clinical flow entry point — the single master orchestrator.
 *
 * Every clinical decision MUST pass through this pipeline:
 *   1. Safety gate (hard stop — no bypass)
 *   2. Clinical reasoning (multi-agent orchestrator with timeout)
 *   3. Audit logging (immutable record of every decision)
 *
 * Existing routes that call the orchestrator directly are still valid
 * (they carry their own safety wiring); this module is the canonical
 * hardened surface for any NEW integration point.
 */
import { withTimeout } from "../utils/withTimeout";
import { runSafetyGate } from "../safety/safetyGate";
import { runFullClinicalFlow as orchestratorFlow, ClinicalInput } from "../orchestrator/clinicalOrchestrator";
import { logAuditEvent } from "../governance/changeAuditLog";
import { ENV } from "../config/env";

export interface HardenedClinicalInput {
  patientId: string;
  complaint: string;
  data: Record<string, unknown>;
```


### `server/clinical/safetyPipeline.ts`
```ts
/**
 * Master Clinical Safety Pipeline
 *
 * ALL clinical decisions must pass through this pipeline before being
 * returned to any provider-facing or patient-facing interface.
 *
 * Priority order (hard-coded, non-negotiable):
 *   1. Sepsis detection (qSOFA / NEWS2)  → ER_NOW if score ≥ 2
 *   2. Pediatric deterioration (PEWS)    → ER_NOW if score ≥ 6, URGENT if ≥ 4
 *   3. Obstetric emergency              → ER_NOW for any critical OB finding
 *   4. Mental health / suicide risk     → ER_NOW for high/imminent ideation
 *   5. Hybrid engine conflict resolver  → deterministic vs. probabilistic merge
 *   6. Final output                     → disposition + full audit trail
 *
 * Design principle: any single safety trigger produces an immediate ER_NOW
 * that CANNOT be overridden by downstream probabilistic reasoning.
 *
 * The pipeline never silently fails — it returns SAFE_FALLBACK on error.
 */

import { detectSepsis,   type VitalSigns }            from "./sepsis";
import { PEWS,           type PedsVitals }             from "./pediatric";
```

---

## Block 4: Clinical Brain Engine

**Why this block matters:** Large reasoning hub tying together differential, safety, questions, evidence, and recommendations.


**Files to include:**

- `server/core/clinicalBrainEngine.ts`


**Claude prompt:**
```text
Review and reimplement this clinical brain engine block from scratch. Focus on orchestration clarity, hidden coupling, overly broad responsibilities, and safer failure handling. Preserve feature intent and compare your version against the original.
```


**Actual code excerpts from this block:**


### `server/core/clinicalBrainEngine.ts`
```ts
import { findSimilarCasesForState } from "../similarity/caseSimilarityService";
import { computeDifferentialProbabilities, type DifferentialCandidate } from "../services/diagnostic/differentialProbabilityEngine";
import { selectNextBestQuestion, type NextBestQuestionResult } from "../services/diagnostic/nextBestQuestionEngine";
import { detectRedFlags } from "../agent/safety/redFlags";
import { logBrainDecision } from "./brainAuditLog";
import { storeClinicalCase, findSimilarMemoryCases } from "./clinicalMemoryEngine";
import { normalizeSymptoms } from "./symptomNormalizationEngine";
import { safetyGuard } from "./clinicalSafetyGuard";
import { diagnosticEvidenceEngine, type EvidenceResult } from "./diagnosticEvidenceEngine";
import { computeUncertainty, type UncertaintyResult } from "./uncertaintyEngine";
import { getBulkRecommendations, type TreatmentRecommendation } from "./treatmentEngine";
import { prioritizeTests } from "./testRecommendationEngine";
import { generateBulkReturnPrecautions } from "./returnPrecautionEngine";
import { contradictionEngine, type ContradictionResult } from "./contradictionEngine";
import { evidenceAggregatorEngine, type AggregatedDifferential } from "./evidenceAggregatorEngine";
import { clinicalGovernanceEngine, type GovernanceOutput } from "./clinicalGovernanceEngine";
import { temporalProgressionEngine, type TemporalOutput } from "./temporalProgressionEngine";
import { riskStratificationEngine, type RiskOutput } from "./riskStratificationEngine";
import { guidelineAdherenceEngine, type GuidelineOutput } from "./guidelineAdherenceEngine";
import { physicianReviewPacketEngine, type PhysicianReviewPacket } from "./physicianReviewPacketEngine";
import { dispositionCalibrationEngine } from "./dispositionCalibrationEngine";
import { complaintCompletenessEngine } from "./complaintCompletenessEngine";
```

---

## Block 5: Adaptive Questions + Dynamic Intake

**Why this block matters:** Likely to surface missing edge cases, stale state, and simpler logic opportunities.


**Files to include:**

- `server/assistant/dynamicQuestionService.ts`

- `server/assistant/adaptiveQuestionEngine.ts`


**Claude prompt:**
```text
Reimplement this adaptive questioning block from scratch. Preserve the same functional purpose while improving clarity, feature coverage detection, edge-case handling, and testability. Output what it does, weaknesses, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/assistant/dynamicQuestionService.ts`
```ts
interface DynamicQuestion {
  id: string
  text: string
  purpose: string
  targetFeature: string
}

interface QuestionGapResult {
  questions: DynamicQuestion[]
  coveredFeatures: string[]
  missingFeatures: string[]
}

const COMPLAINT_FEATURES: Record<string, Array<{
  feature: string
  keywords: string[]
  question: DynamicQuestion
}>> = {
  cough: [
    {
      feature: "shortness_of_breath",
      keywords: ["shortness", "sob", "breathless", "dyspnea"],
```


### `server/assistant/adaptiveQuestionEngine.ts`
```ts
export interface AdaptiveQuestion {
  id: string;
  text: string;
  feature: string;
  expectedInfoGain: number;
  rationale: string;
  currentEntropy: number;
  entropyIfYes: number;
  entropyIfNo: number;
  pYes: number;
}

export interface AdaptiveQuestionResult {
  complaint: string;
  currentEntropy: number;
  topDiagnosis: string;
  topProbability: number;
  questions: AdaptiveQuestion[];
  differential: Array<{ diagnosis: string; probability: number }>;
}

interface DiagnosisFeatureLikelihood {
```

---

## Block 6: Telemedicine Assistant API Slice

**Why this block matters:** Good route+service pair for API design, validation, session flow, and draft-reply logic.


**Files to include:**

- `server/assistant/telemedicineAssistantService.ts`

- `server/routes/telemedicineAssistantRoutes.ts`


**Claude prompt:**
```text
Review and reimplement this route + service pair from scratch. Preserve the feature purpose, improve request validation, response consistency, error handling, and route/service separation. Do not redesign the whole app. Output responsibilities, weaknesses, rewritten service, rewritten routes, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/assistant/telemedicineAssistantService.ts`
```ts
import { getClinicalState } from "../state/clinicalStateStore"
import { publishEvent } from "../core/events/eventPublisher"
import { getUpdatedDifferential } from "./telemedicineDifferentialService"
import { checkSafetyAlerts } from "./telemedicineSafetyService"
import { getMedicationSuggestions } from "./telemedicineMedicationSuggestionService"
import { getReturnPrecautions } from "./telemedicineReturnPrecautionService"
import { getResourceRecommendations } from "../resources/resourceRecommendationEngine"
import { computeUrgencyScore } from "../triage/triagePrioritizationEngine"
import { computeContradictionReport } from "../diagnostics/differentialContradictionEngine"
import { getWeightedAdaptiveQuestions } from "../learning/adaptiveQuestionLearningEngine"

export interface AssistantResult {
  caseId: string
  complaint: string | null
  triage: {
    level: string
    urgencyScore: number
    reason: string
  }
  differential: Array<{
    diagnosis: string
    confidence: number
```


### `server/routes/telemedicineAssistantRoutes.ts`
```ts
import { Router } from "express";
import { runTelemedicineAssistant } from "../assistant/telemedicineAssistantService";
import { generateChartNoteFromResult } from "../assistant/chartNoteGenerator";
import { generateDischargeFromResult } from "../assistant/dischargeGenerator";
import {
  createSession,
  getSession,
  updateSession,
  addPatientMessage,
  addDoctorMessage,
  setDraftReply,
  listActiveSessions,
  listAllSessions,
  closeSession,
} from "../assistant/telemedicineSessionService";
import { checkSafetyAlerts } from "../assistant/telemedicineSafetyService";
import { getUpdatedDifferential } from "../assistant/telemedicineDifferentialService";
import { getMedicationSuggestions } from "../assistant/telemedicineMedicationSuggestionService";
import { checkMedicationSafety } from "../assistant/telemedicineMedicationSafetyService";
import { generateClinicalCodes } from "../assistant/telemedicineCodingService";
import { getReturnPrecautions, formatDischargeMessage } from "../assistant/telemedicineReturnPrecautionService";
import { generateChartNote } from "../assistant/telemedicineNoteService";
```

---

## Block 7: Audit Chain Integrity

**Why this block matters:** High-value integrity block for tamper-resistance and audit trustworthiness.


**Files to include:**

- `server/audit/hashChain.ts`

- `server/audit/auditLogger.ts`

- `server/audit/auditVerifier.ts`


**Claude prompt:**
```text
Review and reimplement this audit integrity block from scratch. Identify cryptographic or logical weaknesses, ordering assumptions, replay risks, and verification gaps. Do not weaken audit guarantees. Output summary, risks, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/audit/hashChain.ts`
```ts
import crypto from "crypto";

let lastHash = "GENESIS";

export function computeChainHash(prevHash: string, entry: Record<string, unknown>): string {
  const content = prevHash + JSON.stringify(entry);
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function advanceChain(entry: Record<string, unknown>): { hash: string; prevHash: string } {
  const prevHash = lastHash;
  const hash = computeChainHash(prevHash, entry);
  lastHash = hash;
  return { hash, prevHash };
}

export function getCurrentChainHead(): string {
  return lastHash;
}

export function verifyChainLink(entry: Record<string, unknown>, prevHash: string, claimedHash: string): boolean {
  const expected = computeChainHash(prevHash, entry);
```


### `server/audit/auditLogger.ts`
```ts
import { db } from "../db";
import { auditLogs } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { advanceChain } from "./hashChain";

export function createTraceId(): string {
  return uuidv4();
}

export async function auditStep({
  traceId,
  step,
  input,
  output,
  metadata = {},
}: {
  traceId: string;
  step: string;
  input: any;
  output: any;
  metadata?: Record<string, any>;
```


### `server/audit/auditVerifier.ts`
```ts
/**
 * DOMAIN 2 — REC 2.2: Immutable Audit Trail Verification
 *
 * The existing hash chain WRITES are correct. This adds READ verification —
 * the ability to prove to FDA/OCR that the audit log was not tampered with
 * since the first record was written.
 *
 * Without verification, a write-only hash chain does not satisfy
 * 45 CFR §164.312(b) — OCR has explicitly stated that integrity controls
 * must include the ability to verify data has not been altered.
 *
 * MY ADDITION: Batch Merkle root verification for efficient spot-checking
 * of large audit logs without reading every record.
 */

import crypto from "crypto";
import { db }  from "../db";
import { auditLogs } from "../../shared/schema";
import { asc, desc } from "drizzle-orm";
import { computeChainHash } from "./hashChain";
import { logger } from "../utils/logger";

```

---

## Block 8: Auth + RBAC Enforcement

**Why this block matters:** Good security comparison block for fail-closed behavior and authorization boundaries.


**Files to include:**

- `server/auth/unifiedAuth.ts`

- `server/auth/rbacService.ts`

- `server/auth/requirePhysician.ts`


**Claude prompt:**
```text
Review and reimplement this auth / RBAC block from scratch. Be strict about authentication, authorization, tenancy, and fail-closed behavior. Preserve expected behavior where possible. Output summary, risks, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/auth/unifiedAuth.ts`
```ts
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";

export type AuthRole = "admin" | "physician" | "reviewer" | "staff";

export interface AuthUser {
  id: string;
  email: string;
  role: AuthRole;
  clinicId?: string;
}

export interface AuthTokenPayload extends AuthUser {
  iat?: number;
  exp?: number;
}

function getJwtSecret(): string {
  const secret = ENV.JWT_SECRET || (ENV.NODE_ENV !== "production" ? "dev-jwt-secret-DO-NOT-USE-IN-PROD" : undefined);
  if (!secret) {
    throw new Error("❌ JWT_SECRET is not configured");
  }
```


### `server/auth/rbacService.ts`
```ts
import type { UserRole } from "../types/auth";

export type Permission =
  | "*"
  | "clinical:run"
  | "clinical:override"
  | "clinical:view"
  | "view:analytics"
  | "view:dashboard"
  | "billing:view"
  | "billing:manage"
  | "tenant:manage"
  | "user:manage"
  | "ehr:read"
  | "ehr:write"
  | "deployment:manage"
  | "audit:view";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ["*"],
  physician: ["clinical:run", "clinical:override", "clinical:view", "view:analytics", "view:dashboard", "ehr:read", "ehr:write", "audit:view"],
  nurse: ["clinical:run", "clinical:view", "view:dashboard", "ehr:read"],
```


### `server/auth/requirePhysician.ts`
```ts
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

type PhysicianClaims = {
  sub: string;
  role?: string;
  physician?: boolean;
  physicianId?: string;
};

declare global {
  namespace Express {
    interface Request {
      physician?: PhysicianClaims;
    }
  }
}

export function requirePhysician(
  req: Request,
  res: Response,
  next: NextFunction
```

---

## Block 9: Corruption Guard + Validation

**Why this block matters:** Good candidate for finding validation gaps, malformed data paths, and silent failures.


**Files to include:**

- `server/data/corruptionGuard.ts`

- `server/validation/clinicalSchemaValidator.ts`


**Claude prompt:**
```text
Review and reimplement this validation / corruption-guard block from scratch. Focus on malformed data handling, clear error reporting, and preserving validation intent. Output summary, weaknesses, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/data/corruptionGuard.ts`
```ts
type SheetRow = Record<string, any>;

const CC_ID_PATTERN = /^[a-z0-9_]+$/;

interface BadRow {
  idx: number;
  table: string;
  field: string;
  value: string;
  reason: string;
}

function checkFieldFormat(
  value: string,
  pattern: RegExp,
  fieldName: string,
  table: string,
  idx: number,
): BadRow | null {
  const v = String(value ?? "").trim();

  if (!v) {
```


### `server/validation/clinicalSchemaValidator.ts`
```ts
import {
  requiredSheets,
  requiredSheetSchemas,
  allowedDispositionLevels,
  allowedAnswerTypes,
  allowedConfidenceHints,
} from "./clinicalSheetSchemas";
import {
  WorkbookValidationReport,
  SheetValidationResult,
  ValidationIssue,
} from "./clinicalSchemaTypes";
import { LoadedWorkbook } from "./workbookLoader";

function hasValue(v: any): boolean {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

function normalize(v: any): string {
  return String(v ?? "").trim();
}

```

---

## Block 10: Knowledge Base Runtime + Admin Routes

**Why this block matters:** Large operational surface for KB loading, CRUD, and admin behavior.


**Files to include:**

- `server/kb/kbRuntime.ts`

- `server/routes/knowledgeBaseAdminRoutes.ts`


**Claude prompt:**
```text
Review and reimplement this KB runtime + admin slice from scratch. Preserve feature intent while improving validation, route consistency, data loading behavior, and maintainability. Stay within the slice shown. Output summary, weaknesses, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/kb/kbRuntime.ts`
```ts
/**
 * KB Runtime Cache
 *
 * Loads clinical knowledge from the Postgres KB tables at startup
 * and caches it in memory with a configurable TTL. All pipeline
 * entry-points (Bayesian engine, red-flag evaluator, treatment
 * plan generator) read from this cache — not from hardcoded TS.
 *
 * The cache is automatically invalidated by KB write routes so
 * any UI edit takes effect on the next triage request.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import type { DiagnosisPrior } from "../clinical/bayesianEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KbRedFlagRule {
  ruleId: string;
  complaintId: string;
  label: string;
```


### `server/routes/knowledgeBaseAdminRoutes.ts`
```ts
import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  kbComplaints, kbQuestions, kbModifiers, kbRedFlagRules,
  kbWorkupRules, kbDiagnosisRules, kbTreatmentRules,
  kbDispositionRules, kbPlanTemplates, kbGoldenCases,
  kbKnowledgeChanges,
  insertKbComplaintSchema, insertKbQuestionSchema, insertKbModifierSchema,
  insertKbRedFlagRuleSchema, insertKbWorkupRuleSchema, insertKbDiagnosisRuleSchema,
  insertKbTreatmentRuleSchema, insertKbDispositionRuleSchema, insertKbPlanTemplateSchema,
  insertKbGoldenCaseSchema, insertKbKnowledgeChangeSchema,
} from "../../shared/schema";
import { eq, desc, and, ilike, count, or } from "drizzle-orm";
import { seedKnowledgeBase } from "../kb/kbSeeder";
import { reloadAndRewireKbCache, getKbCacheStatus } from "../kb/kbRuntime";
import { migrateToFeatureTable, validateFeatureCoverage } from "../kb/migrateCsvToKb";
import {
  kbFeatureLikelihoods, kbClinicalWeights, kbComplaintModules, kbComplaintPacks,
  kbFeatureModels, kbEngineRouting,
  insertKbFeatureLikelihoodSchema, insertKbFeatureModelSchema, insertKbEngineRoutingSchema,
```

---

## Block 11: Complaint Node Execution Layer

**Why this block matters:** Important mid-layer that likely contains branching, config assumptions, and complaint-specific orchestration.


**Files to include:**

- `server/services/complaintNodeRunner.ts`

- `server/services/complaintConfigLoader.ts`

- `server/services/complaintEngines.ts`


**Claude prompt:**
```text
Review and reimplement this complaint execution layer from scratch. Focus on config loading assumptions, node sequencing, branching correctness, and maintainability. Preserve functional intent. Output summary, weaknesses, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/services/complaintNodeRunner.ts`
```ts
import type { CaseState, AgentAction } from "../../shared/agentTypes";
import type { TraceEvent } from "../../shared/testingTypes";
import type { ComplaintConfig } from "./complaintConfigLoader";
import { loadComplaintConfig } from "./complaintConfigLoader";
import {
  runCoreQuestions,
  runRedFlagsComplaint,
  runScoring,
  runDisposition,
  renderTemplate,
  findTemplate,
} from "./complaintEngines";
import { runGenericComplaintV1 } from "../engines/genericComplaintEngineV1";
import { enhancedSupervisorGate } from "./supervisorEnhanced";
import { applyExamOverrides } from "./nodes/examOverride";
import { runDiffAndConfidenceNode } from "./nodes/diffAndConfidenceNode";
import { joinRedFlagsToMaster } from "./nodes/redFlagMasterJoin";
import { addSpotInterventions } from "./nodes/spotInterventionsNode";
import { runSpecialistCouncilNode } from "./nodes/specialistCouncilNode";
import type { CouncilLLM } from "./nodes/specialistCouncilNode";

export type NodeId =
```


### `server/services/complaintConfigLoader.ts`
```ts
import fs from "fs";
import path from "path";
import { getTable, getTableFiltered } from "../data/registry";
import {
  assertCoreQuestionsNotCorrupt,
  assertRedFlagRulesNotCorrupt,
  assertDispositionRulesNotCorrupt,
  assertOutputTemplatesNotCorrupt,
  assertClusterScoringRulesNotCorrupt,
} from "../data/corruptionGuard";

type SheetRow = Record<string, any>;

export interface ComplaintRegistryEntry {
  ccId: string;
  system: string;
  label: string;
  version: number;
  defaultCluster: string;
  scoringModule: string;
  graphId: string;
  enabled: boolean;
```


### `server/services/complaintEngines.ts`
```ts
import type { CaseState } from "../../shared/agentTypes";
import type { ComplaintConfig, CoreQuestion, RedFlagRule, DispositionRule, OutputTemplate } from "./complaintConfigLoader";
import { evaluateExpr } from "./exprEval";
import { computeCentor } from "../agent/scoring/centor";
import { computeEaracheScore } from "../agent/scoring/earacheScore";
import { computeCoughScore } from "../agent/scoring/coughScore";
import { computeChestPainScore } from "../agent/scoring/chestPainScore";
import { computeDizzinessScore } from "../agent/scoring/dizzinessScore";
import { computeAbdPainScore } from "../agent/scoring/abdPainScore";
import { computeUtiScore } from "../agent/scoring/utiScore";
import { computeTesticularPainScore } from "../agent/scoring/testicularPainScore";
import { computePelvicPainScore } from "../agent/scoring/pelvicPainScore";
import { computeHeadacheScore } from "../agent/scoring/headacheScore";

export interface QuestionResult {
  nextQuestion: CoreQuestion | null;
  allAnswered: boolean;
  requiredMissing: string[];
  questionsEvaluated: number;
}

export function runCoreQuestions(state: CaseState, config: ComplaintConfig): QuestionResult {
```

---

## Block 12: Multi-Agent Orchestration

**Why this block matters:** Useful for detecting hidden coupling, duplicate dispatch, and unclear agent contracts.


**Files to include:**

- `server/agents/multiAgentCoordinator.ts`

- `server/agents/controllerAgent.ts`

- `server/agents/orchestrator.ts`

- `server/agents/unifiedAgentRegistry.ts`


**Claude prompt:**
```text
Review and reimplement this multi-agent orchestration block from scratch. Focus on determinism, avoiding duplicate work, explicit registration and dispatch behavior, failure isolation, and simplicity. Output summary, weaknesses, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/agents/multiAgentCoordinator.ts`
```ts
interface AgentTask {
  agent: string;
  task: string;
  assignedAt: number;
  status: "active" | "completed" | "failed";
}

export interface CoordinatorSummary {
  activeTasks: AgentTask[];
  completedTasks: number;
  failedTasks: number;
  totalAssigned: number;
  agents: string[];
}

export class MultiAgentCoordinator {
  private tasks: AgentTask[] = [];

  assign(agent: string, task: string): { status: string; reason?: string } {
    const conflict = this.tasks.find((t) => t.task === task && t.status === "active");
    if (conflict) {
      return { status: "blocked", reason: `Task already assigned to ${conflict.agent}` };
```


### `server/agents/controllerAgent.ts`
```ts
import { addTask, type Task, type TaskType } from "./taskBus";

const TASK_AGENT_MAP: Record<TaskType, string> = {
  SAFETY_CHECK: "SafetyAgent",
  SRE_HEAL:     "SREAgent",
  ROUTING:      "RoutingAgent",
  REVENUE:      "RevenueAgent",
  LEARNING:     "LearningAgent",
  GOVERNANCE:   "GovernanceAgent",
  SIMULATION:   "SimulationAgent",
};

export function getAgentForTask(taskType: TaskType): string {
  return TASK_AGENT_MAP[taskType] ?? "AutoDebugger";
}

/**
 * Route a clinical input to all relevant agents via the task bus.
 * Safety always dispatched first (priority 10).
 */
export function routeTasks(input: any, source = "pipeline"): Task[] {
  const tasks: Task[] = [
```


### `server/agents/orchestrator.ts`
```ts
import { CircuitBreaker } from "../utils/circuitBreaker";
import { withTimeoutStrict } from "../utils/withTimeout";
import { logger } from "../utils/logger";

export interface AgentContext {
  text: string;
  patientId?: string;
  answers?: Record<string, string>;
  channel?: "web" | "telegram" | "whatsapp";
  metadata?: Record<string, any>;
}

export interface AgentOutput {
  [key: string]: any;
}

export interface Agent {
  name: string;
  priority: number;
  timeoutMs?: number;
  dependsOn?: string[];
  run: (context: AgentContext, priorResults: Record<string, AgentOutput>) => Promise<AgentOutput>;
```


### `server/agents/unifiedAgentRegistry.ts`
```ts
import { pool } from '../db';
import { logger } from '../utils/logger';

export type AgentStatus = 'healthy' | 'warning' | 'degraded' | 'critical' | 'disabled';
export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

export interface AgentHeartbeatInput {
  agentId: string;
  type: 'coordinator' | 'task' | 'governance' | 'ms';
  version: string;
  p95LatencyMs?: number;
  successRate?: number;
  status?: AgentStatus;
  circuitBreakerState?: CircuitBreakerState;
}

export interface AgentRecord {
  agentId: string;
  type: string;
  status: AgentStatus;
  lastHeartbeat: Date;
  circuitBreakerState: CircuitBreakerState;
```

---

## Block 13: Self-Improvement + Learning Loop

**Why this block matters:** High-signal for governance, uncontrolled drift, and approval-boundary issues.


**Files to include:**

- `server/agents/selfImprove.ts`

- `server/agents/selfImprovementOrchestrator.ts`

- `server/brain/selfImprovingBrain.ts`


**Claude prompt:**
```text
Review and reimplement this self-improvement / learning block from scratch. Be conservative about automated change behavior. Preserve auditability, approval gates, and traceability. Output summary, risks, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/agents/selfImprove.ts`
```ts
import { getAgentStats } from "./tracking";
import { publish } from "./eventBus";

export interface ImprovementAction {
  agent: string;
  action: string;
  reason: string;
  timestamp: string;
  metric: { successRate: number; runs: number };
}

const improvementLog: ImprovementAction[] = [];
const agentThresholds: Record<string, Record<string, number>> = {};

export function evaluateAndImprove(): ImprovementAction[] {
  const stats = getAgentStats();
  const actions: ImprovementAction[] = [];

  for (const [agent, s] of Object.entries(stats)) {
    if (s.runs < 5) continue;

    if (s.successRate < 60) {
```


### `server/agents/selfImprovementOrchestrator.ts`
```ts
import { runSelfImprovementCycle } from "../engines/selfImprovementCycleEngine";

export interface OrchestrationResult {
  cycleResult: any;
  appliedCount: number;
  skippedCount: number;
}

export async function runContinuousImprovement(): Promise<OrchestrationResult> {
  const cycleResult = runSelfImprovementCycle();

  const approvedFixes = (cycleResult.fixes || []).filter(
    (f: any) => f.autoApprove === true
  );

  const skippedFixes = (cycleResult.fixes || []).filter(
    (f: any) => f.autoApprove !== true
  );

  return {
    cycleResult,
    appliedCount: approvedFixes.length,
```


### `server/brain/selfImprovingBrain.ts`
```ts
import { predictiveFailureEngine } from "../engines/predictiveFailureEngine";
import { memoryEngine } from "../engines/memoryEngine";
import { autoDebuggerAgent } from "../agents/autoDebuggerAgent";
import { rootCauseEngine } from "../agents/rootCauseEngine";
import { multiAgentCoordinator } from "../agents/multiAgentCoordinator";

export interface ImprovementCycle {
  cycleId: string;
  failures: any[];
  rootCause: any;
  debugActions: any[];
  agentStatus: any;
  memorySnapshot: any;
  recommendations: string[];
  timestamp: number;
}

export class SelfImprovingClinicalBrain {
  private cycles: ImprovementCycle[] = [];

  runCycle(): ImprovementCycle {
    autoDebuggerAgent.start();
```

---

## Block 14: Startup Assertions + Runtime Safety

**Why this block matters:** Catches operational safety weaknesses and ambiguous startup behavior.


**Files to include:**

- `server/config/assertProductionSafe.ts`

- `server/config/assertRuntimeModes.ts`

- `server/config/startupChecks.ts`

- `server/config/assertQueueReady.ts`


**Claude prompt:**
```text
Review and reimplement this startup safety / runtime assertion block from scratch. Focus on fail-closed behavior, operator clarity, and ambiguous startup paths. Output summary, weaknesses, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/config/assertProductionSafe.ts`
```ts
import { ENV } from "./env";

const BANNED_VALUES = new Set([
  "dev-secret",
  "dev-secret-change-in-prod",
  "dev-jwt-secret",
  "changeme",
  "password",
  "physician123",
  "admin123",
  "demo-password",
  "replace-with-a-long-random-secret",
  "replace-with-a-different-long-random-secret",
  "replace-with-a-strong-password",
]);

function assertRequired(name: string, value: string | undefined) {
  if (!value || value.trim() === "") {
    throw new Error(`❌ [STARTUP FATAL] Missing required production secret: ${name}`);
  }
}

```


### `server/config/assertRuntimeModes.ts`
```ts
import { ENV } from "./env";

export function assertRuntimeModes() {
  if (ENV.NODE_ENV !== "production") return;

  const violations: string[] = [];

  if (ENV.REVIEW_AUTH_MODE === "off") {
    violations.push("REVIEW_AUTH_MODE=off is forbidden in production");
  }

  if (ENV.ENABLE_TEST_ROUTES) {
    violations.push("ENABLE_TEST_ROUTES=true is forbidden in production");
  }

  if (ENV.ALLOW_PROVIDER_KEY_FALLBACK) {
    violations.push("ALLOW_PROVIDER_KEY_FALLBACK=true is forbidden in production");
  }

  if (process.env.USE_MOCK_EHR === "true") {
    violations.push("USE_MOCK_EHR=true is forbidden in production");
  }
```


### `server/config/startupChecks.ts`
```ts
import { ENV } from "./env"

export type CheckResult = { name: string; ok: boolean; detail: string }

export async function runStartupChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  results.push({
    name: "SESSION_SECRET",
    ok: ENV.SESSION_SECRET.length >= 12,
    detail: ENV.SESSION_SECRET.length >= 12 ? "Set" : "Too short or missing",
  })

  results.push({
    name: "OPENAI_API_KEY",
    ok: !!ENV.OPENAI_API_KEY,
    detail: ENV.OPENAI_API_KEY ? "Set" : "Missing — AI features disabled",
  })

  results.push({
    name: "TWILIO_AUTH_TOKEN",
    ok: !!ENV.TWILIO_AUTH_TOKEN,
```


### `server/config/assertQueueReady.ts`
```ts
import { ENV } from "./env";

export async function assertQueueReady() {
  if (ENV.NODE_ENV !== "production") return;

  const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const hasTcpRedis = ENV.REDIS_URL && !ENV.REDIS_URL.includes("upstash.io");

  if (!hasUpstash && !hasTcpRedis) {
    throw new Error("❌ [STARTUP FATAL] Redis is required in production. Set UPSTASH_REDIS_REST_URL/TOKEN or a TCP REDIS_URL.");
  }

  try {
    const { getRedisAsync } = await import("../queue/redis");
    const redis = await Promise.race([
      getRedisAsync(),
      new Promise<null>(r => setTimeout(() => r(null), 6000)),
    ]);
    if (!redis) throw new Error("Redis client unavailable after timeout");
    const pong = await redis.ping();
    if (pong !== "PONG") throw new Error("Redis ping did not return PONG");
  } catch (err: any) {
```

---

## Block 15: Automation Template Studio Backend

**Why this block matters:** Strong candidate for structural improvements and brittle-selector handling.


**Files to include:**

- `server/automation/templateStore.ts`

- `server/automation/templateRecorder.ts`

- `server/automation/selectorHealing.ts`

- `server/automation/templateRegistry.ts`


**Claude prompt:**
```text
Review and reimplement this automation/template backend block from scratch. Preserve feature intent while improving separation of concerns, validation, brittleness handling, and operational clarity. Output summary, weaknesses, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/automation/templateStore.ts`
```ts
import { query } from "../db";
import type { AutomationTemplate } from "./types";

export async function saveRecordedTemplate(template: AutomationTemplate) {
  const result = await query(
    `INSERT INTO automation_templates (template_key, name, description, target_type, start_url, login_url, definition, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (template_key)
     DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       target_type = EXCLUDED.target_type,
       start_url = EXCLUDED.start_url,
       login_url = EXCLUDED.login_url,
       definition = EXCLUDED.definition,
       updated_at = NOW()
     RETURNING *`,
    [
      template.templateKey,
      template.name,
      template.description || null,
      template.targetType,
```


### `server/automation/templateRecorder.ts`
```ts
import type { Page } from "playwright";
import type { AutomationTemplate, FieldMapping, AutomationAction } from "./types";
import { interpretPage } from "./pageInterpreter";

function guessFieldType(tag: string, type?: string): FieldMapping["type"] {
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (type === "checkbox") return "checkbox";
  if (type === "radio") return "radio";
  if (type === "date") return "date";
  return "text";
}

function normalizeKey(value?: string): string {
  return (value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part, idx) =>
      idx === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
```


### `server/automation/selectorHealing.ts`
```ts
import type { Page } from "playwright";

export async function healSelector(page: Page, selector: string): Promise<string | null> {
  try {
    const found = await page.locator(selector).count();
    if (found > 0) return selector;
  } catch {
  }

  if (selector.startsWith("#")) {
    const id = selector.slice(1);
    const candidates = [
      `[name="${id}"]`,
      `[aria-label="${id}"]`,
      `[placeholder*="${id}" i]`,
      `label:has-text("${id}") + input`,
      `label:has-text("${id}") + select`,
      `label:has-text("${id}") + textarea`,
    ];

    for (const candidate of candidates) {
      try {
```


### `server/automation/templateRegistry.ts`
```ts
import type { AutomationTemplate } from "./types";

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    templateKey: "demo-intake-form",
    name: "Demo Intake Form",
    description: "Example browser automation template for testing the automation layer",
    targetType: "web",
    startUrl: "https://example.com/form",
    fields: [
      { internalKey: "firstName", selector: "#first_name", type: "text", required: true },
      { internalKey: "lastName", selector: "#last_name", type: "text", required: true },
      { internalKey: "dob", selector: "#dob", type: "date" },
      { internalKey: "state", selector: "#state", type: "select" },
      { internalKey: "agree", selector: "#agree_terms", type: "checkbox" },
    ],
    actions: [
      { type: "goto", name: "open-form", url: "https://example.com/form" },
      { type: "fill", name: "fill-first-name", selector: "#first_name", valueKey: "firstName" },
      { type: "fill", name: "fill-last-name", selector: "#last_name", valueKey: "lastName" },
      { type: "fill", name: "fill-dob", selector: "#dob", valueKey: "dob" },
      { type: "select", name: "select-state", selector: "#state", valueKey: "state" },
```

---

## Block 16: Billing Denial + Claim Scrubbing

**Why this block matters:** Good rule-engine comparison target with real operational consequences.


**Files to include:**

- `server/billing/denialPredictionEngine.ts`

- `server/billing/claimScrubber.ts`

- `server/billing/preSubmission.ts`


**Claude prompt:**
```text
Review and reimplement this billing validation / denial-risk block from scratch. Focus on explicit rule behavior, false-confidence risks, validation boundaries, and auditable outputs. Preserve intended use. Output summary, weaknesses, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/billing/denialPredictionEngine.ts`
```ts
import type { AutoCodeResult } from "./diagnosisAutoCoder";
import type { RiskClassification } from "../compliance/riskEngine";

export interface DenialPrediction {
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  reasons: string[];
  recommendations: string[];
  estimatedRevenueImpact: number;
}

const CPT_PRICING: Record<string, number> = {
  "99213": 75,
  "99203": 90,
  "99214": 110,
  "99215": 150,
  "99284": 250,
  "99285": 400,
  "99441": 40,
  "99443": 85,
};

```


### `server/billing/claimScrubber.ts`
```ts
/**
 * Claim Scrubber — validates a claim object before submission.
 *
 * Performs:
 * - Required field checks (ICD-10, CPT)
 * - High-acuity documentation requirement (CPT 99285)
 * - Modifier + procedure mismatch detection
 * - Prior-auth flag check
 * - Date of service sanity check (not in the future)
 */

export interface ClaimInput {
  icd10?:         string;
  cpt?:           string;
  documentation?: string;
  modifiers?:     string[];
  priorAuthRef?:  string;
  dateOfService?: string;
  payerId?:       string;
  patientId?:     string;
  provider?:      string;
}
```


### `server/billing/preSubmission.ts`
```ts
import { scrubClaim } from "./claimScrubber";
import { requiresPriorAuth } from "./priorAuth";
import { validateModifier } from "./modifierEngine";
import { detectHCCs } from "./hccCapture";
import { logSecureEvent } from "../ops/secureAudit";

export interface PreSubmissionResult {
  approved: boolean;
  scrub: { valid: boolean; issues: string[] };
  priorAuth: { required: boolean; reason?: string; procedure?: string };
  modifier: { valid: boolean; reason?: string; risk?: string };
  hcc: { captureCount: number; totalEstimatedUplift: number };
  issues: string[];
  recommendation: string;
  checkedAt: string;
}

export function preSubmitCheck(claim: {
  icd10?: string;
  cpt?: string;
  documentation?: boolean;
  modifier?: string;
```

---

## Block 17: Channel / Message Orchestration

**Why this block matters:** Likely to reveal state bugs, routing duplication, and messy cross-channel assumptions.


**Files to include:**

- `server/channels/messageOrchestrator.ts`

- `server/channels/conversationState.ts`

- `server/channels/chatIntakeEngine.ts`


**Claude prompt:**
```text
Review and reimplement this channel/message orchestration block from scratch. Focus on state transitions, routing clarity, channel abstraction boundaries, and error handling. Preserve behavior unless clearly broken. Output summary, weaknesses, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/channels/messageOrchestrator.ts`
```ts
import { randomUUID } from "crypto";
import { storage, type FlowQuestion } from "../storage";
import { type MessageEvent, buildConversationId, type Channel } from "./messageEvent";
import { getConversationStateStore, type ConversationState, hashBody } from "./conversationState";
import { sendReply } from "./channelAdapter";
import { getConversationLog, detectFrictionSignals } from "../traces/conversationLog";
import { isStaffCommand, handleStaffCommand } from "../whatsapp/staffCommands";
import { formatTriageResult, formatRedFlagAlert, type Channel as BotChannel } from "./botMessageFormatter";
import {
  routeFlowFromText,
  flowFromMenuChoice,
  menuText,
  getAnswersObj,
  setMenuState,
  isAwaitingChoice,
  isAwaitingOtherText,
  isMenuResetCommand,
  isStatusCommand,
  buildRouterAudit,
  setRouterAudit,
} from "../flows/whatsappFlowRouter";
import { generateToken, generateCode, expiresAtMinutes, INTAKE_EXPIRY_MINUTES, BASE_URL } from "../intake/intakeAuth";
```


### `server/channels/conversationState.ts`
```ts
import type { Channel } from "./messageEvent";
import { createHash } from "crypto";

export interface ConversationState {
  conversationId: string;
  channel: Channel;
  externalUserId: string;
  caseId: string | null;
  encounterId: number | null;
  patientId: number | null;
  routingState: string;
  lastQuestionIdAsked: string | null;
  requiredMissing: string[];
  toneProfile: string;
  lastNMessages: { from: "patient" | "system"; text: string; ts: string }[];
  frictionScore: number;
  frictionEvents: number;
  lastFrictionAt: string | null;
  isStaff: boolean;
  isStopped: boolean;
  stopReason: string | null;
  createdAt: string;
```


### `server/channels/chatIntakeEngine.ts`
```ts
import { getOrCreateChatSession, saveChatSession } from "./chatSessionStore";
import type { IncomingPatientMessage, ChatIntakeReply } from "./types";
import { runPatientFlow } from "../patient/patientFlow";
import { processInput } from "../multimodal/multimodalEngine";

const SUPPORTED_COMPLAINTS = ["sore_throat", "cough", "uri", "rash", "uti_simple", "ear_pain", "headache_mild"];

function parseComplaint(text?: string): string | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (t.includes("throat") || t.includes("sore")) return "sore_throat";
  if (t.includes("cough")) return "cough";
  if (t.includes("uti") || t.includes("burning") || t.includes("urination")) return "uti_simple";
  if (t.includes("rash") || t.includes("skin")) return "rash";
  if (t.includes("ear")) return "ear_pain";
  if (t.includes("headache") || t.includes("head ache")) return "headache_mild";
  if (t.includes("cold") || t.includes("uri") || t.includes("congestion")) return "uri";
  return undefined;
}

function firstQuestion(complaint: string): string {
  const map: Record<string, string> = {
```

---

## Block 18: Control Tower Feed + UI Slice

**Why this block matters:** Good full slice for live state, reconnection, rendering complexity, and stale data issues.


**Files to include:**

- `server/controlTower/socket.ts`

- `server/controlTower/aggregator.ts`

- `client/src/pages/SystemControlTowerPage.tsx`


**Claude prompt:**
```text
Review and reimplement this control-tower feature slice. Focus on live updates, reconnection, loading/error handling, frontend state organization, and backend feed clarity. Do not redesign the whole frontend. Output summary, weaknesses, rewritten backend, rewritten frontend, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/controlTower/socket.ts`
```ts
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { subscribeToTower } from "./eventBus";
import { getState } from "./aggregator";

let wss: WebSocketServer | null = null;

export function initControlTowerSocket(httpServer: Server): void {
  wss = new WebSocketServer({ server: httpServer, path: "/ws/control-tower" });

  wss.on("connection", (client: WebSocket, _req: IncomingMessage) => {
    const snapshot = JSON.stringify({ type: "SNAPSHOT", data: getState() });
    if (client.readyState === WebSocket.OPEN) {
      client.send(snapshot);
    }

    client.on("error", () => {});
  });

  subscribeToTower((event) => {
    if (!wss) return;
    const msg = JSON.stringify({ type: "EVENT", event, state: getState() });
```


### `server/controlTower/aggregator.ts`
```ts
import { subscribeToTower, TowerEvent } from "./eventBus";

const MAX_PATIENTS = 500;
const MAX_ERRORS = 200;
const MAX_ALERTS = 100;

interface TowerState {
  patients: any[];
  errors: any[];
  engines: Record<string, string>;
  alerts: any[];
  lastUpdated: number;
}

const state: TowerState = {
  patients: [],
  errors: [],
  engines: {},
  alerts: [],
  lastUpdated: Date.now(),
};

```


### `client/src/pages/SystemControlTowerPage.tsx`
```ts
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import {
  Cpu, Activity, Plug, Layers, Database,
  Terminal, Mic, Bot, AlertTriangle, Zap, Radio,
  ExternalLink, RefreshCw
} from "lucide-react";

import AgentsPanel from "@/components/tower/AgentsPanel";
import EnginesPanel from "@/components/tower/EnginesPanel";
import IntegrationsPanel from "@/components/tower/IntegrationsPanel";
import LivePatientsPanel from "@/components/tower/LivePatientsPanel";
import DeteriorationAlertsPanel from "@/components/tower/DeteriorationAlertsPanel";
import VoiceIntakePanel from "@/components/tower/VoiceIntakePanel";
import { SkillsPanel, LayersPanel } from "@/components/tower/SkillsLayersPanel";
```

---

## Block 19: Complaint Lab Slice

**Why this block matters:** Useful for frontend state, API contract quality, and simulation workflow cleanup.


**Files to include:**

- `client/src/pages/ComplaintLabPage.tsx`

- `server/routes/autonomousLearningRoutes.ts`

- `server/routes/simulationLabRoutes.ts`


**Claude prompt:**
```text
Review this Complaint Lab feature slice from an existing React + TypeScript app. Identify stale state, duplicated business logic, poor API contracts, or unclear loading/error behavior. Reimplement more cleanly and compare against the original. Output summary, weaknesses, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `client/src/pages/ComplaintLabPage.tsx`
```ts
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SimJob {
  jobId: string;
  status: "queued" | "running" | "complete" | "cancelled" | "error";
  progress: number;
  totalCases: number;
  params: { complaint: string; count: number; difficulty: string };
}

interface SimResults {
```


### `server/routes/autonomousLearningRoutes.ts`
```ts
/**
 * Autonomous Learning Routes  (/api/ci/*)
 *
 * Self-testing, self-learning, and governance API.
 * Exposes the async simulation engine, learning queue, audit trail,
 * safety modes, knowledge versioning, and drift detection.
 *
 * No clinical logic is ever auto-modified — all changes require explicit
 * human approval through the governance workflow.
 */

import { Router, Request, Response } from "express";
import {
  startSimJob, getSimJob, listSimJobs, cancelSimJob, getSimJobStatus,
} from "../simulation/asyncSimEngine";
import {
  listLearningQueue, getLearningQueueItem, updateSuggestionStatus, getLearningQueueStats, addLearningQueueItem,
} from "../learning/learningQueueStore";
import {
  listAuditLog, getAuditStats, logAuditEvent,
} from "../governance/changeAuditLog";
import {
```


### `server/routes/simulationLabRoutes.ts`
```ts
import express from "express";
import OpenAI from "openai";
import { createHash } from "crypto";
import { applyPHIGuard } from "../middleware/phiGuardOpenAI";
import { heavyRateLimit } from "../middleware/redisRateLimit";
import { getRedisAsync } from "../queue/redis";
import { runSimulationBatch } from "../simulation/simulationRunner";
import { clearSimulationRuns, getSimulationRun, listSimulationRuns, saveHeatmap, getHeatmap, computeHeatmapFromResults } from "../simulation/simulationStore";
import { db } from "../db";
import { eq, inArray } from "drizzle-orm";
import { kbComplaints, kbRedFlagRules, kbDispositionRules } from "../../shared/schema";
import { getLearningStats } from "../simulation/simulationLearningBridge";
import { runProtocolBenchmark } from "../simulation/protocolBenchmarkEngine";
import { acie } from "../improvement/automatedImprovementEngine";
import { getImprovements, getImprovementStats } from "../improvement/improvementStore";
import {
  top50Cases,
  packCases,
  packList,
  type Top50Pack,
} from "../simulation/top50FailurePack";
import {
```

---

## Block 20: Governance + Compliance

**Why this block matters:** Important review packet for governance boundaries, approval flows, and compliance exports.


**Files to include:**

- `server/routes/governanceCommandRoutes.ts`

- `server/compliance/complianceRoutes.ts`

- `server/compliance/physicianCheckpoint.ts`


**Claude prompt:**
```text
Review and reimplement this governance/compliance slice from scratch. Preserve feature intent while improving route consistency, approval boundaries, auditable outputs, and safety/compliance clarity. Output summary, weaknesses, rewritten code, comparison, and tests.
```


**Actual code excerpts from this block:**


### `server/routes/governanceCommandRoutes.ts`
```ts
import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { evaluatePolicyChange } from "../governance/policyGuard";
import { saveSnapshot, listSnapshots } from "../governance/versionStore";
import { getSystemSnapshot } from "../data/dataAccessLayer";
import { runGoldenValidation } from "../validation/runGoldenValidation";
import { verifyAuditChain } from "../services/auditHashChain";

const router = Router();

// ─── helpers ──────────────────────────────────────────────────────────────────
async function qRow<T = any>(q: string, params: any[] = []): Promise<T | undefined> {
  const r = await db.execute(sql.raw(q.replace(/\?/g, (_, i) => `$${i + 1}`)));
  return ((r as any).rows ?? r)[0] as T | undefined;
}
async function qRows<T = any>(q: string): Promise<T[]> {
  const r = await db.execute(sql.raw(q));
  return ((r as any).rows ?? r) as T[];
}
async function qExec(q: string) {
  return db.execute(sql.raw(q));
```


### `server/compliance/complianceRoutes.ts`
```ts
/**
 * COMPLIANCE ROUTES — All 7-Domain Claude Recommendations
 *
 * Mounts all compliance, safety, audit, and learning endpoints under
 * /api/compliance/* and /api/phase7/* namespaces.
 *
 * Domain coverage:
 *   D1 Safety:       /api/compliance/safety/*
 *   D2 FDA/HIPAA:    /api/compliance/physician-checkpoint/*
 *                    /api/compliance/policy-proposals/*
 *                    /api/compliance/breach-register
 *                    /api/compliance/audit-verify
 *   D3 Observability:/api/compliance/slos
 *                    /api/compliance/engine-health
 *   D4 Architecture: /api/compliance/agent-config (Redis persistence)
 *   D5 Learning:     /api/compliance/demographic-parity
 *   D6 Debate:       (wired into debate engine — no separate endpoint)
 *   D7 Packs:        /api/compliance/packs
 *   Phase 7 Health:  /api/phase7/health
 */

import { Router, Request, Response } from "express";
```


### `server/compliance/physicianCheckpoint.ts`
```ts
/**
 * DOMAIN 2 — REC 2.1: Physician Approval Gate (P0 FDA Requirement)
 *
 * Mandatory physician pre-approval for ER_NOW, ER_URGENT, and URGENT_CARE
 * dispositions. This is the single most important control for maintaining
 * Class II SaMD status under FDA's 2021 AI/ML Action Plan.
 *
 * CLAUDE REVIEW ADDITIONS (Round 2):
 *   - Tier-specific timeouts: ER_NOW=5min, ER_URGENT=10min, URGENT_CARE=20min
 *   - batchApproveUrgentCare() — physician can clear multiple URGENT_CARE cases at once
 *   - Reduced operational burden while maintaining full audit trail
 */

import { randomUUID }   from "crypto";
import { DispositionTier, escalateOneLevel } from "../safety/hardStopRules";
import { auditStep, createTraceId } from "../audit/auditLogger";
import { emitEvent }    from "../controlTower/eventBus";
import { logger }       from "../utils/logger";

export const DISPOSITIONS_REQUIRING_APPROVAL: DispositionTier[] = [
  DispositionTier.ER_NOW,
  DispositionTier.ER_URGENT,
```
