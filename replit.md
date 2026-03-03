# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform designed to streamline initial patient assessments for flu-like symptoms. It leverages WhatsApp to conduct an ENT Flu questionnaire, gather symptoms and medical history, and then uses AI to generate proposed diagnoses and treatment plans. These plans are presented to physicians for review and approval, and the system automates the communication of approved dispositions and orders back to patients via WhatsApp. The project's vision is to enhance efficiency in managing flu-like consultations, reduce physician workload, and improve patient access to healthcare by integrating AI for initial assessments and automating communication workflows.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18 and TypeScript, using `shadcn/ui` (Radix UI based) with Tailwind CSS. It supports physician login, patient intake, case status views, a signed visit summary, a physician dashboard, and a Trace Viewer.

### Backend
The backend is an Express 5 application on Node.js with TypeScript, providing REST API endpoints. It implements a constrained agent architecture for deterministic medical triage, featuring a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. Key functionalities include Centor score calculation, red flag detection, and a supervisor gate for patient-facing outputs. LLM integrations use Replit AI Integrations (OpenAI-compatible) with `gpt-5-mini`, incorporating rate limiting, per-run budgets, and a circuit breaker.

### Data Storage
Primary data storage utilizes Firebase Firestore. SQLite is used as an abstraction for intake storage. Schemas are defined for physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies involve splitting storage for clinical records and debug telemetry.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification.

### Agent System
The agent system orchestrates patient flow through various routing states using `AgentAction` types. A pipeline orchestrator manages complaint routing, FHIR prefill, modifiers, rules evaluation, question queue generation, and a supervisor gate. It incorporates LLM-powered actions such as `REFRAME_QUESTION` and `DRAFT_SUMMARY`, supports prompt template versioning, and allows for LLM A/B testing with guardrails.

### Generic Complaint Engine (GENERIC_V1)
A data-driven engine (`server/engines/genericComplaintEngineV1.ts`) that replaces per-complaint TypeScript scoring modules with CSV-driven rules. Adding a new complaint requires only CSV rows + golden tests — zero new TypeScript code.

**Architecture:**
- `COMPLAINT_REGISTRY.csv` `ENGINE_TYPE` column routes complaints: `GENERIC_V1` → generic engine, `LEGACY` → hardcoded graph
- `CLUSTER_SCORING_RULES.csv` (675 rows) defines cluster scoring: `CC_ID,CLUSTER_ID,RULE_ID,POINTS,WHEN_EXPR,EVIDENCE_LABEL`
- Expression evaluator (`server/services/exprEval.ts`) evaluates `WHEN_EXPR` against `CaseState` (supports `answers.*`, `scores.*`, `demographics.*`, `&&`, `||`, `==`, `!=`, `>=`, `in`, etc.)

**Pipeline steps in `runGenericComplaintV1()`:**
1. `loadComplaintConfig(ccId)` → loads all rules from CSV
2. Core questions evaluation (blocks only on `REQUIRED=TRUE`)
3. `computeScoresFromRules()` → cluster scores + ranked clusters + evidence
4. `evalRedFlagsGeneric()` → gate result (PASS/ESCALATE/ER_SEND) + triggered flags
5. Scoring systems computation (B1, optional)
6. `evalDispositionGeneric()` → disposition level + template
7. Confidence scoring + output template rendering + trace assembly

**Adding a new complaint:** `npx tsx scripts/new_complaint_kit.ts <cc_id> <system> <label>` scaffolds all CSV rows + golden test stubs.

Currently 72+ complaints on GENERIC_V1 with 1247 golden tests passing.

### Multi-System Triage Pipeline
A robust triage pipeline uses canonical keys for medical systems, chief complaints, and clusters. A unified sheets registry, loaded from Google Sheets, dynamically configures data for complaint routing, integration maps, FHIR prefill, modifiers, and rules engines. It dynamically builds question queues, uses an enhanced supervisor for red flags and triage upgrades, resolves dispositions, and provides confidence-scored diagnostic candidates and medication suggestions with safety checks. A secondary ObesityAgent can run in parallel, extending `CaseState` with metabolic, DM, HTN, bariatric, GLP-1, and social details, and supporting specific interventions.

