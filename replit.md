# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that uses WhatsApp to guide patients through an ENT Flu questionnaire, collecting symptoms and medical history. It generates proposed diagnoses and treatment plans for physician review and communicates approved dispositions and orders back to patients via WhatsApp. The project aims to efficiently manage flu-like symptom consultations, reduce physician workload, and improve patient access to care by leveraging AI for initial assessments and automating communication.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18 and TypeScript, utilizing `shadcn/ui` (Radix UI based) with Tailwind CSS. It supports physician login, patient intake, case status views, a signed visit summary, a physician dashboard, and a Trace Viewer.

### Backend
The backend uses Express 5 on Node.js with TypeScript, exposing REST API endpoints. It features a constrained agent architecture for deterministic medical triage, including a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. Key functionalities include Centor score calculation, red flag detection, and a supervisor gate for patient-facing outputs. LLM integrations utilize Replit AI Integrations (OpenAI-compatible) with `gpt-5-mini`, incorporating rate limiting, per-run budgets, and a circuit breaker.

### Data Storage
Primary data storage is Firebase Firestore, with SQLite used as an abstraction for intake storage. Schemas are defined for physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies involve splitting storage for clinical records and debug telemetry.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification.

### Agent System
The agent system manages patient flow through various routing states using `AgentAction` types. A pipeline orchestrator handles complaint routing, FHIR prefill, modifiers, rules evaluation, question queue generation, and a supervisor gate. LLM-powered actions like `REFRAME_QUESTION` and `DRAFT_SUMMARY` are used. The system supports prompt template versioning and LLM A/B testing with guardrails.

### Multi-System Triage Pipeline
A robust triage pipeline uses canonical keys for medical systems, chief complaints, and clusters. A unified sheets registry, loaded from Google Sheets, provides dynamically configured data for complaint routing, integration maps, FHIR prefill, modifiers, and rules engines. A question queue dynamically builds ordered questions, and an enhanced supervisor manages red flags and triage upgrades. A cluster/disposition engine resolves dispositions, and a diagnosis resolver provides confidence-scored diagnostic candidates. Medication suggestions are generated with safety checks.

### Obesity Agent & Metabolic Triage
A secondary-track ObesityAgent runs in parallel with primary complaint routing, triggering on BMI/weight indicators or metabolic medications. It extends `CaseState` with metabolic, DM, HTN, bariatric, GLP-1, and social details. New `AgentAction` types support specific interventions.

### Clinical State Builder System
This system deterministically assembles an auditable clinical state from multiple data tables, capturing evidence traces. It integrates `buildClinicalState()`, `evaluateRedFlagsMaster()`, and `selectSpotInterventions()`. A `runCrossoverHooks()` orchestrates parallel execution of red flag evaluation, urgent care spot interventions, the obesity agent, confidence scoring, care gap evaluation, and the education sandbox, with a priority merge order and ER_SEND short-circuiting.

### Clinical State Confidence Scoring
`computeConfidence()` assigns HIGH/MODERATE/LOW confidence to each inferred condition based on evidence strength.

### Care Gap Engine
`evaluateCareGaps()` evaluates gaps across various conditions. Gaps are severity-boosted under certain conditions.

### Red Flag Audit & Consistency Checker
`runRedFlagAudit()` validates RF references across key rule sets, checking for inconsistencies and preventing silent rule poisoning.

### Agent Trace Viewer
`server/services/traceViewer.ts` provides an in-memory LRU trace store. `buildTraceTimeline()` constructs ordered evidence chains from input to final output, with each step including evidence arrays.

### Safe Freeform Education Sandbox
`evaluateSandboxEligibility()` gates education-only content. It is disabled if ER_SEND is active or confidence is LOW, and only produces educational template content.

### Stress Test Harness
A stress test harness at `POST /api/admin/stress-test` accepts an array of scenarios with assertions, including 100 pre-built scenarios. A standalone runner script at `server/tests/runStressTest.ts` executes all scenarios via CLI.

### Complaint Golden Test Harness
`scripts/run_harness.ts` runs deterministic golden/fuzz test suites for complaint pipelines, covering 825 tests across 71 directories.

### Data Corruption Guard
`server/data/corruptionGuard.ts` validates core configuration data on every config load, checking for corruption, invalid formats, and inconsistencies, hard-failing to prevent silent rule poisoning.

