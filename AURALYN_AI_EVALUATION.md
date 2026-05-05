# Auralyn Clinical Triage Platform — AI Evaluation Brief

> This document is written for evaluation by a large language model (ChatGPT-4o, Claude 3.5+, or similar).
> It describes the system architecture, data model, clinical logic, API surface, and frontend components
> in enough detail for an AI to assess correctness, completeness, clinical soundness, and security posture.

---

## 1. What Auralyn is

Auralyn is a HIPAA-targeted, multi-tenant clinical triage SaaS built for NYC urgent care clinics.
Patients present symptoms via WhatsApp or a web intake form. A backend AI pipeline (no LLM in
the critical path) runs structured clinical rules against their answers and vitals, produces a
triage disposition, and queues the case for physician review. Physicians see a full trace of
every rule that fired, can override the disposition, and confirm or reject the AI's recommended
care pathway.

The system is **not** intended to replace clinical judgment. It is a decision-support layer —
every output is reviewable, auditable, and overridable by a licensed physician.

---

## 2. Core architecture

```
Patient (WhatsApp / web)
       │
       ▼
[Intake / NLP normalization]
       │
       ▼
[Clinical State Builder]  ←  kb_master_rules (PostgreSQL, 27 cols, ~1,400 rows)
       │
       ▼
[13-Step Rule Execution Pipeline]  ←  ruleExecutionEngine.ts
       │
       ├─ Step 7 red_flag → hardStop? ──YES──► ER_NOW / CALL_911 disposition
       │                                        (short-circuits remaining steps)
       │
       ▼
[Disposition + Plan]
       │
       ▼
[Audit Trail]  ←  immutable hash chain, HMAC-SHA
       │
       ▼
[Physician Review Dashboard]
```

---

## 3. The 13-step clinical pipeline (canonical order)

Evaluated by `server/clinical/ruleExecutionEngine.ts` and exported as a standalone
npm package (`@auralyn/clinical-engine`).

| Step | Name | Rule type | Clinical role |
|------|------|-----------|---------------|
| 1 | Complaint Identification | — | Register chief complaint; no rules |
| 2 | Differential Dx / Rule-Out Targets | `diagnosis` | Establish candidate diagnoses |
| 3 | Modifier Collection | `modifier` | Patient context (age, immune status, pregnancy) |
| 4 | Question Engine | `question` | Symptom details (fever, radiation, duration) |
| 5 | Workup Selection | `workup` | Labs and imaging to order |
| 6 | Medication Selection / Safety | `medication` | First-line Rx; allergy safety filters |
| **7** | **Safety Screen — Red Flags** | **`red_flag`** | **Hard-stop decision node. ER_NOW → short-circuit** |
| 8 | Cluster Scoring | `cluster_scoring` | Probabilistic scoring across diagnosis clusters |
| 9 | Diagnosis Ranking | `diagnosis` | Refined differential post-evidence |
| 10 | Disposition + Plan | `disposition` | Final care pathway |
| 11 | Plan Generation | `plan` | Discharge instructions, follow-up timing |
| 13 | Audit Trail | — | Immutable per-case trace |

**Evaluator questions to ask:**
- Is Step 7 (red flag safety screen) correctly placed AFTER medication selection but BEFORE scoring?
- Do hard-stop codes (`ER_NOW`, `ED_NOW`, `CALL_911`) correctly short-circuit Steps 8–11?
- Is the audit trail (Step 13) always written, even on hard stop?

---

## 4. The 27-column rule schema (`kb_master_rules`)

```sql
CREATE TABLE kb_master_rules (
  rule_id                TEXT PRIMARY KEY,
  rule_name              TEXT NOT NULL,
  rule_type              TEXT NOT NULL,          -- see §3 for valid types
  priority               INT  NOT NULL DEFAULT 5,
  complaint_id           TEXT,                   -- NULL = global; 'ALL' = all complaints
  cluster_id             TEXT,
  diagnosis_id           TEXT,
  modifier_dependencies  TEXT[],
  question_dependencies  TEXT[],
  red_flag_dependencies  TEXT[],
  input_fields           TEXT[],
  logic_description      TEXT,
  logic_type             TEXT NOT NULL DEFAULT 'boolean',
  source_tab             TEXT,
  target_tabs            TEXT[],
  outputs                JSONB,
  disposition_impact     TEXT,                   -- DispositionCode enum
  medication_impact      TEXT,
  workup_impact          TEXT,
  safety_level           TEXT NOT NULL DEFAULT 'LOW',
  override_rules         TEXT[],
  confidence_weight      NUMERIC(4,3) DEFAULT 0.5,
  active                 BOOLEAN NOT NULL DEFAULT TRUE,
  version                TEXT DEFAULT '1.0',
  last_updated           TIMESTAMPTZ DEFAULT NOW(),
  owner                  TEXT DEFAULT 'system',
  notes                  TEXT
);
```

