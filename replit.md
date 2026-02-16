# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform designed to streamline patient case review and approval by physicians. It utilizes WhatsApp to guide patients through a deterministic ENT Flu questionnaire, collecting symptoms and medical history. This information is then used to generate proposed diagnoses and treatment plans, which are queued for physician review. Upon approval, the platform communicates dispositions and orders back to the patient via WhatsApp. The primary goal is to efficiently manage flu-like symptom consultations, with a built-in fallback for general WhatsApp-based Q&A. The project aims to revolutionize medical triage by leveraging AI for initial assessments and automating communication, significantly reducing physician workload and improving patient access to care.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18 and TypeScript, using `shadcn/ui` (Radix UI based) with Tailwind CSS and custom healthcare-specific design tokens. Key components include physician login, patient intake forms, case status views, a signed visit summary, a physician dashboard, and a Trace Viewer with LLM variant filtering.

### Backend
The backend leverages Express 5 on Node.js with TypeScript, exposing REST API endpoints. It features a constrained agent architecture for deterministic medical triage, including a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. This system incorporates Centor score calculation, red flag detection, and a supervisor gate for patient-facing outputs. LLM integrations are handled via Replit AI Integrations (OpenAI-compatible) using `gpt-5-mini`, complete with rate limiting, per-run budgets, and a circuit breaker for resilience.

### Data Storage
Primary data storage is handled by Firebase Firestore, with SQLite used as a configurable abstraction for intake storage. The system defines clear schemas for physicians, patients, encounters, orders, WhatsApp messages, and cases. Agent traces and LLM call logs are collected in Firestore (or in-memory for development). PHI retention policies involve splitting storage for clinical records (long-term) and debug telemetry (TTL-swept).

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification.

### Agent System
The agent system manages a flow through various routing states (e.g., `INTAKE_PENDING` to `REVIEW_REQUIRED`), supported by a range of `AgentAction` types (e.g., `ASK_QUESTION`, `RESOLVE_DIAGNOSTICS`, `SET_DISPOSITION`). A pipeline orchestrator initializes `CaseState` and runs at the start of the agent loop. It handles complaint routing, FHIR prefill, modifiers, rules evaluation, question queue generation, and a supervisor gate. LLM-powered actions like `REFRAME_QUESTION` and `DRAFT_SUMMARY` enhance interaction and summarization. The system mandates prompt template versioning and supports LLM A/B testing with guardrails for cost and latency.

### Multi-System Triage Pipeline
A robust multi-system triage pipeline relies on canonical keys for medical systems, chief complaints, and clusters. A unified sheets registry, loaded from Google Sheets, provides dynamically configured data for complaint routing, integration maps, FHIR prefill, modifiers, and rules engines. A question queue dynamically builds ordered questions, and an enhanced supervisor manages red flags and triage upgrades. The cluster/disposition engine resolves dispositions, and medication suggestions are generated with safety checks. A diagnosis resolver provides confidence-scored diagnostic candidates across multiple medical domains.

### Consolidated Global Tables (Feb 2026)
Three global tables replace per-system diagnosis/medication sheets:
- **GLOBAL_CLUSTER_MASTER** (1,258 rows): Cluster_ID, System, Default_Disposition, ER_Threshold/UC_Threshold/PC_Threshold score thresholds, Escalation_Target, Red_Flag_Criteria, Base_Risk_Level, Followup_Plan
- **GLOBAL_MEDICATIONS_MASTER** (548 rows): DIAGNOSIS_ID, System, Medication_Name, Medication_Group, Indications_Cluster (semicolon-delimited multi-cluster), First_Line?, Adult_Dose, Pediatric_Dose, Pregnancy_Considerations, Contraindications, Key_Interactions, Renal_Adjust?, Hepatic_Adjust?, Route
- **CLUSTER_PRIMARY_DIAGNOSIS** (1,258 mappings): Links Cluster_ID to Primary_Diagnosis_ID for medication matching

Key design notes:
- Medication_Link_Type column NOW POPULATED (PRIMARY_DIAGNOSIS: 332, COMBINATION: 127, CLUSTER_BASED: 82, SYMPTOMATIC: 7)
- Matching priority: 1) Direct resolvedDiagnosisIds match, 2) CLUSTER_PRIMARY_DIAGNOSIS table lookup via matched active cluster, 3) Cluster fallback (Indications_Cluster fuzzy-matches activeClusters)
- CLUSTER_PRIMARY_DIAGNOSIS table has 1,258 rows but Primary_Diagnosis_ID is mostly empty — system falls back to cluster-based matching for PRIMARY_DIAGNOSIS meds
- Cluster naming conventions differ between tables: CHIEF_COMPLAINT_ROUTER uses `ENT_PHARYNGITIS`, GLOBAL_CLUSTER_MASTER uses `ENT_STREP_PHARYNGITIS`, GLOBAL_MEDICATIONS_MASTER uses `Strep pharyngitis cluster`. Fuzzy cross-mapping handles system prefix stripping and `_CLUSTER` suffix removal via `findMatchingActiveCluster()`.
- Indications_Cluster uses semicolon delimiters for multi-cluster entries
- Safety checks: allergy blocking (penicillin family), pregnancy contraindication detection, renal/hepatic adjustment flags, anticoagulant interaction warnings
- Care_Setting filter with presets: urgent_care=[urgent_care,symptomatic], family_med=[urgent_care,symptomatic,chronic_management], obesity_dm_htn=[chronic_management,symptomatic]
- **careMode** field on CaseState: `urgent_care | family_medicine | chronic_management | specialty_program` — controls which Care_Setting meds are suggested. Falls back to `routing.careSetting` for backward compat.
- **MED_TO_CONDITION_TRIGGERS** table (Google Sheet): Trigger_Value, Trigger_Type (med_name/substring/med_group/tag), Likely_Conditions, Confidence, Confirm_Question, Followup_Bundle_ID. Runs after FHIR prefill, injects inline confirm questions into questionQueue and adds follow-up bundles.
- Admin endpoints: GET /api/admin/data/validate (integrity checks), GET /api/admin/data/clusters?search=X (cluster browser), POST /api/admin/test/runScenario (end-to-end pipeline test)

### Multi-Channel Messaging
A unified messaging architecture uses a `MessageEvent` type with channel abstraction (WhatsApp, Telegram, Web, Test) and `conversationId` keying. Conversation state is Firestore-cached, with deduplication mechanisms ensuring idempotency. Channel adapters route replies, and a message orchestrator handles shared processing logic, staff commands, menu routing, answer parsing, and emergency warnings. Feature flags enable granular control over channel activation. Channel operations are monitored via a dashboard that tracks key metrics including LLM performance and friction escalations.

### Release Candidate (RC) System
The RC system ensures consistent agent behavior through automated regression testing. It executes golden scenarios across LLM variants, generating reports with pass/fail summaries, diffs, latency, and token usage. A replay mode allows testing changes against existing traces, and PHI-safe replay packs enable secure QA. Quality reviews allow tagging runs for performance analysis, supporting a weekly improvement loop.

## External Dependencies

- **AI Integration**: OpenAI API (via Replit AI Integrations) for medical triage AI conversations.
- **Messaging Integration**: Twilio for WhatsApp communication; Telegram Bot API for Telegram channel.
- **Database**: Firebase Firestore.
- **Data Configuration**: Google Sheets for dynamic configuration of questionnaires, clinical rules, medications, and diagnoses.
- **Cloud Storage**: Firebase Storage (configurable).