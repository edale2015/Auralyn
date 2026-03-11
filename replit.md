# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform leveraging WhatsApp for initial patient assessments of flu-like symptoms. It collects symptoms and medical history, utilizes AI for proposed diagnoses and treatment plans for physician review, and automates communication of approved dispositions and orders to patients. The system aims to enhance efficiency in flu-like consultations, reduce physician workload, and improve patient access to healthcare.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system employs a constrained agent architecture for deterministic medical triage, featuring a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. A multi-system triage pipeline uses canonical keys and a unified sheets registry for data configuration and diagnostic candidate generation. A clinical state builder deterministically assembles an auditable clinical state, and a modular, skill-based orchestration layer handles clinical triage.

### Frontend
Built with React 18 and TypeScript, using `shadcn/ui` with Tailwind CSS, the frontend supports physician login, patient intake, case status, visit summaries, and a physician dashboard.

### Backend
The backend runs on Express 5 with Node.js and TypeScript, providing REST API endpoints. It includes Centor score calculation, red flag detection, and a supervisor gate for patient-facing outputs. LLM integrations feature rate limiting, per-run budgets, and a circuit breaker.

### Data Management
Firebase Firestore serves as the primary data storage, supplemented by SQLite for intake storage. Schemas define physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies enforce split storage for clinical records and debug telemetry.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification. A JWT-based role authentication layer supports admin, physician, staff, and patient roles.

### Agent System Features
The agent system orchestrates patient flow through routing states using a pipeline orchestrator. It supports LLM-powered actions, prompt template versioning, and LLM A/B testing with guardrails.

### Skill Layer 2.0 (Platform Layer)
This production platform layer wraps the clinical skill engine, managing tenant-specific configurations, release gates, deployment readiness checks, and a unified review queue. It also provides an admin REST API for platform operations and a system for hardening complaints based on prediction/disposition failures. Graph trace logging and golden case comparisons are integral for validation.

### Generic Complaint Engine (GENERIC_V1)
This data-driven engine allows new complaints to be added without code changes by using CSV-configured rules, replacing TypeScript scoring modules.

### Clinical Scoring Systems
Data-driven clinical scoring systems (e.g., PERC, WELLS_PE, CENTOR) are configured via CSV, with a consistency engine providing a safety net for dangerous symptom combinations.

### Advanced Triage Logic
The system supports subtype expansions, cross-complaint boosts, and an engine to generate ranked diagnostic candidates.

### Case Management
A Firestore-backed state machine manages the case lifecycle (DRAFT → TRIAGED → NEEDS_REVIEW → APPROVED → SENT → CLOSED), offering CRUD services and authentication for review.

### Physician Review & Signoff System
Facilitates physician review, managing the review queue, assigning reviewers, and orchestrating signoffs.

### Note Generation & Chart Export
Generates deterministic note drafts from engine output and case data using templates and a dedicated service.

### Patient Intake Chat (Web)
A browser-based conversational intake flow maps patient responses to clinical states and runs the generic complaint engine.

### Operational Intelligence & Tooling
Includes case analytics logs, cluster coverage heatmaps, engine coverage audits, rule contradiction detection, and a toolchain to compile clinical guidelines into engine-ready CSVs.

### Synthetic Testing System
Generates synthetic cases across all complaints using the GENERIC_V1 engine, validating output against expected results and persisting statistics.

### Validation Sprint Tooling
Comprises a Synthetic Testing UI, Mismatch Dashboard, Gold Review Workbench, Rule Suggestions, and a Complaint Control Center for managing validation efforts.

### Decision Graph Visualization
Tools for building and visualizing decision graphs, case trace graphs, graph differences, and heatmaps.

### Validation and Testing
Includes various testing harnesses (Stress Test, Complaint Golden Test, Replay), a Data Corruption Guard, a Release Candidate system, Cross-Complaint Goldens, a Bundle ABI Validator, and an 8-gate Prod Pipeline for pre-deployment validation.

### Medication Safety Layer
A comprehensive medication safety layer includes a patient constraint engine, drug interaction checker, and dose adjusters for renal/hepatic impairment, QT risk, and pregnancy.

### Notification Workflow
A notification service and escalation router manage and deliver alerts.

### Audit & Compliance
Services for access logs and audit reports ensure system compliance.

### Medical Reasoning Graph (Graph-Mode Orchestration)
A graph runner traverses an edge graph, guarded and scored by cost/priority. Nodes and edges are registered, and policies apply cost-aware decision-making for skill selection. The orchestrator supports both sequential and graph-based modes, with auto-fallback.

### Cost Tracking & Skill Economics
A skill cost tracker estimates and attaches cost metadata to audit logs. Analytics aggregate cost and latency by complaint family.

### Extended Learning Loop
Features a question reprioritizer, complaint drift alerts, and a tuning suggestion engine to generate actionable suggestions for improving the system based on outcomes.

## External Dependencies

-   **AI Integration**: OpenAI API
-   **Messaging Integration**: Twilio for WhatsApp
-   **Database**: Firebase Firestore
-   **Data Configuration**: Google Sheets
-   **Cloud Storage**: Firebase Storage