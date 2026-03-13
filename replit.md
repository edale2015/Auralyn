# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform designed to streamline initial patient assessments for flu-like symptoms using WhatsApp. It leverages AI for proposed diagnoses and treatment plans, which are then reviewed by physicians. The system automates communication of approved dispositions and orders to patients, aiming to improve efficiency, reduce physician workload, and enhance patient access to healthcare for flu-like consultations.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system employs a constrained agent architecture for deterministic medical triage, featuring a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. A multi-system triage pipeline uses canonical keys and a unified sheets registry for data configuration and diagnostic candidate generation. A clinical state builder deterministically assembles an auditable clinical state. A modular, skill-based orchestration layer handles clinical triage, supported by an active control plane for managing rollouts and rule governance. An intelligence layer provides explainability and failure-driven rule suggestions, with an extended learning loop that uses patient outcomes for continuous improvement.

### Clinical State Model (CSM) + Event Bus
A unified Clinical State Model (`server/state/`) based on an in-memory and file-persisted `ClinicalState` object drives all completion modules. It utilizes a `clinicalEventBus.ts` to emit typed events (e.g., `SESSION_STARTED`, `SYMPTOMS_RECORDED`, `DISPOSITION_SET`) and a `stateProjectionService.ts` to deterministically map events onto state fields. REST endpoints (`/api/state/:caseId`, `/api/state/:caseId/events`) provide access to the clinical state and its events.

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