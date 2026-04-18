# Auralyn — HIPAA/FDA Medical Triage Platform (Multi-Tenant SaaS)

## Security Hardening Release (April 2026) — 10 Critical/High Fixes

### Critical Security Fixes (code review remediation)

1. **ehrOrchestrator.ts** (Critical): Deleted stub theater that returned `{ success: true, stub: true }` regardless of outcome. Now delegates to `ehrWriter.ts` — the single canonical EHR write path. No more silent success-on-failure.

2. **ehrExecutor.ts** (Critical): EHR adapter functions (writeEpic, writeAthena, writeECW) previously caught errors internally and returned `{ written: false }` — a resolved promise that looked like success. Fixed to throw on failure so `executeWithScope` sees real rejections and logs audit records.

3. **fhirRoutes.ts** (Critical): `/fhir/sync-encounter` and `/fhir/patient/search` were completely unauthenticated — any internet client could inject arbitrary FHIR data. Fixed with `requirePhysician` middleware on entire FHIR router; clinicId now taken from JWT, never from request body.

4. **credentialVault.ts** (Critical): EHR automation secrets (passwords, API keys) stored as plaintext PostgreSQL JSONB. Fixed with AES-256-GCM encryption at application layer. Only ciphertext+IV+auth-tag stored in DB. `list()` endpoint excludes secret_json entirely.

5. **visionAgent.ts** (Critical): `fallbackChain()` was an unsafeguarded EHR write bypass — no physician signature, no scope gate, no audit log, raw env-var tokens. Function deleted. All callers (including `batch18Routes.ts`) redirected to `ehrWrite()` via `ehrWriter.ts`.

6. **fhirAuth.ts** (High): Single global `tokenCache` shared across all tenants — one clinic's OAuth token was served to all others. Fixed with `Map<tenantCacheKey, TokenCache>` keyed by `(FHIR_BASE_URL::FHIR_CLIENT_ID)`.

7. **smartAuth.ts** (High): Legacy SMART auth with no PKCE, static CSRF state `"auralyn-state"`, and hardcoded scopes. File deprecated with re-exports to `smartLaunch.ts` + runtime deprecation warning. Callers must migrate.

8. **approvalGate.ts** (High): 15-minute database polling loop (every 2s) held browser session open per pending approval. Fixed with suspend/resume pattern: `waitForApproval()` now enforces 30s hard cap; `checkApprovalStatus()` added for non-blocking async checks.

9. **policyEngine.ts** (High): Policy gate was a single regex on `action.name`. Extended to: URL allowlist validation (`AUTOMATION_ALLOWED_HOSTS`), payload content inspection (drug/chart/order keywords), risk-score composite, unknown action type gating.

10. **batch18Routes.ts** fallback-chain endpoint now routes through `ehrWrite()` instead of deleted `fallbackChain()`.

### New Command Center Pages

- **Command Center v2** (`/command-center-v2`): Live EHR writes + audit replay. EHR adapter status, write audit log, per-patient write history replay, FHIR sync panel. Backend: `server/routes/commandCenterV2Routes.ts` → `/api/cc-v2/*`

- **Command Center v3** (`/command-center-v3`): Predictive analytics + ICU management + multi-hospital. Deterioration risk scoring (12-patient cohort), NYC hospital network ICU bed tracker, transfer queue with physician approval, surge alerts. Backend: `server/routes/commandCenterV3Routes.ts` → `/api/cc-v3/*`

- **Command Center v4** (`/command-center-v4`): Digital twin + EMS tracker + learning system. Real-time physiological model per patient, EMS unit dispatcher, RLHF feedback submission, outcome predictions (AUC 0.91), clinical scenario simulation. Backend: `server/routes/commandCenterV4Routes.ts` → `/api/cc-v4/*`

- **NYC Pilot + FDA** (`/nyc-pilot`): Operational metrics (3 sites, 12,847+ patients), 24h throughput chart, FDNY EMS activity feed, FDA 510(k) readiness checklist (12 items), deployment environment promoter (dev→staging→prod→nyc-pilot), HIPAA/FDA/security compliance scoreboard. Backend: `server/routes/nycPilotRoutes.ts` → `/api/nyc-pilot/*`

## Diagnostic Engine Wave — Fisher / Bayesian / RAG / Validation (April 2026)

### 22 New Files

**Fisher Information Matrix + Natural Gradient (`server/ai/`)**
- `fisher.ts` — `computeDiagonalFisher(probs, gradients)` + `rankFeaturesByFisher()`. Used by the adaptive question engine to pick the next most-informative symptom question.
- `naturalGradient.ts` — `naturalGradientStep()` preconditions gradient updates by the Fisher matrix, projects onto the probability simplex (all values ≥ 0, sum = 1).
- `bayesianUpdater.ts` — `updateBeliefsWithFisher(prior, likelihoods, observations)`. Combines log-likelihood gradient with natural gradient step for geometry-aware Bayesian belief updates.
- `hallucinationExtensions.ts` — Seven additional hallucination guards: impossible physiologic combo detector, confidence compression [0.2, 0.8], differential spread enforcer, dangerous-condition rule-out check (PE/ACS/stroke/sepsis/meningitis/dissection), temporal consistency, risk floor enforcement, low-support abstention.
- `clinicalRagGrounding.ts` — KB-only retrieval-augmented answer generation. Full-text search → confidence scoring → grounded answer builder. `kbOnly: true` is a TypeScript-enforced constant — this module never sets disposition.
- `uncertaintySignaling.ts` — Traffic-light confidence annotator (HIGH/MEDIUM/LOW → green/yellow/red). Detects hedge phrases, adjusts for source count, emits structured `UncertaintySignal` for dashboard rendering.

**Validation System (`server/validation/`)**
- `goldenCaseTypes.ts` — Rich `GoldenCase` type with `minimumSafeDisposition`, `presentationProfile`, `redFlagCount`, plus `ValidationRunResult` and `ValidationSummary`.
- `adversarialGenerator.ts` — `expandAdversarialSet()` generates 4× variants: original + sparse (⌊n/2⌋ obs) + contradictory (impossible marker) + missing-first-critical-feature.
- `calibrationMonitor.ts` — `computeBrierScore()`, `bucketCalibration()`, `detectOverconfidence()` (flags buckets where confidence exceeds accuracy by ≥ 0.15).
- `validationGate.ts` — `enforceValidationGate()` blocks deployment when passRate < 85%, unsafeUndercalls > 0, or calibrationError > 0.15. `runtimeSafetyCheck()` disables AI autonomy instantly. `detectValidationDrift()` alerts on > 10% run-to-run shift.
- `fullCaseGenerator.ts` — `generateFullCaseSet()` produces 1000 synthetic cases (200×PE, ACS, sepsis, stroke, pediatric fever) with probabilistic adversarial features. Plus `seedGoldenCases` (6 canonical hand-crafted cases for CI).
- `goldenCaseHarness.ts` — `runGoldenCases(cases, runFn)` — engine-agnostic harness using a caller-supplied async function so tests run against the live production pipeline. `summarizeValidation()` returns full summary.
- `validationRunner.ts` — `runFullValidation()` — expands adversarial set + runs harness + computes Brier-score calibration in one call. Returns `FullValidationResult`.

**RLHF Bounded Update Engine (`server/rlhf/`)**
- `rlhfEngine.ts` — `boundedUpdate()` clips all weight deltas to ±2%. `computeDeltas()`, `applyBoundedUpdates()`, `pendingApprovalItems()` (changes >1% require physician sign-off).
- `trainer.ts` — `trainFromOutcomes(model, outcomes)` — batch feedback → bounded deltas → updated model.
- `approval.ts` — `requireApproval()` formats change summary for physician review queue. `applyIfAutomatic()` returns null if approval is needed.

**FDA Audit Chain (`server/fda/`)**
- `auditChain.ts` — `buildAuditChain(entries)` — SHA-256 forward-linked chain (GENESIS anchor). `verifyAuditChain(chain)` validates integrity of any stored chain per 21 CFR Part 11.
- `justification.ts` — `generateJustification(data)` — human-readable FDA justification statements from validation summary: pass rate, undercalls, calibration, hallucination blocks, escalation rate.

**Control Tower Additions (`server/controlTower/`)**
- `validationDashboard.ts` — `getValidationDashboard()` reads last 50 `validation_runs` rows and returns passRate trend, unsafeUndercall trend, timestamps for chart rendering. `logValidationRun()` persists summaries.
- `calibrationService.ts` — `calibrationByComplaint(results)` groups calibration rows by complaint and computes per-complaint avgConfidence, accuracy, gap. `flagOverconfidentComplaints()` returns complaint names exceeding the gap threshold.

**Services (`server/services/`)**
- `clinicalKnowledgeService.ts` — `searchClinicalKnowledge(query)` — PostgreSQL FTS via `tsvector/tsquery`, top-5 results by recency. `insertKnowledgeEntry()` for KB management.
- `clinicalAnswerAuditService.ts` — `logClinicalAnswerAudit(payload)` — SHA-256 content-addressed tamper-evident log to `clinical_answer_audit`.
- `physicianReviewGate.ts` — `queueForReview()`, `getPendingReviews()` (sorted LOW→MEDIUM→HIGH), `submitReviewDecision()` with approved/overridden/rejected states.

**Route (`server/routes/clinicalAnswerRoute.ts`)**
- `POST /api/clinical-answer` — KB-grounded query, auto-queues LOW/MEDIUM confidence for physician review, audits every call. Safety boundary enforced: `kbOnly: true, canSetDisposition: false`.
- `GET /api/clinical-answer/review-queue` — pending physician review items.
- `POST /api/clinical-answer/review-decision` — physician submits approved/overridden/rejected decision.

**Schema additions (`shared/schema.ts`)**
- `clinicalKnowledge`, `physicianReviewQueue`, `clinicalAnswerAudit` — Drizzle table definitions with insert schemas and TypeScript types.

**DB tables created via psql (NOT db:push — drizzle proposes catastrophic renames on this schema)**
- `clinical_knowledge` — with GIN full-text search index
- `physician_review_queue` — with status+created_at composite index
- `clinical_answer_audit` — SHA-256 primary key, conflict-safe INSERT

## Batch 6 — Monitoring, RLHF, and Safety Fixes (April 2026)

### 10 Fixes Applied

**1. alertRules.ts — Silent error swallowing**
`catch { continue }` in `evalRules()` now logs rule ID + expression + error. A broken rule that silently never fired is now visible to operators.

**2. safeRuleEngine.ts — NEW structured rule engine**
`server/monitoring/safeRuleEngine.ts`: `SafeRule { metric, operator, value }` + `evaluateSafeRule()` + `validateSafeRule()`. Zero dynamic code execution — no eval, no vm, no Function. Drop-in alternative to the vm sandbox in alertRules.ts when expression flexibility is not needed.

**3. selfModify.ts — Unbounded duplicate prompt injection**
The `successRate < 0.7` branch was unconditionally calling `.push()` with no dedup check, potentially appending hundreds of identical instructions. Fixed via shared `appendIfMissing()` helper (consistent with all other branches). Added `MAX_APPENDED_INSTRUCTIONS = 20` cap. Every mutation now emits a `console.warn` documenting that it's in-memory only and not audited.

**4. selfImprove.ts — TOCTOU race in approveAndApplyAction()**
The approval UPDATE and the apply call were two separate DB operations with no locking between them. A concurrent caller could observe the "approved" state and double-apply the same threshold change. Fixed: wrapped both operations in a single `db.transaction()` that acquires `pg_advisory_xact_lock(ACTION_LOCK_BASE + actionId)` before touching the row.

**5. dataDrift.ts — Frozen baseline**
Baseline was set once from the first 50 samples and never refreshed. A clinic population that shifts seasonally would gradually invalidate drift detection. Fixed: `maybeRefreshBaseline()` called on every `recordSample()`. Refresh runs on first init and every `BASELINE_REFRESH_INTERVAL_MS = 7 days`.

**6. vitalsMonitor.ts — SpO2 sensor dropout misclassified as clinical hypoxia**
SpO2 ≤ 0 or > 100 is physiologically impossible and indicates sensor failure, not patient hypoxia. Added a `sensor_error / high` alert before the clinical threshold block. Responders now see the distinction between "sensor problem" vs "patient deteriorating."

**7. syntheticCaseGenerator.ts — new Function() RCE via CSV**
`evaluateSimpleCondition()` was using `new Function(safeExpr)` — a tampered DISPOSITION_RULES.csv or CORE_QUESTIONS.csv could achieve server-side code execution. Replaced with `vm.Script.runInNewContext()` using an empty prototype-free sandbox with a 20ms timeout.

**8. weightAdapter.ts — Silent weight changes**
`adjust()` previously logged only reductions. Every weight change is now logged with `prevWeight`, `weight`, `score`, and `successRate` for full operator visibility.

**9. icuPredictor.ts — NEW NEWS2 + Lactate ICU predictor**
`server/monitoring/icuPredictor.ts`: `calculateIcuRisk()` (synchronous, pure) + `predictAndStoreIcuRisk()` (async, DB-persisted). Scores RR, SpO2, temp, SBP, HR, mental status, O2 support, lactate, and age ≥75. Every prediction is written to `icu_predictions` and audited. `requiresPhysicianReview: true` always.

**10. Schema additions (psql, not db:push)**
Three new tables created via `psql $DATABASE_URL` to avoid drizzle's destructive table-rename behavior:
- `patient_snapshots` — timestamped vitals/labs snapshots with source tag
- `icu_predictions` — persisted NEWS2+lactate predictions with explanation array
- `digital_twin_runs` — persisted scenario runs with riskDelta and recommended action

## Second Wave — Unified Write Architecture (April 2026)

### Canonical EHR Write Path
All clinical EHR writes now flow through a single, guarded pipeline:

```
POST /api/write-encounter
  → requirePhysician (auth gate)
  → executeClinicalWrite() [clinicalWriteOrchestrator.ts]
      → executeWithScope() [scope gate: physicianSigned + confidence ≥ 0.9]
          → ehrWrite() [ehrWriter.ts — primary EHR write]
          → syncEncounterToFhir() [fhirService.ts — secondary interop]
          → logEvent() [audit trail]
      → handleWriteFailure() [escalation + real-time alert on failure]
```

**New files:**
- `server/ehr/clinicalWriteOrchestrator.ts` — `executeClinicalWrite()` ties the whole pipeline together. EHR failure triggers `handleWriteFailure()` and re-throws; FHIR failure is logged but non-blocking.
- `server/ehr/writeGuard.ts` — `assertWriteAccess(callerModule)` throws in dev if code bypasses the orchestrator. No-op in prod (logs error instead of crashing).
- `server/ehr/failureEscalation.ts` — `handleWriteFailure()` generates a unique `escalationId`, writes a `clinical.write.FAILED` audit event, and broadcasts an `EHR_WRITE_FAILURE` event over the WS event bus.
- `server/routes/writeEncounterRoute.ts` — `POST /api/write-encounter`, zod-validated, requirePhysician-gated. Extracts `clinicId` from session only (never from request body).

## Phase 1-7 Security + Tenant Isolation Fixes (April 2026)

### Phase 1 — livePatientEngine Tenant Isolation
`server/realtime/livePatientEngine.ts`: `startLivePatientEngine(clinicId: string)` — clinicId changed from optional to **required** (throws if not provided). Without it, the engine would broadcast all patients' PHI to every WS client across all tenants. In dev, `process.env.DEV_CLINIC_ID || "clinic-dev"` is passed at startup.

### Phase 2 — Per-Route Auth (Not router.use)
`server/routes/clinicalControlTowerRoutes.ts`: Replaced `router.use(requireRole)` with per-route `...cctAuth` on all 8 CCT endpoints. The router was mounted at `app.use("/api", router)` — a `router.use()` middleware there intercepts ALL `/api/*` requests, not just `/cct/*`, blocking unrelated public endpoints (including the Twilio SMS webhook).

`server/realtime/livePatientRoutes.ts`: Added `router.use(requirePhysician)` as a global middleware on the routes file. Acceptable here because the router is mounted at `/api/patients` (specific prefix, not `/api`).

### Phase 3 — Twilio Webhook Signature Validation
`server/routes/clinicalRoutes.ts` (line 52): Added `twilio.validateRequest()` to the SMS webhook. Without this, any internet client could forge inbound SMS payloads to inject clinical data into the triage pipeline. Also fixed `channel: "web"` → `channel: "sms"`.

### Phase 4 — Fail-Closed Tenant Isolation (pre-existing)
`server/routes/patientFlowRoutes.ts`: Already fail-closed at lines 63/84: `if (!session.clinicId || session.clinicId !== physician.clinicId)`. No change needed.

### Phase 5 — Real System Health Probes (pre-existing)
`server/realtime/systemHealthMonitor.ts`: Real `probeExternalServices()` function already implemented with native `fetch()` and 30s polling loop. Services start as error state until first probe completes. No change needed.

### Phase 6 — WebSocket Auth Token
`client/src/hooks/usePatientStream.ts`: WebSocket URL now appends `?token=${encodeURIComponent(token)}` so the WS server can validate caller identity when enforcement is added server-side.

### Phase 7 — Physician Paging Lockdown
`server/routes/multiPatientRoutes.ts`: `POST /physician-alert` no longer accepts `physicianPhone` from the request body (SMS toll fraud vector). Phone now resolved server-side via `getOnCallPhysician(clinicId)` which reads from `ON_CALL_PHONE_<CLINIC_ID>` or `ON_CALL_PHYSICIAN_PHONE` env vars. Every alert is audit-logged via `auditLog()`.

### New Environment Variables Needed (Production)
- `CREDENTIAL_ENCRYPTION_KEY` — 32-byte hex (64 chars). Required for credentialVault.ts encryption. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `AUTOMATION_ALLOWED_HOSTS` — comma-separated allowlist for goto/navigate automation actions
- `AUDIT_HMAC_SECRET` — HMAC secret for audit log integrity
- `TRUSTED_PROXY_IPS` — comma-separated trusted proxy IPs for request headers
- `DEV_CLINIC_ID` — default clinic ID for dev/test sessions

---

## Overview
"env_flu_slice" is an AI-powered medical triage platform for flu-like symptoms, leveraging WhatsApp for initial patient assessments. It aims to provide diagnoses and treatment plans for physician review, automate patient communication, and enhance healthcare efficiency and access. The system is designed for continuous improvement through a self-developing AI architecture, with a vision to transform medical triage into a more efficient, patient-centric process.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system employs a constrained agent architecture with a plan/act/observe loop and a multi-system triage pipeline. It features a unified sheets registry for data configuration, a clinical state builder, and a modular, skill-based orchestration layer. An intelligence layer provides explainability and failure-driven rule suggestions, with an extended learning loop for continuous improvement. The Clinical Intelligence Planning Layer (CIPL) and Clinical Governance & Deployment Layer ensure continuous improvement and safe deployment of clinical changes. The system adheres to a 12-layer architecture encompassing Interface, Normalization, State, Knowledge, Safety, Reasoning, Decision, Learning, Analytics, Governance, Integration, and Orchestration.

### UI/UX Decisions
The frontend is built with React 18, TypeScript, `shadcn/ui`, and Tailwind CSS, offering intuitive interfaces for physicians, patients, and administrators. Key dashboards include the Clinical Simulation Lab, Clinical Control Tower, Executive Dashboard, Stress Test Dashboard, Patient Queue Dashboard, FDA Validation Dashboard, Decision Tree Explorer (ReactFlow visualization), Live Clinic Console (multi-tenant), and Production Readiness Console. The System Control Tower provides full system observability and control. The Clinical QA Dashboard offers a 3-column layout for quality assurance. The Clinical Improvement Lab features panels for Guideline Ingest, PubMed Auto-Ingestion, Gold Standard Gap Analysis, Evidence Scores, Evidence Ranking, Calibration, and Outcomes & FDA reporting. The Care Pathway Optimizer is an A/B pathway experimentation dashboard. The Skill Graph provides a visual representation of the knowledge base using React Flow. The Revenue War Room (`/revenue-war-room`) is a 5-tab financial intelligence dashboard covering Denial Prediction, Reimbursement Optimization, Physician Coaching (GPT-4o-mini), Contract Simulation, and Outcome-Weighted Revenue — backed by 4 new endpoints on the revenue pipeline routes. The Governance Command Center (`/governance-command-center`) is a 5-tab compliance and governance dashboard covering: Audit Trail (immutable event log with report generation), Policy Optimization (AI-driven policy tuning with auto-apply), FDA SaMD Package (Class II submission JSON generator with download), Quality & Payer (HEDIS metrics + 6-payer performance matrix), and Malpractice Risk (per-case scoring with driver analysis) — backed by 9 `/api/governance/` endpoints and 5 dedicated DB tables (policy_state, policy_updates, malpractice_risk_scores, hedis_snapshots, fda_submissions).

### Clinical Brain Engine v3.0 (Phase-Parallel Rewrite — Packet 16)

`server/core/clinicalBrainEngine.ts` fully rewritten (v2 sequential → v3 phase-parallel):
- **6-phase parallel execution** with `runPhase()` parallel executor; per-engine `ENGINE_TIMEOUT_MS` map (500–5000ms)
- **`withTimeout()`** wraps every engine, falls back to `SAFE_DEFAULTS` on failure, streams telemetry to Redis
- **Importance-weighted failure tracking**: `engineFailures[]`, `degraded`, `degradedSeverity` in every output
- **`schemaVersion: "3.0"`** — backward compatible; all v3 fields are additive
- **Safety gate**: hard short-circuit to ER_NOW before any reasoning when `safetyGuard.disposition === "ER_NOW"`

Core intelligence utilities (`server/clinical/`):
- `importanceUtils.ts`, `brainBehavior.ts`, `cognitiveLoad.ts`, `adaptivePlanner.ts`, `requeryLoop.ts`
- `chiefResidentReflection.ts` (7 consistency checks), `safetyEscalationGuard.ts` (hard override, final guardrail), `shadowEvaluator.ts`, `confidenceCalibrator.ts`

Redis-backed intelligence (`server/controlTower/`, `server/oversight/`, `server/memory/`, `server/meta/`):
- `engineTelemetry.ts`, `engineBandit.ts`, `metaLearningEngine.ts`, `oversightAgent.ts`, `cognitiveMemory.ts`, `memoryLearning.ts`

Multi-agent council system (`server/agents/`):
- `debateEngine.ts`, `consensusEngine.ts`, `multiAgentCouncil.ts`, `hierarchicalCouncil.ts`, `councilActivationBandit.ts`
- Specialist sub-councils: `cardiologyCouncil.ts` (HEART score), `infectiousDiseaseCouncil.ts` (qSOFA/SIRS), `icuCouncil.ts` (SOFA proxy)

API routes: `/api/brain-intel/*` (`clinicalBrainIntelRoutes.ts`), `/api/council/*` (`councilRoutes.ts`)
UI dashboard: `client/src/pages/ClinicalBrainDashboard.tsx` → `/clinical-brain-dashboard`
Tests: `tests/unit/clinicalBrainEngine.test.ts` (10), `tests/unit/councilSystem.test.ts` (28) — 590/590 total

### Technical Implementations
The backend uses Express 5, Node.js, and TypeScript, providing REST API endpoints. It incorporates Centor score calculation, red flag detection, a supervisor gate, and robust LLM integrations. Features include a Clinical Brain Engine, Self-Developing Medical AI, Telemedicine Reasoning Assistant, and an Agent System for patient flow. Clinical capabilities include advanced triage logic, medication safety layers, FHIR-lite structured output, and a Clinical Knowledge Graph. The system includes 30+ Complaint Packs with a Visual Rule Builder, an Adaptive Control Loop, and a Case Memory Engine. A Unified Clinical Pipeline orchestrates triage, self-improvement, and simulation. The Autonomous Operator System provides intent-based task planning. The Engine Control Center chains validation, scoring, billing, outcome, learning, and auditing. The Auto-Debug Engine monitors system health, and an Agent Coordinator manages registered agents. An SMS/WhatsApp Service handles Twilio-based messaging. A Stress Test System allows load generation, and an RPA Browser Agent provides UI automation. An FDA Submission Package generates validation reports. A Live Patient Queue manages real-time sessions. System Monitoring includes a Predictive Failure Engine. The Autonomous Loop runs learning and failure prediction, with a Safety Gate for non-bypassable safety. An Immutable Audit Logger logs every clinical flow. Explainability is integrated into the orchestrator, with critical Safety Engines for drug interaction, pregnancy, and pediatric safety. The Autonomous Brain includes a Self-Learning Engine, Golden Case Validator, and Clinical Safety Guard. A Global Intelligence Layer utilizes federated learning for privacy-safe data export and aggregation, including a War Room panel for monitoring. A Multi-Agent Task Bus + Evolution Engine manages tasks with 7 agents and an autonomous evolution cycle. A System Monitor provides live engine and skill health monitoring.

The system incorporates a Multi-Agent Debate Engine where three clinical agents (Hybrid Reasoning, Bayesian Differential, Safety Veto) argue over diagnoses, with consensus based on weighted accuracy. A Continuous Learning Pipeline, wired to an outcome tracker, applies temporal decay to policies and proposes RLHF weight updates for physician review. A Policy Evolution Engine manages outcome-driven policy weights. An Executive Command Dashboard provides a high-level view of pipeline statistics, agent health, predictive failure signals, and policy evolution. The system is 100% Knowledge Base (KB)-driven for diagnosis, with all clinical decisions managed via Postgres KB tables. Advanced Reasoning Engines include `coMorbidityEngine.ts`, `temporalEngine.ts`, and `outcomeLearningEngine.ts`. Plan Templates are fully migrated to be DB-first.

### System Design Choices
Data management uses Firebase Firestore, SQLite, and NDJSON-backed stores, with PHI retention policies. Authentication involves password-only, session-based HMAC for physicians and token-based access for patients, with JWT-based role authentication. Security and quality hardening include bcrypt, JWT security, rate limiting, and PHI Sanitizer. A Global SRE + Resilience Layer provides geo-aware routing, SLA monitoring, automatic debugging, and chaos engineering. Autonomous Governance includes an agent registry, audit agent, incident commander, digital twin, and predictive engine. The Autonomous Operator System is an AI-powered form automation engine. A Template Studio allows visual template editing. The Replay Inspector audits automation runs. A Robotics Control Module manages medical device orchestration. An Autonomous Learning Console provides a unified dashboard for self-testing, self-learning, and governance, including simulation, learning queue, drift monitor, audit trail, versions, and safety modes. The Multi-Patient Command Grid provides a three-pane, hospital-style dashboard with risk-sorted patient grids, clinical details, ICU waveforms, hospital/EMS routing, automated outreach, and physician auto-paging.

## Phase 6 — KB Governance + Deployment Architecture