**Current state:** ~1,400 active rules across 247 complaints.
Safety level distribution: CRITICAL ~8%, HIGH ~22%, MODERATE ~41%, LOW ~29%.

---

## 5. Rule logic types

| Type | Evaluation behaviour |
|------|---------------------|
| `boolean` | Fires if any `question_dependency` is truthy. Unconditional if none listed. |
| `threshold` | Parses `logic_description` for `field < N` / `field > N` patterns; fires if numeric input crosses it. |
| `scoring` | Always fires; weighted by `confidence_weight` for cluster score accumulation. |
| `mapping` | Fires unless a `no_`-prefixed `modifier_dependency` (allergy/contraindication) is present. |
| `conditional` | Fires if at least one question dep AND one modifier dep are present in inputs. |

**Evaluator questions:**
- Is `threshold` logic robust enough? Does it handle `>=`, `<=` and field names with underscores?
- Does `mapping` correctly handle allergy keys prefixed with both `no_` and `allergy_`?
- Is there a risk of rules with no `question_dependencies` being `boolean` type and firing unconditionally?

---

## 6. Disposition codes (ordered by severity)

```
CALL_911      → Immediate 911 call — life threat
ER_NOW        → Emergency room immediately
ED_NOW        → Emergency department now
URGENT_CARE   → Urgent care within 2–4 hours
ADMIT         → Hospital admission
TELEMEDICINE  → Virtual visit
FOLLOW_UP_48H → In-person follow-up within 48 hours
FOLLOW_UP_72H → In-person follow-up within 72 hours
HOME_CARE     → Self-care / symptomatic treatment
```

Hard-stop codes: `CALL_911`, `ER_NOW`, `ED_NOW`.
Any red_flag rule with one of these as `disposition_impact` triggers `hardStop = true` and
short-circuits the pipeline.

---

## 7. API surface

