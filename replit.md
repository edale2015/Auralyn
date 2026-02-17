# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that uses WhatsApp to guide patients through an ENT Flu questionnaire, collecting symptoms and medical history. It generates proposed diagnoses and treatment plans for physician review and communicates approved dispositions and orders back to patients via WhatsApp. The project aims to efficiently manage flu-like symptom consultations, reduce physician workload, and improve patient access to care by leveraging AI for initial assessments and automating communication.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18 and TypeScript, using `shadcn/ui` (Radix UI based) with Tailwind CSS. It includes physician login, patient intake forms, case status views, a signed visit summary, a physician dashboard, and a Trace Viewer with LLM variant filtering.

### Backend
The backend uses Express 5 on Node.js with TypeScript, exposing REST API endpoints. It features a constrained agent architecture for deterministic medical triage, including a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. Key functionalities include Centor score calculation, red flag detection, and a supervisor gate for patient-facing outputs. LLM integrations utilize Replit AI Integrations (OpenAI-compatible) with `gpt-5-mini`, incorporating rate limiting, per-run budgets, and a circuit breaker.

### Data Storage
Primary data storage is Firebase Firestore, with SQLite used as an abstraction for intake storage. Schemas are defined for physicians, patients, encounters, orders, WhatsApp messages, and cases. Agent traces and LLM call logs are collected in Firestore. PHI retention policies involve splitting storage for clinical records and debug telemetry.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification.

### Agent System
The agent system manages patient flow through various routing states (e.g., `INTAKE_PENDING` to `REVIEW_REQUIRED`) using `AgentAction` types (e.g., `ASK_QUESTION`, `RESOLVE_DIAGNOSTICS`, `SET_DISPOSITION`). A pipeline orchestrator handles complaint routing, FHIR prefill, modifiers, rules evaluation, question queue generation, and a supervisor gate. LLM-powered actions like `REFRAME_QUESTION` and `DRAFT_SUMMARY` are used. The system supports prompt template versioning and LLM A/B testing with guardrails.

### Multi-System Triage Pipeline
A robust triage pipeline uses canonical keys for medical systems, chief complaints, and clusters. A unified sheets registry, loaded from Google Sheets, provides dynamically configured data for complaint routing, integration maps, FHIR prefill, modifiers, and rules engines. A question queue dynamically builds ordered questions, and an enhanced supervisor manages red flags and triage upgrades. A cluster/disposition engine resolves dispositions, and a diagnosis resolver provides confidence-scored diagnostic candidates. Medication suggestions are generated with safety checks, including allergy blocking, pregnancy contraindication detection, and renal/hepatic adjustment flags.

### Obesity Agent & Metabolic Triage
A secondary-track ObesityAgent runs in parallel with primary complaint routing, triggering on BMI/weight indicators or metabolic medications. It extends `CaseState` with metabolic, DM, HTN, bariatric, GLP-1, and social details. New `AgentAction` types support specific interventions, such as `ASK_CLUSTER`, `EDUCATION_BLOCK`, and `ER_SEND_RECOMMENDATION`. The agent includes detailed HTN, DM, and Obesity Entry escalation rules, along with built-in spot interventions for common metabolic issues. Red flags like HTN emergency, DKA/HHS, and severe hypoglycemia are integrated with the supervisor gate for immediate action.

### Clinical State Builder System
This system deterministically assembles an auditable clinical state from multiple data tables, capturing evidence traces. It integrates `buildClinicalState()`, `evaluateRedFlagsMaster()`, and `selectSpotInterventions()`. A `runCrossoverHooks()` orchestrates parallel execution of red flag evaluation, urgent care spot interventions, and the obesity agent, with a priority merge order and ER_SEND short-circuiting. State inference for DM/HTN/GLP-1 conditions is automated based on medication lists and PMH. A multi-channel output formatter renders agent outputs for web, WhatsApp/Telegram, and eCW formats.

### Multi-Channel Messaging
A unified messaging architecture uses a `MessageEvent` type with channel abstraction (WhatsApp, Telegram, Web, Test) and `conversationId` keying. Conversation state is Firestore-cached with deduplication. Channel adapters route replies, and a message orchestrator handles shared processing logic, staff commands, menu routing, answer parsing, and emergency warnings. Feature flags control channel activation, and a dashboard monitors channel operations.

### Release Candidate (RC) System
The RC system ensures consistent agent behavior through automated regression testing. It executes golden scenarios across LLM variants, generating reports with pass/fail summaries, diffs, latency, and token usage. A replay mode allows testing changes against existing traces, and PHI-safe replay packs enable secure QA.

## External Dependencies

-   **AI Integration**: OpenAI API (via Replit AI Integrations).
-   **Messaging Integration**: Twilio for WhatsApp, Telegram Bot API for Telegram.
-   **Database**: Firebase Firestore.
-   **Data Configuration**: Google Sheets for dynamic configuration.
-   **Cloud Storage**: Firebase Storage.