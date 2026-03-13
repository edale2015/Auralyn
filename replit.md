# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that uses WhatsApp for initial patient assessments of flu-like symptoms. It collects symptoms and medical history, employs AI for proposed diagnoses and treatment plans for physician review, and automates communication of approved dispositions and orders to patients. The system aims to improve the efficiency of flu-like consultations, decrease physician workload, and enhance patient access to healthcare.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system utilizes a constrained agent architecture for deterministic medical triage, featuring a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. A multi-system triage pipeline uses canonical keys and a unified sheets registry for data configuration and diagnostic candidate generation. A clinical state builder deterministically assembles an auditable clinical state, and a modular, skill-based orchestration layer handles clinical triage. The platform includes an active control plane for managing rollouts and rule governance, and an intelligence layer for explainability and failure-driven rule suggestions. An extended learning loop uses patient outcomes to continuously improve the system.

### Frontend
Built with React 18 and TypeScript, using `shadcn/ui` with Tailwind CSS, the frontend supports physician login, patient intake, case status, visit summaries, and a physician dashboard, along with administrative consoles for platform management.

### Backend
The backend runs on Express 5 with Node.js and TypeScript, providing REST API endpoints. It includes Centor score calculation, red flag detection, and a supervisor gate for patient-facing outputs. LLM integrations feature rate limiting, per-run budgets, and a circuit breaker.

### Data Management
Firebase Firestore serves as the primary data storage, supplemented by SQLite for intake storage. Schemas define physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies enforce split storage for clinical records and debug telemetry. The system also includes NDJSON-backed stores for outcomes, message templates, and tenant configurations.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification. A JWT-based role authentication layer supports admin, physician, staff, and patient roles.

### Agent System Features
The agent system orchestrates patient flow through routing states using a pipeline orchestrator. It supports LLM-powered actions, prompt template versioning, and LLM A/B testing with guardrails. A generic complaint engine allows new complaints to be added without code changes using CSV-configured rules.

### Clinical Capabilities
The system supports advanced triage logic including subtype expansions, cross-complaint boosts, and generation of ranked diagnostic candidates. It integrates clinical scoring systems (e.g., PERC, WELLS_PE, CENTOR) configured via CSV. A medication safety layer includes a patient constraint engine, drug interaction checker, and dose adjusters. It also features FHIR-lite structured output endpoints for full triage results, differential diagnoses, clinical documentation, and care plans.

### Case Management and Review
A Firestore-backed state machine manages the case lifecycle. A physician review and signoff system facilitates review, manages queues, assigns reviewers, and orchestrates signoffs.

### Operational Intelligence and Tooling
Includes case analytics logs, rule contradiction detection, and a toolchain to compile clinical guidelines into engine-ready CSVs. A synthetic testing system generates cases across all complaints to validate output. Validation tooling includes a Mismatch Dashboard, Gold Review Workbench, Rule Suggestions, and a Complaint Control Center.

### Multi-Tenant Orchestration
The system supports full multi-tenant provisioning and configuration with CRUD operations for tenants, including plan, status, feature flags, complaint access, branding, and limits.

### Analytics and Monitoring
Features patient outcome feedback loops, provider performance analytics (cases reviewed, approval rates), and population health monitoring with complaint and disposition analytics, including drift detection.

## External Dependencies

-   **AI Integration**: OpenAI API
-   **Messaging Integration**: Twilio for WhatsApp
-   **Database**: Firebase Firestore
-   **Data Configuration**: Google Sheets
-   **Cloud Storage**: Firebase Storage