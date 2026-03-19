# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is an AI-powered medical triage platform for flu-like symptoms, leveraging WhatsApp for initial patient assessments. It aims to provide diagnoses and treatment plans for physician review, automate patient communication, and enhance healthcare efficiency and access. The system is designed for continuous improvement through a self-developing AI architecture, with a vision to transform medical triage into a more efficient, patient-centric process.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system employs a constrained agent architecture with a plan/act/observe loop and a multi-system triage pipeline. It features a unified sheets registry for data configuration and diagnostic candidate generation, and a clinical state builder that deterministically assembles an auditable clinical state. A modular, skill-based orchestration layer handles clinical triage, supported by an active control plane for rollouts and rule governance. An intelligence layer provides explainability and failure-driven rule suggestions, with an extended learning loop for continuous improvement. The Clinical Intelligence Planning Layer (CIPL) automatically identifies areas for improvement, resolves knowledge gaps, detects model drift, and prioritizes enhancements. A Clinical Governance & Deployment Layer ensures the safety of clinical changes before deployment. The entire clinical AI system follows a 12-layer architecture encompassing Interface, Normalization, State, Knowledge, Safety, Reasoning, Decision, Learning, Analytics, Governance, Integration, and Orchestration.

### UI/UX Decisions
The frontend is built with React 18, TypeScript, `shadcn/ui`, and Tailwind CSS, offering intuitive interfaces for physicians, patients, and administrators. Key interfaces include physician login, patient intake, case status, visit summaries, physician dashboard, administrative consoles, and specialized dashboards like the Clinical Simulation Lab, Clinical Control Tower, and Executive Dashboard for advanced system insights and management.

### Technical Implementations
The backend uses Express 5, Node.js, and TypeScript, providing REST API endpoints. It incorporates Centor score calculation, red flag detection, a supervisor gate for patient-facing outputs, and robust LLM integrations with rate limiting, per-run budgets, and a circuit breaker.
The system features a **Clinical Brain Engine** for deterministic inference, a **Self-Developing Medical AI** for autonomous improvement, and a **Telemedicine Reasoning Assistant** for real-time session management. An **Agent System** orchestrates patient flow, supporting LLM-powered actions and A/B testing.
**Clinical Capabilities** include advanced triage logic, subtype expansions, ranked diagnostic candidates, and configurable clinical scoring systems. A medication safety layer integrates a patient constraint engine, drug interaction checker, and dose adjusters. FHIR-lite structured output endpoints provide comprehensive triage results.
The **Clinical Knowledge Graph** is a unified clinical ontology. The **Self-Improving Clinical Brain** continuously improves through predictive failure detection, root cause analysis, and AI-generated recommendations via a **Self-Improving Loop** with a Feedback Engine, Error Detection Engine, Auto-Fix Generator, and Improvement Cycle Engine.
The **Auralyn SaaS Platform** is a multi-tenant system for managing clinics with plan-based access, feature gating, and billing services. **EHR Integration** is FHIR R4-compliant for Patient, Encounter, and Observation resources, with granular **RBAC** for various roles.
The system includes **30+ Complaint Packs** for specific conditions, a **Pack Row System** for symptom and modifier definitions, a **Pack Repository Layer**, a **Pack Validation Engine**, **Normalized Question Rows**, and a **Pack Audit Log**. A **Visual Rule Builder** allows for intuitive rule editing. An **Adaptive Control Loop** manages real-time safety posture and insights.
A **Case Memory Engine** provides Jaccard similarity-based clinical case retrieval. The **Explainability Graph Engine** builds visual decision trace graphs. The **Physician Control Center** (`/physician-dashboard`) is a 7-tab unified dashboard. The **Executive Dashboard** (`/executive-dashboard`) is a 12-tab board-level analytics dashboard.
The **Legacy Tab Mapper** converts legacy spreadsheet tabs into canonical pack rows. The **Endocrinology Expansion** adds 8 symptom packs, 12 questions, 3 modifiers, and 3 algorithms. The **Clinical Integration Patch** provides: **RLHF Weight Tuning Engine**, **Case Memory Boost**, **Telegram Bot**, **WhatsApp Flow**, **FHIR Adapter**, and **Patient Outcome Log Service**.
The **Google Sheets Migration Engine** manages canonical tab creation, verification, and migration for Google Sheets-based pack repositories. The **Unified Clinical Pipeline** (`/api/pipeline/*`) is the single-flow orchestrator for triage, self-improvement, and simulation.
**Extended Clinical Scoring** (`server/engines/scoring/`): 10 additional evidence-based scoring systems. **Outcome Learning & RLHF** (`server/learning/`): engines for outcome logging, reinforcement learning weight updates, and continuous learning. **Insurance Billing** (`server/billing/`): engines for ICD-10 + CPT mapping, claim generation, and submission. **Compliance & FDA-Style Framework** (`server/compliance/`): model registry, risk engine, and audit export. **HIPAA Security** (`server/security/`): encryption, PHI redaction, and access logging.

