# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that leverages WhatsApp for initial patient assessments of flu-like symptoms. It collects symptoms and medical history, then uses AI to generate proposed diagnoses and treatment plans for physician review. The system automates communication of approved dispositions and orders back to patients. Its purpose is to enhance efficiency in flu-like consultations, reduce physician workload, and improve patient access to healthcare.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system utilizes a constrained agent architecture for deterministic medical triage, incorporating a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. A multi-system triage pipeline employs canonical keys and a unified sheets registry for data configuration, question queue building, and generating confidence-scored diagnostic candidates. A clinical state builder deterministically assembles an auditable clinical state from various data sources. A modular, skill-based orchestration layer handles clinical triage.

### Frontend
The frontend is built with React 18 and TypeScript, using `shadcn/ui` with Tailwind CSS. It provides physician login, patient intake, case status, visit summaries, and a physician dashboard.

### Backend
The backend runs on Express 5 with Node.js and TypeScript, offering REST API endpoints. It includes functionalities such as Centor score calculation, red flag detection, and a supervisor gate for patient-facing outputs. LLM integrations feature rate limiting, per-run budgets, and a circuit breaker.

### Data Management
Firebase Firestore serves as the primary data storage, complemented by SQLite for intake storage abstraction. Schemas are defined for physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies involve splitting storage for clinical records and debug telemetry.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification. A JWT-based role authentication layer supports roles like admin, physician, staff, and patient.

### Agent System Features
The agent system orchestrates patient flow through routing states using a pipeline orchestrator. It supports LLM-powered actions, prompt template versioning, and LLM A/B testing with guardrails.

### Generic Complaint Engine (GENERIC_V1)
This data-driven engine replaces per-complaint TypeScript scoring modules with CSV-configured rules, allowing new complaints to be added without code changes.

### Clinical Scoring Systems
Data-driven clinical scoring systems (e.g., PERC, WELLS_PE, CENTOR) are configured via CSV and computed automatically. A consistency engine, defined by `CONSISTENCY_RULES.csv`, provides a safety-net for dangerous symptom combinations.

### Advanced Triage Logic
The system supports subtype expansions for improved diagnostic granularity and cross-complaint boosts to adjust cluster scores based on multi-system clinical patterns. It also includes an engine to generate ranked diagnostic candidates.

### Case Management
A Firestore-backed case lifecycle manages cases through a state machine (DRAFT → TRIAGED → NEEDS_REVIEW → APPROVED → SENT → CLOSED), providing CRUD services and authentication for review.

### Physician Review & Signoff System
This system facilitates physician review with services for managing the review queue, assigning reviewers, and orchestrating signoffs.

### Note Generation & Chart Export
The system generates deterministic note drafts from engine output and case data using `Note Templates` and a `Note Generator Service`.

### Patient Intake Chat (Web)
A browser-based conversational intake flow handles patient interactions, mapping patient responses to clinical states and running the generic complaint engine.

### eCW Sidecar Export
Generates encounter export bundles for manual/sidecar eCW transfer.

### Discrepancy Tracking
Detects and surfaces disagreements between engine recommendations and physician signoffs.

### Runtime Analytics Dashboard
A runtime analytics service aggregates complaint volume, disposition distribution, signoff/override rates, and disagreements from Firestore data for display on a dashboard.

### Shadow Mode Operations
A central shadow-mode configuration controls rollout behavior, enabling the logging of operational events for analysis.

### Operational Intelligence & Tooling
Includes features like case analytics logs, cluster coverage heatmaps, engine coverage audits, and rule contradiction detection.

### Guideline-to-Engine Toolchain
A 6-step toolchain compiles raw clinical guideline text into engine-ready CSV rows.

### Patient Disposition Explanation
A patient-facing disposition explanation service builds urgency-tagged explanations from case data for patient communication.

### Synthetic Testing System
A system for synthetic case generation across all complaints, using the GENERIC_V1 engine. It validates engine output against expected results and persists per-run statistics.

### Validation Sprint Tooling
Includes a Synthetic Testing UI, Mismatch Dashboard, Gold Review Workbench, Rule Suggestions, and a Complaint Control Center for managing and analyzing validation efforts.

### Navigation & Authentication
Features a unified login page and an Admin Sidebar with categorized, authentication-gated navigation for various administrative and physician functionalities.

### Decision Graph Visualization
Tools for building and visualizing decision graphs, case trace graphs, graph differences, and heatmaps.

### Validation and Testing
Comprises various testing harnesses (Stress Test, Complaint Golden Test, Replay), a Data Corruption Guard, a Release Candidate system, Cross-Complaint Goldens, a Bundle ABI Validator, and an 8-gate Prod Pipeline for pre-deployment validation.

### Medication Safety Layer
A comprehensive medication safety layer with a patient constraint engine, drug interaction checker, and dose adjusters for renal/hepatic impairment, QT risk, and pregnancy.