### Clinical State Builder System
This system deterministically assembles an auditable clinical state from multiple data tables, capturing evidence traces. It integrates `buildClinicalState()`, `evaluateRedFlagsMaster()`, and `selectSpotInterventions()`. It orchestrates parallel execution of red flag evaluation, urgent care spot interventions, the obesity agent, confidence scoring, care gap evaluation, and the education sandbox, with a priority merge order and ER_SEND short-circuiting. It computes confidence for inferred conditions and evaluates care gaps. A `runRedFlagAudit()` validates RF references.

### Case Management & Physician Review
A Firestore-backed case lifecycle manages cases through a state machine (DRAFT → TRIAGED → NEEDS_REVIEW → APPROVED → SENT → CLOSED). This includes services for CRUD operations on cases, wiring the triage engine, hashing for deduplication, and authentication for review. The frontend provides a physician review queue and detailed case review interfaces.

### Scoring Systems (B1)
Data-driven clinical scoring systems computed from `server/data/csv/SCORING_SYSTEMS.csv`. Currently supports 5 validated instruments:
- **PERC** (8 criteria, pass/fail) — PE rule-out for `pulm_shortness_of_breath`
- **WELLS_PE** (7 criteria, pe_unlikely/intermediate/pe_likely) — Wells score for PE
- **CENTOR** (7 criteria, low/moderate/high) — Centor/McIsaac strep score for `ent_sore_throat`
- **CURB-65** (5 criteria, low/moderate/high) — Pneumonia severity for `pulm_cough`
- **HEART** (10 criteria, low/moderate/high) — Chest pain risk for `cardio_chest_pain`

Engine: `server/engines/scoringSystemsEngine.ts` → `computeScoringSystems(complaintSlug, state)`. Called automatically by `runGenericComplaintV1` after cluster scoring. Results stored in `CaseState.scoringSystems[]` and individual scores in `CaseState.scores` (e.g., `perc_score`, `wells_pe_score`).

Scoring questions use `REQUIRED=FALSE` in CORE_QUESTIONS.csv (category `scoring`, ASK_ORDER 110+). The engine only blocks on required questions, so scoring questions are optional — computed when answers are present, skipped gracefully when absent.

Tests: `npx tsx scripts/test-scoring.ts` (9 golden scenarios).

### Consistency Engine (B2)
A safety-net layer that catches dangerous symptom combinations the main triage might miss. Rules defined in `server/data/csv/CONSISTENCY_RULES.csv` with 11 rules covering anaphylaxis, GI bleed, syncope, chest pain+SOB, ectopic pregnancy, immunocompromised fever, sepsis/AMS, CO poisoning, testicular torsion, low confidence, and scoring ties.

Engine: `server/engines/consistencyEngine.ts` → `computeConsistencyFlags()`. Wired into `server/services/triageService.ts` after triage completes. Actions:
- **FORCE_EMERG**: Overrides disposition to `er_send`
- **NEEDS_REVIEW**: Forces case to `NEEDS_REVIEW` state for physician review
- **FLAG_ONLY**: Advisory flag, no automatic action

Results stored in `CaseTriage.consistencyFlags[]` (type `ConsistencyFlag` in `server/models/caseTypes.ts`). The triage route (`cases.routes.ts`) considers consistency flags in the `needsReview` decision.

Tests: `npx tsx scripts/test-consistency.ts` (10 golden scenarios in `server/data/csv/CONSISTENCY_GOLDENS.jsonl`).

### Validation and Testing
The system includes several validation tools:
-   **Stress Test Harness**: For performance and stability testing.
-   **Complaint Golden Test Harness**: For deterministic testing of complaint pipelines.
-   **Data Corruption Guard**: Validates core configuration data (including SCORING_SYSTEMS.csv and CONSISTENCY_RULES.csv validation).
-   **Replay Harness**: For reproducible debugging of stored cases.
-   **Release Candidate (RC) System**: Ensures consistent agent behavior through automated regression testing across LLM variants.
-   **Gate-Prod Pipeline**: A comprehensive pre-deployment validation pipeline (5 steps: corruption → harness → consistency_goldens → stress → drift).
-   **Scoring Systems Tests**: 9 golden scenarios validating all 5 scoring instruments (`scripts/test-scoring.ts`).
-   **Consistency Tests**: 10 golden scenarios validating all consistency rules (`scripts/test-consistency.ts`).

## External Dependencies

-   **AI Integration**: OpenAI API (via Replit AI Integrations).
-   **Messaging Integration**: Twilio for WhatsApp, Telegram Bot API for Telegram.
-   **Database**: Firebase Firestore.
-   **Data Configuration**: Google Sheets.
-   **Cloud Storage**: Firebase Storage.