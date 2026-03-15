# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform designed to streamline initial patient assessments for flu-like symptoms using WhatsApp. It leverages AI for proposed diagnoses and treatment plans, which are then reviewed by physicians. The system automates communication of approved dispositions and orders to patients, aiming to improve efficiency, reduce physician workload, and enhance patient access to healthcare for flu-like consultations.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Enhancements (March 2026)

### Clinical Brain Bundle v2 (37-file install)

**New namespace: `server/core/brain/`** (parallel to existing wave-7 engines, zero conflicts)

Installed as a self-contained, coherent engine family using a clean `RankedItem`-based type system (`shared/brainEngineTypes.ts`):

| Engine | Function |
|--------|----------|
| `symptomNormalizationEngine` | Canonical symptom slug normalization |
| `contradictionEngine` | Hard-pair contradiction detection (male/pregnant, no-fever/high-fever, etc.) |
| `clinicalSafetyGuard` | Emergency rule triggers (ACS, SAH, stroke) |
| `clinicalMemoryEngine` | Jaccard-based similar case retrieval from `brain_memory.ndjson` |
| `caseSimilarityEngine` | Scores diagnoses from memory matches |
| `differentialProbabilityEngine` | Log-odds Bayesian posterior over 11 diagnoses |
| `knowledgeGraphEngine` | Graph traversal over `CLINICAL_GRAPH_EDGES` (33 edges) |
| `evidenceAggregatorEngine` | 50% Bayes + 30% similarity + 20% graph weighted fusion |
| `uncertaintyEngine` | Shannon entropy → escalate / ask / continue |
| `complaintCompletenessEngine` | Required question gap detection per complaint |
| `guidelineAdherenceEngine` | Major/minor variance vs. expected test workup |
| `temporalProgressionEngine` | Timeline pattern flags |
| `patientRiskStratificationEngine` | Age, SpO2, immunocompromised, top-dx risk flags |
| `testRecommendationEngine` | Graph-derived ordered test list |
| `treatmentRecommendationEngine` | Graph-derived ordered treatment list |
| `returnPrecautionEngine` | Diagnosis-specific return precautions |
| `medicationSafetyEngine` | Pregnancy + drug-interaction safety alerts |
| `testYieldEngine` | Yield-adjusted test ordering |
| `physicianFeedbackLearningEngine` | Feedback NDJSON persistence + disagreement stats |
| `protocolVarianceEngine` | Protocol deviation detection |
| `severityScoringEngine` | Vital-sign-weighted severity score (low/moderate/high/critical) |
| `crossComplaintRouterEngine` | Symptom → complaint pathway routing |
| `diagnosticDriftEngine` | Prior snapshot vs. current top-dx drift detection |
| `dispositionCalibrationEngine` | Disposition selection from supervisor + severity + top-dx |
| `physicianReviewPacketEngine` | Formatted review summary for physician handoff |
| `supervisorEngine` | PASS / ESCALATE / BLOCK from 8 governance signals |
| `coverageGapEngine` | Complaint gap analysis |

**`server/core/brain/coordinator.ts`** — `runClinicalBrainCoordinator(input)` — 22-step sequential pipeline returning full `CoordinationOutput`

**`server/data/clinicalKnowledgeGraph.ts`** — `CLINICAL_GRAPH_EDGES` (33 edges, `ClinicalEdge` interface with `relation` field) appended alongside existing `clinicalEdges` (306 edges, `GraphEdge` type)

**`server/scripts/buildClinicalReasoningGraph.ts`** — exports CLINICAL_GRAPH_EDGES to `clinical_reasoning_graph.json`

**`shared/brainEngineTypes.ts`** — Complete type system: `RankedItem`, `VitalSet`, `BrainCaseInput`, `PriorSnapshot`, `ContradictionResult`, `SafetyGuardResult`, `MemoryRetrieveResult`, `UncertaintyResult`, `CompletenessResult`, `GuidelineAdherenceResult`, `ProtocolVarianceResult`, `DriftResult`, `SeverityResult`, `MedicationSafetyAlert`, `MedicationSafetyResult`, `SupervisorResult`, `ReviewPacketResult`, `BrainOutput`, `CoordinationOutput`