### Latest Status (as of DX_PRIORITY + Micro-Pack Fix Session)
**Test Status:** 1247/1247 PASS across 71 directories (0 failures)
**Hard Golden Coverage:** 312 hard golden tests (13 per complaint × 24 complaints) across OPHTHO, ID, TOX, ORTHO_TRAUMA, DERM, MSK, ENDO, PSYCH
**System Coverage:** 72 total complaint pipelines across 16 medical systems (66 GENERIC_V1, 6 LEGACY)
**Pending:** RENAL (3 complaints) and HEMEONC (3 complaints) need full pipeline scaffolding before golden ingestion

### Consolidated System Inventory (Complaint Pipelines)

| System | Complaint Pipelines (slugs) |
|---|---|
| **ENT** | sore_throat (LEGACY), earache (LEGACY), ent_sinus_pressure, ent_sore_throat, ent_ear_pain, ent_nasal_congestion, ent_epistaxis |
| **PULM** | persistent_cough (LEGACY), pulm_cough, pulm_shortness_of_breath, pulm_wheezing, pulm_chest_tightness, pulm_hemoptysis |
| **GI** | abdominal_pain (LEGACY), chest_pain (LEGACY/CARD), gi_abdominal_pain, gi_diarrhea, gi_vomiting, gi_gi_bleeding, gi_constipation, gi_jaundice, gi_dysphagia, gi_acute_pancreatitis_like |
| **NEURO** | dizziness (LEGACY), neuro_headache, neuro_dizziness_vertigo, neuro_weakness_numbness, neuro_seizure, neuro_syncope, neuro_confusion_ams |
| **GU** | gu_uti_symptoms, gu_testicular_pain_prostatitis, gu_dysuria_uti, gu_flank_pain, gu_testicular_pain, gu_hematuria, gu_urinary_retention, gu_sti_exposure_discharge, gu_pelvic_pain_possible_ovarian_torsion, gu_vaginal_bleeding |
| **GYN** | gyn_pelvic_pain |
| **CARDIO** | cardio_chest_pain, cardio_palpitations, cardio_leg_swelling |
| **MSK** | msk_back_pain, msk_joint_pain, msk_sprain_injury |
| **DERM** | derm_rash, derm_cellulitis, derm_allergic_reaction |
| **ENDO** | endo_hyperglycemia, endo_hypoglycemia, endo_thyroid_symptoms |
| **PSYCH** | psych_anxiety_panic, psych_depression_suicidal_ideation, psych_agitation_psychosis |
| **OPHTHO** | ophtho_vision_loss, ophtho_red_eye, ophtho_eye_pain_foreign_body |
| **ID** | id_fever, id_flu_like, id_animal_bite_wound_infection |
| **TOX** | tox_overdose_intoxication, tox_withdrawal, tox_poisoning_exposure |
| **ORTHO_TRAUMA** | ortho_trauma_head_injury, ortho_trauma_fracture_dislocation, ortho_trauma_laceration |
| **GENERAL** | general_fatigue, general_generalized_weakness, general_nausea_malaise |

### Generic Data-Driven Engine (GENERIC_V1)
`server/engines/genericComplaintEngineV1.ts` provides a fully data-driven complaint pipeline that replaces per-complaint TypeScript scoring modules. Complaints use `CLUSTER_SCORING_RULES` CSV rows to define cluster scoring logic, enabling new complaints to be added with zero TypeScript code. 66/72 complaints run on GENERIC_V1; 6 remain LEGACY. Hard golden tests (13 per complaint) provide deterministic coverage across 24 complaints in 8 systems.

### Multi-Channel Messaging
A unified messaging architecture uses a `MessageEvent` type with channel abstraction (WhatsApp, Telegram, Web, Test) and `conversationId` keying. Conversation state is Firestore-cached with deduplication. Channel adapters route replies, and a message orchestrator handles shared processing logic, staff commands, menu routing, answer parsing, and emergency warnings.

### Phase 2A Automation Tooling
Three automation scripts support the suppressor/boost rule development workflow:

- **`scripts/build-micro-packs.ts`**: Reads `phase2a_pairs_20.txt` (20-pair schedule) and combines per-complaint CSV files from `micro_packs/` into a single `data/micro_packs.csv`. Run: `npx tsx scripts/build-micro-packs.ts`
- **`scripts/tune-pairs.ts`**: Automated pair-by-pair suppressor testing with auto-revert. For each pair: snapshots CSV → removes existing suppressors for complaints with micro rules → applies micro-pack rules → runs harness per complaint → reverts on failure. Outputs `phase2a_pairs_report.json`. Run: `HARNESS_MODE=1 npx tsx scripts/tune-pairs.ts`
- **`scripts/simulate-stress.ts`**: Stress simulation using golden cases with injected noise (0-40% answer flipping). Runs N cases (default 500), reports disposition distribution, cluster distribution, ER_SEND hotspots. Run: `N=500 HARNESS_MODE=1 npx tsx scripts/simulate-stress.ts`

