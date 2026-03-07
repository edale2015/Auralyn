# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that uses WhatsApp for initial patient assessments of flu-like symptoms. It collects symptoms and medical history, then uses AI to generate proposed diagnoses and treatment plans for physician review. The system automates communication of approved dispositions and orders back to patients, aiming to enhance efficiency in flu-like consultations, reduce physician workload, and improve patient access to healthcare.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system utilizes a constrained agent architecture for deterministic medical triage, featuring a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. A multi-system triage pipeline employs canonical keys and a unified sheets registry for data configuration, question queue building, and generating confidence-scored diagnostic candidates. A clinical state builder system deterministically assembles an auditable clinical state from various data sources.

### Frontend
The frontend is built with React 18 and TypeScript, using `shadcn/ui` with Tailwind CSS. It supports physician login, patient intake, case status, visit summaries, and a physician dashboard.

### Backend
The backend uses Express 5 on Node.js with TypeScript, providing REST API endpoints. Key functionalities include Centor score calculation, red flag detection, and a supervisor gate for patient-facing outputs. LLM integrations incorporate rate limiting, per-run budgets, and a circuit breaker.

### Data Management
Primary data storage is Firebase Firestore, with SQLite for intake storage abstraction. Schemas exist for physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies involve splitting storage for clinical records and debug telemetry.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification. A JWT-based role auth layer (`server/services/authService.ts`, `server/middleware/requireRole.ts`) supports roles: admin, physician, staff, patient. Protected routes use `requireRole()` middleware. Auth endpoints at `/api/roleAuth` (login, me). Frontend `AuthProvider` context stores JWT token + user in localStorage, exposes `authFetch` for authenticated requests.

### Agent System Features
The agent system orchestrates patient flow through various routing states using a pipeline orchestrator. It supports LLM-powered actions, prompt template versioning, and LLM A/B testing with guardrails.

### Generic Complaint Engine (GENERIC_V1)
This data-driven engine replaces per-complaint TypeScript scoring modules with CSV-configured rules, allowing new complaints to be added without new TypeScript code. It follows a pipeline for loading configurations, running questions, computing scores, and applying boosts.

### Clinical Scoring Systems
Data-driven clinical scoring systems (e.g., PERC, WELLS_PE, CENTOR) are configured via `SCORING_SYSTEMS.csv` and computed automatically. A consistency engine, defined by `CONSISTENCY_RULES.csv`, acts as a safety-net for dangerous symptom combinations.

### Advanced Triage Logic
The system supports subtype expansions for improved diagnostic granularity and cross-complaint boosts to adjust cluster scores based on multi-system clinical patterns. It also includes an engine to generate ranked diagnostic candidates.

### Case Management
A Firestore-backed case lifecycle manages cases through a state machine (DRAFT → TRIAGED → NEEDS_REVIEW → APPROVED → SENT → CLOSED), providing CRUD services and authentication for review. Comprehensive typed models are used for cases, case events (audit trail), signoffs (physician review), and runtime metrics.

### Physician Review & Signoff System
This system facilitates physician review with services for managing the review queue, assigning reviewers, and orchestrating signoffs. Frontend components include `CaseSummaryCard.tsx`, `SignoffPanel.tsx`, and `RuleTracePanel.tsx`.

### Note Generation & Chart Export
The system generates deterministic note drafts from engine output and case data using `Note Templates` and a `Note Generator Service`. These drafts can be previewed, edited, and saved via dedicated API routes and frontend components.

