# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that uses WhatsApp to guide patients through an ENT Flu questionnaire, collecting symptoms and medical history. It generates proposed diagnoses and treatment plans for physician review and communicates approved dispositions and orders back to patients via WhatsApp. The project aims to efficiently manage flu-like symptom consultations, reduce physician workload, and improve patient access to care by leveraging AI for initial assessments and automating communication.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18 and TypeScript, utilizing `shadcn/ui` (Radix UI based) with Tailwind CSS. It supports physician login, patient intake, case status views, a signed visit summary, a physician dashboard, and a Trace Viewer.

### Backend
The backend uses Express 5 on Node.js with TypeScript, exposing REST API endpoints. It features a constrained agent architecture for deterministic medical triage, including a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. Key functionalities include Centor score calculation, red flag detection, and a supervisor gate for patient-facing outputs. LLM integrations utilize Replit AI Integrations (OpenAI-compatible) with `gpt-5-mini`, incorporating rate limiting, per-run budgets, and a circuit breaker.

### Data Storage
Primary data storage is Firebase Firestore, with SQLite used as an abstraction for intake storage. Schemas are defined for physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies involve splitting storage for clinical records and debug telemetry.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification.

### Agent System
The agent system manages patient flow through various routing states using `AgentAction` types. A pipeline orchestrator handles complaint routing, FHIR prefill, modifiers, rules evaluation, question queue generation, and a supervisor gate. LLM-powered actions like `REFRAME_QUESTION` and `DRAFT_SUMMARY` are used. The system supports prompt template versioning and LLM A/B testing with guardrails.

### Multi-System Triage Pipeline
A robust triage pipeline uses canonical keys for medical systems, chief complaints, and clusters. A unified sheets registry, loaded from Google Sheets, provides dynamically configured data for complaint routing, integration maps, FHIR prefill, modifiers, and rules engines. A question queue dynamically builds ordered questions, and an enhanced supervisor manages red flags and triage upgrades. A cluster/disposition engine resolves dispositions, and a diagnosis resolver provides confidence-scored diagnostic candidates. Medication suggestions are generated with safety checks.

### Obesity Agent & Metabolic Triage
A secondary-track ObesityAgent runs in parallel with primary complaint routing, triggering on BMI/weight indicators or metabolic medications. It extends `CaseState` with metabolic, DM, HTN, bariatric, GLP-1, and social details. New `AgentAction` types support specific interventions.

### Clinical State Builder System
This system deterministically assembles an auditable clinical state from multiple data tables, capturing evidence traces. It integrates `buildClinicalState()`, `evaluateRedFlagsMaster()`, and `selectSpotInterventions()`. A `runCrossoverHooks()` orchestrates parallel execution of red flag evaluation, urgent care spot interventions, the obesity agent, confidence scoring, care gap evaluation, and the education sandbox, with a priority merge order and ER_SEND short-circuiting.

### Clinical State Confidence Scoring
`computeConfidence()` assigns HIGH/MODERATE/LOW confidence to each inferred condition based on evidence strength.

### Care Gap Engine
`evaluateCareGaps()` evaluates gaps across various conditions. Gaps are severity-boosted under certain conditions.

### Red Flag Audit & Consistency Checker
`runRedFlagAudit()` validates RF references across key rule sets, checking for inconsistencies and preventing silent rule poisoning.

### Agent Trace Viewer
`server/services/traceViewer.ts` provides an in-memory LRU trace store. `buildTraceTimeline()` constructs ordered evidence chains from input to final output, with each step including evidence arrays.

### Safe Freeform Education Sandbox
`evaluateSandboxEligibility()` gates education-only content. It is disabled if ER_SEND is active or confidence is LOW, and only produces educational template content.

### Stress Test Harness
A stress test harness at `POST /api/admin/stress-test` accepts an array of scenarios with assertions, including 100 pre-built scenarios. A standalone runner script at `server/tests/runStressTest.ts` executes all scenarios via CLI.

### Complaint Golden Test Harness
`scripts/run_harness.ts` runs deterministic golden/fuzz test suites for complaint pipelines, covering 525 tests across 41 directories.

### Data Corruption Guard
`server/data/corruptionGuard.ts` validates core configuration data on every config load, checking for corruption, invalid formats, and inconsistencies, hard-failing to prevent silent rule poisoning.

### Complaint Pipelines
42 complaint pipelines implemented across 7 medical systems (6 legacy + 36 GENERIC_V1):
- **ENT** (7): Sore Throat (legacy), Earache (legacy), Sinus Pressure, Sore Throat ENT, Ear Pain, Nasal Congestion, Epistaxis
- **PULM** (6): Persistent Cough (legacy), Pulmonary Cough, Shortness of Breath, Wheezing, Chest Tightness, Hemoptysis
- **GU** (10): UTI, Testicular Pain/Prostatitis, Dysuria/UTI, Flank Pain, Testicular Pain, Hematuria, Urinary Retention, STI Exposure/Discharge, Pelvic Pain/Torsion, Vaginal Bleeding
- **GYN** (1): Pelvic Pain
- **NEURO** (6): Headache, Dizziness/Vertigo, Weakness/Numbness, Seizure, Syncope, Confusion/AMS
- **GI** (10): Chest Pain (legacy), Abdominal Pain (legacy+GENERIC_V1), Diarrhea, Vomiting, GI Bleeding, Constipation, Jaundice, Dysphagia, Acute Pancreatitis-like
- **General** (1): Dizziness (legacy)

### Generic Data-Driven Engine (GENERIC_V1)
`server/engines/genericComplaintEngineV1.ts` provides a fully data-driven complaint pipeline that replaces per-complaint TypeScript scoring modules. Complaints use `CLUSTER_SCORING_RULES` CSV rows to define cluster scoring logic, enabling new complaints to be added with zero TypeScript code. 36/42 complaints run on GENERIC_V1; 6 remain LEGACY. Batch D added 22 new complaints (8 GI, 6 NEURO, 8 GU) with 525 total tests passing across 41 directories.

### Multi-Channel Messaging
A unified messaging architecture uses a `MessageEvent` type with channel abstraction (WhatsApp, Telegram, Web, Test) and `conversationId` keying. Conversation state is Firestore-cached with deduplication. Channel adapters route replies, and a message orchestrator handles shared processing logic, staff commands, menu routing, answer parsing, and emergency warnings.

### Release Candidate (RC) System
The RC system ensures consistent agent behavior through automated regression testing. It executes golden scenarios across LLM variants, generating reports with pass/fail summaries, diffs, latency, and token usage. A replay mode allows testing changes against existing traces, and PHI-safe replay packs enable secure QA.

## External Dependencies

-   **AI Integration**: OpenAI API (via Replit AI Integrations).
-   **Messaging Integration**: Twilio for WhatsApp, Telegram Bot API for Telegram.
-   **Database**: Firebase Firestore.
-   **Data Configuration**: Google Sheets for dynamic configuration.
-   **Cloud Storage**: Firebase Storage.