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
Primary data storage is Firebase Firestore, with SQLite used as an abstraction for intake storage. Schemas are defined for physicians, patients, encounters, orders, WhatsApp messages, and cases. Agent traces and LLM call logs are collected in Firestore. PHI retention policies involve splitting storage for clinical records and debug telemetry.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification.

### Agent System
The agent system manages patient flow through various routing states using `AgentAction` types. A pipeline orchestrator handles complaint routing, FHIR prefill, modifiers, rules evaluation, question queue generation, and a supervisor gate. LLM-powered actions like `REFRAME_QUESTION` and `DRAFT_SUMMARY` are used. The system supports prompt template versioning and LLM A/B testing with guardrails.

### Multi-System Triage Pipeline
A robust triage pipeline uses canonical keys for medical systems, chief complaints, and clusters. A unified sheets registry, loaded from Google Sheets, provides dynamically configured data for complaint routing, integration maps, FHIR prefill, modifiers, and rules engines. A question queue dynamically builds ordered questions, and an enhanced supervisor manages red flags and triage upgrades. A cluster/disposition engine resolves dispositions, and a diagnosis resolver provides confidence-scored diagnostic candidates. Medication suggestions are generated with safety checks.

### Obesity Agent & Metabolic Triage
A secondary-track ObesityAgent runs in parallel with primary complaint routing, triggering on BMI/weight indicators or metabolic medications. It extends `CaseState` with metabolic, DM, HTN, bariatric, GLP-1, and social details. New `AgentAction` types support specific interventions, such as `ASK_CLUSTER`, `EDUCATION_BLOCK`, and `ER_SEND_RECOMMENDATION`. The agent includes detailed HTN, DM, and Obesity Entry escalation rules, along with built-in spot interventions for common metabolic issues. Red flags like HTN emergency, DKA/HHS, and severe hypoglycemia are integrated with the supervisor gate for immediate action.

### Clinical State Builder System
This system deterministically assembles an auditable clinical state from multiple data tables, capturing evidence traces. It integrates `buildClinicalState()`, `evaluateRedFlagsMaster()`, and `selectSpotInterventions()`. A `runCrossoverHooks()` orchestrates parallel execution of red flag evaluation, urgent care spot interventions, the obesity agent, confidence scoring, care gap evaluation, and the education sandbox, with a priority merge order and ER_SEND short-circuiting. State inference for DM/HTN/GLP-1 conditions is automated based on medication lists and PMH. A multi-channel output formatter renders agent outputs for web, WhatsApp/Telegram, and eCW formats.

### Clinical State Confidence Scoring
`computeConfidence()` assigns HIGH/MODERATE/LOW confidence to each inferred condition (DM, HTN, GLP-1, bariatric, anticoagulation) based on evidence strength. Global confidence is the maximum of all inferences. Integrated into `runCrossoverHooks()` before the red flag gate.

### Care Gap Engine
`evaluateCareGaps()` evaluates gaps across various conditions (DM, HTN, bariatric, GLP-1, anticoagulation monitoring, and PCP access navigation). Gaps are severity-boosted when `social.pcpAccessDelay=true`. Only runs when redFlagGate=PASS and not EMERGENT_ESCALATION.

### Red Flag Audit & Consistency Checker
`runRedFlagAudit()` validates RF references across RED_FLAGS_MASTER, MED_CONDITION_INTELLIGENCE_RULES, and URGENT_CARE_SPOT_INTERVENTIONS. It checks for duplicate/conflicting IDs, overlapping rules, unreachable triggers, and channel rendering completeness.

### Agent Trace Viewer
`server/services/traceViewer.ts` provides an in-memory 200-entry LRU trace store. `buildTraceTimeline()` constructs ordered evidence chains: INPUT → CLINICAL_STATE (med normalization, condition inference, confirmed problems, risk flags, tables queried) → CONFIDENCE → RED_FLAG_GATE → UC_INTERVENTIONS → OBESITY_AGENT → CARE_GAPS → FINAL_OUTPUT. Each step includes evidence arrays.

### Safe Freeform Education Sandbox
`evaluateSandboxEligibility()` gates education-only content. Disabled if ER_SEND active or confidence=LOW. Never produces prescriptions/orders — only educational template content citing deterministic care gap and spot intervention recommendations. `SAFE_FREEFORM_EDUCATION` action type added to `AgentAction` union.

### Stress Test Harness
`POST /api/admin/stress-test` accepts an array of scenarios with assertions. 100 pre-built scenarios in `server/tests/stressScenarios.json` cover various patient types and conditions, including ER_SEND triggers. A standalone runner script at `server/tests/runStressTest.ts` can execute all scenarios via CLI.

### Complaint Golden Test Harness
`scripts/run_harness.ts` runs deterministic golden/fuzz test suites for complaint pipelines. Run with: `npx tsx scripts/run_harness.ts [directory]` or `npx tsx scripts/run_harness.ts --all`.

**215+ total tests across 13 directories:**
- Persistent Cough (45 tests): 15 golden + 30 fuzz + invariants + monotonicity
- Chest Pain (40 tests): 10 golden + 30 fuzz + invariants + monotonicity
- Dizziness (40 tests): 10 golden + 30 fuzz + invariants + monotonicity
- Abdominal Pain (40 tests): 10 golden + 30 fuzz + invariants + monotonicity
- Sore Throat (10 tests): 10 golden
- UTI / Urinary Symptoms (10 tests): 10 golden in `tests/cases/gu_uti_symptoms/`
- Testicular Pain / Prostatitis (10 tests): 10 golden in `tests/cases/gu_testicular_pain_prostatitis/`
- Pelvic Pain (10 tests): 10 golden in `tests/cases/gyn_pelvic_pain/`
- Headache (10 tests): 10 golden in `tests/cases/neuro_headache/`

### Data Corruption Guard
`server/data/corruptionGuard.ts` validates CORE_QUESTIONS, RED_FLAG_RULES, DISPOSITION_RULES, and OUTPUT_TEMPLATES on every config load. It checks for pasted-row corruption, whitespace in IDs, invalid ID formats, unknown disposition levels, unknown red flag actions, and empty template bodies. Cross-table checks verify template references and question references in trigger expressions. It hard-fails on corruption to prevent silent rule poisoning.

### Complaint Pipelines
Ten complaint pipelines are implemented, each with core questions, red flag rules, scoring modules, disposition rules, and output templates: Persistent Cough, Chest Pain, Dizziness, Abdominal Pain, Sore Throat, Earache, UTI / Urinary Symptoms, Testicular Pain / Prostatitis, Pelvic Pain, and Headache. Each pipeline incorporates specific scoring logic and graph configurations.

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