### Patient Intake Chat (Web)
Browser-based conversational intake flow at `/chat-intake`:
- **Chat Engine Adapter** (`server/services/chatEngineAdapter.ts`): Translates `CaseRecord` → `CaseState`, calls `runGenericComplaintV1`, maps `GraphResult` → `CaseEngineResult`. Uses `chatQuestionPlanner.ts` for next-question selection from real complaint config and `chatAnswerNormalizer.ts` for canonical answer normalization ("yes"/"no"/numbers). Types in `server/types/chatEngine.ts`.
- **Chat Session Service** (`server/services/chatSessionService.ts`): In-memory session management with Firestore persistence. Creates cases, asks questions from real complaint config, normalizes and records answers, runs engine via adapter after each answer, persists unanswered critical questions, transitions to AWAITING_REVIEW on completion.
- **Chat Intake Routes** (`server/routes/chatIntake.ts`): REST endpoints at `/api/chatIntake` — POST start, GET session, POST `/session/:id/answer`, GET case.
- **Frontend**: `PatientIntakeChat.tsx` page, `ChatMessageList.tsx`, `AnswerInput.tsx` components.

### eCW Sidecar Export
Generates encounter export bundles for manual/sidecar eCW transfer:
- **Export Templates** (`server/templates/ecwExportTemplates.ts`): Builds structured text and JSON export bundles from case data, engine output, signoff, and note draft.
- **Export Service** (`server/services/ecwSidecarExport.ts`): Assembles export payload from case + signoffs, writes `.txt` + `.json` to `data/exports/ecw_sidecar/`, marks case as exported, logs audit event + runtime metric.
- **Export Routes** (`server/routes/exportEncounter.ts`): REST endpoints at `/api/exportEncounter` — GET status, POST export (blocks if signoff required but not approved).
- **Export Panel** (`client/src/components/ExportPanel.tsx`): Shows export status, signoff gate, export button with loading/success/error states.

### Discrepancy Tracking
Detects and surfaces disagreements between engine recommendations and physician signoffs:
- **Discrepancy Service** (`server/services/discrepancyService.ts`): Compares engine output vs physician signoff to detect disposition mismatches, Dx top mismatches, red flag overrides, and more-info requests. Provides case timeline (events + signoffs) and lists recent discrepancies.
- **Discrepancy Routes** (`server/routes/discrepancies.ts`): REST endpoints at `/api/discrepancies` — GET list, GET per-case, GET timeline.
- **Frontend**: `Discrepancies.tsx` page at `/discrepancies`, `DiscrepancyBadge.tsx` (typed badge component), `CaseTimeline.tsx` (event + signoff timeline).

### Runtime Analytics Dashboard
Runtime analytics service (`server/services/runtimeAnalyticsService.ts`) aggregates complaint volume, disposition distribution, signoff/override rates, and disagreements from Firestore data. Routes at `/api/runtimeAnalytics` (dashboard, complaint detail) protected by role auth. Frontend at `/runtime-analytics` with summary cards, complaint bar chart (Recharts), disposition pie chart, and top disagreement table.

### Shadow Mode Ops
Central shadow-mode config (`server/config/shadowMode.ts`) controls rollout behavior (enabled, signoff-gating, export gates, logging flags). Shadow-mode event logger (`server/services/shadowModeLogger.ts`) writes operational events to CSV at `data/complaints/runtime/shadow_mode_ops.csv`. Events logged on signoff completion and export creation. Frontend ops page at `/shadow-mode-ops` shows config status, analytics summary, operational checklist, and navigation links. Operational docs in `docs/` (SHADOW_MODE_RUNBOOK.md, SIGNOFF_POLICY.md, EXPORT_WORKFLOW.md).

### Operational Intelligence & Tooling
Operational intelligence features include a case analytics log and a cluster coverage heatmap. Tooling for profile quality includes a coverage report, profile pack linter, and question coverage analysis.

### Guideline-to-Engine Toolchain
A 6-step toolchain compiles raw clinical guideline text into engine-ready CSV rows. This includes compilers for various input formats (text, flowchart, ASCII tree), normalizers, emitters, harmonizers, reviewers, and mergers, supported by tools for token alias suggestions and conflict learning.

### Operational Intelligence & Self-Improving Loop
A suite of scripts provides engine visibility and automatic quality control, including engine coverage audits, dead cluster classification, rule contradiction detection, and auto-generation of missing tests. Runtime audit logging and various reports (e.g., priority refinement, phase readiness, close-the-loop) enhance operational intelligence.

