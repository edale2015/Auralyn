# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is an AI-powered medical triage platform for flu-like symptoms, leveraging WhatsApp for initial patient assessments. It aims to provide diagnoses and treatment plans for physician review, automate patient communication, and enhance healthcare efficiency and access. The system is designed for continuous improvement through a self-developing AI architecture, with a vision to transform medical triage into a more efficient, patient-centric process.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system employs a constrained agent architecture with a plan/act/observe loop and a multi-system triage pipeline. It features a unified sheets registry for data configuration, a clinical state builder, and a modular, skill-based orchestration layer. An intelligence layer provides explainability and failure-driven rule suggestions, with an extended learning loop for continuous improvement. The Clinical Intelligence Planning Layer (CIPL) and Clinical Governance & Deployment Layer ensure continuous improvement and safe deployment of clinical changes. The system adheres to a 12-layer architecture encompassing Interface, Normalization, State, Knowledge, Safety, Reasoning, Decision, Learning, Analytics, Governance, Integration, and Orchestration.

### UI/UX Decisions
The frontend is built with React 18, TypeScript, `shadcn/ui`, and Tailwind CSS, offering intuitive interfaces for physicians, patients, and administrators. Key dashboards include the Clinical Simulation Lab, Clinical Control Tower, Executive Dashboard, Stress Test Dashboard, Patient Queue Dashboard, and an FDA Validation Dashboard. The Decision Tree Explorer provides an interactive ReactFlow visualization. The Live Clinic Console is a multi-tenant operating system, and the Production Readiness Console displays the 58 production architecture layers.

### Technical Implementations
The backend uses Express 5, Node.js, and TypeScript, providing REST API endpoints. It incorporates Centor score calculation, red flag detection, a supervisor gate, and robust LLM integrations. Features include a Clinical Brain Engine, Self-Developing Medical AI, Telemedicine Reasoning Assistant, and an Agent System for patient flow. Clinical capabilities include advanced triage logic, medication safety layers, FHIR-lite structured output, and a Clinical Knowledge Graph. The system includes 30+ Complaint Packs with a Visual Rule Builder, an Adaptive Control Loop, and a Case Memory Engine. A Unified Clinical Pipeline orchestrates triage, self-improvement, and simulation. The Autonomous Operator System provides intent-based task planning. The Engine Control Center chains validation, scoring, billing, outcome, learning, and auditing. The Auto-Debug Engine monitors system health, and an Agent Coordinator manages 7 registered agents. An SMS/WhatsApp Service handles Twilio-based messaging. A Stress Test System allows load generation, and an RPA Browser Agent provides UI automation. An FDA Submission Package generates validation reports. A Live Patient Queue manages real-time sessions. PostgreSQL-backed infrastructure supports learning records, simulations, and audit logs. System Monitoring includes a Predictive Failure Engine. The Autonomous Loop runs learning and failure prediction, with a Safety Gate for non-bypassable safety. An Immutable Audit Logger logs every clinical flow. Explainability is integrated into the orchestrator, with critical Safety Engines for drug interaction, pregnancy, and pediatric safety. The Autonomous Brain includes a Self-Learning Engine, Golden Case Validator, and Clinical Safety Guard. A Global Intelligence Layer utilizes federated learning for privacy-safe data export and aggregation, including a War Room panel for monitoring. A Multi-Agent Task Bus + Evolution Engine manages tasks with 7 agents and an autonomous evolution cycle. A System Monitor provides live engine and skill health monitoring.

The system incorporates a Multi-Agent Debate Engine where three clinical agents (Hybrid Reasoning, Bayesian Differential, Safety Veto) argue over diagnoses, with consensus based on weighted accuracy. A Continuous Learning Pipeline, wired to an outcome tracker, applies temporal decay to policies and proposes RLHF weight updates for physician review. A Policy Evolution Engine manages outcome-driven policy weights. An Executive Command Dashboard provides a high-level view of pipeline statistics, agent health, predictive failure signals, and policy evolution.

### System Design Choices
Data management uses Firebase Firestore, SQLite, and NDJSON-backed stores, with PHI retention policies. Authentication involves password-only, session-based HMAC for physicians and token-based access for patients, with JWT-based role authentication. Security and quality hardening include bcrypt, JWT security, rate limiting, and PHI Sanitizer. A Global SRE + Resilience Layer provides geo-aware routing, SLA monitoring, automatic debugging, and chaos engineering. Autonomous Governance includes an agent registry, audit agent, incident commander, digital twin, and predictive engine. The Autonomous Operator System is an AI-powered form automation engine. A Template Studio allows visual template editing. The Replay Inspector audits automation runs. A Robotics Control Module manages medical device orchestration. An Autonomous Learning Console provides a unified dashboard for self-testing, self-learning, and governance, including simulation, learning queue, drift monitor, audit trail, versions, and safety modes.

