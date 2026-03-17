# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that uses AI and WhatsApp to streamline initial patient assessments for flu-like symptoms. It proposes diagnoses and treatment plans for physician review, automates communication of approved dispositions and orders to patients, and aims to improve efficiency, reduce physician workload, and enhance patient access to healthcare. The system focuses on continuous improvement through a self-developing AI architecture, with a business vision to transform medical triage into a more efficient, patient-centric process.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system employs a constrained agent architecture for deterministic medical triage, featuring a plan/act/observe agent loop and a multi-system triage pipeline. It utilizes a unified sheets registry for data configuration and diagnostic candidate generation, and a clinical state builder that deterministically assembles an auditable clinical state. A modular, skill-based orchestration layer handles clinical triage, supported by an active control plane for managing rollouts and rule governance. An intelligence layer provides explainability and failure-driven rule suggestions, with an extended learning loop for continuous improvement.

### Clinical State Model (CSM)
A unified `ClinicalState` object, based on an in-memory and file-persisted model, drives all completion modules, utilizing an event bus for typed events and a state projection service.

### Clinical Brain Engine
A deterministic 25-step pipeline for every inference call covers symptom normalization, contradiction detection, clinical safety, memory retrieval, case similarity, knowledge graph evidence, Bayesian differential, evidence aggregation, temporal progression, risk stratification, red flag safety, severity scoring, next-best-question selection, disposition logic, guideline adherence, treatment & test recommendations, and physician packet generation. An adaptive question engine implements Bayesian optimal question selection.

### Self-Developing Medical AI
An autonomous improvement engine continuously monitors, diagnoses, and proposes fixes through trace capture, gold case evaluation, failure classification, proposal generation, regression, reinforcement learning, and clinical knowledge graph updates.

### Telemedicine Reasoning Assistant
Provides real-time session management, compound safety rules, ranked differential diagnoses, medication suggestions, auto-coding for ICD-10 and CPT, return precaution generation, and auto-generation of clinical notes.

### Frontend
Built with React 18 and TypeScript, using `shadcn/ui` with Tailwind CSS, providing interfaces for physician login, patient intake, case status, visit summaries, physician dashboard, and administrative consoles. Specialized pages include a Clinical Simulation Lab, Clinical Control Tower, and Engine Atlas Dashboard.

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

### Complaint Alias Registry
Maps natural-language aliases to canonical complaint slugs for consistent processing.

### Clinical Intelligence Planning Layer (CIPL)
A strategic layer that automatically identifies areas needing attention, resolves knowledge graph gaps, detects model drift, analyzes outcome accuracy, schedules simulations, and ranks improvement priorities.

### Sheet Data Import and Ingestion
Allows for the upload of clinical data (e.g., complaints, diagnoses, questions, protocols, medications) via CSV, XLSX, or JSON files to populate the knowledge graph through a full pipeline: validation gate → sheet parsing → graph transformation → knowledge graph population.

### Clinical Change Audit Log and Version Control
Tracks every clinical data change with timestamps, sheet name, change type, key, and impact analysis. A Clinical Version Control System (CVCS) provides version snapshots, diffing, deployment, and rollback capabilities for clinical configurations.

### Clinical Governance & Deployment Layer
Comprises modules ensuring clinical changes are safe before deployment, including a Governance Queue, Review Engine, Regression Testing Agent, Risk Monitor, and Deployment Manager.

### Clinical Intelligence Control Center (CICC)
A master "mission control" dashboard aggregating all platform subsystems, providing an overview of safety scores, system health, engine summaries, graph health, active alerts, and version status.

### Clinical Analytics Engines
A unified dashboard provides advanced clinical analysis tools including Differential Diagnosis Explorer, Question Impact Analyzer, Protocol Conflict Detector, and Case Cluster Discovery Engine.

### Knowledge Graph Dashboard
An 8-tab dashboard provides a comprehensive view and management interface for the clinical knowledge graph.

### Operational Intelligence and Tooling
Includes case analytics logs, rule contradiction detection, a toolchain to compile clinical guidelines, and a synthetic testing system to generate cases for output validation.

### Advanced Clinical Engines
A dashboard at `/advanced-clinical-engines` offers advanced clinical AI capabilities:
- **Clinical Drift Detector**: Compares baseline vs current case results, detecting diagnosis/disposition drift.
- **Diagnostic Uncertainty Navigator**: Entropy-based next-best-question selector.
- **Treatment Outcome Learning Engine**: Feeds back real outcomes to update diagnosis probabilities.
- **Clinical Risk Scoring Engine**: Implements Modified Centor, Wells, and HEART scores.
- **Federated Learning Engine**: Aggregates anonymized case data across clinics.

### 12-Layer Clinical AI Architecture & Brain Monitor
The entire clinical AI system is organized into 12 structured layers: Interface, Normalization, State, Knowledge, Safety, Reasoning, Decision, Learning, Analytics, Governance, Integration, and Orchestration. A real-time monitoring system tracks events and system health, with a Clinical Brain Monitor dashboard at `/clinical-brain-monitor`.

### Self-Improving Clinical Brain
Dashboard at `/self-improving-brain` with 5 tabs (Cycle, Predict, Debug, Agents, Deploy):
- **Self-Improvement Cycle** — Runs a full analysis pass: predictive failure detection, root cause analysis, debug action review, agent coordination, and memory snapshot. Outputs AI-generated recommendations. (`server/brain/selfImprovingBrain.ts`)
- **Predictive Failure Engine** — Tracks latency/error trends across 6 services, detects increasing latency and error spikes, predicts failures before they happen. (`server/engines/predictiveFailureEngine.ts`)
- **Auto-Debugger Agent** — Subscribes to event bus, automatically handles errors, detects latency anomalies, scans system health every 10s, dispatches restart/reroute/adjust/alert actions. (`server/agents/autoDebuggerAgent.ts`)
- **Root Cause Engine** — Analyzes error events to identify primary failure sources and detect error burst patterns. (`server/agents/rootCauseEngine.ts`)
- **Multi-Agent Coordinator** — Prevents task conflicts across 5 agents (AutoDebugger, PredictiveEngine, SimulationAgent, LearningAgent, GovernanceAgent). (`server/agents/multiAgentCoordinator.ts`)
- **Clinical Memory Engine** — Centralized memory store with TTL support, type-based retrieval, and capacity management (1000 entries). (`server/engines/memoryEngine.ts`)
- **Explainability Graph Engine** — Builds reasoning trace graphs from layer execution data. (`server/engines/explainabilityGraphEngine.ts`)
- **Autonomous Deployment Engine** — Governance-gated deployment with predictive risk checks, simulation testing, and safety gates. Tracks deployment history with approve/reject/rollback. (`server/deployment/autonomousDeploymentEngine.ts`)

APIs: GET `/api/self-improving/cycle|history`, `/api/predictive-failures`, `/api/auto-debugger/actions|root-cause`, `/api/agent-coordinator`, `/api/clinical-memory`, `/api/autonomous-deploy/history`; POST `/api/explainability-graph`, `/api/autonomous-deploy`. Routes in `server/routes/selfImprovingRoutes.ts`.

## External Dependencies
*   **AI Integration**: OpenAI API
*   **Messaging Integration**: Twilio for WhatsApp
*   **Database**: Firebase Firestore
*   **Data Configuration**: Google Sheets
*   **Cloud Storage**: Firebase Storage