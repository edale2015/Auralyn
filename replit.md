# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that uses WhatsApp to conduct initial patient assessments for flu-like symptoms. It gathers symptoms and medical history, then leverages AI to generate proposed diagnoses and treatment plans for physician review. The system automates communication of approved dispositions and orders back to patients. Its purpose is to enhance efficiency in managing flu-like consultations, reduce physician workload, and improve patient access to healthcare by integrating AI for initial assessments and automating communication workflows.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18 and TypeScript, using `shadcn/ui` with Tailwind CSS, supporting physician login, patient intake, case status, visit summaries, and a physician dashboard.

### Backend
The backend uses Express 5 on Node.js with TypeScript, providing REST API endpoints. It features a constrained agent architecture for deterministic medical triage, including a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. Key functionalities include Centor score calculation, red flag detection, and a supervisor gate for patient-facing outputs. LLM integrations use Replit AI Integrations with `gpt-5-mini`, incorporating rate limiting, per-run budgets, and a circuit breaker.

### Data Storage
Primary data storage is Firebase Firestore, with SQLite used for intake storage abstraction. Schemas exist for physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies involve splitting storage for clinical records and debug telemetry.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification.

### Agent System
The agent system orchestrates patient flow through various routing states. A pipeline orchestrator manages complaint routing, FHIR prefill, modifiers, rules evaluation, question queue generation, and a supervisor gate. It supports LLM-powered actions, prompt template versioning, and LLM A/B testing with guardrails.

### Generic Complaint Engine (GENERIC_V1)
This data-driven engine replaces per-complaint TypeScript scoring with CSV-driven rules. It processes rules from `CLUSTER_SCORING_RULES.csv` using an expression evaluator and calculates scores, red flags, and dispositions.

### Multi-System Triage Pipeline
A robust triage pipeline uses canonical keys for medical systems and dynamically configures data from a unified sheets registry. It builds question queues, uses an enhanced supervisor for red flags, resolves dispositions, and provides confidence-scored diagnostic candidates and medication suggestions.

### Clinical State Builder System
This system deterministically assembles an auditable clinical state from multiple data tables, capturing evidence traces. It orchestrates parallel execution of red flag evaluation, urgent care interventions, the obesity agent, confidence scoring, and care gap evaluation.

### Case Management & Physician Review
A Firestore-backed case lifecycle manages cases through a state machine (DRAFT → TRIAGED → NEEDS_REVIEW → APPROVED → SENT → CLOSED), providing CRUD services and authentication for review. The frontend offers a physician review queue and detailed case review interfaces.

### Scoring Systems (B1)
Data-driven clinical scoring systems, configured via `SCORING_SYSTEMS.csv`, support 5 validated instruments: PERC, WELLS_PE, CENTOR, CURB-65, and HEART. These are computed automatically after cluster scoring.

### Consistency Engine (B2)
A safety-net layer defined by `CONSISTENCY_RULES.csv` that catches dangerous symptom combinations. It can force emergency dispositions, mandate physician review, or provide advisory flags.

### Calibration System (B3)
Measures over/under-triage rates per complaint against configurable targets defined in `CALIBRATION_TARGETS.csv`.

### Subtype Expansions (B4)
Data-driven subtype upgrades for improved diagnostic granularity. These add optional questions, new cluster scoring rules, DX_PRIORITY tie-breaking, and hard golden tests for various complaints like Cardio Chest Pain, Pulm Cough, Neuro Headache, GI Abdominal Pain, DERM Rash, ENT Sore Throat, GU Flank Pain, MSK Back Pain, and OPHTHO Red Eye. Currently 72+ complaints on GENERIC_V1 with 1364 golden tests passing.

### Validation and Testing
The system includes a Stress Test Harness, Complaint Golden Test Harness, Data Corruption Guard, Replay Harness, Release Candidate (RC) System, and a comprehensive Gate-Prod Pipeline for pre-deployment validation.

## External Dependencies

-   **AI Integration**: OpenAI API (via Replit AI Integrations).
-   **Messaging Integration**: Twilio for WhatsApp, Telegram Bot API for Telegram.
-   **Database**: Firebase Firestore.
-   **Data Configuration**: Google Sheets.
-   **Cloud Storage**: Firebase Storage.