All routes are under `/api/master-rules/*`. Authentication via:
- Physicians: `Authorization: Bearer <firebase-jwt>` with `requireRole` middleware
- Review endpoints: `x-review-token` header (HMAC-signed session)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/master-rules` | List rules (filter: `rule_type`, `complaint_id`, `safety_level`, `active`; paginated) |
| GET | `/api/master-rules/stats` | Aggregate counts by type and safety level |
| GET | `/api/master-rules/complaints` | All distinct complaint IDs with per-complaint rule counts |
| GET | `/api/master-rules/pipeline/:complaint_id` | Rules for a complaint ordered by 13-step execution |
| GET | `/api/master-rules/flowchart/:complaint_id` | GPT-4o-generated clinical decision tree (cached in `kb_clinical_flowcharts`) |
| GET | `/api/master-rules/:rule_id` | Single rule (all 27 fields) |
| POST | `/api/master-rules` | Create rule |
| PATCH | `/api/master-rules/:rule_id` | Update rule fields |
| POST | `/api/master-rules/dry-run` | Simulate pipeline execution (`{complaint_id, inputs}`) |
| POST | `/api/master-rules/export-to-sheets` | Write all active rules to Google Sheets MASTER_RULE_MAP tab |

**Route order note:** `/pipeline/:complaint_id` and `/flowchart/:complaint_id` must be registered
BEFORE `/:rule_id` to prevent route capture by the generic single-rule handler.

---

## 8. AI-generated clinical decision tree

Endpoint: `GET /api/master-rules/flowchart/:complaint_id`

**Process:**
1. Fetch all active rules for the complaint from `kb_master_rules`
2. Call GPT-4o with a structured prompt instructing it to follow the 13-step pipeline order
3. GPT-4o returns a JSON flowchart (12–18 nodes, typed as `start / decision / process / action / terminal`)
4. Result is cached in `kb_clinical_flowcharts` table (PostgreSQL JSONB)
5. Subsequent requests serve from cache; `?refresh=true` forces regeneration

**Node type schema:**
```ts
interface FlowNode {
  id:       string;               // e.g. "n1"
  type:     "start" | "decision" | "process" | "action" | "terminal";
  label:    string;               // display text
  detail?:  string[];             // bullet points for process/action nodes
  next_id?: string;               // sequential flow
  yes_id?:  string;               // decision: positive branch
  no_id?:   string;               // decision: negative branch
}
```

**The AI prompt instructs GPT-4o to:**
- Follow the exact 13-step order (Complaint → Differential → Modifiers → Questions → Workup → Medications → Safety Screen → Scoring → Dx Ranking → Disposition → Audit)
- Place the Safety Screen (Step 6 in clinical labeling) as a `decision` node with `yes_id → ER escalation terminal` and `no_id → continues pipeline`
- Produce 12–18 nodes total
- Base all content on the actual rules provided (no hallucination of new treatments)

**Evaluator questions:**
- Does the AI prompt sufficiently constrain hallucination of medications or diagnoses not in the KB?
- Is caching invalidation handled correctly when rules are updated?
- Are there prompt injection risks if `complaint_id` is user-supplied?

---

## 9. Frontend dashboard — Master Rule Map

Located at `client/src/pages/MasterRuleMapPage.tsx`. 10 tabs:

| Tab | Component | Description |
|-----|-----------|-------------|
| Rule Catalog | `RulesTab` | Paginated 27-field table with filter bar and detail panel |
| Golden Cases | `GoldenCasesTab` | Expected-vs-actual validation cases |
| Pipeline Simulator | `PipelineTab` | Enter complaint + JSON inputs → 13-step trace |
| Coverage Overview | `OverviewTab` | Stats grid: rules per type, complaint coverage |
| System Coverage | `SystemCoverageTab` | Per-clinical-system coverage heatmap |
| Pipeline Flowchart | `PipelineFlowchart` | Linear 13-step flowchart with rule counts per step |
| **Clinical Decision Tree** | `ClinicalDecisionTree` | **Searchable complaint picklist → AI-generated SVG flowchart** |
| Drill-down | `DrillDownTab` | Per-complaint rule breakdown |
| Gaps | `GapsTab` | Complaints with missing rule types |
| Tools & RLHF | `ValidatorTab` | Manual rule validation and feedback loop |

---

## 10. Clinical Decision Tree component

`client/src/components/ClinicalDecisionTree.tsx`

**Layout:** Two-panel — complaint picklist (left) + SVG flowchart (right).

**Picklist features:**
- Fetches all complaints from `/api/master-rules/complaints`
- Search filter (client-side, instant)
- Groups by clinical system (ENT, GI, Pulmonology, Neurology, …)
- Shows rule count and CRITICAL rule count per complaint
- Selecting a complaint immediately triggers tree generation (no separate button)
- Cached trees load instantly; fresh generation takes ~5–10 seconds

**SVG renderer:**
- Recursive layout algorithm: `subtreeWidth()` + `buildLayout()` calculate x/y positions
- Diamond nodes for `decision` type (rotated square CSS transform)
- Rectangular nodes for `process`, `action`
- Pill-shaped terminals
- Elbow-path arrows with Yes/No labels on decision branches
- Horizontally scrollable SVG viewport

---

## 11. npm package — `@auralyn/clinical-engine`

Located at `packages/auralyn-clinical-engine/`.

**Exports:**
```ts
// Core execution
executePipeline(complaintId, rules, inputs) → PipelineResult

// Single rule evaluation
evaluateRule(rule, inputs) → boolean

// Utilities
computeConfidence(result) → number          // 0.0–1.0 weighted score
extractTopDiagnoses(result, n) → string[]   // top-N dx by confidence

// Constants
PIPELINE_STEPS   // canonical 13-step array
HARD_STOP_CODES  // Set { "ER_NOW", "ED_NOW", "CALL_911" }
DIAMOND_STEPS    // Set { 7 }

