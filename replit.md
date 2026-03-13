# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform leveraging WhatsApp for initial patient assessments of flu-like symptoms. It collects symptoms and medical history, utilizes AI for proposed diagnoses and treatment plans for physician review, and automates communication of approved dispositions and orders to patients. The system aims to enhance efficiency in flu-like consultations, reduce physician workload, and improve patient access to healthcare.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system employs a constrained agent architecture for deterministic medical triage, featuring a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. A multi-system triage pipeline uses canonical keys and a unified sheets registry for data configuration and diagnostic candidate generation. A clinical state builder deterministically assembles an auditable clinical state, and a modular, skill-based orchestration layer handles clinical triage.

### Frontend
Built with React 18 and TypeScript, using `shadcn/ui` with Tailwind CSS, the frontend supports physician login, patient intake, case status, visit summaries, and a physician dashboard.

### Backend
The backend runs on Express 5 with Node.js and TypeScript, providing REST API endpoints. It includes Centor score calculation, red flag detection, and a supervisor gate for patient-facing outputs. LLM integrations feature rate limiting, per-run budgets, and a circuit breaker.

### Data Management
Firebase Firestore serves as the primary data storage, supplemented by SQLite for intake storage. Schemas define physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies enforce split storage for clinical records and debug telemetry.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification. A JWT-based role authentication layer supports admin, physician, staff, and patient roles.

### Agent System Features
The agent system orchestrates patient flow through routing states using a pipeline orchestrator. It supports LLM-powered actions, prompt template versioning, and LLM A/B testing with guardrails.

### Skill Layer 2.0 (Platform Layer)
This production platform layer wraps the clinical skill engine, managing tenant-specific configurations, release gates, deployment readiness checks, and a unified review queue. It also provides an admin REST API for platform operations and a system for hardening complaints based on prediction/disposition failures. Graph trace logging and golden case comparisons are integral for validation.

Key services: `deploymentReadinessService`, `releaseGateService`, `reviewQueueService`, `tenantCaseStore`, `complaintHardeningQueue`, `adminOpsRoutes`. Graph trace logging to `graph_trace_log.ndjson` (243 entries). 7/7 graph golden cases validated.

### Skill Layer 2.1 — Platform Admin Console
Adds the operational admin cockpit at `/skill-layer-admin`:
- **`compareDiffStore.ts`** — persists compare-mode diffs to `compare_mode_diffs.ndjson`; reads back last N reversed
- **`graphMetricsService.ts`** — aggregates node/edge stats from `graph_trace_log.ndjson`
- **`platformMetricsRoutes.ts`** — `GET /api/platform/graph-metrics`, `GET /api/platform/compare-diffs`
- Orchestrator updated to persist compare-mode diffs instead of console.log only
- Frontend cards: `DeploymentReadinessCard`, `ReleaseGateCard`, `ReviewQueueCard`, `TenantCasesCard`, `CompareDiffsCard`, `GraphMetricsCard`
- Admin page: `SkillLayerAdminPage.tsx` at `/skill-layer-admin` (Settings icon in sidebar)

### Skill Layer 2.2 — Active Control Plane
Makes the platform actively steerable (not just observable). Services at `server/platform/`:
- **`rolloutManagerService.ts`** — `getRolloutModes(siteId)` merges base config + `rollout_overrides.json`; `setRolloutMode({complaint, mode})` persists overrides
- **`ruleGovernanceEditorService.ts`** — CRUD for `rule_governance_metadata.json`: owner, status, lastReviewedAt, linkedComplaints, notes; seeded for RED_FLAG_RULES.csv and DISPOSITION_RULES.csv
- **`compareDiffExplorerService.ts`** — filters diffs by complaint substring, sameDisposition, sameComplaint
- Routes: `GET/POST /api/platform/rollout-modes`, `GET/POST /api/platform/rule-governance-metadata`, `GET /api/platform/compare-diff-explorer`
- Frontend cards: `ComplaintRolloutManagerCard` (live per-complaint dropdowns), `RuleGovernanceEditorCard` (owner/status/notes form), `CompareDiffExplorerCard` (3-filter search)
- Admin page at `/skill-layer-admin` now shows all 9 cards in a 2-col grid + full-width diff explorer

### Skill Layer 2.3 — Hardening & Learning Automation
Converts failures into improvement actions automatically:
- **`complaintHardeningQueue.ts`** — builds priority queue from reconciliation failures; persisted to `complaint_hardening_queue.json`
- **`goldenCaseAutoGenerator.ts`** — auto-generates golden test cases from reconciliation failures; saved to `goldenCases.generated.json`
- **`releaseGateHistoryStore.ts`** — persists every gate evaluation to `release_gate_history.ndjson`; updated `releaseGateService` to log history after each evaluation
- **`ruleGovernanceEditorService`** — now annotates rules with `isStale`, `daysSinceReview`, `staleWarning` (30-day threshold)
- New routes: `GET /api/platform/hardening-queue`, `GET /api/platform/release-gate-history`, `GET /api/platform/rule-governance-metadata/stale`, `POST /api/skill-layer/learning/generate-golden-cases`, `GET /api/skill-layer/learning/generated-golden-cases`
- Frontend cards: `ComplaintHardeningQueueCard`, `GoldenCaseAutoGeneratorCard`, `ReleaseGateHistoryCard`, `RuleSuggestionCard`
- Admin page at `/skill-layer-admin` has 3 tabbed sections: 2.0–2.2 Core, 2.3 Hardening, 2.4–2.6 Intelligence

