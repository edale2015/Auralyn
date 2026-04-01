# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is an AI-powered medical triage platform for flu-like symptoms, leveraging WhatsApp for initial patient assessments. It aims to provide diagnoses and treatment plans for physician review, automate patient communication, and enhance healthcare efficiency and access. The system is designed for continuous improvement through a self-developing AI architecture, with a vision to transform medical triage into a more efficient, patient-centric process.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system employs a constrained agent architecture with a plan/act/observe loop and a multi-system triage pipeline. It features a unified sheets registry for data configuration, a clinical state builder, and a modular, skill-based orchestration layer. An intelligence layer provides explainability and failure-driven rule suggestions, with an extended learning loop for continuous improvement. The Clinical Intelligence Planning Layer (CIPL) and Clinical Governance & Deployment Layer ensure continuous improvement and safe deployment of clinical changes. The system adheres to a 12-layer architecture encompassing Interface, Normalization, State, Knowledge, Safety, Reasoning, Decision, Learning, Analytics, Governance, Integration, and Orchestration.

### UI/UX Decisions
The frontend is built with React 18, TypeScript, `shadcn/ui`, and Tailwind CSS, offering intuitive interfaces for physicians, patients, and administrators. Key dashboards include the Clinical Simulation Lab, Clinical Control Tower, Executive Dashboard, Stress Test Dashboard, Patient Queue Dashboard, FDA Validation Dashboard, Decision Tree Explorer (ReactFlow visualization), Live Clinic Console (multi-tenant), and Production Readiness Console (displaying 58 architecture layers). The System Control Tower provides full system observability and control with 10 panels. The Clinical QA Dashboard offers a 3-column layout for quality assurance.

### Technical Implementations
The backend uses Express 5, Node.js, and TypeScript, providing REST API endpoints. It incorporates Centor score calculation, red flag detection, a supervisor gate, and robust LLM integrations. Features include a Clinical Brain Engine, Self-Developing Medical AI, Telemedicine Reasoning Assistant, and an Agent System for patient flow. Clinical capabilities include advanced triage logic, medication safety layers, FHIR-lite structured output, and a Clinical Knowledge Graph. The system includes 30+ Complaint Packs with a Visual Rule Builder, an Adaptive Control Loop, and a Case Memory Engine. A Unified Clinical Pipeline orchestrates triage, self-improvement, and simulation. The Autonomous Operator System provides intent-based task planning. The Engine Control Center chains validation, scoring, billing, outcome, learning, and auditing. The Auto-Debug Engine monitors system health, and an Agent Coordinator manages registered agents. An SMS/WhatsApp Service handles Twilio-based messaging. A Stress Test System allows load generation, and an RPA Browser Agent provides UI automation. An FDA Submission Package generates validation reports. A Live Patient Queue manages real-time sessions. System Monitoring includes a Predictive Failure Engine. The Autonomous Loop runs learning and failure prediction, with a Safety Gate for non-bypassable safety. An Immutable Audit Logger logs every clinical flow. Explainability is integrated into the orchestrator, with critical Safety Engines for drug interaction, pregnancy, and pediatric safety. The Autonomous Brain includes a Self-Learning Engine, Golden Case Validator, and Clinical Safety Guard. A Global Intelligence Layer utilizes federated learning for privacy-safe data export and aggregation, including a War Room panel for monitoring. A Multi-Agent Task Bus + Evolution Engine manages tasks with 7 agents and an autonomous evolution cycle. A System Monitor provides live engine and skill health monitoring.

The system incorporates a Multi-Agent Debate Engine where three clinical agents (Hybrid Reasoning, Bayesian Differential, Safety Veto) argue over diagnoses, with consensus based on weighted accuracy. A Continuous Learning Pipeline, wired to an outcome tracker, applies temporal decay to policies and proposes RLHF weight updates for physician review. A Policy Evolution Engine manages outcome-driven policy weights. An Executive Command Dashboard provides a high-level view of pipeline statistics, agent health, predictive failure signals, and policy evolution. The system is 100% Knowledge Base (KB)-driven for diagnosis, with all clinical decisions managed via Postgres KB tables. Advanced Reasoning Engines include `coMorbidityEngine.ts`, `temporalEngine.ts`, and `outcomeLearningEngine.ts`. Plan Templates are fully migrated to be DB-first.

