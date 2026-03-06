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
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification.

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
- **Chat Session Service** (`server/services/chatSessionService.ts`): In-memory session management with Firestore persistence. Creates cases, asks questions, records answers, re-runs engine after each answer, transitions to AWAITING_REVIEW on completion. Engine adapter (`runEngineForChat`) is isolated for easy wiring.
- **Chat Intake Routes** (`server/routes/chatIntake.ts`): REST endpoints at `/api/chatIntake` — POST start, GET session, POST answer, GET case.
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

### Operational Intelligence & Tooling
Operational intelligence features include a case analytics log and a cluster coverage heatmap. Tooling for profile quality includes a coverage report, profile pack linter, and question coverage analysis.

### Guideline-to-Engine Toolchain
A 6-step toolchain compiles raw clinical guideline text into engine-ready CSV rows. This includes compilers for various input formats (text, flowchart, ASCII tree), normalizers, emitters, harmonizers, reviewers, and mergers, supported by tools for token alias suggestions and conflict learning.

### Operational Intelligence & Self-Improving Loop
A suite of scripts provides engine visibility and automatic quality control, including engine coverage audits, dead cluster classification, rule contradiction detection, and auto-generation of missing tests. Runtime audit logging and various reports (e.g., priority refinement, phase readiness, close-the-loop) enhance operational intelligence.

### Validation and Testing
The system includes various testing harnesses (Stress Test, Complaint Golden Test, Replay), a Data Corruption Guard, a Release Candidate system, Cross-Complaint Goldens, a Bundle ABI Validator, and an 8-gate Prod Pipeline for pre-deployment validation.

## External Dependencies

-   **AI Integration**: OpenAI API.
-   **Messaging Integration**: Twilio for WhatsApp, Telegram Bot API for Telegram.
-   **Database**: Firebase Firestore.
-   **Data Configuration**: Google Sheets.
-   **Cloud Storage**: Firebase Storage.