### Skill Layer 2.4–2.6 — Intelligence Layer
- **`explainabilityScorer.ts`** — computes 0–100 case explainability score from: avg confidence, reasoning coverage, skill depth, graph path length
- **`failureDrivenRuleSuggester.ts`** — generates structured rule suggestions (IF/THEN format) from reconciliation mismatches; groups by complaint + failure type
- New routes: `GET /api/skill-layer/learning/rule-suggestions`, `GET /api/skill-layer/learning/explainability`, `GET /api/skill-layer/learning/explainability/:caseId`
- Frontend cards: `ExplainabilityScoreCard` (batch scoring with level distribution), `GraphEdgeGuardCard` (edge traversal + node latency visualizer)

### Skill Layer 2.7 — Clinical API (EHR Readiness)
FHIR-lite structured output endpoints:
- `POST /api/clinical/triage` — full triage result in FHIR-lite format
- `POST /api/clinical/differential` — differential diagnosis only
- `POST /api/clinical/documentation` — HPI + Assessment + Plan + Discharge
- `POST /api/clinical/care-plan` — structured care plan

### Skill Layer 2.8 — Site Management
- `/site-management` page — shows per-complaint rollout modes, site configuration (maxCost, goldenThreshold, modules), per-site mode override UI
- Clinical API reference panel with example request bodies

### Telemedicine Visit Copilot
Real-time clinical reasoning assistant at `/telemedicine`:
- 9-complaint button grid, quick symptom checklist, free-text patient input
- Voice input via Web Speech API (microphone button toggles continuous dictation)
- Runs 18-skill clinical pipeline: red flags, differential, next questions, chart note, discharge
- Auto-generated chart note with copy-to-clipboard

### Generic Complaint Engine (GENERIC_V1)
This data-driven engine allows new complaints to be added without code changes by using CSV-configured rules, replacing TypeScript scoring modules.

### Clinical Scoring Systems
Data-driven clinical scoring systems (e.g., PERC, WELLS_PE, CENTOR) are configured via CSV, with a consistency engine providing a safety net for dangerous symptom combinations.

### Advanced Triage Logic
The system supports subtype expansions, cross-complaint boosts, and an engine to generate ranked diagnostic candidates.

### Case Management
A Firestore-backed state machine manages the case lifecycle (DRAFT → TRIAGED → NEEDS_REVIEW → APPROVED → SENT → CLOSED), offering CRUD services and authentication for review.

### Physician Review & Signoff System
Facilitates physician review, managing the review queue, assigning reviewers, and orchestrating signoffs.

### Note Generation & Chart Export
Generates deterministic note drafts from engine output and case data using templates and a dedicated service.

### Patient Intake Chat (Web)
A browser-based conversational intake flow maps patient responses to clinical states and runs the generic complaint engine.

### Operational Intelligence & Tooling
Includes case analytics logs, cluster coverage heatmaps, engine coverage audits, rule contradiction detection, and a toolchain to compile clinical guidelines into engine-ready CSVs.

### Synthetic Testing System
Generates synthetic cases across all complaints using the GENERIC_V1 engine, validating output against expected results and persisting statistics.

### Validation Sprint Tooling
Comprises a Synthetic Testing UI, Mismatch Dashboard, Gold Review Workbench, Rule Suggestions, and a Complaint Control Center for managing validation efforts.

### Decision Graph Visualization
Tools for building and visualizing decision graphs, case trace graphs, graph differences, and heatmaps.

### Validation and Testing
Includes various testing harnesses (Stress Test, Complaint Golden Test, Replay), a Data Corruption Guard, a Release Candidate system, Cross-Complaint Goldens, a Bundle ABI Validator, and an 8-gate Prod Pipeline for pre-deployment validation.

### Medication Safety Layer
A comprehensive medication safety layer includes a patient constraint engine, drug interaction checker, and dose adjusters for renal/hepatic impairment, QT risk, and pregnancy.

### Notification Workflow
A notification service and escalation router manage and deliver alerts.

### Audit & Compliance
Services for access logs and audit reports ensure system compliance.

### Medical Reasoning Graph (Graph-Mode Orchestration)
A graph runner traverses an edge graph, guarded and scored by cost/priority. Nodes and edges are registered, and policies apply cost-aware decision-making for skill selection. The orchestrator supports both sequential and graph-based modes, with auto-fallback.

### Cost Tracking & Skill Economics
A skill cost tracker estimates and attaches cost metadata to audit logs. Analytics aggregate cost and latency by complaint family.

### Extended Learning Loop
Features a question reprioritizer, complaint drift alerts, and a tuning suggestion engine to generate actionable suggestions for improving the system based on outcomes.

## External Dependencies

-   **AI Integration**: OpenAI API
-   **Messaging Integration**: Twilio for WhatsApp
-   **Database**: Firebase Firestore
-   **Data Configuration**: Google Sheets
-   **Cloud Storage**: Firebase Storage