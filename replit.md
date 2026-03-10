# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that leverages WhatsApp for initial patient assessments of flu-like symptoms. It collects symptoms and medical history, then uses AI to generate proposed diagnoses and treatment plans for physician review. The system automates communication of approved dispositions and orders back to patients, aiming to enhance efficiency in flu-like consultations, reduce physician workload, and improve patient access to healthcare.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system employs a constrained agent architecture for deterministic medical triage, featuring a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. A multi-system triage pipeline uses canonical keys and a unified sheets registry for data configuration, question queue building, and generating confidence-scored diagnostic candidates. A clinical state builder deterministically assembles an auditable clinical state from various data sources.

### Frontend
The frontend is built with React 18 and TypeScript, utilizing `shadcn/ui` with Tailwind CSS. It supports physician login, patient intake, case status, visit summaries, and a physician dashboard.

### Backend
The backend runs on Express 5 with Node.js and TypeScript, providing REST API endpoints. Key functionalities include Centor score calculation, red flag detection, and a supervisor gate for patient-facing outputs. LLM integrations incorporate rate limiting, per-run budgets, and a circuit breaker.

### Data Management
Firebase Firestore is the primary data storage, with SQLite used for intake storage abstraction. Schemas exist for physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies involve splitting storage for clinical records and debug telemetry.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification. A JWT-based role authentication layer supports roles such as admin, physician, staff, and patient.

### Agent System Features
The agent system orchestrates patient flow through various routing states using a pipeline orchestrator. It supports LLM-powered actions, prompt template versioning, and LLM A/B testing with guardrails.

### Generic Complaint Engine (GENERIC_V1)
This data-driven engine replaces per-complaint TypeScript scoring modules with CSV-configured rules, enabling new complaints to be added without code changes. It follows a pipeline for configuration loading, question execution, score computation, and boost application.

### Clinical Scoring Systems
Data-driven clinical scoring systems (e.g., PERC, WELLS_PE, CENTOR) are configured via `SCORING_SYSTEMS.csv` and computed automatically. A consistency engine, defined by `CONSISTENCY_RULES.csv`, provides a safety-net for dangerous symptom combinations.

### Advanced Triage Logic
The system supports subtype expansions for improved diagnostic granularity and cross-complaint boosts to adjust cluster scores based on multi-system clinical patterns. It also includes an engine to generate ranked diagnostic candidates.

### Case Management
A Firestore-backed case lifecycle manages cases through a state machine (DRAFT → TRIAGED → NEEDS_REVIEW → APPROVED → SENT → CLOSED), providing CRUD services and authentication for review.

### Physician Review & Signoff System
This system facilitates physician review with services for managing the review queue, assigning reviewers, and orchestrating signoffs.

### Note Generation & Chart Export
The system generates deterministic note drafts from engine output and case data using `Note Templates` and a `Note Generator Service`. These drafts can be previewed, edited, and saved.

### Patient Intake Chat (Web)
A browser-based conversational intake flow handles patient interactions, mapping patient responses to clinical states and running the generic complaint engine. It manages chat sessions, persists data to Firestore, and transitions cases to an `AWAITING_REVIEW` state upon completion.

### eCW Sidecar Export
Generates encounter export bundles for manual/sidecar eCW transfer, assembling export payloads from case data and signoffs, then writing them to files and marking the case as exported.

### Discrepancy Tracking
Detects and surfaces disagreements between engine recommendations and physician signoffs, comparing engine output against physician signoff for various mismatches.

### Runtime Analytics Dashboard
A runtime analytics service aggregates complaint volume, disposition distribution, signoff/override rates, and disagreements from Firestore data for display on a dashboard.

### Shadow Mode Operations
A central shadow-mode configuration controls rollout behavior, enabling the logging of operational events for analysis.

### Operational Intelligence & Tooling
Includes features like case analytics logs, cluster coverage heatmaps, engine coverage audits, dead cluster classification, and rule contradiction detection.

### Guideline-to-Engine Toolchain
A 6-step toolchain compiles raw clinical guideline text into engine-ready CSV rows, including compilers, normalizers, emitters, harmonizers, reviewers, and mergers.

### Patient Disposition Explanation
A patient-facing disposition explanation service builds urgency-tagged explanations from case data for patient communication.

### Coercion Audit
Audits answer normalization by logging raw-to-parsed mappings with confidence levels for every answer normalization.

### Follow-up Bundles
A follow-up bundle builder identifies critical questions, ranks unanswered questions by priority, and resolves question texts.

### Review Queue V2 with Snapshots
A case snapshot builder produces lightweight case summaries for an enhanced review queue system.

### Export Safety Layer
A pre-export readiness checker validates signoff, note draft, disposition, critical questions, red flags, and prior export state before allowing export.

