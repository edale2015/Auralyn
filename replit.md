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
This system deterministically assembles an auditable clinical state from multiple data tables, capturing evidence traces. It integrates `buildClinicalState()`, `evaluateRedFlagsMaster()`, and `selectSpotInterventions()`. A `runCrossoverHooks()` orchestrates parallel execution of red flag evaluation, urgent care spot interventions, the obesity agent, confidence scoring, care gap evaluation, and the education sandbox, with a priority merge order and ER_SEND short-circuiting. State inference for DM/HTN/GLP-1 conditions is automated based on medication lists and PMH. A multi-channel output formatter renders agent outputs for web, WhatsApp/Telegram, and eCW formats.

### Clinical State Confidence Scoring
`computeConfidence()` in `server/services/confidenceScoring.ts` assigns HIGH/MODERATE/LOW confidence to each inferred condition (DM, HTN, GLP-1, bariatric, anticoagulation) based on evidence strength (medication + PMH match = HIGH, single source = MODERATE, vague complaints with no context = LOW). Global confidence is the maximum of all inferences. Integrated into `runCrossoverHooks()` before red flag gate.

### Care Gap Engine
`evaluateCareGaps()` in `server/services/careGapEngine.ts` evaluates gaps across DM (A1c, UACR, eye exam, statin eligibility, hypo education), HTN (home BP, labs monitoring, OSA screening), bariatric (micronutrient panel, thiamine risk), GLP-1 (lean mass preservation, gallbladder/pancreatitis education), anticoagulation monitoring, and PCP access navigation. Gaps are severity-boosted when `social.pcpAccessDelay=true`. Only runs when redFlagGate=PASS and not EMERGENT_ESCALATION.

### Red Flag Audit & Consistency Checker
`runRedFlagAudit()` in `server/services/redFlagAudit.ts` validates RF references across RED_FLAGS_MASTER, MED_CONDITION_INTELLIGENCE_RULES, and URGENT_CARE_SPOT_INTERVENTIONS. Checks for duplicate/conflicting IDs, overlapping rules, unreachable triggers (references to nonexistent CaseState fields), and channel rendering completeness (ER_SEND flags without immediateActions text). Exposed via `GET /api/admin/audit/redflags`.

### Agent Trace Viewer
`server/services/traceViewer.ts` provides an in-memory 200-entry LRU trace store. `buildTraceTimeline()` constructs ordered evidence chains: INPUT → CLINICAL_STATE (med normalization, condition inference, confirmed problems, risk flags, tables queried) → CONFIDENCE → RED_FLAG_GATE → UC_INTERVENTIONS → OBESITY_AGENT → CARE_GAPS → FINAL_OUTPUT. Each step includes evidence arrays. Exposed via `GET /api/admin/trace` (list) and `GET /api/admin/trace/:scenarioId` (detail).

### Safe Freeform Education Sandbox
`evaluateSandboxEligibility()` in `server/services/safeFreeformSandbox.ts` gates education-only content. Disabled if ER_SEND active or confidence=LOW. Never produces prescriptions/orders — only educational template content citing deterministic care gap and spot intervention recommendations. `SAFE_FREEFORM_EDUCATION` action type added to `AgentAction` union.

### Stress Test Harness
`POST /api/admin/stress-test` accepts an array of scenarios with assertions (expectRedFlagGate, expectConfidence, expectMinCareGaps, expectCareGapIds, expectMinRedFlags, expectRoutingState, expectSystem, expectMinSpotInterventions, expectNoEmergent). 100 pre-built scenarios in `server/tests/stressScenarios.json` cover healthy adults, DM/HTN/GLP-1/bariatric patients, anticoagulation, ER_SEND triggers, vague complaints, and complex multi-comorbidity cases. A standalone runner script at `server/tests/runStressTest.ts` can execute all scenarios via CLI.

### Complaint Golden Test Harness
`scripts/run_harness.ts` runs deterministic golden/fuzz test suites for complaint pipelines. Three tiers:
- **Tier A (Golden)**: 15 cases in `tests/cases/pulm_cough/` covering all cough dispositions and clusters
- **Tier B (Fuzz)**: 30 cases in `tests/cases/pulm_cough_fuzz/` with anchor removal, severity escalation, and condition overlay patterns (3 per golden)
- **Tier C (Invariants)**: 10 property assertions built into the harness runner (INV-1 through INV-10) covering CP→ER_SEND/ESCALATE, O2LOW→ER_SEND, gate↔disposition consistency, duration-based disposition rules, cluster correctness for wheeze+asthma and COPD, hemoptysis gate, and monotonicity (adding O2LOW never reduces gate severity)

Run with: `npx tsx scripts/run_harness.ts [directory]` or `npx tsx scripts/run_harness.ts --all` to sweep all complaint directories.

### Data Corruption Guard
`server/data/corruptionGuard.ts` validates CORE_QUESTIONS, RED_FLAG_RULES, DISPOSITION_RULES, and OUTPUT_TEMPLATES on every config load. Checks for: pasted-row corruption (tabs/multi-space in CC_ID), whitespace in IDs, invalid ID formats, unknown disposition levels, unknown red flag actions, empty template bodies. Cross-table checks verify template references from disposition rules exist, and question references in trigger expressions exist. Hard-fails on corruption to prevent silent rule poisoning. Integrated into `complaintConfigLoader.ts` — runs on every `loadComplaintConfig()` call. Admin endpoint: `GET /api/admin/validate/tabs` runs all validators and returns per-complaint coverage stats.

### Persistent Cough Pipeline
13 core questions (Q_COUGH_DUR through Q_COUGH_GERD), 6 red flag rules, 8 scoring clusters (PE_OVERLAP, PNEUMONIA, ASTHMA_EXAC, COPD_EXAC, VIRAL_URI, INFECTION, UACS_PND, GERD_COUGH). Viral URI cluster is suppressed in diffAndConfidenceNode when danger signals or specific conditions (asthma, COPD, PND, GERD, infection) are present. ER_SEND cases still compute clusters for audit/training (no short-circuit). Scoring module in `server/agent/scoring/coughScore.ts`, graph registered as PC_GRAPH_V1.

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