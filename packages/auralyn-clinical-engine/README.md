# @auralyn/clinical-engine

> DB-free, framework-agnostic 13-step clinical triage pipeline engine.

Evaluates `kb_master_rules` against patient inputs and returns a fully-traced
`PipelineResult` — no database, no LLM, no framework dependency required.

---

## Installation

```bash
npm install @auralyn/clinical-engine
# or
pnpm add @auralyn/clinical-engine
```

---

## Quick start

```ts
import { executePipeline } from "@auralyn/clinical-engine";
import type { MasterRule, PipelineInputs } from "@auralyn/clinical-engine";

// 1. Supply your rules (load from DB, JSON, or test fixtures)
const rules: MasterRule[] = await loadRulesForComplaint("chest_pain");

// 2. Supply patient inputs (vitals + symptom answers)
const inputs: PipelineInputs = {
  O2_sat:               88,
  chest_pain_present:   true,
  diaphoresis:          true,
  pain_radiation_arm:   "yes",
  age:                  67,
};

// 3. Run the pipeline
const result = executePipeline("chest_pain", rules, inputs);

// 4. Inspect the outcome
if (result.hardStop) {
  console.log("ESCALATE:", result.hardStopReason);
  // e.g. "Hypoxia Red Flag: O2_sat < 90 → ER_NOW"
} else {
  console.log("Disposition:", result.finalDisposition);
  // e.g. "URGENT_CARE"
}

// 5. Walk the step trace
for (const step of result.steps) {
  console.log(`Step ${step.step} — ${step.name}: ${step.summary}`);
}
```

---

## The 13-step pipeline

| Step | Label | Rule type | Notes |
|------|-------|-----------|-------|
| 1 | Complaint Identification | — | Registers chief complaint; no rules fire |
| 2 | Differential Dx / Rule-Out Targets | `diagnosis` | Initial differential — which conditions to consider |
| 3 | Modifier Collection | `modifier` | Patient context (age, immunostatus, pregnancy, etc.) |
| 4 | Question Engine | `question` | Symptom-level questions (fever? cough? radiation?) |
| 5 | Workup Selection | `workup` | Labs and imaging to order |
| 6 | Medication Selection / Safety | `medication` | First-line options; allergy/safety filters |
| **7** | **Safety Screen — Red Flags** | **`red_flag`** | **Hard-stop decision diamond. ER_NOW/CALL_911 short-circuits the rest** |
| 8 | Cluster Scoring | `cluster_scoring` | Probabilistic scoring across diagnosis clusters |
| 9 | Diagnosis Ranking | `diagnosis` | Refined differential after evidence accumulation |
| 10 | Disposition + Plan | `disposition` | Final care pathway selection |
| 11 | Plan Generation | `plan` | Discharge instructions and follow-up |
| 13 | Audit Trail | — | Immutable summary of all fired rules and final state |

---

## Key types

```ts
// Patient inputs — any key/value map of vitals and symptom answers
interface PipelineInputs {
  [key: string]: string | number | boolean;
}

// A single master rule (27-column schema)
interface MasterRule {
  rule_id:               string;        // e.g. "RULE_0001"
  rule_name:             string;        // e.g. "Hypoxia Red Flag"
  rule_type:             RuleType;      // "red_flag" | "diagnosis" | ...
  priority:              number;        // lower = runs first
  complaint_id:          string | null; // "chest_pain" | "ALL" | null
  logic_type:            LogicType;     // "boolean" | "threshold" | "scoring" | ...
  logic_description:     string;        // human-readable rule text
  question_dependencies: string[];      // input keys that trigger this rule
  modifier_dependencies: string[];      // blocking or enabling modifiers
  input_fields:          string[];      // primary trigger fields
  outputs:               Record<string, any>; // state emitted when rule fires
  disposition_impact:    DispositionCode | null; // "ER_NOW" | "HOME_CARE" | ...
  safety_level:          SafetyLevel;   // "CRITICAL" | "HIGH" | "MODERATE" | "LOW"
  confidence_weight:     number;        // 0.0–1.0
  active:                boolean;
  // ... 12 more columns (see types.ts)
}

// Full pipeline result
interface PipelineResult {
  ok:               boolean;
  complaint_id:     string;
  inputs:           PipelineInputs;
  executedAt:       string;             // ISO timestamp
  hardStop:         boolean;            // true if ER_NOW/CALL_911 fired
  hardStopReason:   string | null;      // rule name + description
  finalDisposition: DispositionCode;    // "ER_NOW" | "URGENT_CARE" | "HOME_CARE" | ...
  steps:            StepResult[];       // per-step trace (12 entries + audit)
  totalRulesFired:  number;
  criticalFlagsHit: string[];           // rule_ids of CRITICAL rules that fired
}
```

---

## Logic types

| Type | Behaviour |
|------|-----------|
| `boolean` | Fires if any `question_dependency` is truthy. Unconditional if none listed. |
| `threshold` | Fires if a numeric field crosses the threshold in `logic_description` (e.g. `O2_sat < 90`). |
| `scoring` | Always fires to contribute to a cluster score; weighted by `confidence_weight`. |
| `mapping` | Fires unless a blocking `modifier_dependency` (prefixed `no_`) is present (allergy check). |
| `conditional` | Fires if at least one question dep AND one modifier dep are present in inputs. |

---

## Utilities

```ts
import {
  computeConfidence,
  extractTopDiagnoses,
  evaluateRule,
  PIPELINE_STEPS,
  HARD_STOP_CODES,
  DIAMOND_STEPS,
} from "@auralyn/clinical-engine";

// Weighted confidence score across all fired rules
const confidence = computeConfidence(result); // 0.0–1.0

// Top-N diagnosis candidates ranked by confidence weight
const topDx = extractTopDiagnoses(result, 3);

// Evaluate a single rule in isolation
const fires = evaluateRule(rule, { O2_sat: 88, chest_pain_present: true });

// Pipeline step metadata (step number, name, ruleType)
console.log(PIPELINE_STEPS);

// Set of disposition codes that trigger a hard stop
console.log(HARD_STOP_CODES); // Set { "ER_NOW", "ED_NOW", "CALL_911" }
```

---

## Building from source

```bash
cd packages/auralyn-clinical-engine
pnpm install
pnpm build         # tsc → dist/
pnpm typecheck     # type-check only, no output
```

---

## Rule schema reference

The engine reads from the `kb_master_rules` table (27 columns). See
`src/types.ts` for the full `MasterRule` interface. Key columns:

| Column | Type | Description |
|--------|------|-------------|
| `rule_id` | `TEXT PK` | Unique identifier (e.g. `RULE_0001`) |
| `rule_type` | enum | One of 9 types (see pipeline table above) |
| `priority` | `INT` | Execution order within a step (lower = first) |
| `complaint_id` | `TEXT` | Scoped to a complaint, or `ALL` for global rules |
| `logic_type` | enum | Evaluation strategy (boolean, threshold, …) |
| `logic_description` | `TEXT` | Human-readable rule condition |
| `safety_level` | enum | `CRITICAL` → `LOW` |
| `confidence_weight` | `NUMERIC` | 0.0–1.0; used in scoring and ranking |
| `disposition_impact` | enum | Final care pathway if this rule fires |
| `outputs` | `JSONB` | State emitted to downstream steps |

---

## License

UNLICENSED — proprietary to Auralyn Health. Not for redistribution.
