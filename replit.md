# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that uses WhatsApp to conduct initial patient assessments for flu-like symptoms. It gathers symptoms and medical history, then leverages AI to generate proposed diagnoses and treatment plans for physician review. The system automates communication of approved dispositions and orders back to patients. Its purpose is to enhance efficiency in managing flu-like consultations, reduce physician workload, and improve patient access to healthcare by integrating AI for initial assessments and automating communication workflows.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture
The system employs a constrained agent architecture for deterministic medical triage, featuring a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. It includes a multi-system triage pipeline that uses canonical keys and a unified sheets registry to configure data, build question queues, and generate confidence-scored diagnostic candidates. A clinical state builder system deterministically assembles an auditable clinical state from various data sources.

### Frontend
The frontend is built with React 18 and TypeScript, utilizing `shadcn/ui` with Tailwind CSS, supporting physician login, patient intake, case status, visit summaries, and a physician dashboard.

### Backend
The backend uses Express 5 on Node.js with TypeScript, providing REST API endpoints. Key functionalities include Centor score calculation, red flag detection, and a supervisor gate for patient-facing outputs. LLM integrations incorporate rate limiting, per-run budgets, and a circuit breaker.

### Data Management
Primary data storage is Firebase Firestore, with SQLite used for intake storage abstraction. Schemas exist for physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies involve splitting storage for clinical records and debug telemetry.

### Authentication
Physician authentication uses password-only, session-based HMAC-signed httpOnly cookies. Patient access is token-based for intake, requiring a 6-digit code verification.

### Agent System Features
The agent system orchestrates patient flow through various routing states using a pipeline orchestrator. It supports LLM-powered actions, prompt template versioning, and LLM A/B testing with guardrails.

### Generic Complaint Engine (GENERIC_V1)
The data-driven engine (`server/engines/genericComplaintEngineV1.ts`) replaces per-complaint TypeScript scoring modules with CSV-configured rules. Adding a new complaint requires zero new TypeScript code — only CSV rows + golden tests.

**Engine pipeline**: `loadComplaintConfig(ccId)` → `runCoreQuestions()` → `runRedFlagsComplaint()` → `computeScoresFromRules()` → `applyCrossComplaintBoosts()` → `computeScoringSystems()` → `runDisposition()` → output assembly.

**Key tables**:
- `COMPLAINT_REGISTRY.csv`: `ENGINE_TYPE` column routes to `GENERIC_V1` or `LEGACY` engine
- `CLUSTER_SCORING_RULES.csv`: `CC_ID,CLUSTER_ID,RULE_ID,POINTS,WHEN_EXPR,EVIDENCE_LABEL` — expression-evaluated rules grouped by cluster, scored via `evaluateExpr()`
- `CORE_QUESTIONS.csv`, `RED_FLAG_RULES.csv`, `DISPOSITION_RULES.csv`, `OUTPUT_TEMPLATES.csv`: shared across both engine types

**Routing** (`server/services/complaintNodeRunner.ts`): If `config.registry.engineType === "GENERIC_V1"`, calls `runGenericComplaintV1()` directly, bypassing the legacy graph state machine.

**Scaffolder** (`scripts/new_complaint_kit.ts`): `npx tsx scripts/new_complaint_kit.ts <cc_id> <system> <label>` generates stub CSV rows + 10 golden test stubs. Edit rules, update tests, run harness.

**Bundle validation**: `validateComplaintBundle()` enforces GENERIC_V1 constraints (requires cluster scoring rules, red flag rules). `assertClusterScoringRulesNotCorrupt()` validates CLUSTER_ID (`^CL_`), RULE_ID (`^[A-Z0-9_]+`), numeric POINTS.

### Clinical Scoring Systems
Data-driven clinical scoring systems (PERC, WELLS_PE, CENTOR, CURB-65, HEART) are configured via `SCORING_SYSTEMS.csv` and computed automatically. A consistency engine, defined by `CONSISTENCY_RULES.csv`, acts as a safety-net for dangerous symptom combinations. A calibration system measures triage rates against targets.

### Advanced Triage Logic
The system supports subtype expansions for improved diagnostic granularity and cross-complaint boosts to adjust cluster scores based on multi-system clinical patterns. It also includes an engine to generate ranked diagnostic candidates.

