# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that uses AI and WhatsApp to streamline initial patient assessments for flu-like symptoms. It proposes diagnoses and treatment plans for physician review, automates communication of approved dispositions and orders to patients, and aims to improve efficiency, reduce physician workload, and enhance patient access to healthcare for flu-like consultations. The system is designed with a strong focus on continuous improvement through a self-developing AI architecture, incorporating a business vision to transform medical triage into a more efficient, patient-centric process with high market potential in digital health.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system employs a constrained agent architecture for deterministic medical triage, featuring a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. It uses a multi-system triage pipeline with canonical keys and a unified sheets registry for data configuration and diagnostic candidate generation. A clinical state builder deterministically assembles an auditable clinical state. A modular, skill-based orchestration layer handles clinical triage, supported by an active control plane for managing rollouts and rule governance. An intelligence layer provides explainability and failure-driven rule suggestions, with an extended learning loop using patient outcomes for continuous improvement.

### Clinical State Model (CSM)
A unified `ClinicalState` object, based on an in-memory and file-persisted model, drives all completion modules. It utilizes an event bus for typed events and a state projection service to deterministically map events onto state fields.

### Clinical Brain Engine
The system features a deterministic 25-step pipeline for every inference call, encompassing symptom normalization, contradiction detection, clinical safety, memory retrieval, case similarity, knowledge graph evidence, Bayesian differential, evidence aggregation, temporal progression, risk stratification, red flag safety, severity scoring, cross-complaint routing, next-best-question selection, disposition logic, guideline adherence, complaint completeness gating, treatment & test recommendations, medication safety screening, protocol variance checks, diagnostic drift detection, clinical governance, physician packet generation, and disposition calibration. A coordination layer orchestrates these engines into a single output.

### Adaptive Question Selection Engine
An adaptive question engine implements Bayesian optimal question selection with Shannon entropy minimization for specific complaint specifications, using priors, feature likelihoods, and question banks to compute adaptive questions based on Shannon entropy and Expected Information Gain.

### Self-Developing Medical AI
An autonomous improvement engine continuously monitors, diagnoses, and proposes fixes for the triage system through ten layers, including trace capture, gold case evaluation, failure classification, proposal generation, regression, reinforcement learning, clinical knowledge graph updates, and an autonomous orchestrator.

### Telemedicine Reasoning Assistant
A real-time intelligence layer provides session management, compound safety rules, ranked differential diagnoses, medication suggestions, auto-coding for ICD-10 and CPT, return precaution generation, and auto-generation of clinical notes for text-based telemedicine visits.

### Frontend
The frontend is built with React 18 and TypeScript, using `shadcn/ui` with Tailwind CSS, providing interfaces for physician login, patient intake, case status, visit summaries, physician dashboard, and administrative consoles. It includes specialized pages like a Clinical Simulation Lab, Clinical Control Tower, Engine Atlas Dashboard, Clinical Visualization Page, and Conversation Optimization Page.

### Backend
The backend is built with Express 5, Node.js, and TypeScript, offering REST API endpoints. It includes features like Centor score calculation, red flag detection, a supervisor gate for patient-facing outputs, and LLM integrations with rate limiting, per-run budgets, and a circuit breaker.

### Data Management
Firebase Firestore is the primary data store, supplemented by SQLite for intake storage. Schemas are defined for physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies ensure split storage for clinical records and debug telemetry. NDJSON-backed stores are used for outcomes, message templates, and tenant configurations.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access for intake is token-based with 6-digit code verification. A JWT-based role authentication layer supports admin, physician, staff, and patient roles.

### Agent System Features
The agent system orchestrates patient flow via a pipeline orchestrator and supports LLM-powered actions, prompt template versioning, and LLM A/B testing with guardrails. A generic complaint engine allows for new complaints to be added via CSV configuration without code changes.

### Clinical Capabilities
The system supports advanced triage logic including subtype expansions, cross-complaint boosts, and generation of ranked diagnostic candidates. It integrates clinical scoring systems configurable via CSV. A medication safety layer includes a patient constraint engine, drug interaction checker, and dose adjusters. FHIR-lite structured output endpoints provide full triage results, differential diagnoses, clinical documentation, and care plans.

### Clinical Knowledge Graph
A unified clinical ontology connecting complaints, symptoms, skills, engines, diagnoses, protocols, and dispositions in a directed weighted graph. It includes modules for graph types, base graph construction, in-memory storage, query engine, graph builder, gap detection, question coverage scoring, and protocol synchronization. Analysis tools for engine dependency chains and a graph-optimized adaptive question engine are also integrated. A dedicated frontend dashboard with multiple tabs provides exploration and analysis capabilities.

### Graph-Driven Simulation Engine
A targeted simulation system generates synthetic cases based on knowledge graph gaps, using a gap target case factory and a simulation priority planner for scheduling.

### Adaptive Engine Router + Cost Optimizer
Dynamically selects which engines to run per case based on complaint type and severity. An observability module tracks latency, cost, and reliability for engines with weighted optimization.

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
Leverages GPT-4o for clinical reasoning, providing differential diagnoses, recommended dispositions, critical findings, next steps, and confidence levels. A separate agent generates structured clinical notes, and a full pipeline endpoint chains both sequentially.

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

### Knowledge Graph Dashboard
An 8-tab dashboard (Explorer, Pathways, Gap Analysis, Question Coverage, Engine Dependencies, Adaptive Questions, Data Import, AI Planner) provides a comprehensive view and management interface for the clinical knowledge graph.

### Operational Intelligence and Tooling
Includes case analytics logs, rule contradiction detection, and a toolchain to compile clinical guidelines. A synthetic testing system generates cases for output validation, supported by a Mismatch Dashboard, Gold Review Workbench, Rule Suggestions, and a Complaint Control Center.

## External Dependencies
*   **AI Integration**: OpenAI API
*   **Messaging Integration**: Twilio for WhatsApp
*   **Database**: Firebase Firestore
*   **Data Configuration**: Google Sheets
*   **Cloud Storage**: Firebase Storage