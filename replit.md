# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that uses AI and WhatsApp to streamline initial patient assessments for flu-like symptoms. It proposes diagnoses and treatment plans for physician review, automates communication of approved dispositions and orders to patients, and aims to improve efficiency, reduce physician workload, and enhance patient access to healthcare. The system focuses on continuous improvement through a self-developing AI architecture, with a business vision to transform medical triage into a more efficient, patient-centric process.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system utilizes a constrained agent architecture for deterministic medical triage, featuring a plan/act/observe agent loop and a multi-system triage pipeline with canonical keys and a unified sheets registry for data configuration and diagnostic candidate generation. A clinical state builder deterministically assembles an auditable clinical state. A modular, skill-based orchestration layer handles clinical triage, supported by an active control plane for managing rollouts and rule governance. An intelligence layer provides explainability and failure-driven rule suggestions, with an extended learning loop using patient outcomes for continuous improvement.

### Clinical State Model (CSM)
A unified `ClinicalState` object, based on an in-memory and file-persisted model, drives all completion modules, utilizing an event bus for typed events and a state projection service.

### Clinical Brain Engine
The system features a deterministic 25-step pipeline for every inference call, encompassing symptom normalization, contradiction detection, clinical safety, memory retrieval, case similarity, knowledge graph evidence, Bayesian differential, evidence aggregation, temporal progression, risk stratification, red flag safety, severity scoring, cross-complaint routing, next-best-question selection, disposition logic, guideline adherence, complaint completeness gating, treatment & test recommendations, medication safety screening, protocol variance checks, diagnostic drift detection, clinical governance, physician packet generation, and disposition calibration.

### Adaptive Question Selection Engine
An adaptive question engine implements Bayesian optimal question selection with Shannon entropy minimization using priors, feature likelihoods, and question banks.

### Self-Developing Medical AI
An autonomous improvement engine continuously monitors, diagnoses, and proposes fixes through trace capture, gold case evaluation, failure classification, proposal generation, regression, reinforcement learning, and clinical knowledge graph updates.

### Telemedicine Reasoning Assistant
Provides real-time session management, compound safety rules, ranked differential diagnoses, medication suggestions, auto-coding for ICD-10 and CPT, return precaution generation, and auto-generation of clinical notes.

### Frontend
Built with React 18 and TypeScript, using `shadcn/ui` with Tailwind CSS, providing interfaces for physician login, patient intake, case status, visit summaries, physician dashboard, and administrative consoles. Specialized pages include a Clinical Simulation Lab, Clinical Control Tower, Engine Atlas Dashboard, Clinical Visualization Page, and Conversation Optimization Page.

### Backend
Built with Express 5, Node.js, and TypeScript, offering REST API endpoints. Includes Centor score calculation, red flag detection, a supervisor gate for patient-facing outputs, and LLM integrations with rate limiting, per-run budgets, and a circuit breaker.

### Data Management
Firebase Firestore is the primary data store, supplemented by SQLite for intake storage. Schemas are defined for physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies ensure split storage for clinical records and debug telemetry. NDJSON-backed stores are used for outcomes, message templates, and tenant configurations.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access for intake is token-based with 6-digit code verification. A JWT-based role authentication layer supports admin, physician, staff, and patient roles.

### Agent System Features
Orchestrates patient flow via a pipeline orchestrator and supports LLM-powered actions, prompt template versioning, and LLM A/B testing with guardrails. A generic complaint engine allows for new complaints to be added via CSV configuration.

### Clinical Capabilities
Supports advanced triage logic including subtype expansions, cross-complaint boosts, and generation of ranked diagnostic candidates. Integrates clinical scoring systems configurable via CSV. A medication safety layer includes a patient constraint engine, drug interaction checker, and dose adjusters. FHIR-lite structured output endpoints provide full triage results, differential diagnoses, clinical documentation, and care plans.

### Clinical Knowledge Graph
A unified clinical ontology connecting complaints, symptoms, skills, engines, diagnoses, protocols, and dispositions in a directed weighted graph. Includes modules for graph types, base graph construction, in-memory storage, query engine, graph builder, gap detection, question coverage scoring, and protocol synchronization. A dedicated frontend dashboard provides exploration and analysis capabilities.

### Graph-Driven Simulation Engine
Generates synthetic cases based on knowledge graph gaps, using a gap target case factory and a simulation priority planner.

### Adaptive Engine Router + Cost Optimizer
Dynamically selects which engines to run per case based on complaint type and severity, with an observability module tracking latency, cost, and reliability.

### Knowledge Expansion Agent
Automatically expands the knowledge graph with new diagnoses, symptoms, questions, skills, or protocols, maintaining an expansion audit log.

### Unified Probabilistic Clinical Reasoning Engine
Combines multiple signal sources (Bayesian, similarity, graph prior, protocol, physician override) into a single probability model for clinical reasoning.

### Clinical Outcome Tracker
Records predicted versus actual diagnoses to measure real-world accuracy.

### Rare Disease Safety Net
Pattern-matches specific rare conditions for early detection.

### Clinical Intelligence Support Modules
Includes engines for differential ranking, multi-case pattern detection, conversation safety monitoring, explainable AI, guideline update monitoring, clinical memory for similarity retrieval, patient personalization, confidence calibration training, model drift detection, and an autonomous research agent for monitoring medical literature.

