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

## Analytics Engine (`/api/analytics/*`) — COMPLETE

New DB tables: `guideline_evidence`, `guideline_rankings`, `specialty_review_cycles`, `specialty_review_items`, `patient_outcomes`, `calibration_data`, `calibration_models`, `treatment_effect_data`, `causal_model_state`, `treatment_policy`, `payer_outcomes`, `validation_runs`

**API Routes**:
- `GET /api/analytics/evidence-ranking` — ranked guideline evidence by source type × sample size × recency × impact
- `POST /api/analytics/evidence-score` — score a recommendation (RCT +4, meta-analysis +5, cohort +3, expert +1)
- `GET /api/analytics/calibration` — 10-bin calibration curve + Brier score
- `POST /api/analytics/calibration/seed` — seed 200 synthetic calibration points + 1 validation run
- `GET /api/analytics/causal` — ATE (IPW + doubly-robust) per treatment from causal_model_state
- `POST /api/analytics/causal/seed` — load 4 demo treatment effects (amoxicillin, azithromycin, ibuprofen, steroids_croup)
- `POST /api/analytics/causal/submit` — submit new outcome → recompute ATE
- `GET /api/analytics/outcomes` — mismatch rate, clusters, recent cases
- `POST /api/analytics/outcomes/seed` — 8 synthetic patient outcomes
- `GET /api/analytics/payer` — avg cost, readmission rate, LOS by diagnosis
- `POST /api/analytics/payer/seed` — 8 synthetic payer rows
- `GET /api/analytics/fda-report` — FDA-ready JSON (validation metrics, safety gates, traceability, system stats)
- `GET /api/analytics/review-cycles` — specialty review cycle list
- `POST /api/analytics/review-cycles/generate` — auto-generate 6 specialty cycles (ENT, PULM, CARDIO, NEURO, GI, GU)

**Clinical Improvement Lab now has 6 middle tabs** (updated):
- Tab 1: PubMed Auto-Ingestion
- Tab 2: Gap Analysis
- Tab 3: Evidence Scores (scatter vs KB base probability)
- Tab 4: **Evidence Ranking** — guideline credibility scores (RCT/meta/cohort/expert + sample size + recency + IF); ranked list with progress bars
- Tab 5: **Calibration** — confidence calibration curve (10 bins, Brier score); ATE panel (treatment effects, IPW + doubly-robust)
- Tab 6: **Outcomes & FDA** — real-world mismatch rate + mismatch cluster chart; payer metrics table; FDA-ready report with export JSON

## Care Pathway Optimizer (`/care-pathway-optimizer`) — COMPLETE

New DB tables: `care_pathways`, `pathway_experiments`, `pathway_metrics`, `pathway_suggestions`

A/B pathway experimentation dashboard — clinical wind tunnel for optimizing decision tree sequences.

**Layout**: 3-column — Pathway Library (left) | A/B Experiment Runner + Results (middle) | Auto-Suggestions Queue (right)

**Features**:
- **Pathway Library**: 4 seeded demo pathways (SORE_THROAT_V1/V2, HEADACHE_V1/V2); expandable to see step-by-step sequence with type color-coding
- **A/B Experiment Runner**: Select any 2 pathways + case count (100–2000); simulation engine runs N cases through both pathways computing: accuracy, RF sensitivity, false reassurance rate, avg cost, avg steps, avg time, admission rate
- **Metric Comparison Table**: Side-by-side A vs B with color-coded winner per metric
- **Auto-Suggestion Engine**: After each experiment, rules-based engine generates pathway improvement suggestions (add_step, reorder_step, remove_step) with confidence scores
- **Suggestions Queue**: Right pane shows all pending suggestions with rationale, confidence, and "Apply Suggestion" button
- **Experiment History**: Recent experiments with case counts and accuracy comparison

**API Routes** (`/api/optimizer/*`):
- `POST /api/optimizer/seed` — load 4 demo pathways
- `GET /api/optimizer/` — list pathways
- `POST /api/optimizer/` — create/update pathway
- `POST /api/optimizer/experiment` — run A/B simulation (up to 2000 cases), saves metrics + suggestions
- `GET /api/optimizer/experiments` — recent experiment history
- `GET /api/optimizer/suggestions?status=pending` — filtered suggestion queue
- `PATCH /api/optimizer/suggestions/:id` — update suggestion status
- `GET /api/optimizer/metrics` — pathway performance history

**Simulation Engine**: Deterministic simulation based on pathway config flags — strict_mode RF improves sensitivity 0.81→0.93, workup step adds $140–$340 cost, findings step +2% accuracy, pregnancy check +1% accuracy

## Skill Graph (`/knowledge-graph` → "Skill Graph" tab) — COMPLETE

New DB tables: `skill_nodes`, `skill_edges`

A persistent, materialized node/edge graph built on demand from the live KB tables. Visualized with React Flow on the Knowledge Graph page (9th tab).

**Build endpoint** (`POST /api/skill-graph/build`): Scans all active KB tables and materializes:
- **complaint nodes** — from `kb_complaints` (1 per active complaint)
- **modifier nodes** — from `kb_modifiers` (global, system-wide modifiers)
- **skill nodes** — from `kb_questions` (1 per distinct question_id)
- **rule nodes** — from `kb_red_flag_rules` + `kb_diagnosis_rules`
- **edges**: complaint → modifier (`uses`), complaint → skill (`uses`), complaint → red_flag_rule (`triggers`), complaint → diagnosis_rule (`triggers`)
- Degree counters (`degree_in`, `degree_out`) updated after build

**API Routes** (`/api/skill-graph/*`):
- `POST /api/skill-graph/build` — materialize graph from live KB (returns nodeCount, edgeCount, breakdown)
- `GET /api/skill-graph/stats` — { built, nodeCount, edgeCount, byType[], byRel[] }
- `GET /api/skill-graph/nodes?type=&system=` — filtered node list
- `GET /api/skill-graph/edges?relationship=` — filtered edge list
- `GET /api/skill-graph/coverage` — { summary, issues[], modifier_matrix[] } — orphan + gap analysis

**Frontend Panel** (4 sub-tabs):
- **Canvas** — React Flow canvas (MiniMap, Controls, Background); column-based auto-layout; type filter (complaint/modifier/skill/rule) + system filter; edge labels + animated "triggers" edges; legend overlay; up to 500 edges rendered
- **Coverage Evaluator** — 4 stat cards (total nodes, total edges, orphans, coverage %); issue list with critical/high/medium severity (orphans, sparse complaints, unlinked skills/rules)
- **Modifier Matrix** — per-complaint progress bar showing how many of the system-wide modifiers are connected; color-coded (green ≥80%, yellow ≥50%, red <50%)
- **Node List** — type breakdown cards + paginated node rows (200 max); degree indicators; applies type + system filters

**Typical build stats**: ~1,294 nodes · ~1,986 edges from current KB; 100% coverage (0 orphans) with all modifiers connected to all complaints.

## External Dependencies
*   **AI Integration**: OpenAI API
*   **Messaging Integration**: Twilio for WhatsApp, SMS, and Voice TTS
*   **Database**: Firebase Firestore, SQLite, PostgreSQL
*   **Data Configuration**: Google Sheets
*   **Cloud Storage**: Firebase Storage
*   **Authentication**: Google OAuth2 (for Gmail API)