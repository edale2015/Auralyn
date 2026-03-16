# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that uses AI and WhatsApp to streamline initial patient assessments for flu-like symptoms. It proposes diagnoses and treatment plans for physician review, automates communication of approved dispositions and orders to patients, and aims to improve efficiency, reduce physician workload, and enhance patient access to healthcare for flu-like consultations. The system is designed with a strong focus on continuous improvement through a self-developing AI architecture.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system employs a constrained agent architecture for deterministic medical triage, featuring a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. A multi-system triage pipeline uses canonical keys and a unified sheets registry for data configuration and diagnostic candidate generation. A clinical state builder deterministically assembles an auditable clinical state. A modular, skill-based orchestration layer handles clinical triage, supported by an active control plane for managing rollouts and rule governance. An intelligence layer provides explainability and failure-driven rule suggestions, with an extended learning loop that uses patient outcomes for continuous improvement.

### Clinical State Model (CSM) + Event Bus
A unified Clinical State Model (`server/state/`) based on an in-memory and file-persisted `ClinicalState` object drives all completion modules. It utilizes a `clinicalEventBus.ts` to emit typed events and a `stateProjectionService.ts` to deterministically map events onto state fields.

### Clinical Brain Engine – 25-Step Pipeline
The `clinicalBrainEngine.ts` runs every inference call through a deterministic 25-step pipeline including symptom normalization, contradiction detection, clinical safety guard, memory retrieval, case similarity, knowledge graph evidence, Bayesian differential, evidence aggregation, temporal progression, risk stratification, uncertainty/entropy calculation, red flag safety, severity scoring, cross-complaint routing, next-best-question selection, disposition logic, guideline adherence, complaint completeness gating, treatment & test recommendations, test yield scoring, medication safety screening, protocol variance checks, diagnostic drift detection, clinical governance, physician packet generation, unified clinical governance, disposition calibration, physician feedback learning, and storage in clinical memory.

A coordination layer (`server/core/clinicalIntelligenceCoordinationLayer.ts`) orchestrates specific engines into a single output package for external API calls.

### Adaptive Question Selection Engine
An adaptive question engine (`server/assistant/adaptiveQuestionEngine.ts`) implements Bayesian optimal question selection with Shannon entropy minimization for specific complaint specs (e.g., sore throat, cough, chest pain). It uses priors, feature likelihoods, and question banks to compute adaptive questions based on Shannon entropy and Expected Information Gain.

### Self-Developing Medical AI (10 Layers)
An autonomous improvement engine continuously watches, diagnoses, and proposes fixes for the triage system through ten layers: trace capture, gold case evaluation, failure classification, proposal generation, regression + promotion, reinforcement learning, clinical knowledge graph updates, predictive risk model, and an autonomous orchestrator.

### Telemedicine Reasoning Assistant
A real-time intelligence layer provides session management, compound safety rules, ranked differential diagnoses, medication suggestions and safety checks, auto-coding for ICD-10 and CPT, return precaution generation, and auto-generation of clinical notes for text-based telemedicine visits.

### Frontend
The frontend is built with React 18 and TypeScript, using `shadcn/ui` with Tailwind CSS, providing interfaces for physician login, patient intake, case status, visit summaries, physician dashboard, and administrative consoles. New pages include a Clinical Simulation Lab, Clinical Control Tower, Engine Atlas Dashboard, Clinical Visualization Page, and Conversation Optimization Page.

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
The system includes an Autonomous Intake System, Reinforcement Learning Policy Trainer, Care Pathway Automation, Clinician Copilot, and Predictive Risk Modeling.

### Skill Layers
The system incorporates skill layers for Outcomes, Provider Analytics, Population Health, Clinical Coding, Communication Hub, and Tenant Orchestration.

### Case Management and Review
A Firestore-backed state machine manages the case lifecycle, and a physician review and signoff system facilitates case review, queue management, and reviewer assignments.

### Clinical Knowledge Graph
A unified clinical ontology (`server/knowledge/`) connecting complaints, symptoms, skills, engines, diagnoses, protocols, and dispositions in a directed weighted graph (~80 nodes, ~80 edges). Modules: `knowledgeGraphTypes.ts` (8 node types, 8 relation types), `clinicalKnowledgeGraph.ts` (base graph with all 8 complaints), `knowledgeGraphStore.ts` (in-memory store with upsert), `knowledgeGraphQueryEngine.ts` (neighborhood, pathway, search, escalation queries), `knowledgeGraphBuilder.ts` (sync brain assets into graph), `graphGapDetector.ts` (structural gap analysis: missing protocols, skills, engines, dispositions), `questionCoverageEngine.ts` (question-to-skill coverage scoring), `protocolSyncEngine.ts` (protocol alignment). Analysis: `server/analysis/engineDependencyGraph.ts` (8 engine dependency chains with canonical graph IDs). Engine: `server/engines/graphAwareQuestionEngine.ts` (graph-optimized adaptive question selection). Frontend: `/knowledge-graph` page with 6 tabs (Explorer, Pathways, Gap Analysis, Question Coverage, Engine Dependencies, Adaptive Questions). 12 API endpoints at `/api/knowledge-graph/*`.