### OpenAI Clinical Reasoning Agents
Leverages GPT-4o for clinical reasoning, providing differential diagnoses, recommended dispositions, critical findings, next steps, and confidence levels. A separate agent generates structured clinical notes.

### Clinical Scenario Generator
Generates realistic patient narratives from templates for various complaint types with randomized demographics, symptoms, and history.

### System Architecture Map
Provides a live architectural overview of the platform, detailing layers, engines, agents, dashboards, and API surfaces.

### Complaint Alias Registry
Maps natural-language aliases to canonical complaint slugs for consistent processing.

### Clinical Intelligence Planning Layer (CIPL)
A strategic layer that automatically identifies areas needing attention, resolves knowledge graph gaps, detects model drift, analyzes outcome accuracy, schedules simulations, and ranks improvement priorities.

### Sheet Data Import
Allows for the upload of clinical data (e.g., complaints, diagnoses, questions, protocols, medications) via CSV, XLSX, or JSON files to populate the knowledge graph, with admin-only access.

### Sheet-to-Graph Ingestion Pipeline
Full pipeline for clinical data ingestion: validation gate → sheet parsing → graph transformation → knowledge graph population. Ingests COMPLAINT_REGISTRY, CORE_QUESTIONS, DISPOSITION_RULES, RED_FLAG_RULES, CLUSTER_SCORING_RULES, OUTPUT_TEMPLATES into the knowledge graph as nodes/edges.

### Clinical Change Audit Log
Tracks every clinical data change with timestamps, sheet name, change type, key, and impact analysis, mapping changes to affected systems with severity ratings.

### Sheet Sync Engine
File-based sync with diff detection, scheduled daily sync support, and sync history tracking.

### Clinical Schema Validator
A 4-layer workbook validator checking: (1) workbook integrity, (2) header/schema integrity, (3) cross-sheet referential integrity, (4) data quality. Validates 7 required sheets.

### Clinical Governance & Deployment Layer
Comprises 7 modules ensuring clinical changes are safe before deployment: Governance Queue, Review Engine, Regression Testing Agent, Risk Monitor, Knowledge Consistency Engine, Physician Feedback Agent, and Deployment Manager.

### Clinical Version Control System (CVCS)
Comprises 6 modules for clinical configuration versioning: Version Types, Version Store, Version Manager, Version Diff, Rollback Manager, and Change Timeline, providing version snapshots, diffing, deployment, and rollback capabilities.

### Clinical Intelligence Control Center (CICC)
The master "mission control" dashboard aggregating all platform subsystems, providing an overview of safety scores, system health, engine summaries, graph health, active alerts, and version status. It also includes an Engine Profiler, Interactive Intelligence Map, and Visual Reasoning Debugger.

### Clinical Analytics Engines
A unified 5-tab dashboard providing advanced clinical analysis tools including Differential Diagnosis Explorer, Question Impact Analyzer, Protocol Conflict Detector, Case Cluster Discovery Engine, and an Autonomous PubMed Research Agent.

### Knowledge Graph Dashboard
An 8-tab dashboard (Explorer, Pathways, Gap Analysis, Question Coverage, Engine Dependencies, Adaptive Questions, Data Import, AI Planner) provides a comprehensive view and management interface for the clinical knowledge graph.

### Operational Intelligence and Tooling
Includes case analytics logs, rule contradiction detection, and a toolchain to compile clinical guidelines. A synthetic testing system generates cases for output validation, supported by a Mismatch Dashboard, Gold Review Workbench, Rule Suggestions, and a Complaint Control Center.

### Advanced Clinical Engines
A 5-tab dashboard at `/advanced-clinical-engines` for advanced clinical AI capabilities:
- **Clinical Drift Detector** — Compares baseline vs current case results, detecting diagnosis/disposition drift with severity grading (none→critical). Tracks change rates and lists specific case changes. (`server/engines/clinicalDriftDetector.ts`)
- **Diagnostic Uncertainty Navigator** — Entropy-based next-best-question selector. Computes information gain for 5 candidate questions and ranks them by diagnostic uncertainty reduction. (`server/engines/diagnosticUncertaintyNavigator.ts`)
- **Treatment Outcome Learning Engine** — Feeds back real outcomes to update diagnosis probabilities (70/30 observed/prior blend). Shows confusion matrix, accuracy metrics, and learning recommendations. (`server/engines/outcomeLearningEngine.ts`)
- **Clinical Risk Scoring Engine** — Implements Modified Centor (strep), Wells (PE), and HEART (cardiac) scores with interpretations and recommendations. (`server/engines/riskScoringEngine.ts`)
- **Federated Learning Engine** — Aggregates anonymized case data across 4 clinics (1,026 cases) without sharing PHI. Shows global diagnosis distribution and clinic contributions. (`server/federated/federatedLearningEngine.ts`)

APIs: GET `/api/clinical-drift`, `/api/uncertainty-navigator`, `/api/outcome-learning`, `/api/risk-scores/demo`, `/api/federated-learning`; POST `/api/risk-scores/centor|wells|heart`. Routes in `server/routes/advancedEngineRoutes.ts`.

## External Dependencies
*   **AI Integration**: OpenAI API
*   **Messaging Integration**: Twilio for WhatsApp
*   **Database**: Firebase Firestore
*   **Data Configuration**: Google Sheets
*   **Cloud Storage**: Firebase Storage