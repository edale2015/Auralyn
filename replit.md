# ENT Flu Slice - Medical Triage System

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