### Graph-Driven Simulation Engine
A targeted simulation system (`server/simulation/graphDrivenSimulationEngine.ts`) that generates synthetic cases based on knowledge graph gaps instead of random complaints. Modules: `gapTargetCaseFactory.ts` (creates cases per gap type: missing protocol, no engine, no disposition, etc.), `simulationPriorityPlanner.ts` (prioritizes by problem severity), `simulationPlanner.ts` (daily/weekly/monthly schedules). API: GET `/api/graph-simulations`, GET `/api/simulation-schedule`.

### Adaptive Engine Router + Cost Optimizer
`server/brain/adaptiveEngineRouter.ts` dynamically selects which engines to run per case based on complaint type and severity (simple cough → 5 engines, chest pain with red flags → 8+ engines). `server/observability/engineCostOptimizer.ts` tracks latency, cost, and reliability for 12 engines with weighted optimization. APIs: POST `/api/engine-routing`, GET `/api/engine-costs`, POST `/api/engine-costs/optimize`.

### Knowledge Expansion Agent
`server/knowledge/knowledgeExpansionAgent.ts` automatically expands the knowledge graph with new diagnoses, symptoms, questions, skills, or protocols. Maintains expansion audit log. APIs: POST `/api/knowledge-expansion`, GET `/api/knowledge-expansion/stats`.

### Unified Probabilistic Clinical Reasoning Engine
`server/reasoning/unifiedClinicalReasoningEngine.ts` combines 5 signal sources (Bayesian: 30%, similarity: 20%, graph prior: 15%, protocol: 20%, physician override: 15%) into a single probability model. APIs: POST `/api/unified-reasoning`, GET `/api/reasoning-weights`.

### Clinical Outcome Tracker
`server/outcomes/outcomeTracker.ts` records predicted vs actual diagnoses to measure real-world accuracy. APIs: POST `/api/outcomes`, GET `/api/outcomes/stats`.

### Rare Disease Safety Net
`server/engines/rareDiseaseSafetyNet.ts` pattern-matches 7 rare conditions (myocarditis, pheochromocytoma, Guillain-Barré, PE, aortic dissection, meningococcemia, Kawasaki). API: POST `/api/rare-disease-check`.

### Clinical Intelligence Support Modules
- `server/engines/differentialRankingEngine.ts` — Ranks diagnoses using Bayesian + similarity + guideline + red flag signals. POST `/api/differential-ranking`.
- `server/analysis/multiCasePatternDetector.ts` — Finds recurring failure patterns across cases. POST `/api/pattern-detection`.
- `server/engines/conversationSafetyMonitor.ts` — Detects patient confusion/distress with 13 risk patterns and recommends tone adjustments. POST `/api/conversation-safety`.
- `server/explainability/explainableAIEngine.ts` — Generates physician-readable reasoning explanations. POST `/api/clinical-explanation`.
- `server/guidelines/guidelineUpdateAgent.ts` — Monitors 8 clinical guideline sources for compliance. GET `/api/guideline-updates`, GET `/api/guideline-summary`.

### Clinical Memory Engine
`server/memory/clinicalMemoryEngine.ts` — In-memory ring buffer (5000 cases) storing case embeddings + structured features for fast similarity retrieval. Feature-matching scorer returns top-N similar cases with matched feature list. APIs: POST `/api/memory/store-case`, POST `/api/memory/retrieve`, GET `/api/memory/stats`.

### Patient Personalization Engine
`server/engines/patientPersonalizationEngine.ts` — Modifies clinical reasoning using patient context: age >65 (1.3x risk), pediatric <5 (1.2x), pregnancy (1.4x), immunocompromised (1.5x), anticoagulant use (1.2x bleeding risk), smoking (1.15x), obesity (1.1x). Returns compound risk multiplier and list of applied rules. API: POST `/api/personalization/apply`.

### Confidence Calibration Trainer
`server/training/confidenceCalibrationTrainer.ts` — Records predicted confidence vs actual correctness (10K buffer), computes calibration curve by 0.1 buckets with per-bucket accuracy and calibration error. APIs: POST `/api/calibration/record`, GET `/api/calibration/curve`.

### Model Drift Detector
`server/analysis/modelDriftDetector.ts` — Tracks accuracy over time (365-day window), compares recent vs older performance using configurable window size and 5% drift threshold. Returns trend (improving/stable/degrading) with recommendations. APIs: POST `/api/model-drift/record`, GET `/api/model-drift`, GET `/api/model-drift/history`.

### Autonomous Research Agent
`server/research/autonomousResearchAgent.ts` — Monitors medical literature and proposes knowledge graph updates. Simulates 5 research findings (myocarditis, long COVID, mpox pharyngitis, RSV, vestibular migraine) with sources and relevance scores. APIs: GET `/api/research/findings`, GET `/api/research/stats`.

### Operational Intelligence and Tooling
The platform includes case analytics logs, rule contradiction detection, and a toolchain to compile clinical guidelines. A synthetic testing system generates cases for output validation, supported by a Mismatch Dashboard, Gold Review Workbench, Rule Suggestions, and a Complaint Control Center.

## External Dependencies
-   **AI Integration**: OpenAI API
-   **Messaging Integration**: Twilio for WhatsApp
-   **Database**: Firebase Firestore
-   **Data Configuration**: Google Sheets
-   **Cloud Storage**: Firebase Storage