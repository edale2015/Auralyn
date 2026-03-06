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
This data-driven engine replaces per-complaint TypeScript scoring with CSV-driven rules. It processes rules from `CLUSTER_SCORING_RULES.csv` using an expression evaluator and calculates scores, red flags, and dispositions. A **bundle validator** (`validateComplaintBundle`) enforces structural integrity at load time: registry entry exists with engineType, questions are present, disposition rules include a catch-all, escalation paths exist, and GENERIC_V1 complaints have cluster scoring rules with PRIMARY entries and red flag rules. Errors hard-fail; warnings log but proceed.

### Expression Evaluator (exprEval.ts)
Recursive-descent parser supporting: `&&`, `||`, `==`, `!=`, `>=`, `<=`, `>`, `<`, `!`, `in [...]`, dot-path resolution, strings, numbers, booleans, parens. **Atomic grammar functions**: `ALL(expr, ...)` (logical AND), `ANY(expr, ...)` (logical OR), `NOT(expr)` (negation), `LEN(val)` (array/string length). **Compatibility**: single `=` is auto-normalized to `==` for CSV authoring convenience (does not affect `>=`, `<=`, `!=`). Example CSV expressions: `ANY(answers.Q_SOB = 'yes', answers.Q_CHEST = 'yes')`, `ALL(answers.Q_FEVER = 'yes', NOT(answers.Q_IMMUNOCOMP = 'yes'))`.

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
Data-driven subtype upgrades for improved diagnostic granularity. These add optional questions, new cluster scoring rules, DX_PRIORITY tie-breaking, and hard golden tests for various complaints like Cardio Chest Pain, Pulm Cough, Neuro Headache, GI Abdominal Pain, DERM Rash, ENT Sore Throat, GU Flank Pain, MSK Back Pain, OPHTHO Red Eye, TOX Overdose, ID Fever, ORTHO Head Injury, ENDO Hyperglycemia, PSYCH Anxiety/Panic, ENV Heat Illness, and ENV Cold Exposure/Hypothermia. Currently 73+ complaints on GENERIC_V1 with 1455 golden tests passing.

### Cross-Complaint Boosts (B5)
A data-driven engine (`crossComplaintBoostEngine.ts`) that nudges cluster scores based on cross-system clinical patterns. Configured via `CROSS_COMPLAINT_BOOSTS.csv` with rules like PE triad (CP+SOB+leg swelling), ACS pattern, meningitis triad, anaphylaxis respiratory, DKA neuro, and heat stroke exertional. Applied after complaint scoring but before winner pick. Produces audit trail via `crossComplaintAdjustments[]` on CaseState. Validated by 10 golden tests in `CROSS_COMPLAINT_GOLDENS.jsonl`.

