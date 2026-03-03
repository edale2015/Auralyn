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

### Multi-System Triage Pipeline
A robust triage pipeline uses canonical keys for medical systems, chief complaints, and clusters. A unified sheets registry, loaded from Google Sheets, dynamically configures data for complaint routing, integration maps, FHIR prefill, modifiers, and rules engines. It dynamically builds question queues, uses an enhanced supervisor for red flags and triage upgrades, resolves dispositions, and provides confidence-scored diagnostic candidates and medication suggestions with safety checks. A secondary ObesityAgent can run in parallel, extending `CaseState` with metabolic, DM, HTN, bariatric, GLP-1, and social details, and supporting specific interventions.

### Clinical State Builder System
This system deterministically assembles an auditable clinical state from multiple data tables, capturing evidence traces. It integrates `buildClinicalState()`, `evaluateRedFlagsMaster()`, and `selectSpotInterventions()`. It orchestrates parallel execution of red flag evaluation, urgent care spot interventions, the obesity agent, confidence scoring, care gap evaluation, and the education sandbox, with a priority merge order and ER_SEND short-circuiting. It computes confidence for inferred conditions and evaluates care gaps. A `runRedFlagAudit()` validates RF references.

### Case Management & Physician Review
A Firestore-backed case lifecycle manages cases through a state machine (DRAFT → TRIAGED → NEEDS_REVIEW → APPROVED → SENT → CLOSED). This includes services for CRUD operations on cases, wiring the triage engine, hashing for deduplication, and authentication for review. The frontend provides a physician review queue and detailed case review interfaces.

### Validation and Testing
The system includes several validation tools:
-   **Stress Test Harness**: For performance and stability testing.
-   **Complaint Golden Test Harness**: For deterministic testing of complaint pipelines.
-   **Data Corruption Guard**: Validates core configuration data.
-   **Replay Harness**: For reproducible debugging of stored cases.
-   **Release Candidate (RC) System**: Ensures consistent agent behavior through automated regression testing across LLM variants.
-   **Gate-Prod Pipeline**: A comprehensive pre-deployment validation pipeline including corruption checks, harness execution, stress smoke tests, and drift audits.

## External Dependencies

-   **AI Integration**: OpenAI API (via Replit AI Integrations).
-   **Messaging Integration**: Twilio for WhatsApp, Telegram Bot API for Telegram.
-   **Database**: Firebase Firestore.
-   **Data Configuration**: Google Sheets.
-   **Cloud Storage**: Firebase Storage.