### Physician Override Intelligence
Analyzes and surfaces override patterns by complaint to provide insights into physician behavior.

### Differential Question Selection
Incorporates a differential probability engine, question impact analyzer, and next-best-question engine for optimized questioning.

### Clinical Scoring Systems (Specific)
Includes specific calculators for Centor, Wells PE, and HEART scores, managed by a scoring registry.

### Medication Safety Layer
A comprehensive medication safety layer with a patient constraint engine, drug interaction checker, and dose adjusters for renal/hepatic impairment, QT risk, and pregnancy.

### Notification Workflow
A notification service and escalation router for managing and delivering alerts.

### Audit & Compliance
Services for access logs and audit reports ensure system compliance.

### Messaging Orchestrator
A channel orchestrator and message routing service for managing communication across platforms.

### Production Resilience
Includes a healthcheck service and a job runner for maintaining system stability.

### Synthetic Testing System
A system for synthetic case generation across all 78 complaints, using the real GENERIC_V1 engine. The mass runner builds CaseState objects from generated answers and runs the full engine pipeline. Results are persisted to Firestore `validation_runs` collection with per-run stats (accuracy, under/over-triage counts, mismatch analysis, disposition breakdown). Supports batch sizes up to 10,000 cases.

### Validation Sprint Tooling
Tools for complaint validation sprints:
- **Synthetic Testing UI**: Complaint dropdown, count selector (100-10000), run stats display, mismatch navigation
- **Mismatch Dashboard**: Per-run mismatch analysis with under/over-triage categorization, severity gap sorting, filter by mismatch type
- **Gold Review Workbench**: Firestore-backed `gold_reviews` collection with all fields from the validation checklist (disposition, diagnoses, must-ask, tests, meds, red flags, confidence, rationale). CRUD via `/api/goldReviews`
- **Rule Suggestions**: Firestore-backed `rule_suggestions` with accept/reject/postpone workflow. Types: promote_question, add_red_flag, strengthen_threshold, increase_dx_support, add_trigger
- **Complaint Control Center**: Now includes validation metrics (accuracy, under/over-triage, mismatch count, gold review count, synthetic run count) alongside existing case volume data

### Navigation & Authentication
- **Unified Login**: Two-tab login page — Clinic password login (old session auth) and Admin/Physician email+password login (JWT role auth)
- **Admin Sidebar**: All 40+ admin/physician pages wrapped in AdminLayout with categorized sidebar navigation. Auth-gated (requires JWT token).
- **Sidebar Sections**: Clinical Operations, Diagnostics & Scoring, Medications, Outcomes & Monitoring, Export & Records, AI & Agents, Operations, Validation Sprint, Administration

### Clinical Skill Layer
A modular skill-based orchestration layer for clinical triage, built on 18 registered skills across 8 categories (intake, safety, questions, reasoning, output, outcomes, analytics, audit). Key files:
- **`server/skills/shared/skillTypes.ts`**: Core types — `SkillContext`, `SkillResult`, `SkillAudit`, `PlatformPrinciplesCheck`, `OutcomeStub`, `ReviewPacket`, `OrchestratorState`
- **`server/skills/registry/skillRegistry.ts`**: In-code registry of all 18 skills with metadata (safety class, trigger type, engine type, product module)
- **`server/orchestrator/clinicalSkillOrchestrator.ts`**: Sequential skill runner with halt support, disposition extraction, and platform principles evaluation
- **`server/orchestrator/platformPrinciplesPolicy.ts`**: Evaluates 10 platform principles (decision data captured, infrastructure reusable, outcome attach point, workflow embedded, network effect ready, physician time saved, regulatory safe, high-value complaint, product module assigned, expert pathway preserved)
- **`server/skills/outcomes/attachOutcomeStub.ts`**: First real skill implementation — creates outcome tracking stubs with follow-up windows
- **`server/data/csv/SKILL_REGISTRY.csv`**: CSV version of registry with full column set including principle flags
- **`server/data/csv/CASE_AUDIT_LOG.csv`**: Audit log schema with principle columns and seeded example row

### Decision Graph Visualization
Tools for building and visualizing decision graphs, case trace graphs, graph differences, and heatmaps.

### Validation and Testing
Various testing harnesses (Stress Test, Complaint Golden Test, Replay), a Data Corruption Guard, a Release Candidate system, Cross-Complaint Goldens, a Bundle ABI Validator, and an 8-gate Prod Pipeline for pre-deployment validation.

## External Dependencies

-   **AI Integration**: OpenAI API
-   **Messaging Integration**: Twilio for WhatsApp
-   **Database**: Firebase Firestore
-   **Data Configuration**: Google Sheets
-   **Cloud Storage**: Firebase Storage