**System Control Tower** (`/system-control-tower`): Full system observability and control dashboard with 10 panels:
- Agents (7 clinical agents with toggle/start/stop)
- Engines (live latency + error rate for all 10 engines)
- Integrations (Postgres, OpenAI, Redis, Telegram, EHR, FHIR, Twilio status)
- KB Skills (row counts from 4 KB tables)
- Architecture Layers (12-layer toggle panel)
- Robot Exam (otoscope, vitals, EKG device control + device registry)
- Live Patients (WebSocket `/ws/patient-stream` real-time vitals feed + patient state table)
- Deterioration Alerts (KB-driven `/api/sysctrl/alerts/:patientId` + `kb_deterioration_rules`)
- Voice Intake (multimodal NLP processing via `/api/sysctrl/voice`)
- System Logs (live tail of all backend events)
- Header: health summary bar, seed rules button, demo stream button
- 7 new DB tables: `robot_devices`, `robot_commands`, `robot_results`, `patient_live_stream`, `patient_state`, `patient_multimodal_inputs`, `kb_deterioration_rules`
- 9 frontend components in `client/src/components/tower/` (AgentsPanel, EnginesPanel, IntegrationsPanel, LivePatientsPanel, DeteriorationAlertsPanel, VoiceIntakePanel, SkillsLayersPanel, LiveLogsPanel, RobotExamPanel)

**Clinical Control Tower Decision Engine** (`/clinical-control-tower`): A new KB-driven dashboard with:
- `POST /api/control/analyze` — full reasoning pipeline: Advanced Bayesian diagnosis → confidence/uncertainty scoring → adaptive question ranking → counterfactual explainer → workup optimizer
- `POST /api/control/seed` — seeds 44 rows across 5 new KB tables
- 5 new DB tables: `kb_confidence_rules`, `kb_diagnosis_risk`, `kb_workup_costs`, `kb_test_utility`, `kb_question_utility`
- 5 backend engines: `confidenceDisposition.ts`, `workupOptimizer.ts`, `counterfactualExplainer.ts`, `nextBestQuestion.ts`, `buildDecisionTree.ts`
- 5 frontend components in `client/src/components/tower/`: `DecisionTreeViz.tsx` (react-d3-tree), `ScoringConsole.tsx`, `AdaptiveQuestioningPanel.tsx`, `CounterfactualPanel.tsx`, `WorkupOptimizer.tsx`

The system is 100% Knowledge Base (KB)-driven for diagnosis, with all clinical decisions managed via Postgres KB tables. All 5 legacy hardcoded systems have been replaced:
- `weightStore.ts` → write-through to `kb_clinical_weights` + `kb_weight_events`
- `redFlagMap.ts` → DB-first from `kb_red_flag_rules` with sync fallback
- `csvLoader.ts` → ALLOW_CSV guard (disabled by default)

**Phase 3+ Advanced Reasoning Engines** (server/engine/):
- `coMorbidityEngine.ts`: pairwise log-score adjustments from `kb_diagnosis_interactions` (10 seeded)
- `temporalEngine.ts`: rising/falling/persistent/intermittent/acute_onset pattern detection from `kb_temporal_patterns` (19 seeded)
- `outcomeLearningEngine.ts`: records outcomes, generates suggestions, approval workflow, applies approved events

**Advanced KB Tables** (all with full CRUD via /api/kb/ and /api/advanced-reasoning/):
- `kb_feature_models`: 106 boolean probabilistic feature models (p_present, p_absent, LR scoring)
- `kb_feature_likelihoods`: 106 legacy boolean likelihoods (source of truth migrated to feature_models)
- `kb_diagnosis_interactions`: co-morbidity pairwise adjustments
- `kb_temporal_patterns`: time-series pattern modifiers
- `kb_outcome_events`: learning queue with approve/reject workflow
- `kb_clinical_weights`: RLHF weights (write-through from weightStore)
- `kb_engine_routing`: complaint-to-engine dispatch routing (14 entries)
- `kb_complaint_packs`: structured complaint question/finding/modifier packs

**Plan Templates fully migrated (Phase 4)**:
- `server/engines/planTemplateEngine.ts` is now async DB-first with fallback to hardcoded `planTemplates.ts`
- All callers updated to `await`: `packDrivenIntakeRoutes.ts`, `packSimulatorRoutes.ts`, `unifiedClinicalPipeline.ts`
- `POST /api/kb/templates/seed` seeds 5 hardcoded templates into `kb_plan_templates`; meds serialized as JSON in `medicationInstructions`
- Plan Templates tab in KB UI has "Import from planTemplates.ts" seed button

**Knowledge Base Admin Page** (client/src/pages/KnowledgeBasePage.tsx) — 19 tabs covering all KB tables with full CRUD, seeders, and the DiagnosisFeatureEditor (client/src/components/DiagnosisFeatureEditor.tsx) for visual editing of boolean/categorical/numeric/range feature models with live LR preview.

**API Routes**:
- `/api/kb/*` — full CRUD for all 11 core KB tables  
- `/api/advanced-reasoning/*` — interactions, temporal patterns, outcomes, learning queue, health

## External Dependencies
*   **AI Integration**: OpenAI API
*   **Messaging Integration**: Twilio for WhatsApp
*   **Database**: Firebase Firestore, SQLite, PostgreSQL
*   **Data Configuration**: Google Sheets
*   **Cloud Storage**: Firebase Storage
*   **Authentication**: Google OAuth2 (for Gmail API)