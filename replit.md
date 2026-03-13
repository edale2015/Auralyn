# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that uses WhatsApp for initial patient assessments of flu-like symptoms. It collects symptoms and medical history, employs AI for proposed diagnoses and treatment plans for physician review, and automates communication of approved dispositions and orders to patients. The system aims to improve the efficiency of flu-like consultations, decrease physician workload, and enhance patient access to healthcare.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system utilizes a constrained agent architecture for deterministic medical triage, featuring a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. A multi-system triage pipeline uses canonical keys and a unified sheets registry for data configuration and diagnostic candidate generation. A clinical state builder deterministically assembles an auditable clinical state, and a modular, skill-based orchestration layer handles clinical triage. The platform includes an active control plane for managing rollouts and rule governance, and an intelligence layer for explainability and failure-driven rule suggestions. An extended learning loop uses patient outcomes to continuously improve the system.

### 10× Architectural Upgrade — Clinical State Model (CSM) + Event Bus
A unified clinical state model (`server/state/`) powers all completion modules:
- `clinicalStateStore.ts` — in-memory + file-persisted per-case state (ClinicalState object)
- `clinicalEventBus.ts` — emits typed events (SESSION_STARTED, SYMPTOMS_RECORDED, COMPLAINT_IDENTIFIED, RED_FLAG_DETECTED, DIFFERENTIAL_UPDATED, SCORE_COMPUTED, DISPOSITION_SET, PATHWAY_EXECUTED, COPILOT_SUGGESTION, RISK_ASSESSED, OUTCOME_RECORDED, REWARD_COMPUTED)
- `stateProjectionService.ts` — maps events onto state fields deterministically
- REST: GET/POST/PATCH/DELETE `/api/state/:caseId`, GET `/api/state/:caseId/events`

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

### 5 Completion Modules

#### 1. Autonomous Intake System (`/autonomous-intake`)
- `server/intake/autonomousIntakeEngine.ts` — multi-turn NLP intake for 9 complaints
- Compound red-flag detection (requires ≥60% pattern match to avoid false positives)
- Dynamic follow-up question selection per complaint (6 questions each)
- Triage levels: low / moderate / high / critical
- REST: POST `/api/autonomous-intake/start`, POST `/api/autonomous-intake/message`, GET `/api/autonomous-intake/session/:caseId`

#### 2. Reinforcement Learning Policy Trainer (`/rl-policy`)
- `server/learning/reinforcementPolicyService.ts` — reward function: +1 correct disposition, +1 improved, −1 worsened, −2 safety miss
- Persists policy to `rl_policy.json` + history to `rl_policy_history.ndjson`
- Per-complaint avg reward, win rate, safety misses, trend (improving/stable/degrading)
- REST: GET `/api/rl/policy`, POST `/api/rl/train`, GET `/api/rl/policy-history`

#### 3. Care Pathway Automation (`/care-pathways`)
- `server/pathways/pathwayRegistry.ts` — 11 pathways across 9 complaints with labs, meds, referrals, follow-ups, monitoring, contraindications, escalation criteria, outcome goals
- `server/pathways/pathwayExecutor.ts` — executes pathway and emits PATHWAY_EXECUTED CSM event
- REST: GET `/api/pathways`, GET `/api/pathways/:complaint`, POST `/api/pathways/execute`

#### 4. Clinician Copilot (`/clinical-copilot`)
- `server/copilot/clinicalCopilotService.ts` — 7 suggestion categories: scoring hints (CENTOR, CURB-65, HEART, qSOFA), differential DDx, red flag reminders, pending questions, documentation hints, safety checks, pathway suggestions
- Documentation templates for HPI, Assessment, Plan per complaint (copy-to-clipboard)
- Risk indicator: green/yellow/orange/red gauge
- REST: POST `/api/copilot/suggestions`, GET `/api/copilot/presets`

#### 5. Predictive Risk Modeling (`/predictive-risk`)
- `server/predictive/riskModelService.ts` — multi-factor scoring: admission risk, deterioration risk, 30-day readmission risk
- `server/predictive/riskFactorLibrary.ts` — per-complaint factor library with weights (5 complaints × 5–8 factors each)
- Keyword extraction from free-text clinical notes
- REST: POST `/api/predictive/admission-risk`, GET `/api/predictive/risk-factors/:complaint`

### Skill Layers 3–8 (sidebar: "Skill Layers 3–8")
- **SL3** (`/sl3-outcomes`) — Patient outcome feedback: log outcomes, compare vs engine disposition, mismatch flagging
- **SL4** (`/sl4-provider-analytics`) — Provider performance: cases reviewed, approval rate, time-to-review, override rate
- **SL5** (`/sl5-population-health`) — Population health: 7-week complaint trends, drift detection >20% WoW
- **SL6** (`/sl6-clinical-coding`) — ICD-10/CPT mapping with RVU values per complaint+disposition
- **SL7** (`/sl7-comm-hub`) — Message template editor for WhatsApp/SMS/Telegram with delivery log
- **SL8** (`/sl8-tenant-orchestration`) — Multi-tenant CRUD: feature flags, complaint access, branding, limits