**API endpoints:**
- `POST /api/brain/run` — runs the coordinator, returns `CoordinationOutput`
- `GET /api/brain/graph-info` — returns edge count by relation type

### Session Enhancement Batch (T001–T009)

**T001 — Async GPT-4o Job Queue** (`/ms-agent-ops`)
- New in-memory async job store in `msAgentOrchestrator.ts`: `createAsyncJob`, `updateAsyncJob`, `getAsyncJob`, `listAsyncJobs`
- New endpoints: `POST /api/msAgentTasks/reason/async` (fires background GPT-4o, returns `jobId`), `GET /api/msAgentTasks/jobs/:jobId` (poll status/result)
- Frontend: "Run Async" button on Clinical Reasoning tab; job status badge + live polling via `refetchInterval`; result appears when job completes

**T002 — Enhanced SSE Queue** (`/api/sse/queue`)
- New SSE endpoint at `/api/sse/queue` (separate from existing `/api/sse/review-queue`) with severity bucketing
- Auto-annotates each case with `_severity` (critical/high/moderate/low) from `brainOutput.severity.severityLevel` or disposition fallback
- Sorts cases: critical P1 first → low P4 last; pushes `buckets` aggregate per update
- ReviewQueueV2 updated: uses new endpoint, shows severity bucket bar, colored left-border strips for critical/high cases, P1–P4 priority badges

**T005 — LangChain Chain History Tab** (`/ms-agent-ops`)
- New "Chain History" tab in MicrosoftAgentOps — fetches from `/api/langchain/history` (already persisted to Firestore in `langchainRoutes.ts`)
- Expandable run cards: type (tool/chain), tool name, latency, timestamp, step list, output preview

**T009 — Expanded Complaint Registry**
- `shared/complaints.ts` expanded from 143 → 262 canonical slugs (added 8 ENT, 5 pulmonary, 6 cardiac, 7 GI, 6 GU, 9 neuro, 7 MSK, 5 derm, 4 psych, 4 endo, 5 infectious, 5 trauma, 8 ophthalmology, 6 OB/GYN, 4 general, 4 vascular, 5 pediatric, 5 heme/onc, 6 toxicology entries)
- `GoldReviewWorkbench.tsx` now imports `COMPLAINTS` from `@shared/complaints` instead of duplicating the list — single source of truth

**Zip Bundle (New Engine Files)**
- `shared/clinicalEngineTypes.ts` — comprehensive unified type definitions (BrainCaseInput, BrainOutput, CoordinationOutput, all result interfaces)
- `server/core/generalization/domainGeneralizationEngine.ts` — domain-agnostic case similarity scoring with feature-weight signal maps
- `server/core/supervisorEngine.ts` — wraps governance result + red flags + entropy into ESCALATE/PASS decision
- `server/core/expansionEngine.ts` — complaint expansion planner (gap analysis between existing complaints and Sheet candidates)
- `server/services/telepresence/telepresenceOrchestrator.ts` — builds session task lists for wall screen, robot, otoscope, vitals, EKG, and X-ray devices with safety checks
- `server/core/index.ts` — barrel export for all core engines

### GoldReviewWorkbench Visual Analytics (`/gold-reviews`)
- Added "Browse" / "Visualize" tab split using shadcn Tabs
- Visualize tab includes: disposition distribution bar chart (colored by severity), confidence level pie chart, reviews-by-complaint bar chart (top 12), and top diagnoses frequency table
- All charts powered by `recharts`, computed from `useMemo` over all gold reviews

### MicrosoftAgentOps Rebuild (`/ms-agent-ops`)
- Complete rebuild with 4-tab interface: Sessions | Clinical Reasoning | Case Review | Chart Builder
- Sessions tab: lists all agent sessions with step trace expansion
- Clinical Reasoning tab: symptom/history input → POST `/api/msAgentTasks/reason` → confidence bar + evidence lists
- Case Review tab: case ID input → POST `/api/msAgentTasks/review/:caseId` → priority-badged suggestion list
- Chart Builder tab: case ID input → POST `/api/msAgentTasks/chart/:caseId` → structured chart sections