### Case Management
A Firestore-backed case lifecycle manages cases through a state machine (DRAFT → TRIAGED → NEEDS_REVIEW → APPROVED → SENT → CLOSED), providing CRUD services and authentication for review. Schemas exist for physicians, patients, encounters, orders, WhatsApp messages, and cases. PHI retention policies involve splitting storage for clinical records and debug telemetry.

The expanded Firestore backbone (`server/types/case.ts`, `server/types/signoff.ts`) provides comprehensive typed models for cases (with patient context, engine results, DX candidates, cluster scores, rule traces), case events (audit trail), signoffs (physician review with overrides), and runtime metrics. Firestore stores:
- **Cases** (`server/services/firestoreCaseStore.ts`): Full case lifecycle — INTAKE_IN_PROGRESS → AWAITING_REVIEW → IN_REVIEW → SIGNED_OFF → CLOSED, with review queue, answer updates, engine result storage, reviewer assignment, ECW export tracking.
- **Case Events** (`server/services/firestoreCaseEvents.ts`): Append-only audit trail of all case activity (creation, messages, engine runs, red flags, signoffs, exports).
- **Signoffs** (`server/services/firestoreSignoffStore.ts`): Physician review records with status (APPROVED/APPROVED_WITH_EDITS/REQUEST_MORE_INFO/ESCALATED/REJECTED), overrides, rationale.
- **Runtime Metrics** (`server/services/firestoreRuntimeMetrics.ts`): Production telemetry for engine runs, case creation, red flag triggers, signoffs, discrepancies.

### Operational Intelligence & Tooling
Operational intelligence features include a case analytics log and a cluster coverage heatmap. Tooling for profile quality includes a coverage report, profile pack linter, and question coverage analysis.

### Guideline-to-Engine Toolchain
A 6-step toolchain compiles raw clinical guideline text into engine-ready CSV rows:
1. **Compiler** (`scripts/compile-guideline-to-ir.ts`): Text → draft IR JSON (`data/complaints/ir/`). Heuristic keyword/phrase matching.
   - **Flowchart Compiler** (`scripts/compile-flowchart-to-ir.ts`): Structured `.flow.txt` → IR JSON. Supports `QUESTION:`, `RED_FLAG:`, `CLUSTER:`, `DISPOSITION:`, `MODIFIER:` directives.
   - **ASCII Tree Compiler** (`scripts/compile-ascii-tree-to-ir.ts`): Indented decision tree `.tree.txt` → IR JSON. Supports `Q:`, `DX:`, `RF:`, `DISP:` nodes with `yes ->`/`no ->` branching.
2. **Normalizer** (`scripts/normalize-ir.ts`): Draft IR → normalized IR (`data/complaints/ir_normalized/`). Converts prose to token expressions, surfaces unresolved fragments.
3. **Emitter** (`scripts/emit-ir-to-csvs.ts`): Normalized IR → draft CSVs (`data/complaints/emitted/<cc_id>/`). Generates CORE_QUESTIONS, RED_FLAG_RULES, CLUSTER_SCORING_RULES, DISPOSITION_RULES, DX_PRIORITY drafts + manifest.json.
4. **Harmonizer** (`scripts/harmonize-compiler-output.ts`): Rewrites emitted draft tokens/actions to match existing engine vocabulary using `data/complaints/token_harmonizer.json`. Supports `--dry-run`. Writes `harmonize_summary.json`.
   - **Token Alias Suggester** (`scripts/suggest-token-aliases.ts`): Compares emitted tokens vs live vocabulary using string similarity heuristics. Outputs `token_alias_suggestions.csv/.json`.
   - **Alias Applier** (`scripts/apply-suggested-token-aliases.ts`): Promotes high-confidence suggestions into `token_harmonizer.json`. Supports `--dry-run`, `--force`, `--min-score`.
5. **Reviewer** (`scripts/review-emitted-drafts.ts`): Compares drafts against live CSVs (`data/complaints/review/<cc_id>/`). Outputs `*.new.csv`, `*.conflicts.csv`, `review_summary.json`. Safe diff — no merging.
   - **Conflict Learner** (`scripts/learn-token-aliases-from-conflicts.ts`): Learns token aliases from actual conflict file data. Evidence-based, requires repeated observations.
   - **Alias Promoter** (`scripts/promote-learned-aliases.ts`): Promotes learned aliases into `token_harmonizer.json` with support-count and confidence thresholds.