Key files: `phase2a_pairs_20.txt` (pair schedule), `micro_packs/*.csv` (per-complaint candidate rules), `data/micro_packs.csv` (auto-generated combined file).

### Suppressor/Boost Rule Status
147 active suppressor/boost rules across 25 complaints in CLUSTER_SCORING_RULES.csv. All complaints are resolved. Test status: 1247/1247 PASS with 0 failures. DX_PRIORITY tie-break covers 7 complaints (endo_hyperglycemia, msk_back_pain, derm_cellulitis, ent_epistaxis, gi_dysphagia, gu_urinary_retention). Micro-pack scoring rules cover gi_diarrhea (blood differentiator), gu_flank_pain (fever differentiator), neuro_dizziness_vertigo (neurodef differentiator), pulm_chest_tightness (wheeze differentiator).

### Deterministic Tie-Break System
`server/data/csv/DX_PRIORITY.csv` provides optional priority-based tie-breaking for cluster scoring. When clusters have equal scores:
1. If the complaint has entries in DX_PRIORITY.csv → higher priority wins → alphabetical fallback
2. If no entries → stable sort (CSV insertion order preserved)
The tie-break mode is recorded in the `ScoringExplanation` as `"score" | "priority" | "dx_id" | "none"`.

### Scoring Explanation & Confidence
`computeScoresFromRules()` now returns a `ScoringExplanation` object containing:
- `topRules`: top 5 positive-scoring fired rules (ruleId, clusterId, points)
- `topSuppressors`: top 5 negative-scoring fired rules
- `rfTriggered`: red flag IDs that fired
- `tieBreak`: how the winner was determined
- `margin`: point gap between #1 and #2 cluster
- `confidence`: HIGH (margin≥4, ≤1 suppressor), MODERATE (margin≥2), LOW (margin≤1 or many suppressors)
Stored on `CaseState.scoringExplanation` for audit trail.

### Replay Harness
`scripts/replay.ts` replays stored cases through the engine for reproducible debugging.
- `data/case_store.jsonl`: append-only JSONL case store
- Usage: `npx tsx scripts/replay.ts --list [filter]` (list cases), `npx tsx scripts/replay.ts --add <slug> <answers.json>` (add case), `npx tsx scripts/replay.ts <CASE_ID>` (replay case)
- Output includes disposition, clusters, scores, red flags, and full scoring explanation

### Release Candidate (RC) System
The RC system ensures consistent agent behavior through automated regression testing. It executes golden scenarios across LLM variants, generating reports with pass/fail summaries, diffs, latency, and token usage. A replay mode allows testing changes against existing traces, and PHI-safe replay packs enable secure QA.

### Phase 4: Case Management & Physician Review (Firestore-backed)
Firestore-backed case lifecycle with state machine (DRAFT → TRIAGED → NEEDS_REVIEW → APPROVED → SENT → CLOSED).

**Server files:**
- `server/models/caseTypes.ts`: CaseDoc, CaseTriage, PhysicianReview, ScoringExplanation types
- `server/services/caseService.ts`: Firestore CRUD (create, get, merge answers, set triage, physician review, list queue)
- `server/services/triageService.ts`: Wires `runGenericComplaintV1` engine to case triage — builds minimal CaseState, runs engine, maps results
- `server/services/hash.ts`: SHA-256 answer hashing for deduplication
- `server/middleware/reviewAuth.ts`: Placeholder auth gate (REVIEW_AUTH_MODE=off bypasses)
- `server/routes/cases.routes.ts`: POST /api/cases, GET /api/cases/:id, POST answers/message/triage/state
- `server/routes/review.routes.ts`: GET /api/review/queue, GET/POST /api/review/case/:id

**Frontend pages:**
- `/review` → `ReviewQueue.tsx`: Physician review queue with state filter, auto-refresh
- `/review/:caseId` → `CaseReview.tsx`: Case detail with answers, scoring explanation, approve/modify/escalate/reject actions

**Environment:** `REVIEW_AUTH_MODE=off` disables auth for development.

## External Dependencies

-   **AI Integration**: OpenAI API (via Replit AI Integrations).
-   **Messaging Integration**: Twilio for WhatsApp, Telegram Bot API for Telegram.
-   **Database**: Firebase Firestore.
-   **Data Configuration**: Google Sheets for dynamic configuration.
-   **Cloud Storage**: Firebase Storage.