### AgentOps Rebuild (`/agent-ops`)
- Rebuilt with 3 tabs: Tasks | Tool Registry | LangChain
- Tasks tab: instruction input + expandable task cards with tool call traces and JSON results
- Tool Registry tab: grid of registered clinical agent tools with category color badges
- LangChain tab: single tool runner (tool selection + JSON input) and multi-step chain builder

### Messaging Status Dashboard (`/messaging-status`)
- New page accessible from Operations sidebar under "Channel Status"
- Shows WhatsApp and Telegram channel configuration and runtime metrics from `getChannelOpsTracker()`
- Summary stats: total inbound, friction escalations, circuit breaker status
- Channel metrics: inbound count, LLM calls, avg/P95 latency, friction escalations, CB activations, tokens, budget hits
- Bar chart of message volume per channel; auto-refreshes every 30s
- Backend: `GET /api/messaging/status` and `POST /api/messaging/reset-metrics`

### LangChain-Compatible API (`/api/langchain/...`)
- `server/langchain/triageTools.ts`: LangChain-schema tool definitions for clinical_reasoning, get_case_summary, list_recent_cases, analyze_complaint, plus all registered agent tools
- `GET /api/langchain/tools`: returns tools in LangChain JSON Schema format
- `POST /api/langchain/run`: execute a single tool with input
- `POST /api/langchain/chain`: execute a sequential chain of up to 10 tools

## System Architecture

### Core Architecture
The system employs a constrained agent architecture for deterministic medical triage, featuring a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. A multi-system triage pipeline uses canonical keys and a unified sheets registry for data configuration and diagnostic candidate generation. A clinical state builder deterministically assembles an auditable clinical state. A modular, skill-based orchestration layer handles clinical triage, supported by an active control plane for managing rollouts and rule governance. An intelligence layer provides explainability and failure-driven rule suggestions, with an extended learning loop that uses patient outcomes for continuous improvement.

### Clinical State Model (CSM) + Event Bus
A unified Clinical State Model (`server/state/`) based on an in-memory and file-persisted `ClinicalState` object drives all completion modules. It utilizes a `clinicalEventBus.ts` to emit typed events (e.g., `SESSION_STARTED`, `SYMPTOMS_RECORDED`, `DISPOSITION_SET`) and a `stateProjectionService.ts` to deterministically map events onto state fields. REST endpoints (`/api/state/:caseId`, `/api/state/:caseId/events`) provide access to the clinical state and its events.

**Event Subscriber** (`server/core/events/eventSubscriber.ts`): Full pub/sub layer with `subscribe/once/unsubscribe/emitToSubscribers`. All `publishEvent()` calls auto-notify registered subscribers. Use `onClinicalEvent(type, handler)` for persistent subscriptions, `onceClinicalEvent(type, handler)` for one-shot handlers.

### Clinical Brain Engine — 25-Step Pipeline
`server/core/clinicalBrainEngine.ts` runs every inference call through a deterministic 25-step pipeline:

| Step | Engine | File |
|------|--------|------|
| 1 | Symptom Normalization | `symptomNormalizationEngine.ts` |
| 2 | Contradiction Detection (24 rules) | `contradictionEngine.ts` |
| 3 | Clinical Safety Guard (hard overrides) | `clinicalSafetyGuard.ts` |
| 3b | Memory Retrieval | `clinicalMemoryEngine.ts` |
| 4 | Case Similarity | `caseSimilarityService.ts` |
| 5 | Knowledge Graph Evidence | `clinicalGraphEngine.ts` |
| 6 | Bayesian Differential | `differentialProbabilityEngine.ts` |
| 6b | Evidence Aggregator (Bayes 50% + sim 30% + graph 20%) | `evidenceAggregatorEngine.ts` |
| 6c | Temporal Progression + Risk Stratification boosts | `temporalProgressionEngine.ts`, `riskStratificationEngine.ts` |
| 7 | Uncertainty / Entropy | `uncertaintyEngine.ts` |
| 8 | Red Flag Safety Layer | `redFlags.ts` |
| 8b | **Severity Scoring** (numeric score → low/moderate/high/critical) | `severityScoringEngine.ts` |
| 8c | **Cross-Complaint Routing** (symptom → secondary complaint pathways) | `crossComplaintRouterEngine.ts` |
| 9 | Next-Best-Question Selector | `nextBestQuestionEngine.ts` |
| 10 | Disposition Logic | inline |
| 10b | Guideline Adherence (16 rules, 6 complaints) | `guidelineAdherenceEngine.ts` |
| 11 | Complaint Completeness Gate | `complaintCompletenessEngine.ts` |
| 11b | Treatment & Test Recommendations | `treatmentEngine.ts`, `testRecommendationEngine.ts` |
| 11c | Test Yield Scoring | `testYieldEngine.ts` |
| 11d | Medication Safety Screening | `medicationSafetyEngine.ts` |
| 11e | **Protocol Variance Check** (red-flag escalation, missing tests, unsafe disposition) | `protocolVarianceEngine.ts` |
| 11f | **Diagnostic Drift Detection** (prior snapshot vs current — major/moderate/none) | `diagnosticDriftEngine.ts` |
| 12 | Clinical Governance + Physician Packet | `clinicalGovernanceEngine.ts`, `physicianReviewPacketEngine.ts` |
| 12b | **Unified Clinical Governance** (merges severity + variance + drift + guideline) | `unifiedClinicalGovernanceEngine.ts` |
| 12c | Disposition Calibration (final arbiter) | `dispositionCalibrationEngine.ts` |
| 12d | Physician Feedback Learning Stats | `physicianFeedbackLearningEngine.ts` |
| 13 | Store in Clinical Memory | `clinicalMemoryEngine.ts` |

**Coordination Layer**: `server/core/clinicalIntelligenceCoordinationLayer.ts` — standalone orchestrator that composes all 11 engines (steps 8b–12c) into a single `CoordinationOutput` package for external API calls.

**Shared constants**: `shared/complaints.ts` (143 canonical complaint slugs), `server/data/complaintAliasRegistry.ts` (152 intake aliases → canonical slugs).

### Adaptive Question Selection Engine
`server/assistant/adaptiveQuestionEngine.ts` implements Bayesian optimal question selection with Shannon entropy minimization. Features:
- 6 complaint specs: `sore_throat`, `cough`, `chest_pain`, `headache`, `abdominal_pain`, `fever/uti`
- Each spec has priors, feature likelihoods, and an 8-question bank
- `computeAdaptiveQuestions()` uses Shannon entropy + Expected Information Gain (EIG) ranking
- Bayesian posterior updates from extracted features; blends 60% Bayes + 40% external differential
- Routes: `GET /api/similarity/adaptive-questions/:caseId` and `POST /api/similarity/adaptive-questions/from-state`
- UI: "🎯 Adaptive Q" tab in UCSM Console with entropy display, differential bars, interactive Yes/No buttons
- Clinical validation: thunderclap+stiff neck+fever → Meningitis 78%, entropy 0.874; trismus+fever → PTA 77%, entropy 1.227

### Frontend
The frontend is built with React 18 and TypeScript, using `shadcn/ui` with Tailwind CSS. It provides interfaces for physician login, patient intake, case status, visit summaries, a physician dashboard, and administrative consoles.

### Backend
The backend is built with Express 5, Node.js, and TypeScript, offering REST API endpoints. It includes features like Centor score calculation, red flag detection, a supervisor gate for patient-facing outputs, and LLM integrations with rate limiting, per-run budgets, and a circuit breaker.

### Data Management
Firebase Firestore is the primary data store, supplemented by SQLite for intake storage. Schemas are defined for physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies ensure split storage for clinical records and debug telemetry. NDJSON-backed stores are used for outcomes, message templates, and tenant configurations.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access for intake is token-based with 6-digit code verification. A JWT-based role authentication layer supports admin, physician, staff, and patient roles.

### Agent System Features
The agent system orchestrates patient flow via a pipeline orchestrator and supports LLM-powered actions, prompt template versioning, and LLM A/B testing with guardrails. A generic complaint engine allows for new complaints to be added via CSV configuration without code changes.

