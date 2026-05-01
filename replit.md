# Auralyn — HIPAA/FDA Medical Triage Platform (Multi-Tenant SaaS)

### Overview
Auralyn is an AI-powered medical triage platform that leverages WhatsApp for initial patient assessments of flu-like symptoms. It provides diagnoses and treatment plans for physician review, automates patient communication, and aims to enhance healthcare efficiency and access. The platform features a self-developing AI architecture for continuous improvement, a unified EHR write architecture, advanced diagnostic engines, and comprehensive security and compliance. It also includes extensive command center dashboards for monitoring, predictive analytics, and digital twin simulations, supporting multi-hospital and regional deployments. The vision is to transform medical triage into a more efficient, patient-centric process.

### User Preferences
Preferred communication style: Simple, everyday language.

### System Architecture

#### Core Architecture
Auralyn employs a constrained agent architecture with a plan/act/observe loop and a multi-system triage pipeline. It features a unified sheets registry for data configuration, a clinical state builder, and a modular, skill-based orchestration layer. An intelligence layer provides explainability and failure-driven rule suggestions, with an extended learning loop for continuous improvement. The Clinical Intelligence Planning Layer (CIPL) and Clinical Governance & Deployment Layer ensure continuous improvement and safe deployment of clinical changes. The system follows a 12-layer architecture (Interface, Normalization, State, Knowledge, Safety, Reasoning, Decision, Learning, Analytics, Governance, Integration, Orchestration). All clinical EHR writes use a single, guarded pipeline for authentication, scope checks, and audit logging. A robust validation system, including golden cases, adversarial generators, and calibration monitors, enforces strict deployment gates. The Medical Command and Control (MCP) Nervous System allows dynamic registration and execution of clinical tools and workflows, with an immutable audit hash chain.

#### UI/UX Decisions
The frontend is built with React 18, TypeScript, `shadcn/ui`, and Tailwind CSS. It provides intuitive interfaces for physicians, patients, and administrators, featuring various dashboards such as Clinical Simulation Lab, Clinical Control Tower, Executive Dashboard, Stress Test Dashboard, Patient Queue Dashboard, FDA Validation Dashboard, Live Clinic Console, and Clinical Improvement Lab, among others. Specific dashboards like the Master Rule Map, Physician Pathway Review, and Infrastructure Status Dashboard offer detailed views and management capabilities.

#### Technical Implementations
The backend uses Express 5, Node.js, and TypeScript, offering REST API endpoints. Key features include a Clinical Brain Engine (v3.0 phase-parallel), Self-Developing Medical AI, Telemedicine Reasoning Assistant, and an Agent System for patient flow. Clinical capabilities encompass advanced triage logic, medication safety layers, FHIR-lite structured output, a Clinical Knowledge Graph, 30+ Complaint Packs with a Visual Rule Builder, an Adaptive Control Loop, Case Memory Engine, Unified Clinical Pipeline, and an Autonomous Operator System. Security is hardened with AES-256-GCM encryption, HMAC-SHA validation, and comprehensive PHI guarding. A deep agent Python sidecar provides advanced AI capabilities (research, code review, workflow upgrades) integrated via a TypeScript bridge. Communication intelligence engines detect patient tone, generate communication scripts, and manage antibiotic demand responses. The system includes a unified EHR adapter interface for ECW, Athena, and Epic, with a 5-tier fallback write chain and an Agent Scope Engine (ASE) for risk-based, role-aware action governance. Key components like the Clinical Ontology Layer ensure consistent data mapping and validation across the system.

#### System Design Choices
Data management uses Firebase Firestore, SQLite, and PostgreSQL, with specific PHI retention policies. Authentication involves password-only and session-based HMAC for physicians, and token-based access for patients with JWT-based role authentication. Security includes bcrypt, JWT security, rate limiting, and a PHI Sanitizer. A Global SRE + Resilience Layer provides geo-aware routing, SLA monitoring, automatic debugging, and chaos engineering. Autonomous Governance features an agent registry, audit agent, incident commander, digital twin, and predictive engine. The system supports multi-region deployment with auto-scaling and a unified control API, incorporating a medical knowledge graph, DAG visualizer, and YAML pipeline engine for complex workflows. The Self-Healing Infrastructure Monitor ensures system stability by monitoring and remediating critical services.

### Master Rule Map System (Win 23)
- **kb_master_rules table**: 27-column PostgreSQL table with 263 rules seeded from existing KB tables (red_flag, diagnosis, treatment, disposition rule tables)
- **Rule types**: red_flag, diagnosis, cluster_scoring, medication, disposition, modifier, question, workup, plan
- **13-step pipeline engine**: `server/clinical/ruleExecutionEngine.ts` — `executePipeline(complaint_id, inputs)` returns step-by-step trace
- **API routes**: `server/routes/masterRules.routes.ts` at `/api/master-rules/*` (list, stats, single, pipeline, dry-run, export-to-sheets, create, update)
  - **Route order note**: `/pipeline/:complaint_id` must appear BEFORE `/:rule_id` to prevent route capture
- **Sheet export**: `server/scripts/exportMasterRulesToSheets.ts` — 27-column exact format to MASTER_RULE_MAP Google Sheet tab
- **Frontend dashboard** (`client/src/pages/MasterRuleMapPage.tsx`): 6 tabs — Rule Catalog, Pipeline Simulator, Coverage Overview, Drill-down, Gaps, Tools & RLHF
  - Rule Catalog: stats grid, filter bar (type/safety/complaint), paginated table, 27-field detail panel
  - Pipeline Simulator: 13-step pipeline view per complaint, dry-run JSON input, execution trace with expandable steps
- **Auth note**: Custom fetch calls in frontend use `localStorage.getItem("app_auth_token")` for `Authorization: Bearer` headers (the default queryFn does not include this header)

### External Dependencies
*   **AI Integration**: OpenAI API (GPT-4o-mini, GPT-4o, GPT-4-turbo, LangChain, LangGraph)
*   **Messaging Integration**: Twilio (WhatsApp, SMS, Voice TTS), Telegram
*   **Database**: PostgreSQL, Firebase Firestore, SQLite, Redis (BullMQ for queuing)
*   **Data Configuration**: Google Sheets
*   **Cloud Storage**: Firebase Storage, AWS S3
*   **Authentication**: Google OAuth2
*   **EHR Systems**: Epic (FHIR + SMART on FHIR skeleton), Athena Health (proprietary REST), eClinicalWorks (SMART on FHIR complete)
*   **Monitoring**: Prometheus, Grafana, LangSmith
*   **Version Control**: GitHub
*   **External APIs**: NCBI (PubMed), ClinicalTrials.gov, Payer APIs