### Case Management and Review
A Firestore-backed state machine manages the case lifecycle. A physician review and signoff system facilitates review, manages queues, assigns reviewers, and orchestrates signoffs.

### Operational Intelligence and Tooling
Includes case analytics logs, rule contradiction detection, and a toolchain to compile clinical guidelines into engine-ready CSVs. A synthetic testing system generates cases across all complaints to validate output. Validation tooling includes a Mismatch Dashboard, Gold Review Workbench, Rule Suggestions, and a Complaint Control Center.

### Multi-Tenant Orchestration
The system supports full multi-tenant provisioning and configuration with CRUD operations for tenants, including plan, status, feature flags, complaint access, branding, and limits.

### Analytics and Monitoring
Features patient outcome feedback loops, provider performance analytics (cases reviewed, approval rates), and population health monitoring with complaint and disposition analytics, including drift detection.

### Telemedicine Reasoning Assistant (server/assistant/)
A real-time intelligence layer for WhatsApp/Telegram text-based telemedicine visits:
- `telemedicineSessionService.ts` — in-memory session store per case (patientMessages, complaint, differential, safety alerts, medications, codes, return precautions, status)
- `telemedicineSafetyService.ts` — 12 compound safety rules (cardiac, respiratory, neurologic, obstetric, immunologic, medication, age) with severity and recommendation
- `telemedicineDifferentialService.ts` — per-complaint ranked differential with ruling-in / ruling-out factor updates per symptom; 9 complaint sets (50+ diagnoses)
- `telemedicineMedicationSuggestionService.ts` — first-line / alternative / adjunct medications per complaint with dose, route, frequency, duration, indication, caveat
- `telemedicineMedicationSafetyService.ts` — allergy cross-reaction detection, pregnancy contraindications, renal impairment warnings, 11 drug-drug interaction rules
- `telemedicineCodingService.ts` — ICD-10 + CPT auto-coding by complaint × disposition; telemedicine modifier (95); lab CPT codes (strep rapid test, UA)
- `telemedicineReturnPrecautionService.ts` — per-complaint × disposition return precautions, expected course, follow-up, and formatted WhatsApp/Telegram discharge message
- `telemedicineNoteService.ts` — auto-generate HPI, assessment, plan, disposition, safety netting chart note
- REST: POST `/api/telemed/session/start`, GET `/api/telemed/sessions`, GET `/api/telemed/sessions/all`, GET `/api/telemed/session/:caseId`, POST `/api/telemed/session/:caseId/message`, POST `/api/telemed/analyze`, POST `/api/telemed/note/:caseId`, POST `/api/telemed/discharge/:caseId`, POST `/api/telemed/codes`, POST `/api/telemed/medication-safety`

### Telemedicine Console + Doctor Dashboard (Frontend)
- `TelemedicineConsole.tsx` — enhanced with: disposition picker, "Get Intelligence" button, live differential update panel, safety alerts, medication suggestions with category badges, medication safety alerts, ICD-10/CPT billing codes, return precautions, one-click patient discharge message (copy for WhatsApp/Telegram)
- `TelemedicineDoctorDashboard.tsx` — 3-column layout: (1) session list with new session creation, (2) quick analysis panel per session, (3) session detail with 6 tabs: Overview, Medications, ICD/CPT, Precautions, Chart Note, Discharge

## Navigation Structure
Sidebar sections:
1. Clinical Operations — Visit Copilot, Complaint Control Center, Review Queue, etc.
2. Diagnostics & Scoring — Next Best Question, Override Patterns, Decision Graphs, etc.
3. Medications — Formulary
4. Outcomes & Monitoring — Outcome Capture, Outcome Monitoring
5. Data & Learning — Reconciliation, Rule Governance, Performance Stats
6. Platform & Ops — Site Management, Release Governance, Audit Reports
7. Intelligence Layer — Trace Viewer, Graph Heatmaps, Shadow Mode
8. Validation Tools — Synthetic Testing, Gold Reviews, Rule Suggestions
9. Skill Layers 3–8 — SL3 through SL8
10. **Completion Modules** — Autonomous Intake, RL Policy Trainer, Care Pathways, Clinician Copilot, Predictive Risk
11. Administration — Organizations, Audit Reports, Performance

## Key File Paths
- `server/state/` — Clinical State Model + Event Bus
- `server/intake/autonomousIntakeEngine.ts` — Autonomous Intake
- `server/learning/reinforcementPolicyService.ts` — RL Policy
- `server/pathways/` — Care Pathway registry + executor
- `server/copilot/clinicalCopilotService.ts` — Clinician Copilot
- `server/predictive/` — Predictive Risk models + factor library
- `server/routes/sl3Routes.ts` through `sl8Routes.ts` — Skill Layer API routes
- `client/src/pages/` — All frontend pages

## External Dependencies
-   **AI Integration**: OpenAI API
-   **Messaging Integration**: Twilio for WhatsApp
-   **Database**: Firebase Firestore
-   **Data Configuration**: Google Sheets
-   **Cloud Storage**: Firebase Storage