### Clinical Capabilities
The system supports advanced triage logic including subtype expansions, cross-complaint boosts, and generation of ranked diagnostic candidates. It integrates clinical scoring systems (e.g., PERC, WELLS_PE, CENTOR) configured via CSV. A medication safety layer includes a patient constraint engine, drug interaction checker, and dose adjusters. FHIR-lite structured output endpoints provide full triage results, differential diagnoses, clinical documentation, and care plans.

### Completion Modules
The system includes five main completion modules:
1.  **Autonomous Intake System**: Handles multi-turn NLP intake for nine complaints, featuring compound red-flag detection and dynamic follow-up questions.
2.  **Reinforcement Learning Policy Trainer**: Manages a reward function for learning and persistence of triage policies.
3.  **Care Pathway Automation**: Executes predefined care pathways (labs, meds, referrals, follow-ups, monitoring) across multiple complaints.
4.  **Clinician Copilot**: Provides real-time suggestions to clinicians across seven categories (scoring hints, differential DDx, red flags, pending questions, documentation hints, safety checks, pathway suggestions).
5.  **Predictive Risk Modeling**: Calculates multi-factor scores for admission, deterioration, and 30-day readmission risk, utilizing a per-complaint factor library.

### Skill Layers (3-8)
The system incorporates additional skill layers:
-   **SL3 Outcomes**: Patient outcome feedback and mismatch flagging.
-   **SL4 Provider Analytics**: Provider performance metrics.
-   **SL5 Population Health**: Complaint trend analysis and drift detection.
-   **SL6 Clinical Coding**: ICD-10/CPT mapping.
-   **SL7 Comm Hub**: Message template editor for various platforms.
-   **SL8 Tenant Orchestration**: Multi-tenant CRUD operations for feature flags, branding, and limits.

### Case Management and Review
A Firestore-backed state machine manages the case lifecycle, and a physician review and signoff system facilitates case review, queue management, and reviewer assignments.

### Operational Intelligence and Tooling
The platform includes case analytics logs, rule contradiction detection, and a toolchain to compile clinical guidelines. A synthetic testing system generates cases for output validation, supported by a Mismatch Dashboard, Gold Review Workbench, Rule Suggestions, and a Complaint Control Center.

### Self-Developing Medical AI (10 Layers)
An autonomous improvement engine continuously watches, diagnoses, and proposes fixes for the triage system through ten layers:
1.  **Trace Capture**: Records full reasoning paths.
2.  **Gold Case Evaluation**: Compares system output against physician-reviewed gold cases.
3.  **Failure Classification**: Categorizes failures into 13 canonical types.
4.  **Proposal Generation**: Maps failure types to actionable proposals (e.g., add question, strengthen rule).
5.  **Regression + Promotion**: Manages proposal approval workflow.
6.  **Reinforcement Learning**: Employs Q-learning to update policies based on rewards.
7.  **Clinical Knowledge Graph**: A weighted symptom-to-diagnosis graph updated by feedback.
8.  **Predictive Risk Model**: Multi-feature risk scoring with online learning.
9.  **Autonomous Orchestrator**: Manages the full improvement loop from gold case loading to knowledge graph updates.

### Telemedicine Reasoning Assistant
A real-time intelligence layer for text-based telemedicine visits, providing:
-   Session management (`telemedicineSessionService.ts`)
-   Compound safety rules (`telemedicineSafetyService.ts`)
-   Ranked differential diagnoses (`telemedicineDifferentialService.ts`)
-   Medication suggestions (`telemedicineMedicationSuggestionService.ts`)
-   Medication safety checks (`telemedicineMedicationSafetyService.ts`)
-   Auto-coding for ICD-10 and CPT (`telemedicineCodingService.ts`)
-   Return precaution generation (`telemedicineReturnPrecautionService.ts`)
-   Auto-generation of clinical notes (`telemedicineNoteService.ts`)

## External Dependencies
-   **AI Integration**: OpenAI API
-   **Messaging Integration**: Twilio for WhatsApp
-   **Database**: Firebase Firestore
-   **Data Configuration**: Google Sheets
-   **Cloud Storage**: Firebase Storage