### System Design Choices
- **Data Management**: Firebase Firestore is the primary data store, supplemented by SQLite for intake. PHI retention policies ensure split storage. NDJSON-backed stores are used for outcomes, message templates, and tenant configurations.
- **Authentication**: Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient intake uses token-based access with 6-digit code verification. A JWT-based role authentication layer supports admin, physician, staff, and patient roles.
- **Google Email Integration** (`/api/google-email/*`): Gmail API OAuth2 connection for clinic email sending.
- **Shared Dashboard Views** (`/api/shared-views/*`): Create, list, and approve shared dashboard views with an admin-only approval workflow.
- **Signed Board Exports** (`/api/signed-board-exports/*`): HMAC-SHA256 signed JSON board packets.
- **Benchmark Trends** (`/api/benchmark-trends/*`): Computes benchmark trend series.
- **Server-side Pagination**: Reusable `paginate()` utility.
- **Audit Middleware**: Global audit logger applied to all pipeline routes.
- **High-Scale Simulation Engine**: Runs 1000+ synthetic cases per pack for accuracy analysis.
- **Performance Monitoring**: Global `metricsMiddleware` tracks total requests, errors, avg latency, p95 latency.
- **Workbook Intelligence Engine**: Auto-detects tab types and column meanings in workbooks.
- **Adaptive Legacy Mapper**: Uses workbook intelligence to auto-map workbook data into canonical rows.
- **Adaptive Mapping Refiner**: Self-correcting mapping with human-in-the-loop feedback.
- **Environmental Advanced Packs**: 5 packs for environmental health concerns.
- **Full Mapping Pipeline**: One-click pipeline for sheets fetch, adaptive mapping, validation, and preview.
- **System Pack Generator**: Auto-generates packs from 10 system definitions.
- **Executive Ops Drawer**: Slide-out panel in Executive Dashboard for Google Email, Shared Views, Signed Export, Benchmarks, and Alerts.
- **Deployment Status**: Reports Gmail OAuth configuration status and deployment checklist.
- **Extended Clinical Scoring**: 10 additional scoring systems (PERC, CHA2DS2-VASc, Ottawa Ankle, PedsFever, Alvarado, TIMI, GCS, NEWS2, CIWA, CURB-65) at `/api/extended-scoring/*`.
- **Outcome Learning & RLHF**: Outcome logging, reinforcement learning, continuous learning loop at `/api/outcome-learning/*`.
- **Insurance Billing**: ICD-10/CPT coding (38+ diagnoses), claim builder, submission at `/api/billing/*`.
- **Compliance (FDA-style)**: Model registry, risk classification, safe discharge validation, audit export at `/api/compliance/*`.
- **HIPAA Security**: AES-256 encryption, PHI redaction, access logging at `/api/security/*`.
- **Auto-Tune Engine**: Self-improving rule analysis with failure pattern detection and suggestions at `/api/auto-tune/*`.
- **GPT Clinical Explanation**: AI-powered clinical explanations (OpenAI) at `/api/gpt-explanation/explain`.
- **X12 Clearinghouse**: 837P claim mapping, clearinghouse submission, ERA/835 status tracking at `/api/clearinghouse/*`.
- **SaMD Compliance**: Model versioning, performance registry, risk controls, audit bundles at `/api/samd-compliance/*`.
- **PHI Field Protection**: Field-level AES encryption for PHI fields at `/api/phi-protection/*`.
- **Rate Limiting & No-PHI Log**: Request rate limiting middleware and deep recursive PHI-stripping log middleware.
- **FDA 510(k) Narrative Generator**: Pre-filled 9-section regulatory narrative with live metrics, scoring system counts, ICD-10 mapping counts at `/api/fda-510k/*`.
- **ICD-10/CPT Auto-Coder**: Case-insensitive diagnosis cluster coding with batch support and ICD-10 search at `/api/auto-code/*`.
- **Encounter Bundle Builder**: Unified EHR (FHIR) + billing (X12 837P) + audit trail + clinical note + denial prediction in one exportable bundle at `/api/encounter-bundle/*`.
- **Denial Prediction Engine**: Pre-submission claim denial risk scoring with revenue impact estimation, batch analysis, and actionable fix recommendations at `/api/denial-prediction/*`.
- **Autonomous Agent Orchestrator**: Central command pipeline at `/api/autonomous-agents/*` with 6 priority-ordered agents (safety→triage→diagnosis→risk→billing→followup), decision engine with action routing (emergency escalation, physician review, auto-respond), event bus for inter-agent communication, agent performance tracking, follow-up queue with severity-adaptive scheduling, and batch processing. Agents wire to real engines: triagePrioritizationEngine, classifyRisk, diagnosisAutoCoder, denialPredictionEngine, autoFixEngine, claimOutcomeLearning.
- **Agent Control System**: Real-time agent toggle panel at `/agent-control` with per-agent enable/disable (safety cannot be disabled), toggle audit trail, bulk toggle support at `/api/agent-control/*`. Skipped agents recorded in execution order.
- **Intake Queue**: Queue-based high-scale intake at `/api/intake-queue/*` with in-memory worker pool (50 concurrent by default, configurable up to 200), priority scheduling, retry logic, pause/resume/drain controls, batch intake (up to 200 cases), job status tracking, throughput metrics. Frontend control panel with real-time stats, test case submission, job monitoring.
- **Revenue Pipeline**: Unified revenue optimization layer at `/api/revenue-pipeline/*` with: CPT auto-fix engine (denial-driven upcoding), RLHF claim outcome learning (ICD/CPT pair weighting), smart physician routing (specialty-based load-balanced assignment with stateful load tracking), revenue analytics (metrics + projections), and a full intelligent pipeline that chains coding → denial prediction → auto-fix → learned score adjustment → physician routing → disposition decision.
- **Payer Intelligence System**: Full payer-aware intelligence at `/api/payer-intelligence/*` with: payerEngine (8 payers + CPT/modifier optimization), denialClassifierV2 (feature-weighted scoring with 6 risk factors), payerAutoFix (payer-specific denial reduction), payerRLHFEngine (per-payer learning with outcome tracking), contractSimulationEngine (revenue simulation across all payers + best-payer selection + leverage analysis), autoScaler (4-tier elastic scaling for intake queue), clinicLearning (per-clinic AI tuning with diagnosis weight adjustment), selfImprove (meta-intelligence + business metrics + strategy generation). Frontend dashboard at `/payer-intelligence` with 6 tabs: Full Flow, Payer Stats, Contracts, Clinics, Scaling, Self-Improve.
- **Strategy Command Center**: Unified strategic decision layer at `/api/strategy/*` with: multiPayerRoutingEngine (risk-adjusted payer selection), dynamicPricingEngine (demand/capacity/time-of-day pricing), networkStrategyEngine (payer portfolio expand/maintain/renegotiate/reduce/drop), clinicOptimizer (service line scoring + capacity balancing + service mix optimization), metaOrchestrator (CEO agent combining all engines with marketing channel ROI), trustScore (per-complaint autonomy scoring with 85% threshold for auto-handling), disagreement tracker (AI vs physician mismatch patterns), daily report generator (operational metrics), telehealth compliance (consent gate, NY state validation, physician sign-off log, SOAP note generator, immutable audit trail). Frontend dashboard at `/strategy` with 6 tabs: CEO Agent, Pricing, Trust Scores, Disagreements, Telehealth, Daily Report.
- **Enterprise Command Center**: Full enterprise intelligence layer at `/api/enterprise/*` with: Digital Twin (live clinic state model with history + projected revenue), What-If Simulation Engine (scenario comparison + auto-generated strategies), Closed-Loop Adaptive Controller (real-time pricing/routing/intake adjustments with safety envelope + multi-objective optimizer + control policy enforcement), Voice Swarm Call Center (500 concurrent AI agents with conversation engine + call routing + stats), Patient Acquisition Engine (ROI-optimized budget allocation across 6 marketing channels + growth flywheel projections), Capacity Engine + Service Mix Optimizer (load/demand balancing + margin-based service recommendations), Multi-Location Scaling Playbook (NY State expansion projections for 6 locations with viability scoring + break-even analysis), Enterprise Orchestrator (unified analysis combining all engines into single strategic view with health grading). Frontend dashboard at `/enterprise` with 7 tabs: Enterprise, Digital Twin, Control, Voice, Growth, Scaling, Capacity.

## External Dependencies
*   **AI Integration**: OpenAI API
*   **Messaging Integration**: Twilio for WhatsApp
*   **Database**: Firebase Firestore
*   **Data Configuration**: Google Sheets
*   **Cloud Storage**: Firebase Storage