### Patient Disposition Explanation (F1/F2)
Patient-facing disposition explanation service (`server/services/chatDispositionExplainer.ts`) builds urgency-tagged explanations from case data. Route at `/api/chatDispositionExplanation/:caseId`. Frontend `PatientStatusBanner.tsx` component shows headline/body with urgency-based color coding (red/amber/green).

### Coercion Audit (F3/F4)
Answer normalization audit logging in `chatAnswerNormalizer.ts` — every answer normalization writes raw→parsed mapping with confidence (high/medium/low) to `data/complaints/runtime/chat_answer_coercion_audit.csv`. Route at `/api/chatCoercionAudit` (GET, filterable by confidence). Frontend page at `/coercion-audit` with `CoercionAudit.tsx`.

### Follow-up Bundles (G1/G2/G3)
Follow-up bundle builder (`server/services/chatFollowupBundleBuilder.ts`) with supporting services: `chatCriticalQuestionDetector.ts` (red-flag-driven critical question detection), `chatQuestionPriorityRanker.ts` (priority scoring for unanswered questions), `chatQuestionTextResolver.ts` (question text resolution). Route at `/api/chatFollowupBundle/:caseId`. Frontend `FollowupBundleCard.tsx` component.

### Review Queue V2 with Snapshots (H1/H2/H3)
Case snapshot builder (`server/services/chatCaseSnapshotBuilder.ts`) produces lightweight case summaries. Review queue snapshot service (`server/services/reviewQueueSnapshotService.ts`) lists queue with snapshots. Route at `/api/reviewQueueSnapshots`. Frontend `CaseSnapshotCard.tsx` component and `ReviewQueueV2.tsx` page at `/review-queue-v2`.

### Export Safety Layer (I)
Pre-export readiness checker (`server/services/caseExportReadinessChecker.ts`) validates signoff, note draft, disposition, critical questions, red flags, and prior export state. Route at `/api/exportReadiness/:caseId`. Frontend `ExportReadinessPanel.tsx` component.

### Physician Override Intelligence (J)
Override pattern analyzer (`server/services/overridePatternAnalyzer.ts`) surfaces override patterns by complaint. Route at `/api/overridePatterns`. Frontend page at `/override-patterns`.

### Question Gap Analyzer (K)
Question gap analyzer (`server/services/questionGapAnalyzer.ts`) shows commonly missing clinically important questions. Route at `/api/questionGaps`. Frontend page at `/question-gaps`.

### Ops Daily Digest (L)
Daily digest builder (`server/services/opsDailyDigestBuilder.ts`) produces operational summaries. Route at `/api/opsDailyDigest`. Frontend page at `/ops-daily-digest`.

### Clinical Workflow Health (M)
Workflow health service (`server/services/clinicalWorkflowHealthService.ts`) computes health score from discrepancies, queue depth, export readiness, red flag coverage. Route at `/api/clinicalWorkflowHealth`. Frontend page at `/clinical-workflow-health`.

### Case Ops Actions (N)
Case ops action service (`server/services/caseOpsActionService.ts`) supports assign reviewer, request more info, escalate, and close case. Route at `/api/caseOpsActions/:caseId/:action`. Frontend `CaseOpsActions.tsx` component.

### Validation and Testing
The system includes various testing harnesses (Stress Test, Complaint Golden Test, Replay), a Data Corruption Guard, a Release Candidate system, Cross-Complaint Goldens, a Bundle ABI Validator, and an 8-gate Prod Pipeline for pre-deployment validation.

## External Dependencies

-   **AI Integration**: OpenAI API.
-   **Messaging Integration**: Twilio for WhatsApp, Telegram Bot API for Telegram.
-   **Database**: Firebase Firestore.
-   **Data Configuration**: Google Sheets.
-   **Cloud Storage**: Firebase Storage.