### System Design Choices
Data management uses Firebase Firestore, SQLite, and NDJSON-backed stores, with PHI retention policies. Authentication involves password-only, session-based HMAC for physicians and token-based access for patients, with JWT-based role authentication. Security and quality hardening include bcrypt, JWT security, rate limiting, and PHI Sanitizer. A Global SRE + Resilience Layer provides geo-aware routing, SLA monitoring, automatic debugging, and chaos engineering. Autonomous Governance includes an agent registry, audit agent, incident commander, digital twin, and predictive engine. The Autonomous Operator System is an AI-powered form automation engine. A Template Studio allows visual template editing. The Replay Inspector audits automation runs. A Robotics Control Module manages medical device orchestration. An Autonomous Learning Console provides a unified dashboard for self-testing, self-learning, and governance, including simulation, learning queue, drift monitor, audit trail, versions, and safety modes.
The Multi-Patient Command Grid provides a three-pane, hospital-style dashboard with risk-sorted patient grids, clinical details, ICU waveforms, hospital/EMS routing, automated outreach, and physician auto-paging.

## Clinical Improvement Lab (`/clinical-improvement-lab`) — COMPLETE (5 panels)

Evidence-driven KB evolution dashboard — ingests guidelines, detects gaps, enables physician peer review.

**New DB Tables**:
- `guideline_documents` — ingested text (manual/pubmed/pdf), GPT-4o parsed JSON output, source, status
- `guideline_recommendations` — extracted clinical rules (complaint, recommendation, rationale, rule_type, confidence, status)
- `peer_reviews` — physician decisions (approve/reject/modify) linked to recommendations
- `pubmed_articles` — PubMed articles (pmid, title, abstract, journal, parsed, ingested flag)

**Layout**: 3-column — Guideline Ingest (left) | PubMed / Gap Analysis / Evidence Scores tabs (middle) | Physician Peer Review (right)

**5 Panels**:
1. **Guideline Ingest** (left column) — Paste any clinical text + optional title/complaint focus → GPT-4o extracts 4–10 structured clinical rules → saved as `guideline_documents` + `guideline_recommendations`; shows list of all ingested guidelines with recommendation/approval counts
2. **PubMed Auto-Ingestion** (middle · tab 1) — Search PubMed via NCBI E-utilities (no auth); view up to 8 articles with title/abstract/journal; click "Ingest" per article → GPT-4o parses abstract into clinical rules → `pubmed_articles` + `guideline_recommendations` created
3. **Gold Standard Gap Analysis** (middle · tab 2) — Enter a complaint ID → compares all KB rules (red flags + questions + treatments) against ingested guideline recommendations → shows coverage %, "Missing from KB" gap list with confidence scores, "Already in KB" covered list
4. **Evidence Scores** (middle · tab 3) — Scatter chart of guideline confidence vs KB base probability; grouped by complaint and rule type; shows where guideline confidence diverges from KB calibration
5. **Physician Peer Review** (right column) — Full queue of pending guideline recommendations; each card expandable for Approve / Modify / Reject; Approve queues rule to `kb_knowledge_changes` (status=pending) for deployment; Modify lets physician edit the rule text before approving; filter: Pending vs All

**API Routes** (`/api/improvement/*`):
- `POST /api/improvement/ingest` — paste text → GPT-4o → guideline_documents + recommendations
- `GET /api/improvement/guidelines` — list with rec counts
- `POST /api/improvement/pubmed/search` — NCBI E-utilities search (8 results max)
- `POST /api/improvement/pubmed/ingest` — fetch + GPT-4o parse + save article
- `GET /api/improvement/recommendations?status=pending` — filterable queue
- `POST /api/improvement/recommendations/:id/review` — approve/reject/modify + queue to KB
- `GET /api/improvement/compare?complaint=X` — gap analysis vs current KB
- `GET /api/improvement/peer-reviews` — full review history
- `GET /api/improvement/boards` — grouped by specialty
- `GET /api/improvement/evidence-scores` — confidence vs KB base_probability
- `GET /api/improvement/stats` — aggregate counters

**Full Flow**:
Upload guideline → GPT-4o extracts rules → physician reviews → approved rules go to `kb_knowledge_changes` → KB evolution

## External Dependencies
*   **AI Integration**: OpenAI API
*   **Messaging Integration**: Twilio for WhatsApp, SMS, and Voice TTS
*   **Database**: Firebase Firestore, SQLite, PostgreSQL
*   **Data Configuration**: Google Sheets
*   **Cloud Storage**: Firebase Storage
*   **Authentication**: Google OAuth2 (for Gmail API)