// All TypeScript types
MasterRule, PipelineInputs, PipelineResult, StepResult, FiredRule,
FlowNode, Flowchart, RuleType, SafetyLevel, LogicType, DispositionCode
```

**Key design decision:** The package has **zero runtime dependencies** and no database coupling.
Rules are passed as a plain `MasterRule[]` array, making the engine testable in isolation,
runnable in a browser, and importable in any Node.js/Deno/Bun context.

---

## 12. Security and compliance posture

| Control | Implementation |
|---------|----------------|
| Authentication | Firebase JWT (physicians), HMAC-signed session token (review endpoints) |
| Authorization | `requireRole` middleware checks `admin` / `physician` / `patient` roles |
| PHI handling | `PhiSanitizer` strips identifiers before logging; AES-256-GCM encryption at rest |
| Audit logging | Immutable HMAC-SHA hash chain; every rule fire and physician override is recorded |
| Rate limiting | Express rate limiter on all intake and auth endpoints |
| Input validation | Zod schemas on all POST/PATCH request bodies |
| HIPAA | PHI retention policy enforced in Firestore rules; no PHI in server logs |
| SQL injection | Drizzle ORM parameterized queries throughout; no raw string interpolation in SQL |

---

## 13. Known limitations and open questions (for evaluator)

1. **Rule completeness:** The 247-complaint, ~1,400-rule KB was seeded from existing clinical
   knowledge tables. Coverage gaps exist for rare presentations. The Gaps tab surfaces these.

2. **Threshold parsing:** `evaluateRule` in the engine parses thresholds by regex-matching
   `logic_description` text. This works for simple patterns (`O2_sat < 90`) but will miss
   compound conditions (`O2_sat < 90 AND RR > 20`). Multi-condition thresholds require a
   proper expression evaluator.

3. **Scoring calibration:** `cluster_scoring` rules contribute to a score but the current
   engine does not normalize or calibrate scores across complaint types. Confidence weights
   are set manually by rule authors.

4. **LLM guardrails:** The flowchart generator instructs GPT-4o to only use rules provided,
   but there is no post-generation validation step that checks the returned node labels
   against the actual KB. A hallucination filter would strengthen this.

5. **Cache invalidation:** `kb_clinical_flowcharts` is not automatically invalidated when
   underlying rules change. A rule update should mark the complaint's cached flowchart stale.

6. **Hard-stop after medication:** The red flag screen (Step 7) fires AFTER medication
   selection (Step 6). This means a medication could be recommended and then immediately
   overridden by an ER escalation. This is clinically correct (flag checks are last-line
   safety nets) but could confuse patients if they see both outputs simultaneously.

---

## 14. Evaluation checklist

Use this checklist to structure your evaluation:

### Clinical correctness
- [ ] Is the 13-step pipeline order clinically defensible?
- [ ] Does the hard-stop logic correctly prevent non-critical rules from running after ER_NOW?
- [ ] Are disposition codes ordered correctly by severity?
- [ ] Does the AI decision tree generator produce paths that match the KB rules?

### Technical correctness
- [ ] Does `evaluateRule` handle all 5 logic types without false positives?
- [ ] Is the `threshold` parser robust to field names with numbers and underscores?
- [ ] Does `executePipeline` correctly pass accumulated `allOutputs` to downstream steps?
- [ ] Does the pipeline correctly re-run `diagnosis` rules at both Step 2 and Step 9?

### API correctness
- [ ] Are all 10 API endpoints returning correct HTTP status codes?
- [ ] Is the `/pipeline/:complaint_id` route registered before `/:rule_id`?
- [ ] Does `/flowchart/:complaint_id` correctly serve from cache on repeat calls?

### Security
- [ ] Is `complaint_id` in the flowchart URL sanitized before use in the GPT-4o prompt?
- [ ] Are all mutation endpoints (POST/PATCH) protected by `requireRole`?
- [ ] Is PHI excluded from server logs?

### Frontend
- [ ] Does the complaint picklist load all 247 complaints without timeout?
- [ ] Is the SVG layout algorithm cycle-safe (visited set prevents infinite loops)?
- [ ] Does the `ClinicalDecisionTree` component handle the empty state (no complaint selected)?
- [ ] Does the Pipeline Simulator correctly display hard-stop steps with a red indicator?

---

*Document version: 2026-05-05. Reflects codebase commit aa0cd84.*