### KB Governance Lifecycle (Draft → Review → Approve)
- **`server/kb/kbRepository.ts`** — New KB entities inserted with `status: "draft"` (was `"active"`); prevents unreviewed clinical rules going live instantly
- **`server/kb/kbTypes.ts`** — Added `"complaint_pack"` to `KbEntityType` union; consistency audit type vocabulary now aligned
- **`server/kb/specEngine.ts`** — SEED_RULES operator-precedence bug fixed: all `whenExpr` strings are now fully parenthesised with optional chaining and explicit null coalescing (old: `input.scores && NEWS2 >= 7 || icuProb > 0.80` evaluated wrong)
- **`server/kb/routes/kbAdminRoutes.ts`** — Canonical-pathway GET routes now return `503 KB_PATHWAYS_UNAVAILABLE` on DB failure instead of silently returning `[]`
- **`server/startup/assertions.ts`** — Startup invariant checker: verifies `getKbVersion`, `getKbCacheStatus`, and required production env vars at boot; fatal in prod, warning in dev
- **`server/kb/services/kbGovernanceService.ts`** — Approval engine: `submitForReview`, `listPendingReviews`, `approveChange`, `rejectChange` with full DB-persisted audit trail
- **`server/kb/routes/kbGovernanceRoutes.ts`** — `GET/POST /api/kb-governance/*` (queue, submit, approve, reject, audit) — all protected by `requireKbAdmin`
- **`server/middleware/physicianReviewRequired.ts`** — Gating middleware for physician-level KB approval flows
- **`client/src/pages/KBReviewDashboard.tsx`** → `/kb-review-dashboard` — Full physician review UI: pending queue with one-click approve/reject + rejection reason dialog + audit trail tab

### New DB Tables (created via `psql`)
- **`kb_population_priors`** — Bayesian prior multipliers per demographic cluster (elderly, pediatric, immunocompromised); adjusts differential probability at triage time
- **`kb_review_queue`** — Pending KB entity changes awaiting physician/admin approval; `status: pending | approved | rejected`
- **`kb_audit_trail`** — Immutable log of every KB governance action: `CREATE | UPDATE | APPROVE | REJECT | ROLLBACK | SUBMIT_REVIEW` with full payload for FDA audit

### Deployment Files (`deployment/`)
- **`Dockerfile`** — Multi-stage Node 20 build (builder + runtime stages); healthcheck on `/health`
- **`fly.toml`** — Fly.io config: `ewr` region (NYC), performance-2x VMs, 4GB RAM, forced HTTPS, min 1 machine always running
- **`architecture.md`** — Full production architecture: ECS Fargate + RDS + ElastiCache, NYC urgent care pilot targets (CityMD, GoHealth), 4-week rollout plan, payer ROI model, env var checklist

## Phase 5 — Code Review Remediation (25 Items) + Independent Review

All 25 code review items from attached review documents are implemented. Plus 3 additional issues discovered during independent review.

### Phase 1 — Security/Auth (Issues #1-8)
- **requirePhysician.ts** — clinicId enforced in ALL envs (not just prod), role wildcard "*" removed, explicit admin check
- **rlhfRoutes.ts** — requirePhysician applied globally; "applied" status blocked from callers; reviewer identity from JWT
- **fhirRoutes.ts** — requirePhysician on all write endpoints; clinicId injected from token (never from body)
- **patientFlowRoutes.ts** — requirePhysician on all session endpoints; cross-tenant session reads rejected
- **patientStream.ts (WS)** — JWT auth required on every WebSocket upgrade; tenant-scoped broadcast (no cross-tenant event leakage)