### Notification Workflow
A notification service and escalation router for managing and delivering alerts.

### Audit & Compliance
Services for access logs and audit reports ensure system compliance.

### Messaging Orchestrator
A channel orchestrator and message routing service for managing communication across platforms.

### Production Resilience
Includes a healthcheck service and a job runner for maintaining system stability.

### Clinical Skill Layer (18/18 real — zero placeholders)
- **Orchestrator**: `server/orchestrator/clinicalSkillOrchestrator.ts` — sequential 18-skill pipeline with context threading
- **Negation engine**: `server/skills/shared/negationHelper.ts` — clause-level negation with conjunction boundaries
- **Complaint alias registry**: `server/skills/shared/complaintAliasRegistry.ts` — canonical complaint families (sore_throat, cough, uti, etc.) with alias resolution
- **Expression evaluator**: `server/skills/shared/expressionEvaluator.ts` — safe evaluator for sheet expressions (`answers.Q_*`, `redFlagGate.*`, `scores.*`)
- **Synthetic answer bridge**: `server/skills/shared/syntheticAnswerBridge.ts` — converts structured facts into `answers.Q_*` keys for expression rules, supports tri-state (yes/no/unknown)
- **Intake**: `collectModifiers`, `extractMedToConditionTriggers`, `identifyChiefComplaint`, `normalizePatientStory`
- **Safety**: `detectRedFlags` (expression-backed with CSV fallback), `determineDisposition` (expression-backed with redFlagGate + scores injection)
- **Questions**: `runComplaintQuestionBundle`, `triggerGlobalSecondaryQuestions`, `selectNextBestQuestion`
- **Reasoning**: `scoreDifferentialClusters` (expression-backed via shared evaluator), `applyClinicalScore` (Centor/CURB-65), `generateDifferential`
- **Audit**: `checkConsistencyAndGaps`
- **Output**: `generateEmergencyWarning`, `generateAssessmentPlan`, `generatePhysicianReviewPacket`
- **Analytics**: `measureWorkflowValue`
- **Outcomes**: `attachOutcomeStub`, `recordCaseOutcome`, `linkFollowUpResult`, `reconcilePredictedVsActual`
- **Golden case harness**: `server/testing/goldenCaseRunner.ts` + `goldenCaseComparator.ts` + `goldenCaseImporter.ts` + `goldenCaseSummary.ts` + `goldenCases.sample.json` (7 cases) + `goldenCases.template.csv` (spreadsheet-friendly authoring)
- **Golden case review workflow**: `goldenCaseReviewExporter.ts` (exports review worksheet CSV with actual vs expected + pass/fail + failure tags) + `goldenCaseReviewImporter.ts` (imports reviewer overrides/notes) + `goldenCaseFailureTagger.ts` (categorizes failures: wrong_complaint, wrong_disposition, wrong_score, missed_red_flag, wrong_differential, missed_affirmed_symptom, missed_negated_symptom)
- **Outcome data files**: `server/data/runtime/case_outcomes.ndjson`, `case_followups.ndjson`, `case_reconciliation.ndjson`

### Workflow Embedding (API Layer)
- **Skill layer API**: `server/routes/skillLayerRoutes.ts` — POST endpoints: `/api/skill-layer/run`, `/chart-note`, `/discharge`, `/audit-trace`, `/callback-queue`
- **Chart note builder**: `server/services/chartNoteBuilder.ts` — builds HPI/assessment/plan/redFlags/disposition blocks from skill outputs
- **Discharge instruction builder**: `server/services/dischargeInstructionBuilder.ts` — builds summary/homeCare/followUp/returnPrecautions blocks
- **Callback queue service**: `server/services/callbackQueueService.ts` — enqueues follow-up callbacks to `callback_queue.ndjson`
- **Audit trace service**: `server/services/auditTraceService.ts` — builds per-skill audit trace from orchestrator state

### Analytics & Economics
- **Skill layer analytics**: `server/analytics/skillLayerAnalytics.ts` — aggregates skill run counts, latency, disposition distribution, safety misses
- **Dashboard summary**: `server/analytics/skillLayerDashboardSummary.ts` — CLI printout of analytics (`npx tsx server/analytics/skillLayerDashboardSummary.ts`)

### Multi-Site Configuration
- **Site config registry**: `server/config/siteConfigRegistry.ts` — per-site enabled complaints and modules
- **Module toggle registry**: `server/config/moduleToggleRegistry.ts` — module enable/disable toggles

### Learning Loop
- **Question value learner**: `server/learning/questionValueLearner.ts` — ranks high-yield questions from skill run logs
- **Rule drift reporter**: `server/learning/ruleDriftReporter.ts` — detects prediction/disposition mismatches from reconciliation data

## External Dependencies

-   **AI Integration**: OpenAI API
-   **Messaging Integration**: Twilio for WhatsApp
-   **Database**: Firebase Firestore
-   **Data Configuration**: Google Sheets
-   **Cloud Storage**: Firebase Storage