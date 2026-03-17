# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform leveraging AI and WhatsApp to optimize initial patient assessments for flu-like symptoms. It proposes diagnoses and treatment plans for physician review, automates communication of approved dispositions and orders to patients, and aims to enhance efficiency, reduce physician workload, and improve patient access to healthcare. The system is designed for continuous improvement through a self-developing AI architecture, with a business vision to transform medical triage into a more efficient, patient-centric process with significant market potential.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system utilizes a constrained agent architecture with a plan/act/observe loop and a multi-system triage pipeline for deterministic medical triage. It features a unified sheets registry for data configuration and diagnostic candidate generation, and a clinical state builder that deterministically assembles an auditable clinical state. A modular, skill-based orchestration layer handles clinical triage, supported by an active control plane for rollouts and rule governance. An intelligence layer provides explainability and failure-driven rule suggestions, with an extended learning loop for continuous improvement.

### UI/UX Decisions
The frontend is built with React 18 and TypeScript, using `shadcn/ui` with Tailwind CSS, providing intuitive interfaces for physicians, patients, and administrators. Key interfaces include physician login, patient intake, case status, visit summaries, physician dashboard, and administrative consoles. Specialized pages like the Clinical Simulation Lab, Clinical Control Tower, and Engine Atlas Dashboard offer advanced system insights and management.

### Technical Implementations
The backend is built with Express 5, Node.js, and TypeScript, offering REST API endpoints. It includes features like Centor score calculation, red flag detection, a supervisor gate for patient-facing outputs, and robust LLM integrations with rate limiting, per-run budgets, and a circuit breaker.

### Feature Specifications
- **Clinical Brain Engine**: A deterministic 25-step pipeline for inference, covering symptom normalization, contradiction detection, clinical safety, memory retrieval, case similarity, knowledge graph evidence, Bayesian differential, evidence aggregation, temporal progression, risk stratification, red flag safety, severity scoring, next-best-question selection, disposition logic, guideline adherence, treatment & test recommendations, and physician packet generation.
- **Self-Developing Medical AI**: An autonomous improvement engine monitors, diagnoses, and proposes fixes through trace capture, gold case evaluation, failure classification, proposal generation, regression, reinforcement learning, and clinical knowledge graph updates.
- **Telemedicine Reasoning Assistant**: Provides real-time session management, compound safety rules, ranked differential diagnoses, medication suggestions, auto-coding for ICD-10 and CPT, return precaution generation, and auto-generation of clinical notes.
- **Agent System**: Orchestrates patient flow via a pipeline orchestrator, supporting LLM-powered actions, prompt template versioning, and LLM A/B testing with guardrails. A generic complaint engine allows for new complaints via CSV.
- **Clinical Capabilities**: Supports advanced triage logic, subtype expansions, cross-complaint boosts, ranked diagnostic candidates, and integrates configurable clinical scoring systems. A medication safety layer includes a patient constraint engine, drug interaction checker, and dose adjusters. FHIR-lite structured output endpoints provide comprehensive triage results.
- **Clinical Knowledge Graph**: A unified clinical ontology connecting complaints, symptoms, skills, engines, diagnoses, protocols, and dispositions in a directed weighted graph. It includes modules for graph types, base graph construction, in-memory storage, query engine, graph builder, gap detection, question coverage scoring, and protocol synchronization.
- **Self-Improving Clinical Brain**: A comprehensive system for continuous improvement, featuring predictive failure detection, root cause analysis, debug action review, multi-agent coordination, and memory snapshots, leading to AI-generated recommendations and autonomous deployment with safety checks.
- **Auralyn SaaS Platform**: A multi-tenant system managing clinics with plan-based access, feature gating, billing services (Stripe-ready), and a tenant-aware clinical brain endpoint.
- **EHR Integration & RBAC**: FHIR R4-compliant EHR integration for Patient, Encounter, and Observation resources, supporting create/read operations. A granular RBAC system manages permissions across various roles (admin, physician, nurse, staff, patient, viewer).
- **Clinical Scale Stack**: Dashboard at `/clinical-scale` with batch physician review (12 cases, select-all/batch approve/override with audit trail), risk scoring engine (HIGH/MEDIUM/LOW classification), outcome feedback loop (8 seeded outcomes, 75% accuracy, auto model adjustment), and FDA-safe positioning with auto-injected disclaimers. Routes in `server/routes/clinicalScaleRoutes.ts`, FDA middleware in `server/middleware/fdaGuard.ts`.

### System Design Choices
- **Data Management**: Firebase Firestore is the primary data store, supplemented by SQLite for intake storage. PHI retention policies ensure split storage for clinical records and debug telemetry. NDJSON-backed stores are used for outcomes, message templates, and tenant configurations.
- **Authentication**: Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient intake uses token-based access with 6-digit code verification. A JWT-based role authentication layer supports admin, physician, staff, and patient roles.
- **Clinical Intelligence Planning Layer (CIPL)**: A strategic layer that automatically identifies areas needing attention, resolves knowledge graph gaps, detects model drift, analyzes outcome accuracy, schedules simulations, and ranks improvement priorities.
- **Clinical Governance & Deployment Layer**: Ensures clinical changes are safe before deployment, including a Governance Queue, Review Engine, Regression Testing Agent, Risk Monitor, and Deployment Manager.
- **12-Layer Clinical AI Architecture**: The entire clinical AI system is organized into 12 structured layers: Interface, Normalization, State, Knowledge, Safety, Reasoning, Decision, Learning, Analytics, Governance, Integration, and Orchestration, with real-time monitoring.

## External Dependencies
*   **AI Integration**: OpenAI API
*   **Messaging Integration**: Twilio for WhatsApp
*   **Database**: Firebase Firestore
*   **Data Configuration**: Google Sheets
*   **Cloud Storage**: Firebase Storage