### Phase 2 — Clinical Safety (Issues #12-16)
- **ehrWriter.ts** — No mock fallback on production EHR failure; physicians see real error, not false success
- **autonomyGate.ts** — FAIL-CLOSED: missing riskScore or uncertainty → deny autonomy (not coalesce to 0)
- **conflictResolver.ts** — URGENT_24H + flagged MONITOR are now safety-locked, not just ER_NOW
- **specEngine.ts** — vm.runInNewContext() sandbox replaces `new Function` (Issue #5 code injection)
- **kbResolver.ts** — `active = true` filter on ALL rule table queries (not just complaint packs)

### Phase 3 — Data Integrity (Issues #19-21)
- **kbRepository.ts** — upsertKbEntity wrapped in DB transaction (version insert + store update atomic)
- **triageCache.ts** — buildTriageCacheKey now requires clinicId + kbVersion (tenant isolation + KB invalidation)
- **specEngine.ts** — loadDispositionRules returns discriminated union (ok/error), never silently returns []

### Phase 4 — Audit & Monitoring (Issues #22-25)
- **changeAuditLog.ts** — All events persisted to DB (`audit_logs` table); in-memory is read cache only
- **externalAuditStore.ts** — Per-record HMAC-SHA256 signing; `verifyAuditRecord()` for tamper detection
- **ragEvaluator.ts** — passRows query now filters `WHERE pass = true` (was computing total/total = always 1.0)
- **alertEngine.ts** — SLA breach handler failures logged (no longer silently swallowed)
- **smartLaunch.ts** — FHIR_ALLOWED_ISSUERS allowlist enforced; PKCE code_verifier validated
- **fhirClient.ts** — SMART auth failure is now a hard error (no silent unauthenticated fallback)

### Independent Review (3 Additional Issues Discovered)
1. **clinicalOrchestrator.ts** — `buildTriageCacheKey()` was called with 2 args instead of 4 required; `clinicId` and `kbVersion` now properly passed — cache isolation fix was being bypassed
2. **alertRules.ts** — `new Function` on user-editable alert expressions replaced with vm sandbox (50ms timeout, numeric-values-only sandbox)
3. **sequencer.ts** — `new Function` on procedure step conditions replaced with vm sandbox

### New Engines & Routes Added (Phases 3-5)
**ICU Control Tower** (`server/icu/`):
- `predictiveEngine.ts` — NEWS2+lactate multi-dimensional risk scoring
- `patientCommandCenter.ts` — Multi-patient risk ranking
- `emsRouter.ts` — Bed-capacity + proximity hospital routing
- `digitalTwin.ts` — Stochastic 6-hour trajectory simulation
- Route: `GET/POST /api/icu/*` — patients, ranked, simulate, route

**Clinical Validation & SaMD** (`server/validation/`):
- `clinicalValidationEngine.ts` — Sensitivity/specificity/FNR metrics; 90% ER_NOW threshold
- `generateSyntheticCases.ts` — Labeled case generator (4 archetypes)
- `trialSimulator.ts` — Batch trial runner against synthetic cohorts
- `auditReplay.ts` — Step-by-step reasoning trace reconstruction
- `driftDetector.ts` — Distributional shift monitoring with configurable thresholds
- `samdDossierGenerator.ts` — FDA 510(k)-aligned SaMD performance dossier
- Route: `GET/POST /api/validation/*` — run, dossier, drift, replay

**Network & Payer** (`server/network/`, `server/payer/`, `server/deployment/`):
- `nationalRoutingEngine.ts` — Haversine-distance + capacity national EMS routing
- `networkLearningEngine.ts` — Outcome-weighted diagnosis weight updates across network nodes
- `payerOptimizationEngine.ts` — Approval rate analysis per payer
- `contractNegotiator.ts` — Data-driven negotiation strategy recommendations
- `deploymentEngine.ts` — Clinic expansion priority scoring and phase sequencing
- Route: `GET/POST /api/network/*` — status, route, learn, payer, deploy

**Frontend Pages**:
- `/icu-control-tower` — Real-time multi-patient risk ranking + digital twin simulation
- `/validation-dashboard` — FDA SaMD metrics, confusion matrix, dossier preview
- `/network-control-tower` — Deployment planning + payer optimization UI

## Security, Safety & Compliance Architecture (12-Fix Hardening)

All 12 critical fixes from Claude's architecture review are implemented:

### T01 — RLHF Safety Governor (`server/governor/governorLoop.ts`)
- Delta cap ±2% per cycle prevents runaway weight drift
- Minimum 100 clinical outcomes required before any weight update
- Pending proposals stored to DB (`agent_weight_snapshots`) and loaded on startup
- Physician review queue: high-confidence proposals flagged for human approval

### T02 — PHI Guard for OpenAI (`server/middleware/phiGuardOpenAI.ts`)
- Regex scan strips 18 HIPAA identifiers from all messages before OpenAI API calls
- Every scrubbed call written to `phi_guard_audit_log` with field-level match details
- Wrapper `phiGuardedChat()` replaces direct OpenAI calls in clinical flows

### T03 — Twilio Webhook HMAC Validation (`server/middleware/twilioSignatureValidator.ts`)
- HMAC-SHA1 validation using `TWILIO_AUTH_TOKEN` on all `/twilio/webhook` and `/telegram/webhook` endpoints
- Invalid signatures rejected with 403 before any message processing
- Raw body preserved in `req.rawBody` via express.json verify hook

### T04 — EHR Dead Letter Monitor (`server/services/ehrDeadLetterMonitor.ts`)
- Background service (60s interval) checks `ehr_dead_letters` table
- Any record unprocessed >15 minutes triggers clinical alert via `AlertDispatcher`
- Registered in server startup via `startDeadLetterMonitor(60_000)`

### T05 — Immutable Audit Hash-Chain (`server/services/auditHashChain.ts`)
- SHA-256 chained audit log in `audit_hash_chain` DB table
- Each entry includes `prev_hash` — tampering breaks chain
- Nightly verification job auto-runs on startup; verify endpoint: `GET /api/governance/verify-chain`
- Returns `{ ok, chainIntact, valid, totalEntries, errors }`

### T06 — Mandatory Physician Review Gate (`server/routes/improvementLabRoutes.ts`)
- All AI-extracted PubMed rules inserted with `status = 'pending'`
- No bypass path exists — rules cannot become active without physician approval
- GPT-4o-mini extraction pipeline always routes through review queue

### T07 — Study Design Weighting (`server/routes/analyticsRoutes.ts`)
- Evidence scoring formula restructured: RCT=0.95, cohort=0.60, case_report=0.20
- Weights: 35% evidence quality × study design + 25% effect size + 20% sample + 15% recency + 5% authority
- Prevents case reports from being scored equivalently to RCTs

### T08 — Legal Disclaimers (UI)
- **510(k) Disclaimer** (`GovernanceCommandCenterPage.tsx` FDA tab): Red banner — "This is NOT a Submittable 510(k) Document" with full legal text per 21 CFR Part 807
- **Denial Prediction Disclaimer** (`RevenueWarRoomPage.tsx` DenialPredictorTab): Yellow banner — "Statistical Estimates Only" with 18 U.S.C. § 1347 fraud warning

### T09 — BAA Compliance Matrix (`GovernanceCommandCenterPage.tsx`)
- New "BAA Compliance" tab with 6-vendor matrix (OpenAI, Twilio, Firebase, Google Sheets, AWS, Upstash Redis)
- Flags which vendors touch PHI and require BAA signatures per HIPAA §164.308(b)(1)
- Shows count of unsigned required BAAs with actionable next-steps checklist

### T10 — Role-Based Page Guards (`client/src/components/RoleGuard.tsx`)
- `RoleGuard` component wraps 6 sensitive routes in `App.tsx`
- `/governance-command-center`, `/system-war-room`, `/executive-command`, `/skill-layer-admin` → admin only
- `/revenue-war-room`, `/clinical-improvement-lab` → admin or physician
- Unauthenticated users see "Authentication Required"; wrong-role users see "Access Denied" (`data-testid: access-denied`)

### T11 — Production Feature Flags (`server/config/productionFlags.ts`)
- `PRODUCTION_FLAGS.CHAOS_ENGINEERING_ENABLED` — false in prod, controlled by `NODE_ENV`
- `PRODUCTION_FLAGS.SHADOW_MODE_ENABLED` — false in prod
- `PRODUCTION_FLAGS.RLHF_MIN_OUTCOMES_THRESHOLD` — 100 in prod, 10 in dev
- Chaos scheduler only started when flag is true (logged on startup)

### T12 — Global Safety Gate (`server/middleware/globalSafetyGate.ts`)
- Middleware registered on all routes immediately after body parsers
- Checks DB health before every request; returns 503 if DB is unavailable (fail-closed)
- Skips health check endpoints (`/api/healthz`) to avoid circular dependency

## Claude Upgrade Bundle (Applied 2026-04-03)

### Acuity Pre-Classifier (`server/clinical/acuityPreClassifier.ts`)
- Pure-logic fast-path that fires BEFORE the AI pipeline for life-threatening presentations
- Detects: STEMI, stroke (FAST), severe dyspnea, sepsis, altered mental status, thunderclap headache, anaphylaxis
- Returns `ER_NOW | CONTINUE_PIPELINE` disposition with signal, confidence, and rationale
- Exposed at `POST /api/domain/clinical-domain/fast-path`

### Correlation ID Middleware (`server/middleware/correlation.ts`)
- Mounted as the very first middleware in `registerRoutes`
- Propagates or generates `x-correlation-id` header across all requests and responses
- All request logs now include `correlationId` field
- Frontend library at `client/src/lib/correlation.ts` — tracks per-session correlation ID in sessionStorage and injects header into all `apiFetch` calls

### Durable Queue Factory (`server/queue/queueFactory.ts` + `clinicalPipelineQueue.ts`)
- BullMQ-based queue factory with idempotency keys (SHA-256 of `encounterId:tenantId:stage:correlationId`)
- Gracefully disabled if `REDIS_URL` is not an ioredis-compatible URL
- Stages: intake → triage → reasoning → output → claim_submission

### Unified Agent Registry (`server/agents/unifiedAgentRegistry.ts`)
- DB-backed (PostgreSQL `agent_registry` table) replacing in-memory maps
- Heartbeat upsert, degradation sweep (marks missed heartbeats), and list/get queries
- Exposed via `GET/POST /api/domain/agents-domain/registry`

### Evolution Service (`server/evolution/evolutionService.ts`)
- Full proposal lifecycle: pending → staging → approved → canary → promoted | rolled_back
- DB-backed (`evolution_proposals` table) with full audit timestamps
- Exposed via `GET/POST/approve/rollback /api/domain/admin-domain/evolution/proposals`

### Tenant Config Service (`server/tenancy/tenantConfigService.ts`)
- DB-backed (`tenant_configs` table, RLS-protected with `app.current_tenant_id` session variable)
- Version-incremented upserts; exposed via `GET/PUT /api/domain/admin-domain/tenants`

### Tenant Context Middleware (`server/middleware/tenantContext.ts`)
- Sets `app.current_tenant_id` Postgres session variable per-request for RLS enforcement
- Reads from `req.user.tenantId` or `X-Tenant-Id` header

### External Audit Sink (`server/observability/externalAuditSink.ts`)
- S3 write-once sink with COMPLIANCE object lock (7-year retention)
- Gracefully logs to console when `AUDIT_S3_BUCKET` is not configured

### Domain Router Architecture (`server/routes/domainIndex.ts`)
- 6 domain routers mounted at `/api/domain/*`: clinical-domain, billing-domain, learning-domain, agents-domain, admin-domain, observability
- Worker thread stubs in `server/workers/` for golden-case validation and auto-healing

### Physician Override Dialog (`client/src/components/PhysicianOverrideDialog.tsx`)
- Shadcn Dialog with correlation ID injection, required rationale field, and structured POST to `/api/clinical/encounters/:id/override`

### SQL Migrations Applied
- `agent_registry` table (002)
- `evolution_proposals` table (003)
- `tenant_configs` table (004, with RLS policy on `tenant_id`)

## External Dependencies
*   **AI Integration**: OpenAI API
*   **Messaging Integration**: Twilio for WhatsApp, SMS, and Voice TTS
*   **Database**: Firebase Firestore, SQLite, PostgreSQL
*   **Data Configuration**: Google Sheets
*   **Cloud Storage**: Firebase Storage
*   **Authentication**: Google OAuth2 (for Gmail API)
## Second Claude Architecture Review — Deficiency Fixes

### PHI Guard: Twilio Voice TTS (`server/voice/twilioVoiceFull.ts`)
- All TTS output now passes through `scrubText()` before injection into TwiML `<Say>` elements
- Redaction events are traced with `phi_redacted_from_tts` for HIPAA audit purposes
- Closes HIPAA gap: patient PHI can no longer leak through voice output channel

### PHI Defense: Sheet Flow Loader (`server/flows/sheetFlowLoader.ts`)
- Added PHI scan on clinical question templates loaded from Google Sheets
- Logs `PHI-ALERT` to console if any PHI patterns found in template text fields
- Defense-in-depth against administrator accidentally entering PHI in the spreadsheet

### New Scoring Instruments
- **PERC Rule** (`server/services/scoring/percRule.ts`) — 8-criterion PE rule-out with `percNegative` flag; `computePERCRule()`
- **CURB-65** (`server/services/scoring/curb65Score.ts`) — CAP severity scoring with 30-day mortality risk categories; `computeCURB65Score()`
- **Ottawa Ankle & Knee Rules** (`server/services/scoring/ottawaRules.ts`) — Fracture rule-out decisions; `computeOttawaAnkleRule()` and `computeOttawaKneeRule()`

### Scoring Registry Updated (`server/services/scoring/scoringRegistry.ts`)
- All 7 instruments now registered: CENTOR, WELLS_PE, HEART, PERC, CURB65, OTTAWA_ANKLE, OTTAWA_KNEE
- Added `clinicalUse` field to `ScoringSystemMeta` for each instrument

### Golden Case Expansion (`server/services/engineDiagnosticsService.ts`)
- Expanded from 4 to **25 golden cases** covering STEMI, stroke, sepsis, SAH, anaphylaxis, ectopic, torsion, respiratory, pediatric emergencies
- Added **17 ER_NOW escalation cases** including atypical presentations (diabetic silent MI, posterior stroke, pediatric sepsis without fever, elderly AMS/UTI)
- **New 100% escalation threshold**: `escalationOk` — escalation cases must pass at 100% (not 97%); missed escalations log as CRITICAL
- Added `escalationPassRate`, `totalEscalationCases`, `escalationOk` to `GoldenCaseTestResult` interface

### Versioned Clinical Rules Table (`clinical_rules`)
- New table created in PostgreSQL with RLS-compatible structure
- Columns: `rule_key`, `version`, `complaint_cluster`, `rule_type`, `snomed_code`, `evidence_source`, `rule_body (JSONB)`, `authored_by`, `approved_by`, `effective_date`, `expiry_date`, `is_active`, `tenant_id`
- Foundation for tier-1 DB KB migration (replacing Sheets as source of truth)
- Unique index on `(rule_key, version, tenant_id)` prevents duplicate versions
- Partial index on `(complaint_cluster, is_active) WHERE is_active = true` for fast active-rule queries

### Unit Tests Added (82 total, 10 test files)
- `tests/unit/percRule.test.ts` — 6 tests for PERC rule
- `tests/unit/curb65Score.test.ts` — 8 tests for CURB-65
- `tests/unit/ottawaRules.test.ts` — 10 tests for Ottawa Ankle + Knee
- `tests/unit/centorScore.test.ts` — 8 tests for Centor
- `tests/unit/wellsScore.test.ts` — 8 tests for Wells PE

## Production Upgrade Patch (Claude Patch — Session 4)

### Meta-KB Entity Store (3 new tables, adapted to serial PKs)
- `kb_sources` — Provenance tracking for KB entities (CSV, JSON, manual, LLM, system)
- `kb_entity_store` — Generic versioned entity store on top of domain-specific KB tables; unique index on `(entity_type, entity_key)`; `status` lifecycle (draft/active/deprecated)
- `kb_entity_versions` — Immutable version history for every KB entity; CASCADE delete tied to parent entity
- `server/kb/kbTypes.ts` — TypeScript types for `KbEntityType`, `KbEntityStatus`, `KbSourceType`
- `server/kb/kbRepository.ts` — CRUD layer: `upsertKbEntity()`, `getKbEntity()`, `listKbEntities()`, `setKbEntityStatus()`, `getEntityVersionHistory()`, `countKbEntities()`; auto-version-bumps on every upsert
- `server/kb/kbResolver.ts` — `resolveComplaintPack()` joins entity store with domain KB tables; `resolveEntityPackByType()` for generic pack resolution
- `server/kb/migration/fullKbMigration.ts` — Reads from all 9 domain-specific KB tables → writes to `kb_entity_store`; `runFullKbMigration()` idempotent with upsert semantics
- `server/scripts/runFullKbMigration.ts` — Standalone migration runner script

### Golden Case DB Persistence (2 new tables)
- `golden_case_runs` — Per-run result history tied to `kb_golden_cases`; stores score, pass/fail, fail_reason, run_batch timestamp
- `golden_case_coverage` — Coverage matrix by (complaint × risk_band × age_band); unique index; `count` vs `target_count` gap tracking
- `server/golden/types.ts` — `GoldenCaseResult`, `GoldenCaseBatchResult`, `CoverageGap` interfaces
- `server/golden/goldenCaseRepository.ts` — `listActiveGoldenCases()`, `persistRunResults()`, `getRunHistory()`, `upsertCoverageMatrix()`, `getCoverageGaps()`, `getCoverageMatrix()`
- `server/golden/goldenCaseExpansion.ts` — `buildCoverageMatrix()` computes (complaint × 4 risk bands × 3 age bands) matrix; `generateExpansionTemplates()` returns gaps needing new cases
- `server/golden/goldenCaseRunner.ts` — DB-backed batch runner: loads active cases → calls `runSystem()` → scores vs expected → `persistRunResults()` → `buildCoverageMatrix()`

### BullMQ Production Infrastructure (adapted to existing getRedis() pattern)
- `server/queues/bullmq/connection.ts` — Singleton ioredis factory; respects `REDIS_URL`; gracefully disables if Upstash REST URL (https://) detected; `lazyConnect: true` to prevent startup noise
- `server/queues/bullmq/queueNames.ts` — 11 named queues: triage, notification, learning, golden-case, auto-healing, audit, ehr-outbound, explanation, webhook, report, metrics
- `server/queues/bullmq/defaultJobOptions.ts` — Default (3 attempts, exponential backoff), critical (5 attempts, priority 1), and low-priority options
- `server/queues/bullmq/queueFactory.ts` — Registry of BullMQ Queue instances; `getQueue()`, `initAllQueues()`, `closeAllQueues()`
- `server/queues/bullmq/jobTracker.ts` — Drizzle-backed job tracking against `queue_jobs` table: `trackJobQueued()`, `trackJobStatus()`, `listTrackedJobs()`
- `server/queues/bullmq/baseWorker.ts` — `createTrackedWorker()` wraps handler with dual tracking (Drizzle `queue_jobs` + existing raw `jobs` table via `upsertJobRecord()`)
- `server/queues/bullmq/health.ts` — `getQueuesHealth()` returns job counts per queue
- `server/queues/bullmq/gracefulShutdown.ts` — `registerWorkerForShutdown()` + `gracefulShutdown()` for clean process exit

### 6 New BullMQ Workers (added to registerWorkers.ts)
- `auditWorker.ts` — Writes to `triage_audit_logs` via `appendAuditLog()` from `server/repos/auditRepo.ts`; concurrency 10
- `ehrOutboundWorker.ts` — Calls `sendToEhr()` from `server/services/ehrAdapter.ts`; concurrency 3
- `explanationWorker.ts` — Enqueues LLM explanation via `enqueueExplanation()` from `server/llm/asyncLLM.ts`; concurrency 2
- `webhookWorker.ts` — Delivers HTTP POST webhooks with `fetch()` + 15s timeout; concurrency 5
- `reportWorker.ts` — Builds daily reports using `goldenCaseRuns` + `kbGoldenCases` counts; concurrency 2
- `metricsWorker.ts` — Rolls up `kbLearningEvents` count + golden case pass rate; concurrency 3

### Unified Publisher API
- `server/queues/publishers.ts` — Typed publisher for all 11 queues: `publishers.triage.runTriage()`, `publishers.audit.log()`, `publishers.ehr.deliver()`, `publishers.goldenCase.runBatch()`, `publishers.metrics.rollup()`, etc.

### Production Scheduler
- `server/scheduler/productionScheduler.ts` — `startProductionScheduler()` / `stopProductionScheduler()`; 3 scheduled jobs: golden-case-batch (hourly), metrics-rollup (15 min), executive-report (daily); gracefully disabled when Redis unavailable

### New API Routes
- `/api/kb` — KB entity CRUD: `GET /entities`, `GET /entities/:type/:key`, `GET /entities/:id/history`, `PUT /entities/:type/:key/status`, `GET /resolve/:complaint`, `GET /resolve-type/:entityType`, `GET /stats`, `POST /migrate`
- `/api/golden` — Golden case monitoring: `GET /cases`, `GET /cases/:id/history`, `GET /runs/:runBatch`, `POST /run` (sync or async via `?async=true`), `GET /coverage`, `GET /coverage/gaps`, `POST /coverage/rebuild`, `GET /expansion/templates`
- `/api/queues` — Queue admin: `GET /health`, `GET /jobs`, `GET /status`, `POST /init`, `POST /publish/*`

### Queue Jobs Table (new Drizzle table)
- `queue_jobs` — Drizzle-backed BullMQ job tracking; unique index on `(queue_name, job_id)`; parallel to existing raw-SQL `jobs` table (no conflict)

---

## Auralyn Patch Pack (ChatGPT + Claude Deep Evaluation — April 2026)

### SQL Migrations (7 new tables, run directly via psql)
- `governance_flags` — System-wide flags: `validation_lock` for model freeze
- `outbox_events` — Transactional outbox for PostgreSQL → Firestore consistency (aggregate_type, event_type, payload_json, processed_at, failure_count)
- `electronic_signatures` — FDA 21 CFR Part 11 e-signatures: printed_name, meaning, statement_text, signature_digest (SHA-256 canonical hash), metadata_json
- `physician_overrides` — Structured override records: output_fingerprint, reason_category (9-category enum), ai_disposition, ai_diagnoses_json
- `kb_deficiency_signals` — Auto-generated KB quality alerts: severity (medium/high), signal_source (single_physician_repeat/cross_physician_consensus)
- `kb_population_priors` — Population-specific Bayesian prior multipliers keyed by population_flag
- `scoring_system_versions` — Version history of SCORING_SYSTEMS sheet loads with content_hash deduplication
- Columns added: `tenant_id` on queue_jobs/audit_hash_chain/kb tables; `kb_version_hash`+`detected_language` on encounters

### Clinical Safety Layer
- `server/clinical/acuityPreClassifier.ts` — Extended from 7 to 14 fast-path conditions; added ectopic pregnancy rupture, testicular torsion, meningococcal sepsis, aortic dissection, CO poisoning, adult epiglottitis, pediatric intussusception; each with `erNowMessage` and `specificityFlag`
- `server/clinical/populationFlags.ts` — Detects 5 population modifier flags from clinical state: immunocompromised, elderlyOver75, pregnant, pediatricUnder2, dialysisDependent
- `server/clinical/bayesianPriorService.ts` — Population-specific prior multipliers from DB with 5-min cache; `invalidatePriorCache()` for emergency eviction
- `server/clinical/bayesianFallback.ts` — 0.40 posterior confidence threshold: below → uncertain differential + physician_review priority elevated to `urgent`
- `server/clinical/debatePolicy.ts` — Documented 4-rule debate resolution matrix: (1) Safety veto absolute, (2) Consensus, (3) Higher acuity wins, (4) Merged differential; version AURALYN_DEBATE_POLICY_v2026_04

### Governance & Regulatory
- `server/governance/audit.ts` — Thin wrapper routing `appendAuditEvent()` through existing immutable hash chain
- `server/governance/modelFreeze.ts` — `POST/GET /api/governance/model-freeze`; `assertModelPromotionAllowed()` throws 423 if validation_lock is active
- `server/governance/sqliteDeprecationGuard.ts` — Blocks PHI writes to SQLite; hard deadline 2026-07-02; scans for 10 PHI field name tokens
- `server/governance/productionChecklist.ts` — 12-item production readiness checklist: WAF, private subnets, TLS 1.2+, BAAs, 7-year audit retention, immutable sink, pen test, SQLite deprecation, SCORING_SYSTEMS health, physician review gate, model freeze

### Physician Workflow
- `server/physician/part11SignatureService.ts` — `createPart11Signature()`: requires password re-verification, captures printed name + meaning + statement, produces SHA-256 digest of canonical record, stored in electronic_signatures
- `server/physician/overrideLearning.ts` — `recordOverrideAndMaybeSignal()`: 9-category structured override; auto-creates kb_deficiency_signals at ≥3 same-physician repeats (medium) or ≥3 cross-physician (high)

### Knowledge Base
- `server/kb/priorInvalidationRoute.ts` — `POST /api/kb/priors/invalidate` (admin); `GET /api/kb/priors/cache-stats`; both write to audit chain
- `server/kb/kbConsistencyAudit.ts` — `runKbConsistencyAudit()`: daily comparison of kb_entity_store vs 4 domain tables; writes result to audit chain
- `server/kb/scoringSystemsLoader.ts` — `loadScoringSystemsOrFail()`: BLOCKING on empty/malformed SCORING_SYSTEMS sheet (per Claude Q6); halts KB load cycle rather than silently degrading. Persists version record to scoring_system_versions on every successful load

### Infrastructure
- `server/db/outbox.ts` — `createEncounterWithOutbox()`: writes encounter + outbox_event atomically in a single transaction; `writeOutboxEvent()` for standalone events
- `server/jobs/outboxWorker.ts` — `flushOutbox()`: SELECT FOR UPDATE SKIP LOCKED batch flush to Firestore writer; tracks failure_count and last_error; `getOutboxLag()` for monitoring
- `server/queues/clinicalQueue.ts` — `enqueueClinicalJobOrFail()`: hard-fails (503) when Redis unavailable instead of silently falling back to in-memory queue; writes rejection to audit chain
- `server/middleware/tenantContextHardFail.ts` — `tenantContextHardFail()` / `requireTenantContext()`: returns 400 TENANT_CONTEXT_REQUIRED when tenant cannot be resolved from header or session
- `server/i18n/multilingualIntake.ts` — 8-language NYC intake: detect → normalize to English → run pipeline → localize output; `createGoogleTranslationProvider()` adapter (GCP HIPAA addendum required); languages: en/es/zh/bn/ru/ar/ht/ko
- `server/sheets/phiScanner.ts` — `assertNoPhiInSheetsContent()`: throws on 14 PHI regex patterns in Sheets content; halts cache load cycle; `scanAndWarn()` for non-blocking monitoring
- `server/jobs/backpressuredLoop.ts` — `startBackpressuredLoop()`: setTimeout-after-completion pattern; eliminates concurrent execution buildup from setInterval
- `server/jobs/advisoryScheduler.ts` — `runWithAdvisoryLock()`: wraps jobs in `pg_try_advisory_lock`; only one instance executes across horizontal scale
- `server/scheduler/productionScheduler.ts` (refactored) — All 3 BullMQ jobs now use backpressuredLoop + advisoryScheduler; KB consistency audit added as 4th job (no Redis dependency)

### Routes Registered in server/index.ts
- `app.use("/api/kb", priorInvalidationRouter)` — Prior cache invalidation + stats
- `app.use(modelFreezeRouter)` — Model validation lock (mounts at `/api/governance/model-freeze`)
- `app.use(commandStripRouter)` — All command strip endpoints (see below)

---

## Physician Command Strip — 500 Patients/Day Feature Set

### Backend Files

**Three-Tier Triage Router** (`server/physician/triageRouter.ts`)
- `assignTier()` — pure function: input debate outcome + disposition + confidence + flags → Tier 1/2/3 with rationale
- Tier 1 (notify-only, SLA 4h): CONSENSUS + HOME_CARE + conf ≥ 0.85 + no flags
- Tier 2 (eyes-on 30s, SLA 2h): CONSENSUS URGENT_CARE or any population/red flag
- Tier 3 (full review 15min): VETO_BLOCK, HIGHER_ACUITY_WINS, MERGED_DIFFERENTIAL, ER_NOW, conf < 0.40, prior override exists

**Command Strip Queue** (`server/physician/commandStripQueue.ts`)
- `getCommandStripQueue()` — loads all pending sessions, assigns tiers, sorts T3→T2→T1 oldest-first
- Checks `physician_overrides` table for prior override fingerprint matches
- Returns `tierCounts`, `batchEligibleCount`, and `batchEligible` flag per case

**Batch Part 11 Signature Service** (`server/physician/batchSignatureService.ts`)
- `batchApproveCases()` — batch-approves up to 100 Tier-1 cases under one SHA-256 Part 11 signature
- Canonical statement includes exact selection criteria — legally equivalent to radiologist batch read attestation
- Stores batch signature in `electronic_signatures`, links all cases via `batchSignatureId` + `batchId`
- Throws 401 on credential verification failure, 400 on empty batch, 400 on oversized batch (>100)

**Physician Inbox Broker** (`server/inbox/physicianInboxBroker.ts`)
- `ingestChannelEvent()` — normalizes events from whatsapp/telegram/web/chatgpt/voice/sms with deduplication
- `computePriority()` — classifies critical/high/normal/low from text patterns + event type
- `getPhysicianInbox()` — priority-sorted, filterable by channel and priority
- `routePhysicianReply()` — routes physician approve/escalate/override/flag back to originating channel adapter
- `registerChannelAdapter()` — pluggable adapter interface for each messaging channel

**Ambient Health Aggregator** (`server/monitoring/ambientHealthAggregator.ts`)
- `getAmbientHealthSnapshot()` — returns 6 health dots: KB, Debate Engine, Scoring Systems, Messaging Gateway, PHI Scanner, Outbox Lag
- Each dot: green/amber/red/gray with detail text and plain-English degradedMessage for amber/red
- All 6 checks run in parallel via `Promise.all()`

**Command Strip API Routes** (`server/routes/commandStripRoutes.ts`)
- `GET  /api/command-strip/queue` — tiered patient queue (filter by tier, paginated)
- `POST /api/command-strip/cases/:id/approve` — single approve + audit log
- `POST /api/command-strip/cases/:id/escalate` — single escalate + audit log
- `POST /api/command-strip/cases/:id/override` — structured override with 9-category dropdown
- `POST /api/command-strip/batch-approve` — batch Part 11 sign + approve Tier-1 cases
- `GET  /api/command-strip/inbox` — unified physician inbox across all channels
- `GET  /api/command-strip/inbox/stats` — inbox volume by channel and priority
- `POST /api/command-strip/inbox/reply` — physician reply routed to originating channel
- `POST /api/command-strip/inbox/ingest` — channel adapter event injection endpoint
- `GET  /api/command-strip/health` — 6-dot ambient health snapshot

### Frontend Files

- `client/src/pages/PhysicianCommandStrip.tsx` — Full command strip page at `/physician-command-strip` (role-gated: admin/physician/clinician). Two-tab layout: Queue + Inbox. Keyboard shortcuts: J/K navigate, Space select, A approve, E escalate, O override. 15s auto-refresh on queue, 10s on inbox. Tier filter pills. Ambient health bar embedded at top. Batch select + sign workflow integrated.

- `client/src/components/physician/CommandCard.tsx` — Per-case card: disposition color, tier badge, channel badge, diagnoses, red/population flags, ER now message, SLA breach indicator, inline override form with 9-category dropdown. Four action buttons: Approve / Escalate / Override / (deferred via checkbox).

- `client/src/components/physician/AmbientHealthBar.tsx` — Row of 6 colored dots with tooltip on hover (label + detail + degradedMessage). Auto-refreshes every 30s. Amber/red dots pulse. Alert message if any dot is degraded.

- `client/src/components/physician/BatchApproveBar.tsx` — Sticky bottom bar. Shows count of selected and how many are batch-eligible. PIN/password input with Enter-to-submit. Calls `POST /api/command-strip/batch-approve`. On success: shows signature ID in toast, clears selection.

- `client/src/components/physician/TierBadge.tsx` — Color-coded tier pill (emerald/amber/red) with animated pulse dot for Tier 3.

### Route Registration
- `ROUTES.PHYSICIAN_COMMAND_STRIP = "/physician-command-strip"` added to `client/src/routes/routeRegistry.ts`
- Route added to `WorkbenchRouter` in `App.tsx` with `RoleGuard` (admin/physician/clinician)

## Self-Improvement Governance Layer (Hardening Packet)

### Overview
`server/agents/selfImprove.ts` was a minimal in-memory prototype (no DB, no governance). It has been completely rewritten with 7 hardening items:

1. **Distributed locking** — `runContinuousImprovement()` acquires a session-level Postgres advisory lock (`pg_advisory_lock(91424019)`) with explicit `pg_advisory_unlock` in `finally` to serialize cycles across all processes.
2. **Idempotent apply** — `applyImprovementAction()` checks `status === "applied"` and returns `{ applied: false, reason: "already applied" }` immediately.
3. **Compare-and-swap** — apply reads the current threshold from DB and verifies it matches `action.fromValue` before writing; mismatches fail with `"stale proposal"`.
4. **Explicit lifecycle** — `proposed | pending_review | approved | applied | rejected | failed` persisted in Postgres; never in-memory.
5. **Duplicate proposal suppression** — `hasOpenProposal(agent, parameter)` blocks creating a new proposal when one with `status IN ('proposed', 'pending_review', 'approved')` already exists for that agent+parameter pair.
6. **Validated stats inputs** — `validateAgentStat()` rejects non-finite runs, runs < 1, successRate outside 0–100.
7. **Physician review flow** — full CRUD: list pending, approve-and-apply, reject, per-action history, all routed through `requireRole(['physician', 'admin'])`.

### New DB Tables (created via psql)
- `agent_threshold_records` — replaces in-memory Map; stores `(agent, parameter)` → `current_value` with `UNIQUE` constraint for upsert.
- `improvement_actions` — row per proposal with full lifecycle status + metric JSONB.
- `improvement_reviews` — one row per physician decision (approve/reject) referencing `improvement_actions`.
- `improvement_cycle_log` — one row per orchestrator cycle: proposed/applied/rejected counts + durationMs + error.

### New / Rewritten Files
- `server/agents/selfImprove.ts` — complete rewrite; exports `evaluateAndImprove` (now async), `applyImprovementAction`, `approveAndApplyAction`, `rejectImprovementAction`, `hasOpenProposal`, `validateAgentStat`, `listPendingReviews`, `getReviewHistory` + backward-compat `computeBusinessMetrics`, `getImprovementLog`, `getAgentThresholds`, `startSelfImproveLoop`, `stopSelfImproveLoop`.
- `server/agents/selfImprovementOrchestrator.ts` — rewritten with advisory lock + 30s min-gap guard; writes `improvementCycleLog` on every run.
- `server/agents/selfImprovementReviewService.ts` — thin re-export facade for routes to import from.
- `server/routes/selfImprovementGovernance.ts` — 5 endpoints under `/api/self-improvement/`.

### API Routes (`/api/self-improvement/`)
- `GET  /reviews` — list pending/proposed/approved actions (physician+admin)
- `POST /reviews/:id/approve` — physician approves and immediately applies
- `POST /reviews/:id/reject` — physician rejects with optional note
- `GET  /reviews/:id/history` — full review audit trail for one action
- `GET  /log?limit=N` — recent improvement actions from DB

### Tests
- `tests/unit/selfImproveGovernance.test.ts` — 27 new tests covering all 7 hardening items (pure + DB-mocked). Total test suite: **353/353**.

### Backward Compatibility
- `payerIntelligenceRoutes.ts` routes calling `evaluateAndImprove()`, `getImprovementLog()`, `getAgentThresholds()` are updated to `await` the now-async functions.
- `metaOrchestrator.ts` calling `computeBusinessMetrics()` is unchanged (that function remains sync/pure).

---

## Telemedicine Multi-Agent Intelligence Upgrade (Phases 1–5)

**590/590 tests passing.**

### New Intelligence Engines (server-side)
| File | Purpose |
|------|---------|
| `server/qa/qaAgent.ts` | Autonomous QA agent — flags safety_miss, undertriage, overtriage, contradiction, low_confidence |
| `server/qa/qaLogService.ts` | QA event log with stats aggregation |
| `server/reasoning/counterfactualEngine.ts` | Counterfactual reasoning — "what would change this decision?" |
| `server/reasoning/trajectoryEngine.ts` | 24h trajectory prediction with risk score, trend, escalation probability |
| `server/reasoning/bayesianEngine.ts` | Bayesian posterior updates from clinical evidence |
| `server/simulation/digitalTwinEngine.ts` | 3-scenario digital twin (no-action / treatment / delay) |
| `server/simulation/fullTwinEngine.ts` | Continuous 24-72h simulation timeline |
| `server/assistant/telemedAgentAdapter.ts` | Maps telemedicine outputs → standardized agent opinions + debate runner |
| `server/assistant/requeryPolicy.ts` | Re-query decision policy (uncertainty, consensus, sub-service failures) |
| `server/assistant/nextBestQuestionEngine.ts` | Information-gain-ranked next-best-question selection |
| `server/assistant/caseMemoryService.ts` | Per-case temporal memory log (iteration, triage, uncertainty, winner) |
| `server/assistant/escalationService.ts` | Builds actionable escalation bundle for urgent/emergency cases |
| `server/assistant/specialtyRouter.ts` | Routes complaints to specialty council (cardiology, pulmonary, ID, ENT, neuro, GI) |
| `server/learning/outcomeLearningService.ts` | RLHF-lite outcome recording + per-agent performance scoring |
| `server/learning/agentWeighting.ts` | Adaptive agent weighting from historical performance |
| `server/learning/metaLearningEngine.ts` | Meta-learning for threshold adaptation (escalation, uncertainty, re-query, safety boost) |
| `server/missionControl/cognitiveBus.ts` | WebSocket-capable cognitive event bus (pub/sub for mission control stream) |
| `server/hospital/commandGrid.ts` | Multi-patient command grid (risk-ranked, real-time updated) |
| `server/agents/interventionAgent.ts` | Autonomous intervention engine (ESCALATE/REQUERY/FOLLOW_UP/MONITOR/NONE) |
| `server/integration/outcomeIngest.ts` | Outcome ingestion from EHR → RLHF-lite |

### Upgraded Telemedicine Service
`server/assistant/telemedicineAssistantService.ts` now runs all intelligence layers in sequence:
- Base clinical pipeline (differential, safety, urgency, resources, questions)
- Agent debate (5 agents: diagnostic, triage, safety, treatment + specialty)
- Meta-learning threshold refresh
- Re-query policy + Next-Best-Question selection
- Trajectory prediction + Digital twin simulation
- Counterfactual analysis + Bayesian updating
- Specialty routing + Escalation bundle
- QA audit + Intervention decision
- Case memory logging + Command grid update
- Population health logging + Cognitive bus broadcast

Returns enriched `AssistantResult` with: `uncertainty`, `debate`, `requery`, `counterfactuals`, `trajectory`, `bayesian`, `simulation`, `qa`, `specialty`, `escalation`, `intervention`, `systemThresholds`, `iteration`.

### New API Endpoints
- `GET /api/mission/snapshot` — full mission control state (grid, QA, agents, thresholds, cognitive history)
- `GET /api/mission/command-grid` — active patient command grid
- `GET /api/mission/cognitive-stream` — last 50 cognitive bus events
- `GET /api/learning/agents` — agent performance rankings
- `GET /api/learning/outcomes` — outcome event log
- `GET /api/learning/thresholds` — current system thresholds
- `POST /api/learning/meta-learn` — trigger threshold adaptation
- `POST /api/telemed/outcome` — ingest EHR outcome (correct/incorrect/overtriage/undertriage)

### Brain Command Center Dashboard
Route: `/brain-command-center` | Sidebar entry: "Brain Command Center"
8 tabs (expanded):
1. **Command Grid** — live risk-sorted patient grid with triage, risk %, trajectory, escalation badges
2. **Cognitive Stream** — real-time cognitive event log with safety override + fusion badges
3. **Next Questions** — Next-Best-Question panel ranked by info gain, re-query intelligence + live status
4. **Why This Won** — SHAP-style explanation: factor attribution, contribution bars, narrative, winner domain
5. **Temporal View** — per-case decision timeline across iterations with change tracking + SHAP history
6. **Agent Performance** — live win-rate tracker with drift detection + historical outcome scores
7. **QA Audit** — per-case QA scores, flag distribution, flag detail cards
8. **Meta-Learning** — 4 adaptive threshold cards with visual progress bars + trigger button

### Intelligence Engines (Telemedicine Layer)
- `server/assistant/clinicalFusionEngine.ts` — 6-layer priority cascade arbitration
- `server/assistant/uncertaintyEngine.ts` — multi-signal uncertainty quantification (score + level + drivers)
- `server/assistant/safetyGovernor.ts` — FDA-grade hard override (forces emergency when safety alerts present)
- `server/assistant/shapExplainer.ts` — SHAP-style factor attribution for "Why This Won"
- `server/assistant/agentPerformanceTracker.ts` — win rate per agent + drift detection (window vs overall)
- `server/assistant/shapLogService.ts` — in-memory SHAP explanation log (last 50 entries)

### AssistantResult Fields (Full)
Core: caseId, complaint, iteration, triage, differential, nextQuestions, resources, contradictions, safetyAlerts, pathway
Intelligence: uncertainty, debate, requery, counterfactuals, trajectory, bayesian, simulation, qa, specialty, escalation, intervention
New engines: fusion, uncertaintyLevel, uncertaintyDrivers, safetyGovernorOverride, safetyGovernorReason
Explainability: explanation (SHAP factors + narrative), nextBestQuestions, temporalHistory

### National Intelligence Layer (Packet: National Network Layer)

`server/national/` — 7 modules:
- `federationEngine.ts` — aggregates all regional states; computes totalPatients, totalER, avgStrainScore, critical/surge/stable region tiers
- `crossRegionLearning.ts` — merges population complaint signals across regions; surfaces top 10 national complaints, confidence scores, cross-regional spread alerts
- `nationalLoadBalancer.ts` — balances demand across regions; recommends lowest-strain region, identifies overflow regions, generates cross-region transfer suggestions
- `policyLayer.ts` — enforces US state-level telehealth regulations (NY supervision, TX/ILC compact, CA NP independence); international fallback
- `scalingController.ts` — autonomous scaling actions triggered by patient volume, strain score, ER rate, critical regions, pattern alerts
- `nationalPopulation.ts` — CDC-like national epidemiological surveillance; watch (20+ cases), alert (50+ across 3+ regions), pandemic_signal (200+ or 80% of regions)
- `nationalOrchestrator.ts` — coordinates all 6 national modules; full national orchestration output

API: `POST /api/national/orchestrate` — accepts regional state array; returns federation, learning, load balance, policy, scaling, population outputs

UI: `NationalCommandCenter.tsx` — federation grid with strain bars, load balancing panel, scaling actions by priority, cross-region learning signals, population clusters, policy snapshot

### Global Intelligence Layer (Packet: Global/WHO-Scale)

`server/global/` — 3 modules:
- `globalOrchestrator.ts` — groups regions by continent; computes continent signals (volume, trend, avgStrain); identifies underloaded redistribution targets + overloaded regions; drives all 3 sub-modules
- `pandemicEngine.ts` — 3 sub-engines: detectPandemicSignals (respiratory cluster: cough>200 AND fever>200; GI cluster: vomiting>150 AND diarrhea>150), simulateSpread (SIR model: R0, population, initialInfected → next-day/week/month/peak/herd), earlyWarningSystem (severity: none/watch/warning/critical + action)
- `globalPolicyLayer.ts` — country-specific policy (US HIPAA, UK NHS, India LGPD, Brazil CFM, EU GDPR, AU MBS); default-deny for unknown jurisdictions

API: `POST /api/global/orchestrate` — accepts regions with continent/country; returns continentSignals, pandemic, simulation, earlyWarning, redistribution, policy outputs

UI: `GlobalCommandCenter.tsx` — continent trend grid, pandemic detection status, SIR simulation cards, early warning banner, redistribution targets, global policy snapshot

### Full Intelligence Pipeline (complete)
Patient → Clinical Brain → Hospital Brain → Regional Orchestrator → National Orchestrator → Global Orchestrator

### Test Coverage
- 801 tests passing across 30 test files (added 64 new tests: 37 national, 27 global)

### Mission Control API (Extended)
- `GET /api/mission/snapshot` — full system snapshot including liveAgentPerformance, driftEvents, shapHistory, activeCases
- `GET /api/mission/agent-performance` — live win rates + drift events per agent
- `GET /api/mission/drift-events` — recent drift detection events
- `GET /api/mission/shap-history` — recent SHAP explanations
- `GET /api/mission/case-memory/:caseId` — temporal history + SHAP for a specific case
- `GET /api/mission/active-cases` — list of all cases with recorded memory

### Packet 20 — Automation Template Studio (Phase 3: Integration Map)

**New files:**
- `server/automation/events.ts` — Domain event types (`AutomationEvent` union) and `TOPICS` constants (run, result, validation, selector_drift)
- `server/automation/metricsTracker.ts` — Prometheus-ready in-memory counters: `runsTotal`, `failuresTotal`, `selectorHealCount`, p95/max latency, per-template breakdown, `toPrometheusText()`
- `server/automation/queue.ts` — Lightweight in-process async job queue: `registerJobHandler`, `enqueueJob`, `fireAndForget`, `onJobResult`, `getQueueState`; concurrency-controlled (5 workers); no BullMQ dependency
- `server/automation/templateRunner.ts` — Playwright runner wired to `replayWithHealing` + `auditStep`; registers as queue job handler via `startTemplateRunner()`; 6-hour validation scheduler via `startValidationScheduler()`
- `server/oversight/automationMonitor.ts` — Rolling failure-rate window (last 50 jobs); `analyzeAutomationMetrics()` for batch analysis; `getAutomationHealthSnapshot()` for live oversight; `FAILURE_RATE_THRESHOLD = 0.1`
- `client/src/components/tower/AutomationPanel.tsx` — Control Tower panel: live metrics cards (runs, failures, heals, p95), queue state badge, per-template table, instability alert banner, link to Template Health Dashboard

**Modified files:**
- `server/core/masterClinicalPipeline.ts` — Automation side-channel: `fireAndForget("insurance_check")` after safety clears; **skipped when `disposition === "escalate"` (ER safety guardrail)**
- `server/oversight/autonomousOversightAgent.ts` — Step 4b: calls `getAutomationHealthSnapshot()` and merges automation alerts into oversight decision (non-blocking try/catch)
- `server/meta/metaLearningEngine.ts` — `LearningInsight.type` extended with `"selector_drift"` union member
- `client/src/pages/SystemControlTowerPage.tsx` — Added "Automation" tab (PlayCircle icon) + `AutomationPanel` rendering block
- `server/automation/healthRoutes.ts` — Added `GET /api/automation/metrics` endpoint returning `{ metrics, queue, prometheus }`

**Test count (Phase 3):** 907/907 passing across 33 files (+23 new integration tests in `tests/unit/automationIntegration.test.ts`)

### Packet 20 — Automation Template Studio (Visual Editor + LLM Generator)

**New files:**
- `server/automation/llmTemplateGenerator.ts` — GPT-4o-mini powered full template generator: `generateTemplateFromPrompt(prompt)` → `AutomationTemplate` JSON; `repairTemplateStep()` for LLM-based selector repair fallback; strict output validation + coercion; lazy OpenAI init
- `server/automation/routingStrategy.ts` — Global automation routing: `pickWorkerRegion()` (probes all regions in parallel), `pickWorkerRegionFromMap()` (synchronous from pre-measured latency), `buildJobUrl()`, 4 regions (dev / us-east / eu-west / asia-pacific) configurable via env vars
- `client/src/pages/AutomationStudio.tsx` — 4-tab visual workspace at `/automation/studio`:
  - **Build** — Visual step builder (click/fill/select/waitFor/screenshot); add/remove/reorder steps; selector + fallback selector fields; save to template store; test-run with replay link
  - **Generate** — LLM prompt → full template; preview generated steps; one-click adopt to template store
  - **DNA** — Template health view: selector confidence scores, healing history, run count, success rate (calls `GET /api/automation/dna/:key`)
  - **Route** — Region probe + latency table; auto-pick fastest worker; submit job to selected region

**New API endpoints:**
- `POST /api/automation/generate` — LLM template generation; requires `{ prompt }` body; returns `{ template, rawContent, tokensUsed }`
- `GET /api/automation/dna/:key` — Template DNA: selector scores + version history + metrics breakdown
- `GET /api/automation/routing/probe` — Probe all worker regions; returns `{ latencies, recommended }` region

**Modified files:**
- `server/automation/routes.ts` — Added 3 new endpoints (generate, dna/:key, routing/probe)
- `client/src/App.tsx` — Added `/automation/studio` route → `AutomationStudio`

**Test count (Visual Editor):** 919/919 passing across 34 files (+12 new tests in `tests/unit/automationStudio.test.ts`)

---

### Multi-Packet — ML Pipeline, Scaling Infrastructure, SMART-on-FHIR, Observability

**New files:**
- `server/ml/featureStore.ts` — `buildFeatures(input)` → 15-field numeric feature vector (age, sbp, spo2, hr, rr, temp, chestPain, sob, diaphoresis, confusion, fever, immunocompromised, ageOver65, ageOver80, dbp); `normalizeFeatures()` for model input
- `server/ml/admissionModel.ts` — Logistic regression admission risk model (15 weights + bias); `predictAdmission()` returns probability, risk level, top-5 contributing factors, modelVersion; `explainPrediction()` for interpretability; `dataDrift()` SPO2 mean-shift detector with configurable threshold; `trainModel()` offline training stub
- `server/ml/mlRoutes.ts` — REST API: `POST /api/ml/predict`, `POST /api/ml/features`, `POST /api/ml/explain`, `POST /api/ml/drift`, `POST /api/ml/train`
- `server/performance/latencyBudget.ts` — `enforceLatencyBudget(start, budgetMs)` → `{ degrade, elapsed, budget, reason }`; `retryWithJitter(fn, opts)` with exponential backoff + random jitter; `timeoutRace(promise, ms)` utility
- `server/performance/canaryRouter.ts` — `shouldUseNewModel(patientId, pct)` stable-hash canary rollout; `assignExperiment(userId, name, pct)` deterministic A/B; `canaryDecide(id, opts)` higher-order decision helper
- `server/clinical/policyEngine.ts` — Dynamic triage policy store: 7 seeded policies (NY region, MEDICARE/MEDICAID payer, global kill switch); `getPolicy()`, `setPolicy()`, `isPolicyEnabled()`, `getPoliciesForContext({ region, payer })`, `globalKillSwitch(mismatchRate)` with 2% hard threshold
- `server/clinical/policyRoutes.ts` — REST API: `GET /api/policies`, `GET /api/policies/context?region=&payer=`, `GET /api/policies/:key`, `PUT /api/policies/:key`
- `server/reporting/execBrief.ts` — `generateExecBrief(metrics)` → structured investor brief; `buildFdaPack(metrics, tests)` → Class II SaMD FDA validation pack with risk controls + auditability statements; `exportFdaPack(pack)` → writes `fda_validation_<ts>.json`; `buildPitchDeck(metrics)` → markdown pitch
- `server/reporting/reportingRoutes.ts` — REST API: `POST /api/reporting/exec-brief`, `POST /api/reporting/fda-pack`, `POST /api/reporting/fda-pack/export`, `POST /api/reporting/pitch-deck`
- `server/ingest/bulkIngest.ts` — `ingestNdjson(path)` sync NDJSON parser with error tracking; `ingestNdjsonStream(path, cb)` async streaming parser; `ingestCsv(path, delimiter)` CSV parser with header detection + column-count validation
- `server/ehr/smartAuth.ts` — Complete SMART-on-FHIR layer wrapping existing low-level FHIR client: `buildSmartLaunchUrl()`, `exchangeCodeForToken()`, `getPatientFHIR()`, `createEncounterFHIR()`, `postObservationFHIR()`, `postVitalsFHIR()` (bulk vitals → parallel FHIR observations with LOINC codes)

**Modified files:**
- `server/routes.ts` — Added ML routes, reporting routes, policy routes, global `GET /metrics` Prometheus endpoint
- `GET /metrics` — Prometheus text format: HTTP requests/errors/latency (P50/P95/avg) + queue depth/workers + full automation metrics via `toPrometheusText()`. Ready for Grafana scrape config: `targets: ["localhost:5000"]`

**Test count:** 955/955 passing across 35 files (+36 new tests in `tests/unit/mlAndScaling.test.ts`)

---

### Multi-Packet — Grafana Observability, SMART EHR, ML Operations, Simulation, Resilience

**New server modules:**
- `server/ml/modelRegistry.ts` — Model version store: `switchModel()`, `rollbackModel()`, `listVersions()`, immutable history with timestamps; REST via `POST /api/ml/registry/switch`, `POST /api/ml/registry/rollback`
- `server/ml/featureLogger.ts` — Training data capture: `logFeatures(features, outcome, modelVersion)` → TRAIN_DATA JSON lines; `getFeatureLog(n)`, `exportFeatureLogNdjson()`, `getFeatureLogStats()`; REST via `GET /api/ml/features/log`, `GET /api/ml/features/export`
- `server/ml/syntheticData.ts` — Clinically realistic synthetic generator: `generateSynthetic(n, seed)` — seeded LCG for determinism, rush-hour arrival patterns, high/low risk split; `generateLabeledDataset(n)` for training
- `server/ml/externalMLClient.ts` — `predictML(input)` → calls `process.env.ML_URL/predict` with retry + jitter; falls back to in-process logistic model when ML_URL is unconfigured; `getMLServiceStatus()`
- `server/ml/retrainScheduler.ts` — Accuracy watchdog: `retrainIfNeeded(metrics)` checks accuracy vs 90% threshold + minimum 100 samples; `scheduleRetrainCheck(getMetrics, intervalMs)` periodic timer; full stats via `getRetrainStats()`
- `server/ml/mlAdminRoutes.ts` — REST API for ML admin: `/api/ml/registry/*`, `/api/ml/features/*`, `POST /api/ml/synthetic`, `GET /api/ml/external/status`, `/api/ml/retrain/*`
- `server/analytics/riskHeatmap.ts` — `buildRiskHeatmap(patients)` → complaint-keyed aggregation with avg risk + high-risk count; `sortByPriority(patients)` → stable risk-score descending sort; `detectPatterns(data, minCount)` → high-frequency symptom extraction; `getTopRiskComplaint()`; REST via `/api/analytics/*`
- `server/monitoring/alertBus.ts` — EventEmitter-based live alert bus: `emitAlert(msg, severity, source)` → `info|warn|critical`; `onAlert(cb)` / `onAlertBySeverity(severity, cb)` subscriptions; ring buffer (200); `getRecentAlerts(n)`, `getAlertStats()`; REST via `GET/POST /api/alerts`
- `server/simulation/hospitalSimulator.ts` — Capacity load model: `simulateHospital(hours, opts)` → hourly arrivals with rush-hour multiplier, ER/telemed split, discharge model, overload detection, wait-time estimation; deterministic with seed; `GET /api/simulate/hospital`
- `server/infra/resilientFetch.ts` — Multi-region HTTP failover: `resilientFetch(path, options)` → sequential region fallback with per-region health tracking; `startHealthCheckLoop(intervalMs)` → periodic health probes; `resetRegionHealth()`; configurable via `CLUSTER_*` env vars
- `server/routes/smartRoutes.ts` — Epic SMART-on-FHIR Express router: `GET /smart/launch` → redirect to authorization URL; `GET /smart/callback` → token exchange; `GET /smart/status` → configuration check
- `server/exec/deckGenerator.ts` — `generateDeckMarkdown(metrics)` → complete pitch deck markdown; `writeDeckFile(metrics)` → writes `deck.md`; `generateDeckJson(metrics)` → structured slide array for API responses

**New config files:**
- `grafana/provisioning/datasources/prometheus.yaml` — Prometheus datasource pointing at `http://prometheus:9090`
- `grafana/provisioning/dashboards/dashboards.yaml` — Dashboard auto-provisioning from `/var/lib/grafana/dashboards`
- `grafana/dashboards/auralyn.json` — 11-panel Grafana dashboard (uid: `auralyn-main`): P95/avg latency, error rate, automation runs/failures/success rate, queue depth/workers, selector heals — import via Grafana → Dashboards → Import

**New API endpoints (all live):**
- `GET /api/simulate/hospital?hours=48&seed=42` — hospital capacity simulation
- `POST /api/analytics/heatmap` / `/priority` / `/patterns` — risk analytics
- `GET /api/alerts`, `POST /api/alerts` — live alert bus
- `GET /api/ml/registry`, `POST /api/ml/registry/switch|rollback` — model versioning
- `POST /api/ml/synthetic` — synthetic data generation
- `GET /smart/launch`, `GET /smart/callback`, `GET /smart/status` — SMART-on-FHIR

**Test count:** 989/989 passing across 36 files (+34 new tests in `tests/unit/newModules.test.ts`)

## Batch 3 — Live Simulation Engine + Geo Router + Surge Forecast (COMPLETE)

**Modules wired:**
- `server/simulation/liveSimulator.ts` — 1 s tick EventEmitter with rush-hour load model; started on boot in `server/index.ts`
- `server/ws/liveStream.ts` — WebSocket at `/ws/live-simulation` pushed on every tick; started on boot
- `server/simulation/liveSimulatorRoutes.ts` — REST API at `/api/live-sim/status | /start | /stop | /forecast | /geo`
- `server/simulation/surgeForecast.ts` — `forecastSurge`, `forecastWithTrend`, `detectCapacityPressure`, `adjustCapacity`, `scaleWorkers`, `syncLearning`, `buildForecastReport`
- `server/infra/geoRouter.ts` — IP-prefix geo routing, multi-region failover URLs
- `client/src/pages/LiveSimulationPage.tsx` — React dashboard with sparklines at `/live-simulation`

**Test count:** 1019/1019 passing across 37 files (+30 new tests in `tests/unit/liveSimulator.test.ts`)

## Batch 4 — Stress Test + Hospital Pilot + AWS Multi-Region + Clinical Utils + Live Command Center (COMPLETE)

**Modules added:**
- `server/simulation/stressTest.ts` — `runStressTest(n)`: runs n patients (batched 200 at a time), returns `{total, erRate, errors, durationMs, throughputPerSec, p50Ms, p95Ms, p99Ms}`
- `server/integrations/hospitalPilot.ts` — `sendPilotCase()` (POST to `HOSPITAL_PILOT_API`), `receiveOutcome()` (500-entry ring buffer with learning weight), `getOutcomeBuffer()`
- `server/infra/awsRegions.ts` — `REGIONS`, `AURALYN_TASK_DEF` (ECS task def), `routeByLatency()`, `replicateEvent()`, `getRegionHealth()`
- `server/utils/clinicalUtils.ts` — `adjustRiskThreshold()`, `weightOutcome()`, `fastPath()`, `runContinuousSimulation()`, `stopContinuousSimulation()`, `globalAlert()`, `classifyLoad()`
- `client/src/pages/LiveCommandCenter.tsx` — real-time oversight dashboard at `/command-center` (2s poll, severity/alerts/actions, integrated stress test launcher)

**Endpoints:**
- `GET /simulate/stress?n=N` — run stress test for N patients (capped at 50,000)
- `POST /api/pilot/case` — send patient case to hospital pilot API
- `POST /api/pilot/outcome` — receive outcome for learning loop
- `GET /api/pilot/outcomes` — view outcome buffer

**Test count:** 1061/1061 passing across 38 files (+42 new tests in `tests/unit/batch4Systems.test.ts`)

## Batch 5 — Epic FHIR Flow + Pilot Stats + AWS Autoscale + Enterprise Package + Intelligence Utils (COMPLETE)

**Modules added:**
- `server/integrations/epicFullFlow.ts` — `epicFullFlow(patientId, token)`: reads Patient from FHIR, runs triage, writes Observation back; graceful local fallback when `FHIR_BASE` unconfigured
- `server/simulation/pilotStats.ts` — `liveStats` ring buffer, `updateStats()`, `resetStats()`, `aggregateStats()` (p50/p95/p99, min/max, erRate)
- `server/infra/awsAutoscale.ts` — `computeScale()`, `lambdaFallback()`, `chooseRegion()`, `computeScaleStep()`, `getScaleRecommendation()`
- `server/reporting/enterprisePackage.ts` — `buildEnterprisePackage()`, `generateEnterprisePackage()` (writes `enterprise.json`)
- `server/utils/intelligenceUtils.ts` — `tuneThresholds()`, `interruptForCritical()`, `clinicPerformanceMetrics()`, `sendFollowup()`, `broadcastRegionAlert()`
- `client/src/pages/PilotDashboardPage.tsx` — live pilot dashboard at `/pilot-dashboard` (2s polling, p50/p95/p99 latency bars, ER rate, range panel)

**Endpoints:**
- `GET /api/pilot/stats` — aggregated live pilot stats
- `POST /api/pilot/stats/update` — feed a result into the stats buffer
- `POST /api/pilot/stats/reset` — reset buffer
- `POST /api/epic/flow` — Epic FHIR full flow (read patient → triage → write Observation)
- `POST /api/enterprise/package` — generate and return enterprise package JSON
- `POST /api/followup` — patient follow-up scheduling
- `GET /api/autoscale/recommendation?queueDepth=N&currentInstances=N` — AWS scale recommendation

**Test count:** 1096/1096 passing across 39 files (+35 new tests in `tests/unit/batch5Systems.test.ts`)

## Batch 6 — Unified Control API + Global State + Control Bus + Control Stream + Master Control Tower (COMPLETE)

**Modules added:**
- `server/control/systemState.ts` — `getSystemState()` (live-merged from liveSimulator), `patchSystemState()`, `recordReset()`, `recordAlert()`, `setActiveModel()`
- `server/control/controlBus.ts` — `controlBus` (EventEmitter, 100 listener cap), `broadcast(event, data)` — emits named event + universal `update` envelope with timestamp
- `server/control/controlStream.ts` — `startControlStream(server)` — WebSocket server at `/ws/control`, relays all `update` events to connected clients
- `server/control/controlRoutes.ts` — Unified REST router at `/api/control/`: `state`, `simulate`, `stress`, `epic`, `scale`, `export`, `reset`, `model`, `template/repair`, `alert`, `report`
- `server/control/systemControls.ts` — `resetSystem()`, `switchActiveModel()`, `repairTemplate()`, `triggerGlobalAlert()`, `generateReport()` — all broadcast to controlBus
- `client/src/pages/MasterControlTower.tsx` — full control dashboard at `/master-control`: 5 stat cards, action buttons, model switcher, template repair, global alert trigger, live `/ws/control` event stream panel, region status grid

**Wired on boot:**
- `startControlStream(httpServer)` started in `server/index.ts` alongside existing WS servers

**Test count:** 1117/1117 passing across 40 files (+21 new tests in `tests/unit/batch6Control.test.ts`)

## Batch 7 — AI Autopilot + Pilot Workflow + Production Mode + FDA Export (COMPLETE)

**Modules added:**
- `server/autopilot/autopilotAgent.ts` — `runAutopilot()`: reads live system state, decides scale/retraining/simulation actions, enforces safety gate, broadcasts to controlBus. Returns `{actions, mode, level, skippedCount, ts}`
- `server/autopilot/pilotWorkflow.ts` — `pilotWorkflow()` (intake→triage→EMS→pilot case), `dispatchEMS()` (CODE_RED dispatch + 200-entry log), `recordPhysicianOverride()` (500-entry log), `getEMSLog()`, `getOverrideLog()`
- `server/autopilot/productionMode.ts` — `setMode()/getMode()` (staging/canary/production), `enforceProductionSafety()` (throws at >1% mismatch), `isCanary(userId)`, `canaryRolloutFraction()`, `isProductionSafe()`
- `server/autopilot/autopilotUtils.ts` — `autopilotLevel()` (auto/semi-auto/manual), `computeKPIs()` (erRate, avgLatencyMs, safetyScore), `interruptSystem()`, `selfHeal()` (auto-repairs template errors), `syncGlobalState()`
- `server/exec/fdaExport.ts` — `buildFullFDAPackage()` (SaMD Class II, 10k golden cases, 0.95 accuracy), `writeFDAPackage()`, `exportEnterpriseBundle()` (readinessLevel: MVP/PILOT/PRODUCTION)
- `server/autopilot/autopilotRoutes.ts` — Unified router at `/api/autopilot/`

**Endpoints at `/api/autopilot/`:**
- `POST /run` — execute autopilot cycle
- `POST /pilot/workflow` — full intake→triage→EMS→pilot case flow
- `POST /override` — physician disposition override
- `GET /ems/log` — EMS dispatch log
- `GET /overrides` — physician override log
- `POST /mode` / `GET /mode` — deployment mode (staging/canary/production)
- `GET /canary/:userId` — canary bucket check
- `GET /safety/check` — live production safety gate status
- `POST /interrupt` — global system interrupt
- `GET /kpis` — live KPI snapshot
- `POST /sync` — sync global region states
- `POST /fda/export` — write `fda_package.json`
- `GET /fda/bundle` — enterprise readiness bundle

**Test count:** 1165/1165 passing across 41 files (+48 new tests in `tests/unit/batch7Autopilot.test.ts`)

## Batch 8 — Live Pilot + Production Loop + CPT Revenue + National Rollout + Clinic Intelligence (COMPLETE)

**Modules added:**
- `server/pilot/livePilot.ts` — `runLivePilot()` (intake→triage→EMS→hospital, full flow), `ingestHospitalOutcome()` (feeds meta-learning + outcome buffer)
- `server/runtime/productionLoop.ts` — `startProductionLoop()` (5s autopilot+watchdog cycle, no `process.exit`), `stopProductionLoop()`, `watchdog()` (broadcasts CRITICAL alert at >2% mismatch), `getLoopStatus()`, `isLoopRunning()`, `getCycleCount()`
- `server/billing/cptRevenue.ts` — `assignCPT()` (disposition→CPT: 99285/84/83/82/13), `estimateRevenue()` (visit array→total $), `computePLV()` (patient lifetime value @$150/visit), `clinicScore()` (efficiency, erRate, avgRevenue)
- `server/national/rolloutEngine.ts` — `findExpansionTargets()` (pop>500k, load<0.5, no telemed), `deployRegion()` (queues or calls DEPLOY_API), `runNationalExpansion()` (full sequential rollout with broadcast), 500-entry deployment log
- `server/clinical/clinicIntelligence.ts` — `shedLoad()` (load>80→telemed redirect), `recoverSystem()` (logs + broadcasts), `broadcastNational()` (national alert with controlBus)
- `server/batch8Routes.ts` — Unified router for all 5 systems at `/api/*`

**19 new endpoints:**
- `POST /api/pilot/live` — full live patient flow
- `POST /api/pilot/outcome` — ingest hospital outcome feedback
- `POST /api/production/loop/start` / `stop` / `GET status` — production loop control
- `GET /api/production/watchdog` — live safety check
- `POST /api/billing/cpt` / `revenue` / `plv` / `clinic-score` — billing intelligence
- `POST /api/national/expansion/targets` / `run` — rollout targeting and execution
- `POST /api/national/deploy` / `GET /api/national/deployment/log` — per-region deploy
- `POST /api/intel/shed-load` / `recover` / `broadcast` — clinic intelligence

**Test count:** 1213/1213 passing across 42 files (+48 new tests in `tests/unit/batch8.test.ts`)

## Batch 9 — Denial Prediction + AI Patient Chat + Production Flow + IPO Report + System Ops (COMPLETE)

**Modules added:**
- `server/revenue/denialPredictor.ts` — `predictDenial()` (CPT/insurance risk scoring, reasons list), `routeByPayer()` (Medicaid→clinic, Private→telemed, default→self-pay), `batchPredictDenials()`
- `server/patient/chatAgent.ts` — `patientChat()` (lazy OpenAI GPT-4o-mini, medical triage persona), `followupAgent()` (high→call, medium→SMS, low→24h check-in), `careNavigator()` (high→ER, medium→clinic, low→home+telemed)
- `server/exec/ipoReport.ts` — `buildIPOReport()` (platform summary, 66-layer architecture, 5 moat items, FDA 510(k) pathway, $revenue, regions, agents)
- `server/ops/systemOps.ts` — `systemHealth()` (green/yellow/red, issues list), `troubleshoot()` (FHIR/selector/Redis/timeout/ML/generic routing), `maintenanceTasks()` (6-item deterministic task list)
- `server/revenue/productionFlow.ts` — `productionPatientFlow()` (triage→CPT assignment→denial prediction→claim submit→hospital send, full integrated flow)

**Frontend:**
- `client/src/pages/PatientAIChat.tsx` — AI triage chat page at `/patient-ai-chat` with: OpenAI-powered conversation, emergency keyword banner (chest pain / stroke / 911 etc.), real-time typing indicator, keyboard shortcut (Enter to send), disclaimer footer, full dark mode support

**15 new endpoints:**
- `POST /api/revenue/denial/predict` / `batch` — claim denial risk scoring
- `POST /api/revenue/payer/route` — payer-aware patient routing
- `POST /api/patient/chat` — AI triage chat (GPT-4o-mini)
- `POST /api/patient/followup` / `navigate` — follow-up and care navigation
- `POST /api/production/patient-flow` — full production pipeline
- `POST /api/exec/ipo-report` / `GET` — IPO architecture summary
- `GET /api/ops/health` — live system health (green/yellow/red)
- `POST /api/ops/troubleshoot` — error→action mapping
- `GET /api/ops/maintenance-tasks` — maintenance task list

**Test count:** 1260/1260 passing across 43 files (+47 new tests in `tests/unit/batch9.test.ts`)

## Batch 10 — Pilot Orchestrator + Eligibility Engine + Chat-Triage Bridge + Deck Builder + System Monitor (COMPLETE)

**Modules added:**
- `server/pilot/pilotOrchestrator.ts` — `runPilot()`: full pipeline: triage → FHIR/Epic write → denial prediction → CPT fallback on high denial risk (99285→99284) → claim submission. Returns disposition, CPT, denialRisk, claimId, fhirPushed
- `server/revenue/eligibility.ts` — `checkEligibility()` (PAYER_API call, degrades gracefully in sandbox), `scrubClaim()` (validates insurance/CPT/patientId, auto-corrects overcoding), `revenueKPIs()` (total, denialRate, estimatedRevenue, approvedCount)
- `server/patient/chatTriageBridge.ts` — `patientChatTriage()` (GPT-4o-mini + live triage pipeline combined: returns LLM reply + clinical disposition), `scheduleFollowup()` (per-patient timeout map, replaces on re-schedule), `cancelFollowup()`, `getPendingFollowups()`
- `server/exec/deckBuilder.ts` — `buildDeckMarkdown()` (rich Markdown deck: scale, safety, accuracy, revenue, moat, tech, next steps), `buildDeck()` (writes deck.md to disk)
- `server/ops/systemMonitor.ts` — `saveConversation()`/`getConversation()`/`clearConversation()` (200-msg ring buffer per user), `heartbeat()` (uptime, heapUsedMb, heapTotalMb, rss), `maintenanceLoop()` (idempotent 1hr broadcast cycle), `triageBudget()` (vitals→acuity level 1-6), `optimalFacility()` (distance+load sort, non-mutating)

**18 new endpoints:**
- `POST /api/pilot/orchestrate` — full FHIR + billing + denial-guarded pilot run
- `GET /api/revenue/eligibility/:patientId` — payer eligibility check
- `POST /api/revenue/scrub` / `kpis` — claim scrubbing + revenue KPIs
- `POST /api/patient/chat-triage` — GPT + clinical triage combined response
- `POST /api/patient/followup/schedule` / `DELETE /:patientId` / `GET /pending` — follow-up scheduler
- `POST /api/exec/deck` / `GET` — markdown deck generation
- `GET /api/ops/heartbeat` — process health snapshot
- `POST /api/ops/conversation` / `GET /:userId` / `DELETE /:userId` — conversation memory
- `POST /api/ops/maintenance/start` / `stop` — maintenance loop control
- `POST /api/ops/triage-budget` / `optimal-facility` — adaptive triage + routing

**Test count:** 1312/1312 passing across 44 files (+52 new tests in `tests/unit/batch10.test.ts`)

## Batch 11 — Epic Sandbox + Payer Contract + Slide Builder + Dynamic Intake + Case Speed Panel (COMPLETE)

**Modules added:**
- `server/integrations/epicSandbox.ts` — `epicTestPatientFlow(fhirToken)`: creates test FHIR patient → runs triage → posts Observation. Degrades gracefully when `FHIR_BASE` not configured (returns sandbox-prefixed patient ID + real triage result)
- `server/revenue/payerContract.ts` — `simulatePayerContract(claim)`: base CPT rates + time modifier (+10% if >60min) + complexity modifier (+20% if high) + denial risk penalty (×0.6 if >0.5). `batchSimulateContracts()`, `sendPush()` (push notification stub)
- `server/exec/slideBuilder.ts` — `buildSlides(metrics)`: 8-slide structured JSON deck (Vision, Scale, Safety, Accuracy, Revenue, Moat, Technology, Next Steps). `slidesToMarkdown()` renders with `---` separators
- `server/clinical/intakeDynamic.ts` — `nextSecondaryQuestion(context)`: progressive question engine (age → fever → duration → null when complete). `collectModifiers()`: normalizes meds/allergies/PMH. `fastTrack()`: short-circuits to ROUTINE for minor complaints with normal vitals
- `server/clinical/caseSpeedPanel.ts` — `buildPhysicianSummary(caseData)`: extracts complaint/topDx/risk/disposition in one call (reduces physician cognitive load). `dispositionFollowup()`: 5-tier follow-up schedule (immediate call → 2hr → 4hr → next-day → 24hr)

**12 new endpoints:**
- `POST /api/epic/sandbox/test-flow` — FHIR create patient + triage + observation write
- `POST /api/revenue/payer-contract/simulate` / `batch` — payer reimbursement model
- `POST /api/patient/push` — push notification dispatch
- `POST /api/exec/slides` / `slides/markdown` — investor/FDA slide generation
- `POST /api/intake/next-question` / `collect-modifiers` / `fast-track` — dynamic intake engine
- `POST /api/clinical/physician-summary` / `disposition-followup` — case speed panel

**Test count:** 1363/1363 passing across 45 files (+51 new tests in `tests/unit/batch11.test.ts`)

## Batch 12 — Fast Triage UX + Live Clinic + Payer Contracts + Workflow Engine + Multi-Region + Autonomy + Alerts + Connector Hub + Triage Utils (COMPLETE)

**Backend modules (10 files):**
- `server/patient/fastTriage.ts` — `fastTriageFlow()`: 3-path progressive engine (fast-track ROUTINE → progressive question → full pipeline). Sub-10s design with early exit for eligible patients
- `server/pilot/liveClinic.ts` — `liveClinic()`: full real patient loop. Auto-dispatches EMS for ER_NOW, schedules 60-min follow-up, returns emsDispatched flag
- `server/revenue/contracts.ts` — `payerContract()`: payer-specific multipliers (Aetna×1.0, BlueCross×0.95, Cigna×0.9, United×0.85, Medicare×0.8, Medicaid×0.6). Combines with CPT base rates
- `server/workflows/registry.ts` — Step registry (registerStep, listSteps, getStep, clearSteps)
- `server/workflows/runner.ts` — `runStepWorkflow(def, input)`: chains arbitrary registered steps, fails fast on missing steps
- `server/infra/gateway.ts` — Multi-region gateway (us-east/us-west/eu): IP-based routing + failover. `desiredWorkers()` autoscale calculator (2–20 workers based on queue depth)
- `server/autonomy/autonomyController.ts` — `autonomyLevel()`: 4-level safety-gated controller (manual/assist/semi/auto). `executeAutonomy()`: enforces safe-action allowlist in assist mode
- `server/monitoring/alerts.ts` — `sendSlackAlert()`, `sendWhatsAppAlert()`, `evaluateAlerts()`: Prometheus threshold evaluation with graceful fallback when webhooks unconfigured
- `server/integrations/connectorHub.ts` — Connector registry: registerConnector, listConnectors, callConnector, checkIntegrations (health-checks all registered connectors)
- `server/clinical/triageUtils.ts` — Bundled utilities: requireModifiers, quickView, autoRepairTemplate, adaptiveQuestions, approveDisposition, autoEscalate, trackInteraction, integrationStatus

**Frontend (5 files):**
- `client/src/components/PhysicianCopilot.tsx` — AI Co-Pilot card: complaint, top Dx, risk (color-coded), disposition, override buttons (ER/Routine) with onOverride callback
- `client/src/dashboard/PanelRegistry.ts` — Dynamic panel registry (registerPanel, unregisterPanel, listPanels) — add panels without editing main dashboard
- `client/src/pages/WorkflowBuilder.tsx` — Visual workflow builder: add/remove/reorder steps, POST to /api/workflows/run, displays JSON result
- `client/src/pages/WorkflowCanvas.tsx` — ReactFlow node-based canvas: drag/connect/save workflows to /api/workflows/save
- `client/src/pages/SmartLaunch.tsx` — Epic SMART on FHIR launch page (routes to /api/smart/launch with ISS parameter)

**Routes:** /workflow-builder, /workflow-canvas, /smart-launch registered in App.tsx

**Test count:** 1430/1430 passing across 46 files (+67 new tests in `tests/unit/batch12.test.ts`)

## Batch 13 — Branching Workflows + Clinic Queue + High Autonomy + Followup Utils + SMART Callback (COMPLETE)

**Backend modules (4 files):**
- `server/workflows/branchRunner.ts` — `runBranchWorkflow(nodes, startId, input)`: conditional workflow engine. Each node can declare `if: { field, equals, then, else }` — value match routes to `then` node, mismatch routes to `else`, missing else terminates cleanly. Chains straight-line via `next` field. Fully async step execution
- `server/patient/clinicQueue.ts` — In-memory priority queue: `addPatient()` (auto-timestamps), `nextPatient()` (FIFO by ts, destructive), `peekQueue()` (non-destructive sorted view), `queueLength()`, `clearQueue()`
- `server/autonomy/highAutonomy.ts` — `runHighAutonomy(state)`: policy-driven planner — ML drift → retrain, queue >50 → scale_workers, otherwise validate_templates. Respects `autonomyLevel()` safety gates (manual=execute nothing, assist=validate_templates only, semi/auto=all)
- `server/clinical/followupUtils.ts` — `secondaryToModifiers()`: maps secondary question answers to clinical modifiers (e.g., smoker → riskFactors). `smartFollowup()`: content-aware follow-up (fever→6h temp check, chest_pain→call if worsening). `dashboardInsights()`: auto-generates insight alerts from latency/ER rate/mismatch/queue metrics. `safeExternalCall()`: wraps external calls with graceful fallback — on failure, enqueues to non-critical queue and returns `{queued:true}`. `enqueueNonCritical()` + `drainNonCriticalQueue()`

**Frontend (2 files):**
- `client/src/pages/SmartCallback.tsx` — SMART OAuth callback page: extracts `?code=` from URL, POSTs to `/api/smart/callback`, shows 3-state UI (connecting/success/error) with retry link
- `client/src/pages/WorkflowCanvas.tsx` — Updated: added "+ Condition" button that injects a conditional `IF risk == high` node (amber-styled), plus "+ Fast Triage" and "+ Bill" step node buttons. All new nodes auto-position below existing graph

**Route added:** `/smart-callback` registered in App.tsx

**Test count:** 1469/1469 passing across 47 files (+39 new tests in `tests/unit/batch13.test.ts`)

## Batch 14 — Graph Utils + Alert Rules Engine + QA Suite + Golden Runner + Telegram + Multi-Channel Broadcast (COMPLETE)

**Backend modules (4 files + 1 update):**
- `server/workflows/graphUtils.ts` — `edgesToGraph(nodes, edges)`: converts ReactFlow node/edge arrays into an adjacency list (WorkflowGraph). `graphToExecutionOrder(graph, startId)`: BFS traversal producing ordered execution sequence. Ignores edges with unknown sources. Exposed at `POST /api/workflows/graph`
- `server/monitoring/alertRules.ts` — Dynamic rule engine: `addRule()` (assigns unique id + timestamp), `getAlertRules()`, `removeRule(id)`, `clearRules()`. `evalRules(metrics)`: evaluates all registered expressions using safe `Function()` constructor against live metrics, fires Slack/WhatsApp/both per target, skips invalid expressions without crashing. Exposed at `POST/GET/DELETE /api/alerts/rules` and `POST /api/alerts/rules/eval`
- `server/clinical/qaUtils.ts` — `minimizeQuestions(qs)`: caps question list to top 3 to reduce patient friction. `debugFailure(err)`: pattern-matches error strings to actionable suggestions (FHIR→check token, selector→heal, network→retry, timeout→increase). `trend(data[])`: last-minus-first for dashboard sparkline direction. `captureTrace(traceId, step, data)`: JSON-structured trace logging for replay analysis. `runGoldenBatch(cases, runPipeline)`: async batch golden case runner with injected pipeline function, returns `{expected, actual, match}[]`. Exposed at `/api/qa/*`
- `server/monitoring/alerts.ts` — Added `sendTelegramAlert(msg)` (graceful fallback when TG_TOKEN/TG_CHAT absent). Added `broadcastMultiChannel(msg)`: fires Slack + WhatsApp + Telegram in parallel with `Promise.all`. Exposed at `POST /api/monitoring/broadcast` and `/api/monitoring/telegram`

**Frontend (2 new pages + 1 update):**
- `client/src/pages/AlertRules.tsx` — Full alert rule management UI: expression editor (monospace input), target selector (Slack/WhatsApp/Both), save/remove/evaluate now. Live rule list with timestamps. Routes: `/alert-rules`
- `client/src/pages/WorkflowCanvasFull.tsx` — Full canvas variant: ReactFlow with edge-to-graph export button. Sends current nodes+edges to `/api/workflows/graph` and renders the adjacency list inline as a JSON overlay. Routes: `/workflow-canvas-full`

**Routes added:** `/workflow-canvas-full`, `/alert-rules` in App.tsx

**Test count:** 1508/1508 passing across 48 files (+39 new tests in `tests/unit/batch14.test.ts`)

## Batch 15 — Visual IF/ELSE Node + Multi-Tenant + ECW + SLO/On-Call + Epic UI + Physician Copilot (COMPLETE)

**Backend modules (4 new files):**
- `server/tenancy/tenant.ts` — `getTenant(req)`: reads `x-tenant-id` header, falls back to `"default"`. `scopedQuery(tenant, table)`: generates SQL with tenant filter, strips dangerous chars from table name (no injection). `buildTenantMetrics(tenant, overrides)`: typed metric builder. `listTenants()`: returns known clinic roster. Routes: `GET /api/tenants`, `GET /api/tenants/stats?tenant=`
- `server/integrations/ecwAdapter.ts` — `sendToECWEncounter(data)`: real REST POST to ECW_API with Bearer auth; graceful `{success:false}` when env vars absent. `safeEHR(fn, data)`: returns `"ok"` or `"queued"` — on failure queues a 1-second retry via setTimeout. `syncSystems(data)`: fires ECW encounter + Epic FHIR Observation in parallel, returns `{ecw, epic}` status pair. Routes: `POST /api/ecw/encounter`, `POST /api/ecw/sync`
- `server/clinical/sloUtils.ts` — `computeSLO(metrics)`: `{availability: 0.999|0.99, latency: bool}`. `onCallAlert(msg)`: broadcasts Slack+WhatsApp simultaneously. `checkSLOAndAlert(metrics)`: computes SLO, fires `onCallAlert` for any violation. `anomalyCard(data)`: returns `"High ER spike"` when erRate > 0.3, else null. `rankQuestions(qs, weights)`: ML-weighted sort, immutable (doesn't mutate input). Routes: `POST /api/slo/compute`, `POST /api/slo/oncall`, `POST /api/monitoring/anomaly`
- `server/batch15Routes.ts` — wires all tenant, ECW, SLO, anomaly, Epic test, and rank-questions endpoints

**Frontend (4 new pages + 2 updated):**
- `client/src/components/ConditionNode.tsx` — Fully interactive IF/ELSE ReactFlow node: editable "field" + "equals" inputs, dual source handles for THEN (left) and ELSE (right), amber-yellow styling, `memo` for perf. Fires `data.onChange` on every edit
- `client/src/pages/WorkflowCanvas.tsx` (updated) — Registers `conditionNode` type via `nodeTypes` prop. "Add Condition" button now spawns a live `ConditionNode` instead of a static label node. onChange updates the node's data in-place in the node state
- `client/src/pages/EpicTest.tsx` — Triggers `POST /api/epic/test` against the Epic sandbox, displays full JSON result. Routes: `/epic-test`
- `client/src/pages/MultiTenantDashboard.tsx` — Tenant selector (clinicA/B/C/default), live stats cards (patient count, avg latency, ER rate, SLO availability). Anomaly banner fires when erRate > 0.3. Auto-refreshes every 30s. Routes: `/multi-tenant`
- `client/src/pages/PhysicianCopilot.tsx` — 2-second decision mode: type chief complaint, press Enter or "Triage →", get instant `QuickDecision` display (color-coded: red=ER_NOW, orange=URGENT, green=ROUTINE, blue=MONITORING). Calls `/api/triage/fast`. Routes: `/physician-copilot`

**Routes added:** `/epic-test`, `/multi-tenant`, `/physician-copilot` in App.tsx

**Test count:** 1536/1536 passing across 49 files (+28 new tests in `tests/unit/batch15.test.ts`)

## Batch 16 — AI Workflow Gen + EHR Unified + Full Revenue + SLO Burn + Question Graph + Retry Queue + RBAC + Patient Memory + Repair Loop + Integration Hub (COMPLETE)

**Backend modules (10 new files):**
- `server/workflows/autoBuilder.ts` — `generateWorkflow(prompt)`: lazy-init OpenAI, prompts GPT-4o-mini to return `{nodes, edges}` JSON for a clinical workflow; strips markdown code fences; falls back to a 3-node default graph on any parse/API error. Exposed at `POST /api/workflows/auto`
- `server/integrations/ehrUnified.ts` — `writeEHRAll(data)`: fires Epic FHIR Observation + ECW encounter in `Promise.allSettled`, returns `{epic, ecw}` status strings. Graceful no-op when env vars absent. Exposed at `POST /api/pilot/live`
- `server/revenue/fullRevenue.ts` — `processRevenue(patient, disposition)`: full pipeline — CPT assignment → claim scrub → denial prediction → CPT upgrade to 99284 on high-risk → payer contract reimbursement calc. Returns `{claim, denial, revenue}`. Exposed at `POST /api/revenue/full`
- `server/clinical/observabilityUtils.ts` — `sloBurn(errors, total)`: returns `"burning"` or `"stable"` against 1% threshold. `evaluateSystem(state)`: scans latency + safety mismatch rate and returns alerts string[]. `routeOnCall(alerts)`: broadcasts each alert to Slack + WhatsApp in parallel. Exposed at `POST /api/slo/burn` + `POST /api/slo/evaluate`
- `server/clinical/questionGraph.ts` — `dynamicQuestionGraph(ctx)`: returns context-aware follow-up questions per complaint (chest_pain, fever, SOB, abdominal pain, headache). `physicianMacro(action)`: maps ER/Urgent/Routine to pre-built action bundles (notify, dispatchEMS, scheduleFollowup). Exposed at `GET /api/questions/graph` + `POST /api/physician/macro`
- `server/clinical/retryQueue.ts` — `enqueueRetry(job)`: adds job with priority + maxAttempts. `processRetry()`: sorts by priority descending, runs each job, removes on success/exhaustion, returns `{processed, failed}`. `getQueue()` + `clearQueue()`. Exposed at `GET/POST/DELETE /api/retry/*`
- `server/tenancy/roles.ts` — `can(role, action)`: RBAC permission check. `auth(actionRequired)`: Express middleware that reads `x-role` header and returns 403 on failure. `listRoles()` + `listPermissions(role)`. Exposed at `GET /api/roles`, `POST /api/roles/check`, `GET /api/roles/:role/permissions`
- `server/clinical/patientMemory.ts` — `updateMemory(id, visit)`: appends timestamped visit to in-memory patient history. `getMemory(id)`: returns full visit history. `clearMemory(id?)`: clears one patient or all. `memoryStats()`: returns totalPatients + totalVisits. Exposed at `POST/GET /api/patient/memory/:id`, `GET /api/patient/memory-stats`
- `server/clinical/repairLoop.ts` — `repairLoop(errors[])`: pattern-matches errors → selector/timeout/FHIR repairs, returns `{repaired, skipped}`. `performanceScore(metrics)`: weighted composite — `(1-errorRate)×0.4 + speedScore×0.3 + (1-denialRate)×0.3`, clamped to [0,1]. Exposed at `POST /api/system/repair` + `POST /api/system/performance-score`
- `server/integrations/integrationHub.ts` — `addIntegration(name, fn)`, `runIntegration(name, payload)`, `listIntegrations()`, `removeIntegration(name)`. `connectorHealth(connectors[])`: calls each connector's `ping()`, returns `{name: "ok"|"fail"}` map. Exposed at `GET /api/integrations`, `POST /api/connectors/health`

**Frontend (3 new/updated):**
- `client/src/components/IfBlockEditor.tsx` — Sidebar condition editor: controlled `field` + `equals` inputs, Save button fires `update()` callback, close button, live preview label "IF field == value". Renders as floating panel in WorkflowCanvasFull when a conditionNode is clicked
- `client/src/pages/AdminPanel.tsx` — Multi-tenant RBAC admin console: role switcher (admin/physician/staff), permission badge display, action buttons gated by `can()`, broadcast alert button, tenant list from API. Routes: `/admin-panel`
- `client/src/pages/WorkflowCanvasFull.tsx` (updated) — AI auto-build toolbar: prompt input + "✨ Generate" button → calls `/api/workflows/auto`, loads returned nodes/edges onto canvas. Click on any conditionNode → opens IfBlockEditor overlay panel. Both ConditionNode and IfBlockEditor registered

**Routes added:** `/admin-panel` in App.tsx

**Test count:** 1593/1593 passing across 50 files (+57 new tests in `tests/unit/batch16.test.ts`)

## Batch 17 — Live Clinic Loop + Payer API + National Rollout + Marketplace + UI Automation + EHR Sync (COMPLETE)

**Backend modules (6 new files):**
- `server/pilot/realClinicLoop.ts` — `startClinicLoop(intervalMs)`: setInterval-driven production loop pulling from patient queue every 2s, running `runLivePilot()` per patient, tracking processed/error counts. `stopClinicLoop()`: clean clearInterval. `enqueuePatient(patient)`: adds to FIFO queue. `getNextPatient()`: pops head. `getClinicLoopStatus()`: live `{running, queueLength, processed, errors}`. Exposed at `POST /api/clinic-loop/start|stop|enqueue`, `GET /api/clinic-loop/status`
- `server/revenue/payerAPI.ts` — `submitRealClaim(claim)`: REST POST to REAL_PAYER_API with Bearer auth; returns `{status:"skipped"}` when unconfigured. `estimateReimbursement(cpt, insurance)`: CPT base rate × payer multiplier lookup (Aetna×1.0 → Medicaid×0.6) for pre-submission revenue forecasting. Exposed at `POST /api/revenue/payer/submit|estimate`
- `server/national/expansionEngine.ts` — `nationalRollout(regions[])`: iterates regions, deploys when `load < 0.5 && population > 500_000` via existing `deployRegion()`, returns `{deployed[], skipped[]}`. `scoreExpansionTarget(region)`: capacity × 0.6 + size × 0.4 composite score for prioritization. Exposed at `POST /api/national/rollout|score`
- `server/marketplace/matcher.ts` — `matchPatient(patient, providers[])`: filters by specialty + available, sorts by distance, returns closest match or null. `rankProviders(patient, providers[])`: weighted sort by distance (70%) + rating (30%). `filterByInsurance(providers[], insurance)`: insurance network filter. Exposed at `POST /api/marketplace/match|rank`
- `server/automation/uiEngine.ts` — `findElement(page, label)`: 4-strategy multi-fallback element finder (text, placeholder, aria-label, label+input). `runUIAutomation(template)`: lazy Playwright launch (graceful `{ok:false}` when playwright unavailable). `runParallel(templates[])`: `Promise.all` parallel execution. `healAndRetry(template)`: re-runs after stripping empty steps on failure. `trackAutomation(result)`: `{success, time}` tracker. `detectForm(page)`: extracts all input name/placeholder pairs. `syncEHRs(data)`: parallel ECW + Epic write with status pair response. Exposed at `POST /api/ui/run|run-parallel|heal-retry|sync-ehrs`
- `server/batch17Routes.ts` — all 12 routes wired

**Frontend (1 new page):**
- `client/src/pages/UIAutomationPanel.tsx` — Three-panel control tower: UI Automation (run/result display), Live Clinic Loop (start/stop/live stats grid), Cross-EHR Sync (trigger + ECW/Epic status). Routes: `/ui-automation`

**Routes added:** `/ui-automation` in App.tsx

**Test count:** 1623/1623 passing across 51 files (+30 new tests in `tests/unit/batch17.test.ts`)

## Batch 18 — Vision Agent + ECW Pilot Hardening + Revenue Optimizer + Central Orchestrator + Control Tower (COMPLETE)

**Backend modules (6 new files):**
- `server/automation/visionAgent.ts` — `findByVision(screenshot, goal)`: lazy GPT-4o-mini image analysis returning pixel coordinates; graceful null on failure. `clickAt(page, x, y)`: Playwright mouse click at coordinates. `smartClick(page, label)`: 4-strategy selector first → vision fallback → throws on total failure. `rememberSelector/recallSelector/clearSelectorMemory`: persistent selector learning memory. `rememberUI/recallUI`: screen-level mapping memory. `diagnoseUIError(err)`: categorizes timeout/selector/FHIR/network errors. `buildHeatmap(events[])`: filters + maps click coordinates. `fallbackChain(data)`: ECW → Epic → "failed" waterfall routing
- `server/automation/visionLoop.ts` — `runVisionAgent(page, goal, maxAttempts=5)`: screenshot→findByVision→clickAt loop with 500ms wait between attempts, returns `{success, attempts}`. `actOnUI(page, goal)`: tries vision loop first, falls back to smartClick, returns `{method}` discriminant
- `server/automation/ecwPilot.ts` — `safeECWAutomation(template)`: try/catch wrapper around runUIAutomation with Slack alert on failure. `dualWriteEHR(data)`: Promise.allSettled ECW API + UI write, returns `{api, ui}` status pair. `ecwPilot(patient, template)`: full ECW workflow — triage → safeECWAutomation → result object
- `server/revenue/revenueOptimizer.ts` — `optimizeRevenue(claim)`: Private+URGENT → CPT 99285 upgrade (immutable). `analyzeRevenue(claims[])`: sum reducer. `enterpriseOptimize(claim)`: three-strategy chain (Private/medium/ER_NOW → best CPT). `learnFromDenials(claims[])`: denied CPT frequency map. `prioritizedWrites(tasks[])`: priority-sorted Promise.all for write batching
- `server/clinical/orchestrator.ts` — `orchestrate(patient)`: full production pipeline (runFinalPipeline → processRevenue → writeEHRAll → safeExternalCall hospital alert). `systemScore(metrics)`: composite `(1-errorRate)×0.4 + (1-latency/3000)×0.3 + (1-denialRate)×0.3` clamped to [0,1]. `routeConnector(type, payload)`: universal dispatcher to slack/telegram/broadcast/ecw with noop fallback. `cacheAction/getCachedAction/clearActionCache`: in-process action cache for physician-speed replays
- `server/batch18Routes.ts` — all 14 routes wired

**Frontend (1 new page):**
- `client/src/pages/ControlTower.tsx` — Unified command center: Live Clinic Loop stats (auto-refresh every 5s), System Health Score gauge with live metric inputs, Connector Router (select type + message → route), Central Orchestrator one-click demo run, navigation links to all system panels. Routes: `/control-tower`

**Routes added:** `/control-tower` in App.tsx

**Test count:** 1667/1667 passing across 52 files (+44 new tests in `tests/unit/batch18.test.ts`)

## Batch 19 — Unified System Bus + Module State Reporters + Live Real System + Live Billing + Region Cluster + Master Control Dashboard (COMPLETE)

**Backend modules (6 new files):**
- `server/control/systemBus.ts` — `systemBus` (alias of `controlBus`), `publish(event, data)`, `subscribe(event, handler)`, `unsubscribe(event, handler)`, `publishUpdate(data)` for broadcasting real-time state changes to all WebSocket subscribers
- `server/control/modulesState.ts` — Per-module state reporters: `clinicalState()` (activeCases, safetyMismatch from live simulation snapshot), `automationState()` (templates, failures, lastRun), `revenueState()` (dailyRevenue, denialRate), `visionState()` (successRate, fallbackRate), `integrationState()` (epic/ecw/chatgpt/whatsapp checks via env vars). `getUnifiedState()` composes all four. Utilities: `healthScore(state)` composite `(1-safetyMismatch)×0.4 + (1-denialRate)×0.3 + successRate×0.3`. `smartSecondary(ctx)` question engine (duration → severity → null chain). `instantSummary(data)` physician format. `autoRecover(state)` ECW/Epic restart advisor. `runTask(type, data)` universal dispatcher (triage/revenue/automation). `nextStep(patient)` navigator. `globalTrend(data[])` complaint frequency map. `systemInsight(state)` latency/safety diagnostic
- `server/control/regionCluster.ts` — `routeGlobal(body)`: tries REGION_EAST → REGION_WEST → REGION_EU env-configured URLs, returns first successful `{region, data}`, throws if all fail. `autoScale(queueDepth)`: returns 20/>200, 10/>100, 3/else. `getConfiguredRegions()`: lists which regions have env vars set
- `server/pilot/liveRealSystem.ts` — `runLiveSystem(patient)`: full production pipeline — `runFinalPipeline` → parallel `writeEHRAll` → `processRevenue` → `publishUpdate` on system bus → returns `{disposition, revenue, ehr}`
- `server/revenue/liveBilling.ts` — `submitLiveClaim(claim)`: POST to `PAYER_API` with Bearer auth; graceful `{status:"skipped"}` when unconfigured. `optimizeClaim(claim)`: Private+URGENT → 99285, Medicaid → 99284 (immutable)
- `server/batch19Routes.ts` — 18 routes wired. `initBatch19(httpServer)` starts WebSocket `startControlStream` and logs confirmation

**Frontend (1 new page):**
- `client/src/pages/MasterControl.tsx` — Full unified command center: Clinical panel (activeCases + safety%), Automation panel (templates + failures), Revenue panel (dailyRevenue + denial rate), Vision Agent panel (success/fallback rates), Integrations grid (Epic/ECW/ChatGPT/WhatsApp status dots), Control Action buttons (Simulation/Stress/Repair/DeployRegion/PublishUpdate), Panel Navigation grid. All data auto-refreshes every 3s via `useQuery`. System health score badge in header. Routes: `/master-control`

**Key routes added (18 new):** `/api/control/state/unified`, `/api/control/modules/{clinical,automation,revenue,vision,integration}`, `/api/control/action`, `/api/control/health-score`, `/api/control/insight`, `/api/control/recover`, `/api/task/run`, `/api/navigator/next-step`, `/api/trends/global`, `/api/clinical/smart-secondary`, `/api/clinical/instant-summary`, `/api/live/run`, `/api/revenue/billing/submit|optimize`, `/api/region/route|scale|configured`

**Routes added:** `/master-control` in App.tsx

**Test count:** 1711/1711 passing across 53 files (+44 new tests in `tests/unit/batch19.test.ts`)

## Batch 20 — Live Adapters + National Network Controller + Marketplace Engine + Workflow Optimizer + Advanced Utils (COMPLETE)

**Backend modules (6 new files):**
- `server/integrations/liveAdapters.ts` — `safeFetch<T>(url, init)`: generic typed fetch wrapper that catches network errors and JSON parse failures, returning `{ok:true,data}|{ok:false,error}`. `connectHospital(patient)`: POST to `HOSPITAL_API` with `HOSPITAL_TOKEN` auth; graceful `{ok:false}` when unconfigured. `connectPayer(claim)`: POST to `PAYER_API` with `PAYER_TOKEN`; falls back to `REAL_PAYER_API`. `safeExternalWrite(fn, onFail)`: wraps any write in a try/onFail callback pattern — never blocks care
- `server/national/networkController.ts` — `pickBestRegion(regions[])`: filters healthy regions, sorts by composite `load + latencyMs/1000` score, returns lowest. `rebalance(regions[])`: identifies hot (load>0.8) and cold (load<0.5) regions, returns `{from,to,action:"shift_traffic"}[]` rebalance plan. `networkHealth(regions[])`: summary `{healthy, degraded, avgLoad}` across all regions
- `server/marketplace/engine.ts` — `matchProvider(patient, providers[])`: SLA-aware matching with composite score `distanceKm×0.4 + load×0.4 + slaMs/1000×0.2`; returns best match or null. `bookProvider(providerId, patientId)`: POST to `BOOKING_API`; graceful skip when unconfigured. `rankProvidersSLA(patient, providers[])`: same composite sort, returns full sorted list
- `server/optimization/optimizer.ts` — `optimizeWorkflow(visits[])`: computes `{profit, margin, avgLatency}` from visit cost/revenue/latency arrays. `applyOptimization(metrics)`: recommends `reduce_cost_path` (margin<0.2), `enable_fast_path` (latency>1500ms), `review_pricing` (profit<0). `projectRevenue(visits[], multiplier)`: revenue projection with multiplier
- `server/utils/advancedUtils.ts` — `nextBestQuestion(dx[], qs[])`: information-gain question selection (argmax of sum p×weight across diagnoses). `oneGlance(c)`: physician one-glance card `complaint | differential | disposition`. `retry<T>(fn, tries=3)`: exponential backoff + random jitter (200×2^i + rand(100)ms). `zAnomaly(series[], threshold=3)`: Z-score outlier detection on last series value. `zScore(series[])`: raw Z-score computation. `universalWrite(data)`: 3-tier fallback chain — ECW API → UI automation → Playwright vision → "failed"
- `server/batch20Routes.ts` — 14 routes wired

**Routes added (14 new):** `/api/integrations/hospital|payer|safe-write|universal-write`, `/api/network/best|rebalance|health`, `/api/marketplace/engine/match|rank|book`, `/api/optimization/analyze|project`, `/api/clinical/next-best-question|one-glance`, `/api/analytics/z-anomaly`

**Test count:** 1758/1758 passing across 54 files (+47 new tests in `tests/unit/batch20.test.ts`)

## Batch 21 — Deep Agent Python Sidecar + TypeScript Bridge + Dashboard (COMPLETE)

**Python sidecar service** (`deep-agent-service/`):
- `requirements.txt` — fastapi 0.115.8, uvicorn, pydantic 2.11.3, deepagents, langchain, langgraph, langchain-openai, httpx
- `app/models.py` — `DeepAgentRunRequest`, `DeepAgentRunResponse`, `HealthResponse`, `MessageIn`, `AgentTaskType` Pydantic models
- `app/config.py` — `MODEL`, `MEMORY_DIR`, `WORK_DIR` from env with auto-mkdir
- `app/tools.py` — `write_json_artifact`, `summarize_system_context` (3000-char per-key truncation), `emit_patch_manifest`
- `app/prompts.py` — 6 specialized system prompts: `general`, `research`, `kb_audit`, `code_review`, `workflow_upgrade`, `article_compare`
- `app/agent_factory.py` — `build_backend(session_id)` CompositeBackend with per-session `/workspace/` + shared `/memories/`. `build_subagents()` returns 6 subagents: kb-specialist, code-specialist, safety-specialist, observability-specialist, ehr-automation-specialist, governance-specialist. `create_agent(task_type, session_id)` factory
- `app/service.py` — `run_deep_agent(req)`: writes attachments + context to session workspace, invokes agent, collects artifacts from `/workspace/output/`, parses first JSON artifact as `structured_output`
- `app/main.py` — FastAPI with CORS, `GET /health`, `POST /run`
- `Dockerfile` — python:3.11-slim, port 8081
- `docker-compose.deepagents.yml` — service definition with volume mount

**TypeScript bridge** (`server/services/`):
- `deepAgentClient.ts` — `runDeepAgent(payload)`: typed fetch to `DEEP_AGENT_URL/run` with 120s timeout. `safeRunDeepAgent(payload)`: wraps `runDeepAgent` in try/catch returning `{ok:false,raw:{error}}` — never throws. `checkDeepAgentHealth()`: GET `/health` with 5s timeout
- `deepAgentUpgradeOrchestrator.ts` — `runUploadedArticleUpgrade(input)`: full 7-task KB audit with 4 file attachments + HIPAA platform context. `runKbAuditFromSource(opts)`: targeted KB audit from raw source text. `parseUpgradeOutput(res)`: extracts `{summary,kb_changes,workflow_changes,api_changes,dashboard_changes,safety_notes,rollout_plan}` from `structured_output` with empty-array fallbacks

**Express routes** (`server/routes/deepAgentRoutes.ts`) — 8 routes:
- `GET /health` — proxies to Python sidecar health; returns `{ok:false,error}` when unreachable
- `POST /run` — generic agent run with session_id + user_prompt validation
- `POST /article-compare` — sessionId/articleText/currentModuleName body
- `POST /kb-audit` — sourceText/kbSnapshot/complaintFlows/rulesContext
- `POST /code-review` — files[]/moduleName/architectureContext
- `POST /workflow-upgrade` — description/currentWorkflow/targetOutcome
- `POST /upgrade-from-article` — full upgrade orchestrator; returns `result + parsed` sections
- `POST /research` — topic/context/attachments

**Frontend** (`client/src/pages/DeepAgentDashboard.tsx`) at `/deep-agent`:
- Task selector: general / research / kb_audit / code_review / workflow_upgrade / article_compare
- Session ID input (auto-generated when blank), module name
- Conditional prompt vs article text area by task type
- "Run Agent" + "Full Upgrade Analysis" (article modes) buttons
- Live stats: Total Runs / Succeeded / Artifacts counters
- Collapsible run cards: response text, structured output JSON, artifact badges, error display

**Route registration:** `/api/deep-agent/*` mounted in `server/routes.ts`

**Test count:** 1808/1808 passing across 55 files (+50 new tests in `tests/unit/batch21.test.ts`)

## Batch 22 — Communication Intelligence Engine (COMPLETE)

**Problem addressed:** Repeat-visit patients with cough/URI/sinus demanding antibiotics. System now detects, scripts, and tracks the interaction consistently across all providers.

**Backend modules (7 new files in `server/services/communication/`):**

- `toneDetector.ts` — `detectTone(text)`: classifies patient language as frustrated/demanding/anxious/neutral via phrase matching. `detectToneScore(text)`: returns per-tone match counts for scoring
- `scriptVariants.ts` — `getScriptVariant({tone, complaint, priorAntibiotics})`: 4 script variants (neutral/frustrated/demanding/anxious). Prior-antibiotics addendum appended when flag is set. `listVariantNames()`: returns all 4 variant names
- `scriptEngine.ts` — `isRepeatVisitTrigger(input)`: returns true when visitCount≥3, durationDays≤14, complaint ∈ {cough/uri/sinus/upper respiratory/sore throat/cold}. `generateCommunicationScript(input)`: full pipeline — trigger check → tone detection → variant selection → `{script, tone, variant, triggered, triggerReasons}`
- `antibioticDemandDetector.ts` — `detectAntibioticDemand(text)`: 18-phrase list covering "zpack", "z-pak", "i know my body", "it always turns into", "antibiotics always fix it" etc. Returns `{isDemandingAntibiotic, phrasesMatched, confidence: high|medium|low}`
- `antibioticDemandEngine.ts` — `generateAntibioticDemandResponse(input)`: 3-branch logic — (1) no demand → `{triggered:false}`, (2) demand + bacterial criteria → treat now script, (3) demand + no criteria → delayed-Rx script with Centor borderline variant. Rationale array always populated
- `delayedPrescriptionService.ts` — `createDelayedPrescription(params)`: creates `{id, status:"PENDING_ACTIVATION", expiresAt, createdAt}`. `activateDelayedPrescription(rxId)`. `buildActivationCriteria({fever, throatPain, worsening, rash, custom})`: standard English criteria strings
- `outcomeTracker.ts` — In-memory store (DB-ready) for `logCommunicationOutcome` and `logAntibioticDemandEvent`. `getCommunicationStats()`: total/requests/avoided/returnVisits/variantBreakdown/toneBreakdown/avoidanceRate. `getAntibioticDemandStats()`: demandRate/delayedUsed/avoided/acceptanceRate. `resetOutcomes()` for testing

**Express routes (2 new files in `server/routes/`):**
- `communicationRoutes.ts` → `/api/communication/*`: `POST /generate-script`, `POST /detect-tone`, `POST /check-trigger`, `POST /variant`, `GET /variants`, `POST /log-outcome`, `GET /stats`
- `antibioticRoutes.ts` → `/api/antibiotic/*`: `POST /antibiotic-demand`, `POST /detect-demand`, `POST /delayed-rx/create`, `POST /delayed-rx/activate`, `POST /activation-criteria`, `POST /log-event`, `GET /stats`

**DB migration:** `server/db/migrations/20260411_add_antibiotic_demand.sql` — tables: `communication_outcomes`, `antibiotic_demand_events`, `delayed_prescriptions` with indexes

**Frontend:** `client/src/pages/CommunicationDashboard.tsx` at `/communication`:
- Tab 1 "Repeat Visit Script": complaint/visitCount/durationDays/priorAntibiotics form, patient text for tone detection, live script output with variant badge and trigger reasons, "Log as Avoided Antibiotics" one-click
- Tab 2 "Antibiotic Demand": patient text + bacterial criteria + Centor score, demand detection, full response script, "Create Delayed Rx" button, Rx ID/status display
- Tab 3 "Outcomes & Stats": 8 stat cards (total/requests/avoided/return visits + demand rate/delayed used/avoided/returns), variant usage bar chart

**Startup fix:** `server/config/startupChecks.ts` — DATABASE_CONNECTIVITY and DATABASE_SCHEMA_READY downgraded from `fatal:true` to `fatal:false` so the app starts in degraded mode when DB is temporarily unreachable (warnings logged, traffic accepted)

**Test count:** 1882/1882 passing across 56 files (+74 new tests in `tests/unit/batch22.test.ts`)

## Batch 23 — Unified EHR Provider Model + Athena + SLO + Deployment (COMPLETE)

**Three major pillars delivered:**

### 1 — Unified EHR Adapter Interface (ECW / Athena / Epic)

**`server/integrations/ehr/types.ts`** — Canonical `EhrAdapter` interface:
- `EhrSystem` type: `"ecw" | "athena" | "epic"`
- `EhrPatientContext` — unified patient record shape (firstName, lastName, dob, sex, medications, allergies, problems, vitals)
- `EhrWritePayload` — unified write envelope (patientId, disposition, note, vitals, diagnosisCodes, cptCode, traceId)
- `EhrAdapter` interface — `getPatientContext`, `writeEncounter`, `writeObservation?`, `ping`
- `EhrWriteResults` / `EhrHealthStatus` types

**`server/integrations/athenaAdapter.ts`** — NEW Athena Health adapter:
- Authenticates via `ATHENA_API_BASE`, `ATHENA_PRACTICE_ID`, `ATHENA_TOKEN`
- `getPatientContext`: fetches patient + 3 parallel calls for allergies, medications, problems (each wrapped in try/catch so partial failures don't abort)
- `writeEncounter`: POST to `/chart/encounters` with departmentId, reasonforvisit, encounterdate, note
- `writeObservation`: POST to `/chart/observations` with vitals array
- `ping`: returns `false` rather than throwing when env vars missing

**`server/integrations/epicAdapter.ts`** — NEW standalone Epic FHIR adapter (replaces inline code in epicFullFlow.ts):
- Authenticates via `FHIR_BASE` + `EPIC_TOKEN`
- `getPatientContext`: FHIR `Patient/{id}` GET → name[0].given/family, birthDate, gender
- `writeEncounter`: FHIR `Encounter` POST with status "in-progress"
- `writeObservation`: FHIR `Observation` POST with valueString
- `postObservation` exported as standalone helper (backward-compatible)
- `ping`: returns `false` rather than throwing when env vars missing

**`server/integrations/ecwAdapter.ts`** — Updated: added `ecwAdapter` unified export at bottom:
- `system: "ecw"`
- `getPatientContext`, `writeEncounter` (throws on `success:false`), `writeObservation`, `ping` (returns false not throws)
- All legacy exports preserved: `sendToECWEncounter`, `safeEHR`, `syncSystems`, `ECWPayload`

**`server/integrations/ehrRouter.ts`** — NEW tri-EHR orchestration:
- `EHR_ADAPTERS`: `{ecw, athena, epic}` registry
- `PRIMARY_EHR = "ecw"`
- `getAdapter(system)`: returns the correct adapter
- `getPatientContextUnified(patientId, preferred?, token?)`: delegates to preferred adapter
- `writePrimaryEHR(payload, token?)`: ECW-only write
- `writeAllEHRs(payload, tokenMap?)`: `Promise.allSettled` across all 3 → `EhrWriteResults`
- `pingAllEHRs(tokenMap?)`: parallel ping all 3, catches errors → booleans
- `summarizeWriteResults(results)`: maps settled to `"ok"|"failed"` per system

**`server/integrations/ehrConsistency.ts`** — NEW cross-EHR data validator:
- `checkConsistencyMulti(epic?, ecw?, athena?)`: checks allergies (all 3 pairs), medications (ECW vs Epic, ECW vs Athena), DOB (Epic vs ECW) → `{issues, ok, checkedFields}`
- `checkConsistencyDual(a, b, labelA?, labelB?)`: any two contexts with custom labels
- Null-safe: missing contexts treated as empty arrays

**`server/integrations/ehrRouting.ts`** — NEW patient-to-EHR routing:
- `routeEHR(patient)`: maps `patient.system` → `EhrSystem | "all"` (case-insensitive)
- `routeEHRForWrite(patient)`: returns array of target systems — single if preferred EHR known, all 3 if not
- `isValidEhrSystem(s)`: type guard

**`server/integrations/universalWrite.ts`** — NEW 5-tier fallback chain:
```
ECW → Athena → Epic → UI Automation → Vision Agent → failed
```
- Each tier caught independently; falls through on error or `success: false`
- Returns `{success, tier, data?, error?}` — tier always indicates which level handled the write
- UI/Vision tiers use dynamic `import()` so missing automation modules don't crash the chain

**`server/integrations/ehrUnified.ts`** — Updated: now uses `writeAllEHRs` + `summarizeWriteResults`:
- `writeEHRAll(data)` → `{epic, ecw, athena}` — all three concurrently, graceful failure per system
- `writeEHRPrimary(data)` → `{ecw}` — ECW only with error swallow

### 2 — EHR API Routes

**`server/routes/ehrRoutes.ts`** — Added 6 new endpoints to existing FHIR route file:
- `GET /api/ehr/unified/health` — pings all 3 systems, returns `{ok, systems:{ecw,athena,epic}}`
- `GET /api/ehr/unified/patient/:patientId?system=` — fetch unified patient context from any EHR
- `POST /api/ehr/unified/write` — write to all 3 EHRs simultaneously
- `POST /api/ehr/universal-write` — 5-tier fallback write
- `POST /api/ehr/consistency` — cross-system consistency check
- `POST /api/ehr/route` — determine which EHR to use for a patient

### 3 — System State — Athena Integration Status

**`server/control/systemState.ts`** — Updated:
- `EhrIntegrationStatus` interface: epic/ecw/athena as `"ok"|"down"|"unconfigured"` + chatgpt/whatsapp as `"ok"|"down"`
- `integrations` field added to `SystemStateSnapshot` with safe defaults
- `refreshEhrStatus()` — async: calls `pingAllEHRs`, maps to status strings (unconfigured when env vars absent, down when ping fails, ok when ping succeeds), persists to `_state.integrations`

### 4 — Clinical Services

**`server/services/completenessGate.ts`** — Pre-triage context validator:
- `ensureCompleteness(ctx)` — checks required fields: age, meds, allergies → `{ok, missing, score}`
- `ensureCompletenessStrict(ctx)` — also requires chiefComplaint, sex
- Score 0–100 based on present fields; empty arrays treated as missing; null-safe

**`server/services/sloMonitor.ts`** — SLO monitoring + SLA tracking:
- `sloBurnRate(errors, total)` → `{rate, status:"ok"|"burning"|"critical", errorPct}` (>1% = burning, >5% = critical, divide-by-zero safe)
- `updateSLA(provider, latencyMs)` → EWMA update `0.7×old + 0.3×new`, load +0.05 (capped 1.0), non-mutating
- `resetSlaLoad(provider, decayFactor?)` → decays load by factor
- `approveAndSend(caseData)` → audit log + `universalWrite`, returns `{ok, traceId, tier}`

### 5 — One-Click Deployment

**`fly.toml`** — Fly.io production config: app `auralyn-brain`, region `iad`, port 3000, HTTP+TLS, health check at `/api/health`, 500-patient concurrency hard limit, persistent volume mount

**`scripts/up.sh`** — Docker bootstrap: copies `.env.example → .env`, validates docker/compose present, runs `docker compose up -d --build`, prints URLs for API (3000), Grafana (3001), Prometheus (9090)

**`docker-compose.yml`** — Full local stack: app + redis:7 + postgres:15 + prometheus + grafana with named volumes, `unless-stopped` restart policy

**`.env.example`** — Appended: `ATHENA_API_BASE`, `ATHENA_PRACTICE_ID`, `ATHENA_TOKEN`, `ATHENA_DEFAULT_DEPARTMENT_ID`, plus `FHIR_BASE`, `EPIC_TOKEN`, `ECW_API`, `ECW_TOKEN` sections

**Test count:** 1979/1979 passing across 57 files (+97 new tests in `tests/unit/batch23.test.ts`)

---

## Batch 29 — Medical MCP Nervous System (COMPLETE)

**Test count: 2,396/2,396 passing across 63 files (+57 new tests in `tests/unit/batch29.test.ts`)**

### New Files

**`server/mcp/medicalMCP.ts`** — Singleton MedicalMCPRegistry: `register()`, `execute()`, `listTools()`, `has()`.

**`server/mcp/loadTools.ts`** — Side-effect import that activates all tool registrations (call once in routes.ts or workflow engine).

**`server/mcp/tools/baseClinicalTools.ts`** — 6 base clinical tools: `intake.collect`, `questions.nextBest`, `diagnosis.run`, `risk.assess`, `disposition.determine`, `ehr.document`.

**`server/mcp/tools/phase2Tools.ts`** — 2 specialist tools: `council.run` (cardiology + ID + ICU vote), `monitoring.assess` (real-time deterioration).

**`server/types/clinical.ts`** — Shared clinical types: `ClinicalWorkflowState`, `ClinicalWorkflowInput`, `GoldenCaseDef`, `GoldenCaseRunResult`, `MonitoringAlert`, `MonitoringAssessment`, `SpecialistVote`, `SpecialistCouncilResult`, `RLHFFeedbackEvent`, `RLHFProposal`, `RiskLevel`.

**`server/services/auditTraceService.ts`** — `AuditTraceService` class (appended, preserving legacy `buildAuditTrace`): `createTrace`, `startStep`, `completeStep`, `failStep`, `getTrace`, `summarize`, `listTraces`. Delta computation on step completion.

**`server/services/specialistCouncilService.ts`** — 3-specialist vote engine: cardiology, infectious disease, ICU. Consensus via majority, risk level escalation, confidence averaging. `runSpecialistCouncil(state)`.

**`server/services/patientMonitoringService.ts`** — Real-time deterioration scoring: HR, SpO2, BP, temp, RR, sepsis pattern. Score → reassessInMinutes (5/10/30/60). `assessMonitoring(state)`.

**`server/services/workflowRuntime.ts`** — `runToolWithTrace()` bridges MedicalMCP execution with AuditTraceService step logging.

**`server/workflows/clinicalWorkflowEngine.ts`** — 8-step clinical workflow: collect-intake → choose-next-question → run-diagnosis → specialist-council → risk-assessment → monitoring-assessment → determine-disposition → ehr-documentation. Returns full `ClinicalWorkflowState` with traceId + traceSummary.

**`server/services/goldenCaseService.ts`** — Singleton `GoldenCaseService`: `seed`, `list`, `getById`, `compare` (mismatch diffing). Pre-seeded: gc-cough-viral-001 (low-risk cough) + gc-sepsis-risk-001 (critical sepsis).

**`server/services/goldenCaseRunner.ts`** — `runAllGoldenCases()`: runs workflow for each active golden case, compares against expected, returns pass/fail suite result.

**`server/services/rlhfService.ts`** — `RLHFService`: `addFeedback`, `listFeedback`, `generateProposals` (≥5 events/group, ±2% max delta, clamped [0.5,1.5]), `listProposals`, `reviewProposal` (approved/rejected/applied).

### New Routes

**`server/routes/workflowRoutes.ts`** — `/api/workflow/run` (POST), `/api/workflow/trace/:traceId` (GET), `/api/workflow/tools` (GET).

**`server/routes/goldenCaseRoutes.ts`** — `/api/golden-cases` (GET), `/api/golden-cases/runs` (GET), `/api/golden-cases/run-all` (POST).

**`server/routes/rlhfRoutes.ts`** — `/api/rlhf/feedback` (GET/POST), `/api/rlhf/proposals` (GET), `/api/rlhf/proposals/generate` (POST), `/api/rlhf/proposals/:id/review` (POST).

**`server/routes/monitoringRoutes.ts`** — Added `/api/monitoring/assess` (POST) for real-time vitals deterioration assessment.

### New Frontend

**`client/src/pages/MissionControlPhase2.tsx`** — 4-tab dashboard at `/mission-control-phase2`: Clinical Workflow (8-step runner with trace summary), Monitoring (real-time deterioration form), Golden Cases (suite runner with pass/fail), RLHF (feedback submission + proposal management).

---

## Batch 30 — FDA Validation Engine + Immutable Hash Chain + Drift Detection (COMPLETE)

**Test count: 2,425/2,425 passing across 64 files (+29 new tests in `tests/unit/batch30.test.ts`)**

### New Services

**`server/services/fdaValidationService.ts`** — `FDAValidationService.generateReport(runs)`: accuracy, high-risk failures (missed ED-now), readinessGrade (A/B/C/F), fdaReady flag, criticalMisses[], recommendations[]. Requires ≥80% accuracy AND 0 critical misses for FDA-ready.

**`server/services/hashChain.ts`** — `HashChain` singleton (`auditHashChain`): `add(data)` SHA-256 chains each record to its predecessor (prevHash), `verify()` walks the full chain for tamper detection, `latest()`, `getChain()`, `length()`. First record has prevHash="GENESIS".

**`server/services/driftDetectionService.ts`** — Per-complaint confidence drift detector (separate from existing rule-based engine). Rolling 10-sample window: older 5 vs recent 5. `detect(complaint?)` returns drift/difference/recentAvg/olderAvg/details. `record()`, `clear()`, `history_length()`. Threshold: 10% confidence delta.

### Workflow Engine Upgrades

**`server/workflows/clinicalWorkflowEngine.ts`** — Updated to hook `auditHashChain.add()` after each of the 8 steps, and `driftDetectionService.record()` after every full workflow run. Both hooks are non-blocking and preserve existing functionality.

**`server/services/goldenCaseRunner.ts`** — Fixed `runAllGoldenCases()` to return only current run results (not all historical), enabling accurate FDA report generation per invocation.

### New Routes

**`server/routes/fdaRoutes.ts`** — 4 endpoints:
- `GET /api/fda/report` — generate FDA report from all golden case runs
- `POST /api/fda/run-and-report` — execute golden cases + generate report in one call
- `GET /api/fda/audit-chain` — full immutable hash chain dump
- `GET /api/fda/audit-chain/verify` — quick tamper-check (valid:boolean + length)

**`server/routes/driftRoutes.ts`** — 3 endpoints:
- `GET /api/drift` — global drift detection (all complaints)
- `GET /api/drift/:complaint` — complaint-specific drift
- `POST /api/drift/record` — manual drift metric recording

### New Frontend

**`client/src/pages/SystemValidationDashboard.tsx`** — 3-tab dashboard at `/system-validation`:
- FDA Validation: run-and-report button, readiness grade badge (A/B/C/F), accuracy %, high-risk misses, recommendations
- Audit Chain: verify integrity, view latest hash, full chain explorer (last 10 records)
- Drift Detection: record metrics, check global + per-complaint drift with delta visualization

---

## Batch 31 — SaMD Dossier + Trial Simulator + ROI Engine + DAG Executor + Pilot Workflow (COMPLETE)

**Test count: 2,479/2,479 passing across 65 files (+54 new tests in `tests/unit/batch31.test.ts`)**

### New Services

**`server/services/samdDossierService.ts`** — `samdDossierService.generate()`: assembles a complete SaMD Class II FDA submission dossier object from live system state (hash chain, FDA validation report, drift state, golden case corpus, risk mitigations, all architecture flags). No file I/O — pure structured output.

**`server/services/trialSimulator.ts`** — `trialSimulator.runTrial(n)`: generates N synthetic patients (fever/cough/chest-pain rotation with randomised vitals), runs each through the clinical workflow engine, and returns `{total, edRate, avgConfidence, edCount, homeCount, byComplaint, results[]}`. Cap at 500.

**`server/services/payerROIService.ts`** — `payerROIService.calculate(cases[])`: takes raw trial results, computes avoided-ED count, total savings ($2,500 ED − $250 UC per avoided visit), avg savings per patient, and `annualizedSavings500` (500 pt/day × 250 days/yr).

**`server/services/payerContractService.ts`** — `simulateContract(volume)`: base $100/visit + $10 bonus (>500), $20 bonus (>1000), $50k diversion bonus (>1000). `suggestNegotiation(data)`: returns strategy + negotiation levers + estimated uplift % based on ED diversion metrics and clinical accuracy.

### New Core Architecture

**`server/core/FlowContext.ts`** — type-safe key-value context store for agent pipelines: `get<T>()` (throws on missing), `tryGet<T>()`, `set()`, `has()`, `merge(FlowContext)`, `mergeRecord(Record)`, `dump()`, `clone()`.

**`server/core/MedicalAgent.ts`** — abstract base class with `AgentMeta { name, consumes[], provides[] }` + abstract `run(ctx): Promise<FlowContext>`.

**`server/core/DAGExecutor.ts`** — `validate(availableKeys?)` checks every `consumes` key is satisfied by a provider or initial context (throws descriptively). `run(ctx)` executes agents sequentially. `runParallel(layers, ctx)` executes agent layers with `Promise.all` within each layer.

**`server/agents/redFlagAgent.ts`** — `RedFlagAgent` (consumes: vitals; provides: redFlags): detects `possible_PE_or_ACS`, `critical_hypoxia`, `shock_risk`, `respiratory_failure`, `possible_sepsis`, `cardiopulmonary_compromise`. Does not mutate input context (clones before writing).

**`server/orchestrators/clinicalOrchestrator.ts`** — `runClinicalPipeline(input)`: wraps FlowContext + DAGExecutor + RedFlagAgent. Safe defaults for missing `vitals`/`symptoms` keys.

### Billing & Workflow

**`server/billing/cptEngine.ts`** — `generateCPT({riskLevel, diagnosis, disposition})`: risk-level-driven E&M coding — low→99213, moderate/high→99214, critical→99285. Separate from the richer `codingEngine.ts`.

**`server/ehr/ehrOrchestrator.ts`** — `submitEncounter(data)`: routes to Athena/Epic/ECW EHR adapter. Stub mode in dev/test (no Playwright browser launch) — returns `{success:true, stub:true, system}`.

**`server/workflows/pilotWorkflow.ts`** — `runPilotEncounter(input)`: 4-step real-world clinic encounter: (1) clinical workflow, (2) physician documentation gate, (3) CPT billing, (4) EHR submission. Returns `{status, clinical, billing?, ehr?}`.

### New Routes

**`server/routes/samdRoutes.ts`** — `GET /api/samd/generate`
**`server/routes/trialRoutes.ts`** — `GET /api/trial/run?n=50`
**`server/routes/roiRoutes.ts`** — `GET /api/roi/simulate?n=100`
**`server/routes/cptRoutes.ts`** — `POST /api/cpt/generate`
**`server/routes/payerRoutes.ts`** — `GET /api/payer/simulate?volume=1000`, `POST /api/payer/negotiate`
**`server/routes/pilotRoutes.ts`** — `POST /api/pilot/encounter`

### New Frontend

**`client/src/pages/ClinicalOperationsCenter.tsx`** — 5-tab dashboard at `/clinical-ops-center`:
- FDA Dossier: one-click SaMD dossier generation with architecture flags, risk mitigations, FDA readiness badge, hash chain validity
- Trial Simulator: configurable N patients, edRate/homeRate/avgConfidence cards, breakdown-by-complaint grid
- Payer ROI: simulate ROI from trial results — avoided ED visits, total savings, annualized $
- Contract Engine: volume-driven contract simulation + negotiation strategy with levers and uplift %
- Pilot Encounter: live encounter form (patientId, complaint, vitals) → clinical result + CPT code + EHR submission status

---

## Batch 32 — Medical Knowledge Graph + DAG Visualizer + Debate Engine + YAML Pipelines + Trace Replay (COMPLETE)

**Test count: 2,525/2,525 passing across 66 files (+46 new tests in `tests/unit/batch32.test.ts`)**

### Knowledge Graph Layer (`server/graph/`)

**`server/graph/schema.ts`** — `NodeType` enum (disease/symptom/sign/test/treatment/risk_factor/pattern) + `RelationType` enum (CAUSES/INDICATES/ASSOCIATED_WITH/TREATED_BY/CONTRAINDICATED_WITH/SUPPORTS/RULE_TRIGGER) + `GraphNode`/`GraphEdge` interfaces.

**`server/graph/graphStore.ts`** — `MedicalGraphStore` singleton (`graphStore`): in-memory relational graph (no Neo4j dependency). `createNode()`, `createRelation()`, `getRelated()`, `getRelatedTo()`, `allNodes()`, `allEdges()`, `seed()`. Pre-seeded with 45 nodes and 40 edges covering diseases (ACS/PE/Sepsis/Pneumonia/CHF/COPD/COVID-19/Strep/UTI/Meningitis), symptoms, signs, tests, treatments, and risk factors.

**`server/graph/queries.ts`** — `getRelatedDiseases(symptom[])`: weighted INDICATES traversal sorted by score. `getRecommendedTests(disease)`: SUPPORTS traversal. `getRecommendedTreatments(disease)`: TREATED_BY traversal. `getRiskFactors(disease)`: reverse CAUSES traversal. `getDiagnosticContext(symptoms[])`: full enriched candidate list with tests + treatments + risk factors.

### Agent Infrastructure

**`server/registry.ts`** — Central agent registry: `registerAgent(name, factory)`, `getAgent(name)` (throws descriptively on miss), `listAgentContracts()`, `listAgentNames()`. Pre-registers `redFlagAgent`.

**`server/api/agentContracts.ts`** — `getAgentContracts()` reads registry contracts. `buildDAGFromContracts(contracts)`: produces a `{nodes[], edges[]}` DAG with both `agent` and `data` typed nodes and labelled input/output edges.

**`server/api/dagApi.ts`** — `getDAG()`: builds DAG from registered agents. `getKnowledgeGraph()`: exports full graph + stats.

### YAML Pipeline Engine (`server/yaml/`)

**`server/yaml/loader.ts`** — `loadPipeline(filePath)` reads from disk. `parsePipeline(yamlText)` parses in-memory. `PipelineConfig` interface: `{name, agents[], flow: FlowStep[], meta?}`.

**`server/yaml/executor.ts`** — `runYamlPipeline(config, input)`: executes parallel and sequential steps using registry + FlowContext. Returns `{pipelineName, steps, context, durationMs}`.

**`pipelines/chestPain.yaml`** — Sample pipeline: `[parallel: [redFlag]]`.

### LLM Specialist Agents

**`server/agents/cardiologyLLMAgent.ts`** — `CardiologyLLMAgent.evaluate(ctx)`: calls GPT-4o-mini with cardiology system prompt + JSON response format. Falls back to rule-based logic (chest pain + HR > 100 → Possible ACS) when OpenAI unavailable.

**`server/agents/pulmonaryLLMAgent.ts`** — `PulmonaryLLMAgent.evaluate(ctx)`: calls GPT-4o-mini with pulmonology system prompt. Falls back: SOB + SpO2 < 93 → acute respiratory compromise.

### Debate Engine

**`server/debate/debateEngine.ts`** — `runDebate(agents[], ctx)`: runs all agents in parallel, scores by confidence-weighted vote, picks consensus diagnosis. Returns `{opinions[], consensus{diagnosis, totalScore}, dissent[], summary}`.

### Execution Trace Replay

**`server/audit/traceStore.ts`** — In-memory circular buffer (max 200 traces). `saveTrace()`, `getTrace(id)`, `listTraces(limit)`, `traceCount()`, `clearTraces()`. Newest first; auto-prunes above 200.

### New Routes — `GET|POST /api/brain/*`

- `GET /api/brain/agents` — registered agent contracts
- `GET /api/brain/dag` — agent pipeline DAG (nodes + edges)
- `GET /api/brain/knowledge-graph` — full graph + stats
- `GET /api/brain/knowledge-graph/query?symptoms=chest+pain,fever` — enriched diagnostic candidates
- `GET /api/brain/traces?limit=20` — list execution traces
- `GET /api/brain/traces/:id` — single trace replay
- `DELETE /api/brain/traces` — clear all traces
- `POST /api/brain/debate` — multi-specialist debate (Cardiology + Pulmonary)
- `POST /api/brain/pipeline/run` — run a named YAML pipeline
- `GET /api/brain/pipeline/list` — list available pipelines

### New Frontend

**`client/src/pages/ClinicalBrainPage.tsx`** — 6-tab Control Tower at `/clinical-brain`:
- Agents: agent contract cards (consumes/provides badges per registered agent)
- DAG: ReactFlow-powered agent dependency graph (agent nodes purple, data nodes blue)
- Knowledge Graph: symptom query → scored disease candidates with tests, treatments; stats badge
- Debate: live multi-specialist debate form → opinions grid with confidence %, consensus, summary
- Replay: execution trace list + step-by-step replay viewer (agent name, input→output, duration)
- YAML Pipeline: pipeline name + JSON input → run → context dump with duration

---

## Batch 33 — Cognitive Medical Brain v2 (COMPLETE)

**Test count: 2,572/2,572 passing across 67 files (+47 new tests in `tests/unit/batch33.test.ts`)**

### `server/cognitive/` — New Directory (8 modules)

**`monologueEngine.ts`** — `generateClinicalMonologue(ctx)`: async internal pre-decision reasoning trace. Calls GPT-4o-mini with clinical reasoning system prompt + JSON response format. Deterministic fallback: chest pain → ACS+PE dangerous misses; SpO2 < 92 → respiratory_failure; SBP < 90 → septic_shock; high temp + tachycardia → sepsis; missing vitals → confidence_gaps. Returns `{uncertainty_level, dangerous_misses[], bias_flags[], confidence_gaps[], recommended_strategy, reasoning_summary}`.

**`debateCouncil.ts`** — `runSpecialistDebate(caseData, baseResult?)`: three-specialist debate (Cardiology via CardiologyLLMAgent, Pulmonary via PulmonaryLLMAgent, Infectious Disease via rule-based fallback). Integrates knowledge graph candidates. Returns `{final_diagnosis, disagreementScore, most_dangerous_miss, confidence, opinions[], graphCandidates[]}`.

**`strategyEngine.ts`** — `selectStrategy(monologue, debate)`: uncertainty > 0.7 → rule_out; disagreementScore > 0.5 → escalate; dangerous_misses > 2 → rule_out; high confidence + low uncertainty → reassure; else uses monologue recommendation. Returns `ClinicalStrategy`.

**`biasEngine.ts`** — `applyBiasGuards({plan, monologue})`: suppresses over-treatment (removes antibiotics pending culture), flags anchoring bias (broadens differential), flags premature closure (disagreement > 0.4), corrects availability bias (PE/ACS missed by debate but present in graph). Returns `{final_diagnosis, suppressedActions[], biasCorrections[]}`.

**`dispositionEngine.ts`** — `computeDisposition({confidence, uncertainty, disagreement, redFlags})`: red flags → ED (urgencyScore 1.0); uncertainty > 0.6 OR disagreement > 0.5 → URGENT_CARE; confidence > 0.85 AND uncertainty < 0.3 → HOME; else FOLLOW_UP. Returns `{disposition, rationale, urgencyScore}`.

**`communicationEngine.ts`** — `generatePatientMessage({disposition, strategy, diagnosis})`: generates structured `{headline, body, returnPrecautions[], urgency}` for each of the 4 dispositions. HOME → routine, URGENT_CARE/FOLLOW_UP → prompt, ED → immediate.

**`memoryGraph.ts`** — In-memory symptom→diagnosis frequency map (lowercase keys). `writeToMemoryGraph()`, `readMemoryGraph()` (sorted by frequency), `queryMemory(symptom)`, `memorySize()`, `clearMemory()`. Handles both string[] and Record<string,boolean> symptom inputs.

**`caseStore.ts`** — In-memory circular buffer (max 500 cognitive cases). `persistCognitiveCase()`, `listCognitiveCases(limit)`, `getCognitiveCase(id)`, `caseCount()`, `clearCases()`. Newest-first ordering.

**`cognitiveOrchestrator.ts`** — `runCognitiveBrain(input)`: 8-step pipeline:
1. Internal Monologue (generateClinicalMonologue)
2. Bayesian Clinical Workflow (existing 8-step engine via runClinicalWorkflow)
3. Multi-Specialist Debate (runSpecialistDebate — Cardiology + Pulmonary + ID)
4. Strategy Selection (selectStrategy)
5. Bias Suppression (applyBiasGuards)
6. Disposition Computation (computeDisposition)
7. Patient Communication (generatePatientMessage)
8. Memory Write + Case Persistence

Returns `{caseId, diagnosis, disposition, confidence, strategy, urgencyScore, patientMessage, reasoning{monologue,debate,safePlan}, durationMs}`.

### Routes

**`server/routes/cognitiveRoutes.ts`** — Express router mounted at `/api/cognitive`:
- `GET /api/cognitive/cases?limit=20` — list recent cognitive runs
- `GET /api/cognitive/cases/:id` — single case by ID
- `GET /api/cognitive/memory` — full symptom→diagnosis memory graph
- `GET /api/cognitive/memory/:symptom` — query memory for specific symptom

**Top-level alias in `routes.ts`:**
- `POST /api/cognitive-run` — main Cognitive Brain endpoint (the exact path from the user spec)

### Frontend

**`client/src/pages/CognitiveBrainPage.tsx`** — 3-tab UI at `/cognitive-brain`:
- **Run**: symptom textarea + red flags toggle → full result with disposition badge, confidence bar, patient message (headline + body + return precautions), internal monologue panel (uncertainty gauge + dangerous misses + bias flags + confidence gaps), debate council panel (3 specialist opinions with confidence %, disagreement score, most dangerous miss), bias suppression panel (suppressed actions + corrections)
- **Memory**: live auto-refreshing symptom→diagnosis frequency table (updates every 5 sec)
- **History**: recent case list (diagnosis, disposition badge, strategy, confidence, duration, timestamp)

Sidebar navigation entry: "Cognitive Brain v2" at `/cognitive-brain`.

---

## Batch 34 — Medical Plugin Architecture (COMPLETE)

**Test count: 2,607/2,607 passing across 68 files (+35 new tests in `tests/unit/batch34.test.ts`)**

### New Agents (`server/agents/`)

**`systemContextEngine.ts`** — `scanProject()`: walks `server/`, `client/src/`, `shared/` and returns `{totalFiles, files[], dependencies{}, unusedFiles[], stats{agentFiles, routeFiles, serviceFiles, testFiles}}`. Skips node_modules/dist/.git. Reads import statements to build dependency map and surfaces potentially orphaned files.

**`sequentialClinicalReasoner.ts`** — `SequentialClinicalReasoner.run(patientInput)`: 6-step traced reasoner:
1. Normalize Input (symptoms array, vitals, patientId)
2. Apply Modifiers (age > 65 → elevated risk)
3. Red Flag Override (short-circuit → ED if red flags present)
4. Cognitive Brain (full 8-step pipeline via `runCognitiveBrain`)
5. Modifier Adjustment (PCP loop-back note for elevated-risk)
6. Final Decision (diagnosis, disposition, confidence, caseId)

Returns `{diagnosis, disposition, confidence, caseId, reasoning: ReasoningStep[], totalMs}`. Each step has `{step, status: "ok"|"override"|"skipped", data, durationMs}`.

**`evidenceEngine.ts`** — `EvidenceEngine` class. `searchPubMed(query, maxResults)`: NCBI E-utilities esearch + esummary → `{source:"PubMed", query, count, items[{pmid,title,source,pubdate}], fetchedAt}`. `searchClinicalTrials(query, maxResults)`: ClinicalTrials.gov v2 API → `{source:"ClinicalTrials", query, count, items[{nctId,title,status,phase,condition}], fetchedAt}`. `searchGuidelines(query)`: both in parallel. Graceful error handling with timeout (8s, AbortSignal). Confirmed live: PubMed returns 105,662 results for "chest pain".

**`ehrAutomationAgent.ts`** — `EHRAutomationAgent` stub: `loginAthena/loginEpic(username, password)` → session object. `enterClinicalNote(note, system)` → NoteResult with noteId. `pushDiagnosis(patientId, diagnosis, system)` → delegates to existing `universalWrite` adapter when available. `getConfiguredSystems()` → checks ATHENA_API_KEY/EPIC_CLIENT_ID/ECW_API_KEY/FHIR_BASE_URL env vars.

**`deploymentDebugger.ts`** — `DeploymentDebugger`: `analyzeFailure(logs)` — matches 10 regex patterns (ECONNREFUSED, timeout, OOM, MODULE_NOT_FOUND, auth failure, rate limit, JSON parse, ENOENT, TLS/SSL, OpenAI key) → `{issue, severity, suggestion, pattern}[]`. `summarizeLogs(raw)` → error/warn/info counts + top 5 error lines. `getServiceHealth()` → checks redis/postgres/openai/fhir config.

**`pluginRegistry.ts`** — In-memory plugin registry: 9 plugins (diagnosis, disposition, debate, monologue, orders, fhir, billing, evidence, audit). `listPlugins()`, `getPlugin(name)`, `togglePlugin(name, status)`, `recordPluginCall(name, latencyMs?)` — increments callCount, updates lastCalled, applies EWA to latency. FHIR status auto-detected from FHIR_BASE_URL env.

### Routes — `GET|POST /api/agents/*`

- `POST /api/agents/reason` — sequential step-by-step clinical reasoning (6 traced steps)
- `GET  /api/agents/context` — project context (file stats + unused files)
- `GET  /api/agents/context/full` — full dependency map (internal tooling)
- `GET  /api/agents/evidence?q=...` — PubMed + ClinicalTrials search in parallel
- `GET  /api/agents/evidence/pubmed?q=...&n=5` — PubMed only
- `GET  /api/agents/evidence/trials?q=...&n=5` — ClinicalTrials only
- `GET  /api/agents/health` — service health (redis, postgres, openai, fhir)
- `POST /api/agents/debug` — analyse log blob for failure patterns
- `GET  /api/agents/plugins` — plugin registry list
- `POST /api/agents/plugins/toggle` — enable/disable plugin by name
- `GET  /api/agents/ehr/systems` — configured EHR integrations
- `POST /api/agents/ehr/login` — EHR session init (Athena/Epic stub)
- `POST /api/agents/ehr/note` — push clinical note or diagnosis to EHR

### Frontend

**`client/src/pages/AgentSystemPage.tsx`** — 6-tab dashboard at `/agent-system`:
- **Reasoner**: symptom input + optional red flags → full step-by-step reasoning trace with color-coded override/skipped steps, disposition badge, raw JSON per step
- **Plugins**: plugin registry table (name, description, status badge, latency, call count, enable/disable toggle)
- **Evidence**: PubMed + ClinicalTrials dual search with live article/trial cards
- **EHR**: session init (Athena/Epic) + clinical note push with real-time response
- **Health**: service health grid (redis, postgres, openai, fhir) with auto-refresh every 30s
- **Context**: project stats (agent/route/service/test file counts) + unused file list

Sidebar nav entry: "Agent System" at `/agent-system`.

---

## Batch 35 — System Evolution Map Phase 2 & 3 (COMPLETE)

**Test count: 2,640/2,640 passing across 69 files (+33 new tests in `tests/unit/batch35.test.ts`)**

### Source: System Evolution Map + Auralyn Zip + Project Generator

All spec code from the uploaded attachments (System Evolution Map Phase 2/3 + project generator) is now fully incorporated into the production stack.

### New Server Files

**`server/realtime/patientStream.ts`** — WebSocket patient broadcast layer. Attaches to the existing HTTP server at path `/ws/patients` (no extra port). `initPatientStream(server)` is called once at app startup in `server/routes.ts`. `broadcastPatientUpdate(data)` pushes JSON to all connected clients. `broadcastDiagnosticResult(caseId, result)` sends typed diagnostic events. `clientCount()` / `isInitialised()` for health checks.

**`server/agents/specialistCouncil.ts`** — Three-specialist rule-based council (Cardiology / Infectious Disease / ICU). Each specialist runs deterministic rules against `{complaint, symptoms, vitals, redFlags}`:
- Cardiology: chest pain → HIGH, hemodynamic instability → CRITICAL
- ID: fever + tachycardia → HIGH, fever alone → MEDIUM, sore throat → LOW
- ICU: redFlags or SpO2 < 88 or SBP < 80 → CRITICAL
- `consensus()` → `{decision: ICU|ED|URGENT_CARE|OUTPATIENT, riskSummary, agreementScore}`

**`server/fda/fdaValidator.ts`** — FDA accuracy + safety validator. `validate(results[], threshold)` → `{accuracy, status: PASS|REVIEW|FAIL, total, correct, incorrect, safetyMisses, threshold, computedAt}`. REVIEW when 90–100% of threshold. `compareResults(expected[], actual[], dangerousDiagnoses)` builds CaseResult[]  and auto-flags safety misses for dangerous diagnoses (ACS, PE, Sepsis, Meningitis, Stroke).

**`server/learning/driftDetector.ts`** — L1 distribution drift detector. `detect(oldDist, newDist, threshold)` → `{hasDrift, l1Distance, threshold, detectedAt}`. `detectFromMaps(oldMap, newMap, threshold, label)` normalises frequency maps before comparison. `scan(windows[][], threshold)` → `{anyDrift, reports[]}` for multi-window analysis.

**`server/testing/goldenCaseHarness.ts`** — Golden case test harness (spec interface: `runCases(cases[], engine)`). Each case: `{id, input, expected:{diagnosis, disposition}}`. Engine: `{run:(input)=>Promise<any>}`. Returns `HarnessSummary: {total, passed, failed, safetyMisses, accuracy, fdaStatus, results[], runAt}`. Handles engine crashes gracefully. Delegates FDA status to `fdaValidator`.

### New Routes

**`server/routes/advancedControl.ts`** — Mounted at `/api/advanced`:
- `POST /api/advanced/council` — Specialist Council evaluation (3 votes + finalDecision)
- `POST /api/advanced/cpt` — CPT code generation (high→99285 $300, medium→99284 $200, low→99283 $120)
- `POST /api/advanced/fda/validate` — FDA accuracy/safety validation
- `POST /api/advanced/drift` — L1 drift check (arrays or maps)
- `POST /api/advanced/golden/run` — Golden case harness (sequential or cognitive engine)
- `GET  /api/advanced/stream/status` — WebSocket connected client count
- `POST /api/advanced/stream/broadcast` — Manual broadcast to all WS clients

**`server/routes/simRoutes.ts`** — Mounted at `/api/sim`:
- `GET  /api/sim/patients` — 5 mock patients (chest pain, fever, dyspnea, headache, sore throat)
- `POST /api/sim/run` — Run sequential reasoner + broadcast to WS
- `POST /api/sim/run/cognitive` — Run cognitive brain + broadcast to WS
- `GET  /api/sim/heatmap/:id` — Bayesian posterior for mock patient (deterministic, complaint-based)
- `POST /api/sim/council` — Specialist council + WS broadcast

### New Frontend Components

**`client/src/components/Heatmap.tsx`** — Bayesian posterior heatmap. Props: `{posterior: {dx, prob}[], title?, showPercent?}`. Sorted by probability descending. Color-coded bars: red (≥35%), orange (≥20%), yellow (≥10%), blue (<10%). `data-testid="heatmap-{dx}"` on each row.

### Confirmed Live Responses

- `POST /api/advanced/council` → `{finalDecision:"ED", riskSummary:"HIGH", agreementScore:0.667, votes:[{cardiology:HIGH,ID:LOW,ICU:LOW}]}`
- `POST /api/advanced/cpt?complexity=high` → `{code:"99285", estimatedRevenue:300}`
- `POST /api/advanced/fda/validate` → `{status:"FAIL", accuracy:0.5, safetyMisses:1}`
- `POST /api/advanced/drift` → `{hasDrift:true, l1Distance:1}`
- `GET  /api/sim/patients` → 5-element array
- `GET  /api/sim/heatmap/1` → 5-item posterior with ACS at 0.38 probability (top)
- `GET  /api/advanced/stream/status` → `{connected:0, wsPath:"/ws/patients"}`

### Batch 38 — Autonomous Hospital Layer (2,777/2,777 tests · 72 files)

**5 new server modules** at `server/hospital/`:

**`schedulingEngine.ts`** — Priority-queue appointment scheduling
- `bookAppointment`, `cancelAppointment`, `updateStatus`, `listAppointments`, `estimateWaitTime`, `getScheduleSummary`
- Priority 1–5 (1=critical), auto-sorted queue, wait-time projection by acuity

**`staffingEngine.ts`** — Shift management & ratio monitoring
- Safe nurse:patient ratios per unit (ICU 1:2, ED 1:4, MedSurg 1:5, etc.)
- `checkStaffingRatios` → RATIO_BREACH / UNDERSTAFFED / COVERAGE_GAP / OVERTIME alerts
- `computeShiftDemand` — per-unit deficit calculation; `getStaffingSummary`

**`bedManagement.ts`** — Real-time bed occupancy & patient flow
- 106-bed inventory across 6 units: ED, ICU, MedSurg, Urgent Care, OB, PEDS
- Bed lifecycle: AVAILABLE → OCCUPIED → CLEANING → AVAILABLE
- `admitPatient`, `dischargePatient`, `markBedAvailable`, `getOccupancyReport`, `getHospitalCapacity`

**`populationHealth.ts`** — Cohort risk stratification & chronic disease tracking
- 20-patient seeded population with readmission risk modeling
- Risk tiers: LOW / MEDIUM / HIGH / VERY_HIGH (CHF+CKD pushes VERY_HIGH)
- `analyzeConditionCohort` (cohort summary per chronic condition), `getReadmissionAlerts`, preventive care gap analysis

**`hospitalAgent.ts`** — Autonomous hospital monitoring agent
- Action types: ESCALATE / DISCHARGE_SUGGEST / STAFF_ALERT / CAPACITY_ALERT / READMISSION_RISK / DIVERT_RECOMMEND
- Ring buffer action log (500 entries), `resolveAction`, `getAgentStats`, WS broadcast on critical actions
- Per run: scans capacity, unit occupancy, critical patients (acuity 1), staffing ratios, shift deficits, readmission risk

**`hospitalRoutes.ts`** — Mounted at `/api/hospital/*`
- `GET  /api/hospital/status` — unified hospital status (capacity + staffing + scheduling + population + agent)
- `GET  /api/hospital/beds`, `GET /api/hospital/beds/capacity`
- `POST /api/hospital/beds/admit`, `POST /api/hospital/beds/:id/discharge`, `POST /api/hospital/beds/:id/available`
- `GET/POST /api/hospital/schedule`, `DELETE /api/hospital/schedule/:id`, `PATCH /api/hospital/schedule/:id/status`
- `GET  /api/hospital/staffing`, `GET/POST /api/hospital/staffing/staff`, `POST /api/hospital/staffing/patient-counts`
- `GET  /api/hospital/population`, `GET /api/hospital/population/patients`, `GET /api/hospital/population/cohort/:condition`
- `GET  /api/hospital/population/readmission-alerts`, `POST /api/hospital/population/patients`
- `POST /api/hospital/agent/run`, `GET /api/hospital/agent/log`, `GET /api/hospital/agent/stats`, `POST /api/hospital/agent/resolve/:id`

**Frontend**: `client/src/pages/HospitalDashboard.tsx` at `/hospital` — 5-tab dashboard (Overview, Beds, Staffing, Population, Agent)

### Confirmed Live Responses (Batch 38)

- `GET /api/hospital/status` → occupancy:0.519, activeStaff:8, appts:4 (seeded), highRisk:11
- `POST /api/hospital/agent/run` → 39 actions (23 critical, 10 high, 6 medium), durationMs:2
- `GET /api/hospital/beds/capacity` → 106 beds, 55 occupied (51.9%), 6 units
- `GET /api/hospital/population` → 20 patients, 11 high-risk, avgReadmission:0.361, gapRate:0.9
- `GET /api/hospital/staffing` → 8 staff, 13 alerts, 26 total nurse deficit
- `POST /api/hospital/beds/admit {unit:ED}` → admitted to ED-006, status:OCCUPIED

### Batch 39 — Real-Time Clinical Engine (2,801/2,801 tests · 73 files)

**New files:**
- `server/engines/interventionEngine.ts` — NEWS2 scoring, sepsis bundle, hypoxia/O₂, tachycardia, hypotension, fever interventions
- `server/llm/insightEngine.ts` — GPT-4o-mini per-patient AI insights with 30s vitals-fingerprint cache + rule-based fallback
- `server/realtime/livePatientEngine.ts` — 5 seeded patients (Rivera, Lee, Cohen, Kim, Torres), vitals drift ±random walk every 2s, WS broadcast
- `server/realtime/livePatientRoutes.ts` — `/api/patients/live`, `/api/patients/insights`, `/api/patients/interventions`
- `client/src/hooks/usePatientStream.ts` — auto-reconnect WebSocket hook consuming `/ws/patients`
- `client/src/pages/LivePatientMonitor.tsx` — ICU-grid patient monitor at `/live-monitor`
- `client/src/pages/HospitalCommandCenter.tsx` — 3-panel command surface at `/command-center`

**Routes registered:** `/api/patients/*` (livePatientRoutes), `startLivePatientEngine()` on server boot.

**Nav entries:** "Live Patient Monitor" (`/live-monitor`) + "Command Center" (`/command-center`).

**CSS:** `animate-pulse-alert` keyframes for critical cards in `client/src/index.css`.

### Confirmed Live (Batch 39)
- `[LivePatientEngine] Streaming 5 patients every 2s via /ws/patients` ✓
- `[LivePatients] /api/patients/* + 2s WS stream active` ✓
- Tests: 2,801/2,801 (73 files)

### Batch 40 — AI Medical Orchestration Layer (2,822/2,822 tests · 74 files)

**From ZIP file scaffold** — all core concepts already existed in production-grade form:
- `backend/ws/server.ts` → our `/ws/patients` WebSocket (batch 39)
- `backend/engines/deteriorationEngine.ts` → our NEWS2 interventionEngine
- `backend/engines/triageEngine.ts` → our full Bayesian triage pipeline
- `backend/learning/rlhfEngine.ts` → our full RLHF system
- `backend/llm/insightEngine.ts` → our GPT-4o-mini insightEngine with cache

**AI Medical Orchestration Layer (new — from attachment):**

Architecture: `/server/ai-orchestration/`
- `orchestrator.ts` — master entry point: `runFullTriage()` chains all phases
- `langchain/clinicalRAG.ts` — LangChain RAG (`@langchain/openai` + `@langchain/core`): retrieves KB rules → GPT-4o-mini chain → structured JSON diagnosis
- `langchain/tools.ts` — LangChain tool definitions: `compute_news2`, `generate_interventions`
- `langgraph/triageGraph.ts` — `@langchain/langgraph` StateGraph: ask→evaluate→conditional loop (up to 5 iterations) → disposition
- `crew/specialistCouncil.ts` — TypeScript-native CrewAI equivalent: 3 parallel GPT-4o-mini specialists (Cardiologist, ID, ICU) → consensus + disposition
- `events/workflowEngine.ts` — n8n-style composable Workflow class: `.add(step)`, `.run(input)`, `.onLog()`, step timing + audit
- `observability/langsmith.ts` — LangSmith client (`langsmith` npm package) + local audit log fallback (FDA-ready)
- `orchestrationRoutes.ts` — 7 REST endpoints at `/api/orchestration/*`

**Routes:**
- `POST /api/orchestration/triage` — full pipeline (workflow → RAG → graph → council → trace)
- `POST /api/orchestration/rag` — RAG-only diagnosis
- `POST /api/orchestration/triage-graph` — LangGraph loop only
- `POST /api/orchestration/council` — specialist council only
- `POST /api/orchestration/workflow` — workflow run with step audit
- `GET  /api/orchestration/audit` — local FDA audit log
- `POST /api/orchestration/log` — manual trace entry

**Packages added:** `@langchain/openai`, `@langchain/core`, `@langchain/langgraph`, `langsmith`

### Confirmed Live (Batch 40)
- `POST /api/orchestration/triage` `{"symptoms":"chest pain shortness of breath","patientId":"test-001"}` → full pipeline response with ragDiagnosis, triage (LangGraph), council, disposition, auditTraceId
- `[Orchestration] /api/orchestration/* active` ✓

### Batch 41 — Autonomous Intervention + Command Center (2,849/2,849 tests · 75 files)

**New modules:**

`server/intervention/`
- `orderExecutor.ts` — EHR order placement (Epic adapter + mock fallback); batch execution; audit log ring buffer
- `alertEngine.ts` — WebSocket broadcast to all dashboards (`broadcastPatientUpdate`) + Twilio SMS for critical-level via existing `sendSMS` + alert ring buffer
- `escalationEngine.ts` — routes patients to ER / ICU / RRT / UrgentCare / Telemedicine based on riskScore + flags; fires critical alert automatically
- `actionOrchestrator.ts` — `runInterventions()`: generates interventions via NEWS2 engine → parallel lab/med orders → alerts → escalation

`server/command-center/`
- `commandCenterAI.ts` — `computePriorityScore()`: riskScore × 2 + vital instability + trend vectors (spo2Trend, hrTrend, bpTrend); `rankPatientsAI()`: sorts all patients sickest-first; urgency: routine/soon/urgent/immediate

`server/prediction/`
- `deteriorationEngine.ts` — early sepsis/shock/respiratory failure detection; SIRS criteria, shock criteria, rapid-trend early warning; auto-fires alert + escalation on critical/high risk

`server/learning/`
- `rlhfClinicalEngine.ts` — `evaluateCase()` reward function (disposition accuracy + outcome labels); `updateClinicalWeights()` FDA-safe ±2% cap; Redis-persisted weights; `runLearningLoop()` full cycle; `getLearningStats()`

`server/orchestrator/`
- `fullClinicalBrain.ts` — `runClinicalBrain()`: rank → parallel (deterioration + intervention) per patient → summary stats (critical/escalated/orders)

**Routes:** `server/routes/commandCenterRoutes.ts` → `/api/command-center/*`
- `POST /rank` · `POST /deterioration` · `POST /interventions` · `POST /brain` · `POST /learn` · `GET /learn/stats` · `GET /learn/weights` · `GET /alerts` · `GET /escalations` · `GET /orders`

### Confirmed Live (Batch 41)
- `POST /api/command-center/rank` with 3 patients → sick patient (HR 138, SpO2 87%) ranked #1 with priorityScore:37, urgency:"immediate"
- `[CommandCenter] /api/command-center/* active` ✓

### Batch 42 — Agent Scope Engine (ASE) + Scope-Aware Triage + Control Tower (2,887/2,887 tests · 76 files)

**New modules:**

`server/scope/`
- `agentScopeEngine.ts` — `AgentScopeEngine` class: evaluates express/implied/denied/restricted authority per agent role. Singleton `scopeEngine` with 6 pre-configured medical roles. Evaluation log (2000 entries), stats, role management.
- `delegation.ts` — `delegateScope()`: time-bound authority transfer (default 5-min TTL). `isDelegated()`, `revokeDelegate()`, `getActiveDelegations()`.
- `riskBasedScope.ts` — `getScopeByRisk()`: permission sets expand with patient acuity (LOW→CRITICAL). `augmentScopeWithRisk()` for dynamic scope injection.

`server/execution/`
- `actionGuard.ts` — `guardAction()`: checks scope engine + delegation chain + logs to audit hash chain + broadcasts to Control Tower WS. Returns APPROVED/BLOCKED/PENDING_OVERRIDE.
- `executeWithScope.ts` — `executeWithScope()`: wraps any handler behind scope gate. `executeStrict()` throws on block/override.

`server/controlTower/scopeController.ts` — `evaluateAndExecuteAction()`: scope eval + audit log + WS broadcast in one call.

`server/ehr/ehrExecutor.ts` — `writeToEHR()`, `submitOrder()`: all EHR writes scope-gated through `ehr_agent` role (requires physician_signed + confidence ≥ 0.9).

`server/override/overrideController.ts` — `requestOverride()`, `approveOverride()`, `denyOverride()`: FDA-traceable physician approval with WS broadcast and audit log.

`server/monitoring/scopeDrift.ts` — `detectScopeDrift()`: violations/expansions/risk level/top violators/recommendation. `generateScopeHeatmap()`: per-agent usage heat.

`server/triage/scopeAwareTriageEngine.ts` — `evaluatePatientRisk()`: NEWS2 (0.7) + qSOFA (0.3) → risk score → triage level → scope level 1–4 → augmented permissions. `rankPatients()`. `calculateQSOFA()` (AMS + RR ≥ 22 + SBP ≤ 100).

`server/simulation/scopeSimulationEngine.ts` — `simulateScope()`: "what-if" agent permission testing without side effects. `runScenario()`: named scenario reports. `recommendScopeMinimization()`: auto-minimize unused permissions.

`server/fda/fdaValidationEngine.ts` — `generateFDAMetrics()`: allowed/blocked/override rates, safety score 0–100, FDA safe flag, scope drift level, recommendation string.

**Routes:** `server/routes/scopeRoutes.ts` → `/api/scope/*`
- `GET /roles` · `POST /evaluate` · `GET /log` · `GET /stats`
- `POST /delegate` · `DELETE /delegate/:id` · `GET /delegations`
- `POST /simulate` · `POST /scenario`
- `GET /drift` · `GET /heatmap`
- `GET /fda`
- `POST /triage`
- `GET /overrides` · `POST /overrides/:id/approve` · `POST /overrides/:id/deny`

**Frontend:** `client/src/pages/ScopeCommandCenter.tsx` → `/scope-command-center`
- Live WebSocket scope event feed (200 entries, color-coded allowed/blocked/override)
- Physician override approval panel (approve/deny buttons)
- FDA metrics card (allowed rate, blocked rate, override rate, safety score)
- Agent role contract cards (express/denied/audit level per role)
- Stats bar: total actions, allowed, blocked, overrides, FDA safe, drift risk, role count
- Alert banners for pending overrides and high drift

**Confirmed Live (Batch 42):**
- 6 roles: triage_agent, treatment_agent, ehr_agent, escalation_agent, learning_agent, billing_agent
- EHR agent write:ehr (physician signed, confidence 0.95) → APPROVED, auditLevel HIGH
- FDA metrics → fdaSafe: true, safetyScore: 100
- Critical patient triage: HR 135, SpO2 86%, qSOFA=3 → level=CRITICAL, scope=4, #1 ranked

### Batch 43 — Command Wall + Sepsis Engine + Digital Twin + ICU Allocator + RL + EMS (2,930+/2,931 tests · 77 files)

**New modules:**

`server/sepsis/`
- `sepsisEngine.ts` — `detectSepsisRisk()`: NEWS2×0.08 + qSOFA×0.15 + infection signals (+0.2) + lactate>2 (+0.3) + lactate>4 (+0.2) + WBC abnormal (+0.1) + trend vectors. Probability clamped 0–1, highRisk≥0.6, auto-generates SEPSIS_ALERT.
- `sepsisAlertService.ts` — `triggerSepsisAlert()`: WS broadcast + Twilio SMS to on-call + audit log. Ring buffer of 500 alerts.

`server/controlTower/multiPatientStream.ts` — `updateWallDisplay()`: ranks all patients (NEWS2+qSOFA) → enriches each with sepsis risk + deterioration → triggers sepsis alerts → broadcasts WALL_DISPLAY_UPDATE.

`server/intervention/autonomousInterventionEngine.ts` — `runAutonomousInterventions()`: scope-gated autonomous engine. Generates sepsis bundle / fluid / escalation / oxygen suggestions → executes each through `intervention_agent` scope with `confidence > 0.9` constraint.

`server/digitalTwin/digitalTwinEngine.ts` — `runDigitalTwin()`: 5-min step forward simulation. Physiological drift model (infection drift, fluid response, hypoxia feedback, autonomic compensation). Outputs deteriorationProb, icuProb, tteMinutes, trajectory, riskSummary (STABLE/WATCH/DETERIORATING/ICU_IMMINENT).

`server/icu/icuAllocator.ts` — `allocateICUBeds()`: runs 2-hour digital twin per patient, sorts by icuProb×0.7 + imminent TTE factor×0.3, assigns only available beds, skips low-risk (<15%) patients.

`server/network/hospitalCoordinator.ts` — `routePatients()`: haversine distance sorting + availability filter + capability matching. `getSystemCapacity()`: system-wide bed utilization.

`server/orchestrator/systemOrchestrator.ts` — `runSystemCycle()`: parallel digital twins + ICU allocation + hospital routing → broadcasts SYSTEM_SNAPSHOT.

`server/rl/rlEngine.ts` — Q-table RL: `computeReward()` (survival 100pts + no-ICU 20pts − LOS penalty). `updateQ()` (α=0.1), `chooseBestAction()`, `learnFromOutcome()`. Redis-backed Q-table persistence.

`server/rl/rlSafetyGate.ts` — `validateRLAction()`: forbidden (prescribe, discharge, override), restricted (escalate_ICU, transfer — physician cosign required). `filterSafeActions()` removes all forbidden before RL can act.

`server/ops/hospitalOptimizer.ts` — `optimizeHospitalFlow()`: NORMAL / DIVERT / SURGE / CRITICAL_OVERLOAD strategy with action list + plain-text recommendation.

`server/ems/emsIngestion.ts` — `ingestEMSCall()`: normalizes raw EMS call to standard patient format. `ingestBatch()`, `getEMSLog()`.

`server/ems/emsRouter.ts` — `routeEMS()`: runs 60-min digital twin + sepsis check → routes to best hospital pre-arrival. Alert levels ROUTINE/URGENT/CRITICAL.

`server/orchestrator/hospitalBrain.ts` — `runHospitalBrain()`: parallel system cycle + wall display → ops optimization + EMS routing → broadcasts GLOBAL_BRAIN_UPDATE.

`server/scope/agentScopeEngine.ts` — Added `intervention_agent` role (7th role): express = suggest:intervention, suggest:treatment, read:*; implied = order:labs, send:alert; denied = write:ehr, billing; restricted = execute:escalation (physician override required); constraint = confidence > 0.9.

**Routes:** `server/routes/hospitalOpsRoutes.ts` → `/api/hospital/*`
- `POST /wall/update` · `POST /sepsis/evaluate` · `POST /sepsis/batch` · `GET /sepsis/alerts`
- `POST /interventions/autonomous`
- `POST /twin/simulate` · `POST /twin/batch`
- `POST /icu/allocate`
- `POST /route`
- `POST /system/cycle`
- `POST /brain`
- `POST /rl/learn` · `POST /rl/recommend` · `POST /rl/validate` · `GET /rl/table`
- `POST /ops/optimize`
- `POST /ems/ingest` · `POST /ems/batch` · `POST /ems/route` · `GET /ems/log`

**Frontend:**
- `/command-wall` — `CommandWall.tsx`: dark full-screen patient grid. WS-fed WALL_DISPLAY_UPDATE. Color-coded cards by risk level. Sepsis probability bars. Deterioration warning overlays. Live sepsis alert strip.
- `/regional-command` — `RegionalCommand.tsx`: Digital Twin cards (ICU prob, TTE, riskSummary) + ICU bed assignments + hospital routing + capacity panel.
- `/global-command` — `GlobalCommand.tsx`: Hospital ops strategy + EMS routing panel + system status. All WS + manual refresh.

**Confirmed Live (Batch 43):**
- Critical patient sepsis eval → highRisk=true, prob=100%, SEPSIS_ALERT
- Digital Twin (HR 138, SpO2 87%) → icuProb=1.00, riskSummary=ICU_IMMINENT
- EMS route (chest pain, SpO2 88%) → Bellevue, alertLevel=CRITICAL, sepsisFlag=true

## Batch 59 — Agent Fleet Orchestrator, Best-of-N, Artifact Store, Agent Memory

**Implemented (Batch 59):**
- `server/agents/agentFleetOrchestrator.ts` — parallel agent fleet (Promise.all, N tasks simultaneously), weighted vote-consensus engine, heuristic fallback (no AI key required)
- `server/agents/bestOfN.ts` — multi-model parallel comparison (gpt-4o/gpt-4o-mini/gpt-4-turbo each with different clinical role framing), meta-analysis (full/partial/divergent agreement, safety flag, confidence range, merged recommendation)
- `server/artifacts/artifactStore.ts` — typed structured artifact persistence (save/get/list/filter/status update), 9 artifact types, physician review workflow (pending_review → approved/rejected)
- `server/agents/agentMemory.ts` — persistent agent memory across runs (6 memory types), prompt-ready context block injection, physician override recording (RLHF signal), outcome feedback loop, memory pruning
- `server/routes/agentFleetRoutes.ts` — 8 API endpoints at `/api/agent-fleet/*`

**New DB Tables (Batch 59):**
- `agent_artifacts` — typed structured artifact store with physician review status
- `agent_memory_log` — persistent agent memory with importance scoring

**API (Batch 59):**
- `POST /api/agent-fleet/run` — run parallel agent fleet (up to 12 concurrent tasks)
- `POST /api/agent-fleet/best-of-n` — multi-model parallel comparison with meta-analysis
- `POST /api/agent-fleet/artifacts` — save typed artifact
- `GET /api/agent-fleet/artifacts` — list artifacts (filter by agentId, patientId, type, status)
- `GET /api/agent-fleet/artifacts/:id` — get single artifact
- `PATCH /api/agent-fleet/artifacts/:id/status` — physician review (approve/reject)
- `POST /api/agent-fleet/memory` — save agent memory entry
- `GET /api/agent-fleet/memory/:agentId` — get agent memories (filter by type, importance)
- `POST /api/agent-fleet/memory/:agentId/override` — record physician override (RLHF)
- `GET /api/agent-fleet/memory/:agentId/context` — get prompt-ready context block
- `DELETE /api/agent-fleet/memory/:agentId/prune` — prune low-importance memories
- `GET /api/agent-fleet/health` — module health

**Tests:** 73/73 passing (`tests/unit/batch59.test.ts`)

## Independent Code Review — Round 2 (Phase 6)

Seven new critical/high findings discovered and fixed during independent review (not identified by prior review rounds).

### Finding 1 — vm Sandbox Escape via Prototype Chain (`server/kb/specEngine.ts`)
**Severity: CRITICAL**
The `evalCondition()` function passed the raw `input` object into the vm sandbox. Because Node.js `vm.runInNewContext()` is not a true security boundary, objects from the outer context retain their prototypes — enabling `input.constructor.constructor('return process')()` to escape the sandbox and access Node.js internals.
**Fix:** Added `deepSanitize()` — a recursive null-prototype deep-copy that strips all functions, prototype references, and non-identifier-safe keys before passing `input` to the vm sandbox.

### Finding 2 — sequencer.ts FAIL-OPEN on Condition Error (`server/procedures/sequencer.ts`)
**Severity: CRITICAL (Clinical Safety)**
`evaluateCondition()` returned `true` on any exception — meaning a step with a failing condition check would execute rather than be skipped. If a step condition intended to guard medication delivery (e.g., "skip if allergic to penicillin") threw an error, the step ran anyway.
**Fix:** `catch` now returns `false` (fail-safe: skip the step) with a `[Sequencer] WARN` log; the undefined case (no condition) still returns `true` (always run).

### Finding 3 — 5 PHI Routes with Zero Authentication
**Severity: CRITICAL (HIPAA)**
Five routes exposed Protected Health Information with no authentication middleware. Any HTTP client could enumerate live patients, clinical case memories, prior authorization records, population case data, and trigger bulk SMS sends.

| Route file | Endpoint(s) | PHI exposure |
|---|---|---|
| `livePatientRoutes.ts` | `GET /live`, all POSTs | Full live patient objects |
| `caseMemoryRoutes.ts` | `/store`, `/search`, `/size` | Case complaint text, diagnosis history |
| `priorAuthRoutes.ts` | `/queue`, `/:paId`, `/create`, `/submit`, `/appeal` | Insurance PA records + clinical notes |
| `populationHealthRoutes.ts` | `/cases`, `/heatmap/*`, `/outbreaks`, `/cohort` | Individual case records + epi data |
| `bulkMessaging.ts` | `/send`, `/jobs` | Patient phone list + SMS send ability |

**Fix:** Added `requireRole()` to all endpoints. Read endpoints require `staff+`; write/send endpoints require `physician+`. Also added `try/catch` to `caseMemoryRoutes.ts` and `bulkMessaging.ts` async handlers to prevent unhandled rejections crashing Express.

### Finding 4 — X-Clinic-Id Header Trusted Without Proxy Validation (`server/middleware/setRLS.ts`)
**Severity: HIGH (Cross-Tenant Data Leakage)**
`rlsMiddleware` accepted the `X-Clinic-Id` header from any HTTP client, letting an attacker set their own clinic UUID to read a different tenant's patient records — a full bypass of PostgreSQL Row-Level Security isolation.
**Fix:** The header is now only accepted when the request originates from a trusted source (localhost always trusted; configurable `TRUSTED_PROXY_IPS` env var for ALB/load-balancer CIDRs). Untrusted sources receive a `[RLS] SECURITY:` warning log and the header is ignored. Production checklist added in comments: ALB header-strip rule + env var setup.

### Finding 5 — Vitals Range Validation Missing (`server/engines/scoring/news2.ts`)
**Severity: HIGH (Clinical Safety)**
All vital sign values were used in scoring engines without range validation. An impossible sensor value (e.g., `heartRate: 9999`) always scored maximum points, permanently forcing any patient into "High" clinical risk — causing alert fatigue and hiding genuine deterioration from other patients.
**Fix:** Added `VITAL_RANGES` physiological bounds map and `sanitizeVitals()` function. `calculateNEWS2()` now calls `sanitizeVitals()` on entry; out-of-range values are clamped to boundary with a `[NEWS2] WARN` log for biomedical engineering review.

### Finding 6 — caseMemoryRoutes Unhandled Async Rejections
**Severity: HIGH**
`POST /store` and `POST /search` were async Express handlers without try/catch. An unhandled promise rejection in Express 4 hangs the request and may crash the server process.
**Fix:** Wrapped both handlers in try/catch with structured 500 error responses.

### Finding 7 — Population Case Bulk-Dump Uncapped
**Severity: MEDIUM**
`GET /cases?limit=99999999` allowed downloading the entire case database in a single request. Combined with the missing auth (Finding 3), this was a full PHI bulk-export vector.
**Fix:** Added `Math.min(limit, 500)` cap on the `/cases` endpoint limiting any single response to 500 records maximum.

### Security Posture After Round 2
- All PHI routes: authenticated ✅
- vm sandbox: prototype-chain escape blocked ✅
- sequencer: clinically fail-safe ✅
- Tenant RLS: header spoofing mitigated ✅
- Vitals: range-validated before scoring ✅
- Server startup: `[StartupAssertions] All clinical startup invariants passed` ✅

---

## Claude Review Slice Exporter (Added April 2026)

Admin-only tool at `/admin/claude-export` that packages the Auralyn codebase into 9 structured markdown slices + a ZIP archive for systematic Claude code review.

### Architecture

| File | Purpose |
|------|---------|
| `server/tools/allowlist.ts` | Deny-by-default allowlist (only server/ai, server/clinical, server/validation, etc.) |
| `server/tools/secretScrubber.ts` | Redacts process.env.*, inline API keys, JWT tokens, DB URIs |
| `server/tools/phiScrubber.ts` | Redacts SSN, DOB, MRN, phone numbers (best-effort static) |
| `server/tools/diffTracker.ts` | SHA-256 hash-based diff tracker — enables changed-files-only export |
| `server/tools/exportClaudeSlices.ts` | Main exporter: 9 SLICE_DEFS → markdown + ZIP via archiver |
| `server/routes/adminClaudeExportRoutes.ts` | API: POST export, GET download (path-traversal safe), GET list |
| `client/src/pages/AdminClaudeExportPage.tsx` | React admin page with options, slice map, export history |

### 9 Review Slices
1. System Overview — Clinical Pipeline & Orchestration
2. Diagnosis Engine — Bayesian + Fisher + Natural Gradient
3. **Disposition & Safety Core — MOST CRITICAL**
4. Validation — Golden Cases, Adversarial, Calibration
5. Control Tower & Real-Time Streaming
6. Digital Twin & Synthetic Case Generation
7. Clinical RAG Copilot
8. RLHF & Safe Learning System
9. FDA & Audit Layer — 21 CFR Part 11/820

### Security Controls
- Allowlist: only server/ai, server/clinical, server/validation, server/controlTower, server/rlhf, server/fda, server/services, server/routes, server/ws, server/realtime, server/simulation, shared/, client/src
- Secret scrubber: 8 regex patterns (process.env.*, API keys, JWT, DB URIs, Bearer tokens)
- PHI scrubber: SSN, DOB, MRN, US phone numbers, patient name patterns
- Path traversal: downloads validated to `exports/claude-review/` only, zip-extension enforced
- Auth: requirePhysician + requireRole(["admin"]) on all 3 endpoints
- Both API endpoints verified to return 401 without authentication

### API Routes
- `POST /api/admin/export-claude-slices` — generate export (returns download URL)
- `GET  /api/admin/claude-export/list`   — list previous exports
- `GET  /api/admin/claude-export/download?path=<...>` — download ZIP (path-validated)

### Export Output
`exports/claude-review/<timestamp>/`
- `01_system_overview.md` … `09_fda_audit.md`
- `manifest.json`
- `REVIEW_PROMPTS.md` (copy-paste prompts for each slice)
- `claude-review-slices.zip`

## Medium Scout Research Pipeline (9 Modules)

### Overview
Auto-research → auto-propose → auto-validate → human-approve → GitHub PR
Scans Medium/PubMed RSS feeds for medical AI articles, triages them, generates summaries,
proposes code upgrades, validates against golden cases, and exports approved changes as GitHub PRs.

### DB Tables (5 new tables, created via psql)
- `research_articles` — ingested RSS articles (title, url UNIQUE, author, excerpt, tags, raw)
- `research_reviews` — triage scores (relevance, trust, novelty, actionability, verdict)
- `research_summaries` — AI or local summaries with 5 takeaways
- `proposed_upgrades` — heuristic patch bundles awaiting validation + human approval
- `github_exports` — branch names, commit SHAs, PR numbers after GitHub export

### Backend Modules
- `server/research/mediumScout.ts` — RSS scanner (Medium + PubMed feeds)
- `server/research/articleTriage.ts` — keyword-based scoring, adopt/test_only/ignore verdicts
- `server/research/articleSummarizer.ts` — local + GPT-4o-mini summary with 5 takeaways
- `server/research/upgradePlanner.ts` — 6 clinical topic → code patch bundle mappings
- `server/research/autoValidate.ts` — golden case harness gate (0 unsafe undercalls required)
- `server/research/humanApproval.ts` — approval gate (requires validationStatus=passed)
- `server/integrations/githubExporter.ts` — @octokit/rest branch + PR creation

### API Route
`/api/research/*` registered in server/routes.ts
- GET  `/api/research/config` — GitHub + OpenAI config check (public)
- GET  `/api/research/articles` — list all articles
- GET  `/api/research/articles/:id` — article + review + summary + upgrades
- POST `/api/research/scan` — trigger RSS feed scan (admin only)
- POST `/api/research/triage/:articleId` — run triage scoring
- POST `/api/research/summary/:articleId` — generate summary
- POST `/api/research/propose/:articleId` — create upgrade proposal
- POST `/api/research/validate/:upgradeId` — run validation harness
- POST `/api/research/approve/:upgradeId` — human approval gate
- POST `/api/research/reject/:upgradeId` — reject upgrade
- POST `/api/research/export-github/:upgradeId` — create branch + PR (admin only)
- POST `/api/research/pipeline/:articleId` — one-shot triage+summary+propose
- GET  `/api/research/upgrades` — list all proposed upgrades
- GET  `/api/research/exports` — list GitHub exports

### UI
`client/src/pages/ResearchInboxPage.tsx` at `/research-inbox`
Sidebar: Self-Developing AI → Research Inbox (Medium Scout)

### GitHub Setup (required for export)
Set these environment secrets:
- GITHUB_TOKEN — fine-grained PAT with Contents + Pull Requests write
- GITHUB_OWNER — GitHub org or username
- GITHUB_REPO — repository name
- GITHUB_BASE_BRANCH — base branch (default: main)
CI workflow: `.github/workflows/validate-research-upgrade.yml`

### Packages Installed
- rss-parser (RSS feed parsing)
- @octokit/rest (GitHub API client)

## Slice-Native Research Pipeline (Cross-Model)

### Overview
Claude slice export → Claude findings per slice → OpenAI review per slice → proposals per slice → validate per slice → human approve per slice → GitHub PR per slice → Replit review/implement per slice.

Second-pass model: OpenAI GPT-4o acts as conservative clinical safety reviewer for Claude's recommendations before any code change is made.

### DB Tables (5 new tables, created via psql)
- `cross_model_reviews` — Claude recommendations → OpenAI review results (full-article path)
- `review_slices` — slice definitions (sliceId, title, prompt, files)
- `claude_slice_reviews` — Claude findings submitted per slice
- `openai_slice_reviews` — OpenAI per-slice review results (summaryForUser, reviewJson, overallVerdict)
- `slice_proposals` — per-slice proposals (validation_status, approved, github_branch, github_pr_url, replit_status)

### Backend Modules
- `server/research/openaiReviewClient.ts` — GPT-4o chat completion with JSON mode; conservative clinical reviewer
- `server/research/crossModelCoordinator.ts` — Claude → OpenAI handoff; persists to cross_model_reviews
- `server/research/replitHandoffBuilder.ts` — builds REVIEW_PACKET.md, AGENT_SKILL.md, IMPLEMENTATION_TASK.md bundles
- `server/research/exportToGitHubAndReplit.ts` — legacy full-article export (GitHub + Replit packet)
- `server/research/openaiSliceReview.ts` — per-slice OpenAI review using claude_slice_reviews
- `server/research/sliceProposalBuilder.ts` — converts OAI review upgrades → slice_proposals rows
- `server/research/sliceValidation.ts` — lightweight safety checklist gate (5 checks, red-flag regex)
- `server/research/sliceApproval.ts` — human approval gate (requires validationStatus=passed + approvedBy)
- `server/research/sliceGitHubReplitExport.ts` — per-slice GitHub branch + PR + SLICE_REVIEW_PACKET.md

### API Routes
`/api/claude-slices/*` — slice definitions + Claude findings
- GET  `/api/claude-slices/` — list all slices with review counts
- GET  `/api/claude-slices/:sliceId` — slice + all reviews + proposals
- POST `/api/claude-slices/create` — create new review slice
- POST `/api/claude-slices/submit-findings` — store Claude findings for a slice

`/api/slice-pipeline/*` — slice pipeline orchestration
- POST `/api/slice-pipeline/openai-review/:sliceId` — run OpenAI second-pass review
- POST `/api/slice-pipeline/build-proposals/:sliceId` — create proposals from OAI review
- POST `/api/slice-pipeline/validate-proposal/:id` — run validation checklist
- POST `/api/slice-pipeline/approve-proposal/:id` — human approval (requires approvedBy)
- POST `/api/slice-pipeline/reject-proposal/:id` — reject proposal
- POST `/api/slice-pipeline/export-proposal/:id` — export to GitHub + Replit packet
- GET  `/api/slice-pipeline/proposals/:sliceId` — list proposals for slice
- GET  `/api/slice-pipeline/proposal/:id` — get single proposal

`/api/cross-model/*` — full-article cross-model review
- POST `/api/cross-model/review` — trigger Claude findings → OpenAI review
- GET  `/api/cross-model/reviews` — list all cross-model reviews
- GET  `/api/cross-model/reviews/:id` — get one review
- GET  `/api/cross-model/review/:id` — get one review (singular alias for UI)
- POST `/api/cross-model/convert/:id` — convert OAI review → proposed_upgrades
- POST `/api/cross-model/export-replit/:proposalId` — export proposal → GitHub + Replit

### UI Pages
- `client/src/pages/SlicePipelineAdmin.tsx` at `/slice-pipeline`
  Two-panel: slice list + create (left) | step-by-step workflow per slice (right)
  Steps: 1. Submit Claude findings → 2. Run OAI review → 3. Build proposals → 4. Validate/Approve/Export
- `client/src/pages/CrossModelReviewInbox.tsx` at `/cross-model-review`
  Load review by ID → see Claude + OpenAI findings → convert to proposals → validate/approve/export

Sidebar: Self-Developing AI → Cross-Model Review Inbox + Slice Pipeline Admin

### GitHub Setup (same as Medium Scout)
GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BASE_BRANCH
