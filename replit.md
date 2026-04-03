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