### Telegram Triage Bot
A Telegram webhook at `/telegram/webhook` provides conversational triage via the generic complaint engine. Uses `channelThreadService` (Firestore `channel_threads` collection) to map chats → active cases, `complaintMatchService` (registry ALIASES) for symptom→complaint routing, `questionFlowService` (CORE_QUESTIONS.csv REQUIRED column) for sequential question flow, and `triageService` for final disposition. Supports `/start` and `/reset` commands. Env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`. Webhook setup: `npx tsx scripts/telegram-set-webhook.ts`.

### Complaint Engine Generator
A bulk complaint scaffolding tool (`scripts/generate-complaints.ts`) that generates complete complaint bundles from a seed CSV or single command. For each complaint it appends rows to all central CSVs (COMPLAINT_REGISTRY, CORE_QUESTIONS, CLUSTER_SCORING_RULES, RED_FLAG_RULES, DISPOSITION_RULES, OUTPUT_TEMPLATES, DX_PRIORITY) and creates 10 golden test stubs. Supports bulk mode (`npx tsx scripts/generate-complaints.ts data/complaints/seed.csv`) and single mode (`npx tsx scripts/generate-complaints.ts <cc_id> <system> <label> [aliases]`). Idempotent — skips existing CC_IDs. Seed CSV columns: CC_ID, SYSTEM, LABEL, ALIASES.

A differentials accelerator (`scripts/generate-complaints-from-differentials.ts`) extends the base generator by reading a seed CSV with a DIFFERENTIALS column (semicolon-separated differential diagnoses). For each complaint it: (1) runs the base generator if missing, (2) appends differential-derived cluster scoring rules (inert stubs with `WHEN_EXPR=false`, 0 points) and DX_PRIORITY rows, (3) optionally emits golden test suggestion files. Usage: `npx tsx scripts/generate-complaints-from-differentials.ts data/complaints/differentials_seed.csv [--dry-run] [--no-golden]`. Seed CSV columns: COMPLAINT_KEY, SYSTEM, LABEL, ALIASES, DIFFERENTIALS.

### Profile Pack System
A data-driven system for safely "waking up" inert differential CSR stubs with real clinical WHEN_EXPRs. Profile packs are defined in `data/complaints/profile_packs.json`, each specifying a complaint's `cc_id`, `cluster_prefix`, and an `activate` array with `dx` (differential token matching RULE_ID), `when` (expression using `answers.Q_XX_YY` format), `points`, and `label`. Three scripts work together:

- **ensure-profile-rows** (`scripts/ensure-profile-rows.ts`): Creates missing CSR stub rows for profile activation targets. Usage: `npx tsx scripts/ensure-profile-rows.ts <cc_id> <PROFILE_ID> [--dry-run]`
- **apply-profile-pack** (`scripts/apply-profile-pack.ts`): Activates targeted CSR stubs by updating WHEN_EXPR, POINTS, and EVIDENCE_LABEL. Also ensures DXP tier rows exist. Matches by RULE_ID pattern (`CSR_<CCID>_DX_<TOKEN>`). Usage: `npx tsx scripts/apply-profile-pack.ts <cc_id> <PROFILE_ID> [--dry-run]`
- **bulk applier** (`scripts/apply-profile-pack-bulk.ts`): Reads all CSVs once, plans all changes in-memory, writes once. Supports `--dry-run`, `--continue-on-fail`, `--only-profile <ID>`, `--cc <id>`, `--list`, `--summary-json <path>`. Usage: `npx tsx scripts/apply-profile-pack-bulk.ts data/complaints/profile_apply_seed.csv [flags]`. Includes transaction backups (`_tx_backups/<RUN_ID>/`), atomic writes (tmp+rename), `--validate-cmd <cmd>` for post-write validation with auto-rollback on failure, `--no-auto-rollback`, and `--rollback <RUN_ID>` for manual restore. `--parallel <N>` accepted for future concurrency.

Currently 18 profiles defined across 12 system families (ENT, PULM, CARD, GI, GU, NEURO, DERM, MSK, PSYCH, ENDO). All idempotent. 1505 golden tests passing after activation.

### Family Pack Generator
Generates profile packs and apply-seed rows from a family seed CSV (`data/complaints/family_seed_v1.csv`). Usage: `npx tsx scripts/generate-family-packs.ts data/complaints/family_seed_v1.csv [--dry-run] [--emit-questions <out.csv>]`. Seed CSV columns: FAMILY_ID, PROFILE_ID, SYSTEM, CLUSTER_PREFIX, CC_IDS, DIFFERENTIALS_PRIMARY/SECONDARY/BENIGN, QUESTIONS. Idempotent — skips existing profile IDs.

### Red Flag Packs
Data-driven red flag rule packs in `data/complaints/red_flag_packs.json`. Applied by `scripts/apply-red-flag-packs.ts [--dry-run]`. Each pack specifies `applies_to_cc_ids` and an array of rules with `rf_id`, `trigger_expr`, `label`, `severity`, `action`, `immediate_actions`, `rationale`. Idempotent — skips existing RF_ID+CC_ID pairs. Currently 3 packs: RF_PACK_CHEST_PAIN, RF_PACK_NEURO, RF_PACK_DERM.

### DX Candidates Engine
Generates ranked diagnostic candidates from CSR + DXP data. Script: `scripts/generate-dx-candidates.ts`. Output: `server/data/csv/DX_CANDIDATES.csv` (596 rows across 73 complaints). Loaded by `complaintConfigLoader.ts` into `ComplaintConfig.dxCandidates` with file-mtime caching. Used by `genericComplaintEngineV1.ts` to populate `likelyDx` and `dxListText` on CaseState for template rendering.

### Profile Quality Tooling
- **Coverage Report** (`scripts/coverage-report.ts`): Reports CSR active/inert counts, profile target status, and missing CSR rows per complaint. Output: `data/complaints/reports/coverage_report.csv`. Supports `--cc <id>` filter and `--out <path>`.
- **Profile Pack Linter** (`scripts/lint-profile-packs.ts`): Validates all profiles for missing fields, duplicate dx entries, non-numeric points, and WHEN_EXPR tokens not found in CORE_QUESTIONS. Exit code 1 on errors.
- **Question Coverage** (`scripts/ensure-profile-questions.ts`): Detects Q_IDs referenced in profile WHEN_EXPRs missing from CORE_QUESTIONS. Reports suggestions; `--apply` auto-adds them.

### Operational Intelligence (Phase 6)
- **Case Analytics Log** (`server/data/csv/CASE_ANALYTICS_LOG.csv`): Auto-appended by `runGenericComplaintV1()` after each disposition. Columns: `TIMESTAMP,CASE_ID,CC_ID,DISPOSITION,TOP_DX,DX_SCORE,RED_FLAG_TRIGGERED,TOP_CLUSTER,ENGINE_VERSION`. Skipped during harness runs (`HARNESS_MODE=1`). Gitignored (runtime data).
- **Cluster Coverage Heatmap** (`scripts/cluster-coverage-report.ts`): Reports per-complaint CSR row counts, active/inert rules, clusters fired in golden tests vs analytics. Output: `data/complaints/cluster_heatmap.csv`. Highlights complaints with no test coverage and >50% inert rules.
- **Confidence Calibration**: DX candidates now include normalized confidence percentages (`score / sum(top 5 scores)`). `dxListText` on CaseState renders as `• Viral URI (63%)` format for improved user trust.

### Validation and Testing
The system includes a Stress Test Harness, Complaint Golden Test Harness, Data Corruption Guard, Replay Harness, Release Candidate (RC) System, Cross-Complaint Goldens, Bundle ABI Validator (`scripts/validate-complaint-bundles.ts`), and a comprehensive Gate-Prod Pipeline (8 gates) for pre-deployment validation.

## External Dependencies

-   **AI Integration**: OpenAI API (via Replit AI Integrations).
-   **Messaging Integration**: Twilio for WhatsApp, Telegram Bot API for Telegram.
-   **Database**: Firebase Firestore.
-   **Data Configuration**: Google Sheets.
-   **Cloud Storage**: Firebase Storage.