6. **Merger** (`scripts/merge-approved-drafts.ts`): Safely merges `*.new.csv` rows into live CSVs. Creates `_tx_backups/` before writing. Idempotent — skips duplicates. Supports `--dry-run`. WARNING: Do not merge into CC_IDs that have existing hand-crafted rules without careful review.

### Operational Intelligence & Self-Improving Loop
A suite of scripts provides engine visibility and automatic quality control:
- **Engine Coverage Audit** (`scripts/engine-coverage-audit.ts`): Scans dead rules, weak clusters, disposition dominance, unused red flags, missing question tokens. Outputs `data/complaints/reports/engine_coverage_audit.csv`, `dead_rules.csv`, `unused_red_flags.csv`, `missing_question_tokens.csv`.
- **Dead Cluster Classifier** (`scripts/classify-dead-clusters.ts`): Categorizes dead clusters as `UNDER_TESTED`, `NEVER_FIRES_IN_TESTS_BUT_FIRES_IN_PROD`, `LIKELY_OVERSPECIFIED`, `LIKELY_SHADOWED`, or `UNKNOWN`.
- **Rule Contradiction Detector** (`scripts/analyze-rule-contradictions.ts`): Finds obvious contradictions in WHEN/TRIGGER expressions (boolean conflicts, impossible numeric ranges).
- **Auto Test Generator** (`scripts/auto-generate-missing-tests.ts`): Generates draft golden tests for dead clusters by extracting synthetic inputs from WHEN_EXPR constraints.
- **Golden Test Exporter** (`scripts/export-missing-tests-to-golden-format.ts`): Converts generated tests into draft golden JSONL format.
- **Golden Test Validator** (`scripts/validate-generated-golden-tests.ts`): Validates generated test JSONL structure before promotion.
- **Test Status Backfiller** (`scripts/backfill-generated-test-status.ts`): Bulk-updates review_status (APPROVED/REJECTED/PENDING_REVIEW) by complaint or test ID.
- **Test Promoter** (`scripts/promote-approved-generated-tests.ts`): Filters to approved-only JSONL.
- **Test Appender** (`scripts/append-generated-tests-to-golden.ts`): Appends approved tests to a golden harness JSONL.
- **Harness Merger** (`scripts/merge-generated-tests-into-harness.ts`): Merges approved tests into harness with backup + idempotency + dry-run.
- **Complaint Folder Merger** (`scripts/merge-generated-tests-into-real-complaint-folders.ts`): Routes approved tests into complaint-specific `golden.generated.jsonl` files.
- **Harness Manifest Builder** (`scripts/build-harness-manifest.ts`): Scans complaint dirs, produces `harness_manifest.json` with test counts.
- **Runtime Audit Logger** (`server/services/engineRuntimeAuditLogger.ts`): Appends production engine execution data to `data/complaints/runtime/engine_runtime_audit.csv`. Wired into `runGenericComplaintV1`.
- **Runtime Coverage Converter** (`scripts/runtime-audit-to-coverage.ts`): Converts runtime audit logs into cluster/complaint coverage summaries.
- **Priority Refinement Report** (`scripts/priority-refinement-report.ts`): Flags DX candidate ranking instability (benign dominance, low score gaps, ties).
- **Phase Readiness Report** (`scripts/phase-readiness-report.ts`): One-shot check for all required scripts and artifacts.
- **Close-the-Loop Report** (`scripts/close-the-loop-report.ts`): Consolidated dashboard combining all audit/test/runtime data into one JSON+CSV report.

### Validation and Testing
The system includes various testing harnesses (Stress Test, Complaint Golden Test, Replay), a Data Corruption Guard, a Release Candidate system, Cross-Complaint Goldens, a Bundle ABI Validator, and an 8-gate Prod Pipeline for pre-deployment validation.

## External Dependencies

-   **AI Integration**: OpenAI API (via Replit AI Integrations).
-   **Messaging Integration**: Twilio for WhatsApp, Telegram Bot API for Telegram.
-   **Database**: Firebase Firestore.
-   **Data Configuration**: Google Sheets.
-   **Cloud Storage**: Firebase Storage.