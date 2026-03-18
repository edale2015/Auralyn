# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is an AI-powered medical triage platform for flu-like symptoms, leveraging WhatsApp for initial patient assessments. It aims to provide diagnoses and treatment plans for physician review, automate patient communication, and enhance healthcare efficiency and access. The system is designed for continuous improvement through a self-developing AI architecture, with a vision to transform medical triage into a more efficient, patient-centric process.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system employs a constrained agent architecture with a plan/act/observe loop and a multi-system triage pipeline. It features a unified sheets registry for data configuration and diagnostic candidate generation, and a clinical state builder that deterministically assembles an auditable clinical state. A modular, skill-based orchestration layer handles clinical triage, supported by an active control plane for rollouts and rule governance. An intelligence layer provides explainability and failure-driven rule suggestions, with an extended learning loop for continuous improvement. The Clinical Intelligence Planning Layer (CIPL) automatically identifies areas for improvement, resolves knowledge gaps, detects model drift, and prioritizes enhancements. A Clinical Governance & Deployment Layer ensures the safety of clinical changes before deployment. The entire clinical AI system follows a 12-layer architecture encompassing Interface, Normalization, State, Knowledge, Safety, Reasoning, Decision, Learning, Analytics, Governance, Integration, and Orchestration.

### UI/UX Decisions
The frontend is built with React 18, TypeScript, `shadcn/ui`, and Tailwind CSS, offering intuitive interfaces for physicians, patients, and administrators. Key interfaces include physician login, patient intake, case status, visit summaries, physician dashboard, and administrative consoles. Specialized pages like the Clinical Simulation Lab, Clinical Control Tower, Engine Atlas Dashboard, Clinical Scale, Operations Dashboard, Smart Intake Pipeline, Intelligence Layer, Pack Builder, Pack Simulator, Coverage Dashboard, Adaptive Control, Pack Admin, Pack Audit Log, and Pack Questions offer advanced system insights and management.

### Technical Implementations
The backend uses Express 5, Node.js, and TypeScript, providing REST API endpoints. It incorporates Centor score calculation, red flag detection, a supervisor gate for patient-facing outputs, and robust LLM integrations with rate limiting, per-run budgets, and a circuit breaker.
The system features a **Clinical Brain Engine** for deterministic inference, a **Self-Developing Medical AI** for autonomous improvement, and a **Telemedicine Reasoning Assistant** for real-time session management and clinical support. An **Agent System** orchestrates patient flow, supporting LLM-powered actions and A/B testing.
**Clinical Capabilities** include advanced triage logic, subtype expansions, ranked diagnostic candidates, and configurable clinical scoring systems. A medication safety layer integrates a patient constraint engine, drug interaction checker, and dose adjusters. FHIR-lite structured output endpoints provide comprehensive triage results.
The **Clinical Knowledge Graph** is a unified clinical ontology connecting complaints, symptoms, skills, engines, diagnoses, protocols, and dispositions.
The **Self-Improving Clinical Brain** continuously improves through predictive failure detection, root cause analysis, and AI-generated recommendations.
The **Auralyn SaaS Platform** is a multi-tenant system for managing clinics with plan-based access, feature gating, and billing services.
**EHR Integration** is FHIR R4-compliant for Patient, Encounter, and Observation resources, with granular **RBAC** for various roles.
The system includes **30+ Complaint Packs** for specific conditions, a **Pack Row System** for symptom and modifier definitions, a **Pack Repository Layer** with InMemory and Google Sheets adapters, a **Pack Validation Engine**, **Normalized Question Rows**, and a **Pack Audit Log**. A **Visual Rule Builder** allows for intuitive rule editing. An **Adaptive Control Loop** manages real-time safety posture and insights.
The **Self-Improving Loop** includes a **Feedback Engine** (outcome ingestion), **Error Detection Engine** (severity classification: CRITICAL/HIGH/MODERATE/LOW), **Auto-Fix Generator** (RULE_ADD, RED_FLAG_ADD, QUESTION_ADD, ESCALATION_THRESHOLD proposals), and an idempotent **Improvement Cycle Engine** with deduplication. A **Case Memory Engine** provides Jaccard similarity-based clinical case retrieval. The **Explainability Graph Engine** builds visual decision trace graphs from clinical traces (questions, modifiers, rules, clusters → diagnosis). The **Physician Control Center** (`/physician-dashboard`) is a 7-tab unified dashboard (Overview, Feedback, Errors, Self-Improve, Case Memory, Explainability, Simulation) with role-based access control. All physician routes are at `/api/physician/*`.

### System Design Choices
- **Data Management**: Firebase Firestore is the primary data store, supplemented by SQLite for intake. PHI retention policies ensure split storage for clinical records and debug telemetry. NDJSON-backed stores are used for outcomes, message templates, and tenant configurations.
- **Authentication**: Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient intake uses token-based access with 6-digit code verification. A JWT-based role authentication layer supports admin, physician, staff, and patient roles.

## External Dependencies
*   **AI Integration**: OpenAI API
*   **Messaging Integration**: Twilio for WhatsApp
*   **Database**: Firebase Firestore
*   **Data Configuration**: Google Sheets
*   **Cloud Storage**: Firebase Storage