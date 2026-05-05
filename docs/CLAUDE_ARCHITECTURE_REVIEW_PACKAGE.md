# Auralyn — Clinical Pipeline Architecture Review Package
**For: Claude Architecture & Code Review**
**Date: May 2026**
**Context: HIPAA/FDA-adjacent multi-tenant medical triage SaaS (NYC urgent care, physician-facing)**

---

## 1. What We Need From This Review

We are asking Claude to review the medical reasoning pipeline architecture and give us concrete, prioritized recommendations on:

1. **Clinical safety gaps** — are there patterns in this pipeline design that could produce incorrect triage decisions or miss critical escalation signals?
2. **Expression matching correctness** — the current `exprMatches` / `rowMatchesInput` functions use lightweight token-matching against Google Sheet row values. Is this sufficient or dangerous for clinical rule evaluation?
3. **Architecture coherence** — we have TWO separate pipeline engines (World B sheet-based + `ruleExecutionEngine` DB-based) that disagree on step order and some semantics. How should we reconcile them?
4. **Type safety and `as unknown as` casts** — there are several `as unknown as SheetRow[]` casts in the codebase. Are these a correctness risk in production?
5. **HIPAA / audit trail completeness** — Step 13 is currently a stub note, not a real write. What must change before this system handles real patient encounters?
6. **Performance** — `loadComplaintConfig` fetches 18 Google Sheet tables per request (with 60s cache). What are the risks?
7. **Specific missing steps** — Steps 10–12 (Medication Group Selection, Medication Safety Filters, Plan Generation) exist in `ruleExecutionEngine.ts` but are absent from the World B pipeline. Is that intentional or a gap?

---

## 2. System Overview

**Auralyn** is a physician-facing clinical knowledge base and decision-support system for NYC urgent care. It is NOT a consumer app — physicians interact with it to get structured clinical reasoning for chief complaints (e.g. chest pain, sore throat, shortness of breath).

**Key constraints:**
- HIPAA-adjacent (no real PHI stored yet, but the audit trail is being built for that transition)
- FDA clinical decision support rules apply (must be explainable, not black-box AI)
- Physician override always wins
- AI may summarize but must NOT approve care, downgrade deterministic critical-risk findings, or invent rules

**Data architecture:**
- **Google Sheets ("World B")** — the live knowledge base. Physicians edit rows in named tabs. The system reads these via a Google Sheets API connector, with CSV fallback files for CI/testing.
- **PostgreSQL (`kb_master_rules` table)** — a 27-column structured rule table seeded from KB data, used by `ruleExecutionEngine.ts` for dry-run simulation.
- The two layers are intentionally separate: Sheets = live clinical knowledge, DB = audit-able rule snapshot for governance.

---

## 3. The World B Pipeline Step Order

This is the canonical clinical reasoning sequence. The order matters clinically.

```
Step 1  — Complaint Identification       COMPLAINT_REGISTRY
Step 2  — Differential Diagnosis         CLUSTER_PRIMARY_DIAGNOSIS, GLOBAL_CLUSTER_MASTER, SCORING_DEFS, DX_CANDIDATES
Step 3A — Modifier Collection            MODIFIERS, GLOBAL_MODIFIERS, GLOBAL_MODIFIERS_CLEAN, CARDS_MODIFIER_MASTER
Step 3B — Question Engine                CORE_QUESTIONS, GLOBAL_SECONDARY
Step 4  — Workup Selection               URGENT_CARE_SPOT_INTERVENTIONS
Step 5  — Medication Selection/Safety    GLOBAL_MEDICATIONS_MASTER, MED_CONDITION_INTELLIGENCE_RULES
Step 6  — Safety Screen (Red Flags)      RED_FLAG_RULES, RED_FLAGS_MASTER
Step 7  — Cluster Scoring               CLUSTER_SCORING_RULES, SCORING_SYSTEMS, SCORING_DEFS
Step 8  — Diagnosis Ranking             CLUSTER_PRIMARY_DIAGNOSIS, GLOBAL_CLUSTER_MASTER, DX_CANDIDATES
Step 9  — Disposition + Plan            DISPOSITION_RULES, OUTPUT_TEMPLATES
Step 13 — Audit Trail                   audit_logs (stub)
```

**Key clinical design decisions:**
- Differential (Step 2) comes BEFORE questions (Step 3B) so the question engine knows what it's ruling out
- Modifiers (Step 3A) come BEFORE questions so pregnancy, allergies, anticoagulants etc. shape which questions fire
- Red flags (Step 6) come after workup/medication — but a HARD red flag still forces escalation at Step 9 (safety dominance)
- Disposition and plan are merged — the plan text is not free-floating; it is bound to a specific disposition rule

---

## 4. Full Source: `server/data/registry.ts`

The table registry — controls which tabs are loaded from Google Sheets vs CSV fallback, and their TTLs.

```typescript
import { getSheetRows } from "../sheets/sheetHelper";
import { loadCsvTable } from "./csvLoader";

type SheetRow = Record<string, any>;

interface CacheEntry {
  expiresAt: number;
  rows: SheetRow[];
}

const TABLE_CACHE = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

const TABLE_CONFIG: Record<string, { tab: string; range?: string; ttlMs?: number }> = {
  CHIEF_COMPLAINT_ROUTER: { tab: "CHIEF_COMPLAINT_ROUTER" },
  INTEGRATION_MAP: { tab: "INTEGRATION_MAP" },
  MODIFIERS: { tab: "MODIFIERS", range: "A1:Z5000", ttlMs: 60_000 },
  GLOBAL_MODIFIERS: { tab: "GLOBAL_MODIFIERS", range: "A1:Z5000", ttlMs: 60_000 },
  GLOBAL_SECONDARY: { tab: "GLOBAL_SECONDARY", range: "A1:Z5000" },
  CARDS_MODIFIER_MASTER: { tab: "CARDS_MODIFIER_MASTER", range: "A1:Z5000" },
  RULESTRIGGERS: { tab: "RULESTRIGGERS", range: "A1:Z5000" },
  GLOBAL_CLUSTER_MASTER: { tab: "GLOBAL_CLUSTER_MASTER", range: "A1:Z5000" },
  GLOBAL_MEDICATIONS_MASTER: { tab: "GLOBAL_MEDICATIONS_MASTER", range: "A1:Z5000" },
  CLUSTER_PRIMARY_DIAGNOSIS: { tab: "CLUSTER_PRIMARY_DIAGNOSIS", range: "A1:Z2000" },
  MED_CONDITION_INTELLIGENCE_RULES: { tab: "MED_CONDITION_INTELLIGENCE_RULES", range: "A1:Z5000" },
  URGENT_CARE_SPOT_INTERVENTIONS: { tab: "URGENT_CARE_SPOT_INTERVENTIONS", range: "A1:Z2000" },
  RED_FLAGS_MASTER: { tab: "RED_FLAGS_MASTER", range: "A1:Z2000" },
  GLOBAL_MODIFIERS_CLEAN: { tab: "GLOBAL_MODIFIERS_CLEAN", range: "A1:Z5000" },
  COMPLAINT_REGISTRY: { tab: "COMPLAINT_REGISTRY", range: "A1:Z500", ttlMs: 60_000 },
  CORE_QUESTIONS: { tab: "CORE_QUESTIONS", range: "A1:Z5000", ttlMs: 60_000 },
  RED_FLAG_RULES: { tab: "RED_FLAG_RULES", range: "A1:Z2000", ttlMs: 60_000 },
  SCORING_DEFS: { tab: "SCORING_DEFS", range: "A1:Z500", ttlMs: 60_000 },
  DISPOSITION_RULES: { tab: "DISPOSITION_RULES", range: "A1:Z2000", ttlMs: 60_000 },
  OUTPUT_TEMPLATES: { tab: "OUTPUT_TEMPLATES", range: "A1:Z2000", ttlMs: 60_000 },
  CLUSTER_SCORING_RULES: { tab: "CLUSTER_SCORING_RULES", range: "A1:Z5000", ttlMs: 60_000 },
  SCORING_SYSTEMS: { tab: "SCORING_SYSTEMS", range: "A1:Z2000", ttlMs: 60_000 },
};

// CSV_ENABLED_TABLES — prefer local CSV files over live Sheets (CI safety, offline dev)
const CSV_ENABLED_TABLES = new Set([
  "MODIFIERS", "GLOBAL_MODIFIERS", "GLOBAL_MODIFIERS_CLEAN", "CARDS_MODIFIER_MASTER",
  "GLOBAL_SECONDARY", "GLOBAL_CLUSTER_MASTER", "CLUSTER_PRIMARY_DIAGNOSIS",
  "GLOBAL_MEDICATIONS_MASTER", "MED_CONDITION_INTELLIGENCE_RULES",
  "URGENT_CARE_SPOT_INTERVENTIONS", "RED_FLAGS_MASTER",
  "COMPLAINT_REGISTRY", "CORE_QUESTIONS", "RED_FLAG_RULES",
  "SCORING_DEFS", "DISPOSITION_RULES", "OUTPUT_TEMPLATES",
  "CLUSTER_SCORING_RULES", "SCORING_SYSTEMS",
]);

export async function getTable(tableName: string): Promise<SheetRow[]> {
  const now = Date.now();
  const cached = TABLE_CACHE.get(tableName);
  if (cached && cached.expiresAt > now) return cached.rows;

  const config = TABLE_CONFIG[tableName];
  const tab = config?.tab ?? tableName;
  const range = config?.range ?? "A1:Z2000";
  const ttl = config?.ttlMs ?? DEFAULT_TTL_MS;

  // CSV-first: prefer local files (for CI/offline/performance)
  if (CSV_ENABLED_TABLES.has(tableName)) {
    const csvRows = loadCsvTable(tableName);
    if (csvRows && csvRows.length > 0) {
      TABLE_CACHE.set(tableName, { expiresAt: now + ttl, rows: csvRows });
      return csvRows;
    }
  }

  if (process.env.HARNESS_MODE === "1") return [];

  try {
    const { rowsAsObjects } = await getSheetRows(tab, range);
    TABLE_CACHE.set(tableName, { expiresAt: now + ttl, rows: rowsAsObjects });
    return rowsAsObjects;
  } catch (err: any) {
    console.error(`[Registry] Failed to load table ${tableName}: ${err.message}`);
    if (cached) return cached.rows; // stale-cache fallback
    return [];
  }
}
```

---

## 5. Full Source: `server/services/complaintConfigLoader.ts` (key parts)

The core config loader — reads 18 sheet tables, normalizes them into typed interfaces, validates the bundle, caches for 60s.

### Type interfaces

```typescript
export type SheetRow = Record<string, any>;

export interface ComplaintRegistryEntry {
  ccId: string;           // normalized complaint ID (e.g. "chest_pain")
  system: string;         // specialty domain (e.g. "CARDS", "ENT")
  label: string;          // human label
  version: number;
  coreQuestionsVersion: number;
  redFlagSetId: string;
  scoringId: string;
  dispositionSetId: string;
  outputTemplateSetId: string;
  defaultCluster: string;
  scoringModule: string;
  graphId: string;
  enabled: boolean;
  engineType: "LEGACY" | "GENERIC_V1";
  aliases: string[];       // synonym complaint IDs that resolve to this entry
}

export interface CoreQuestion {
  ccId: string; qId: string; askOrder: number;
  questionText: string; answerType: string; required: boolean;
  askIf: string;   // expression: "true", "fever=yes", "O2_sat<94"
  category: string;
}

export interface RedFlagRule {
  ccId: string; rfId: string; label: string;
  triggerExpr: string;        // expression evaluated against symptom tokens
  severity: "HARD" | "SOFT"; // HARD = force escalation, SOFT = warn
  action: string;
  immediateActions: string;
  rationale: string;
}

export interface DispositionRule {
  ccId: string; dispRuleId: string; priority: number;
  whenExpr: string;          // expression: "true", "cluster_acs=high"
  dispositionLevel: string;  // "routine", "urgent", "er_send"
  rationaleTemplateId: string;
  confidenceHint: string;
}

export interface ClusterScoringRule {
  ccId: string; clusterId: string; ruleId: string;
  points: number;
  whenExpr: string;
  evidenceLabel: string;
}

export interface DxCandidateRow {
  CC_ID: string; DX_ID: string; DX_LABEL: string;
  BEST_CLUSTER_ID: string;
  BASE_POINTS: number; CLUSTER_PRIORITY: number; BASE_SCORE: number; RANK: number;
}

export interface ComplaintConfig {
  // Typed/validated layers
  registry: ComplaintRegistryEntry;
  coreQuestions: CoreQuestion[];
  redFlagRules: RedFlagRule[];
  scoringDefs: ScoringDef[];
  dispositionRules: DispositionRule[];
  outputTemplates: OutputTemplate[];
  clusterScoringRules: ClusterScoringRule[];
  dxCandidates: DxCandidateRow[];

  // World B raw sheet rows (polymorphic — key varies per sheet)
  modifiers: WorldBRow[];
  scoringSystems: WorldBRow[];
  globalSecondary: WorldBRow[];
  globalClusterMaster: WorldBRow[];
  clusterPrimaryDiagnosis: WorldBRow[];
  redFlagsMaster: WorldBRow[];
  globalMedicationsMaster: WorldBRow[];
  urgentCareSpotInterventions: WorldBRow[];
  medConditionIntelligenceRules: WorldBRow[];
}
```

### Row-to-type normalizers (example: red flag)

```typescript
function firstPresent(row: SheetRow, keys: string[]): any {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  return undefined;
}

function rowToRedFlagRule(row: SheetRow): RedFlagRule | null {
  const ccId = normalizeKey(firstPresent(row, ["CC_ID", "COMPLAINT_ID", "complaint_id", "ccId"]));
  const rfId = norm(firstPresent(row, ["RF_ID", "RULE_ID", "RED_FLAG_ID"]));
  if (!ccId || !rfId) return null;
  return {
    ccId, rfId,
    label: norm(firstPresent(row, ["LABEL", "DESCRIPTION", "RED_FLAG_LABEL"])),
    triggerExpr: norm(firstPresent(row, ["TRIGGER_EXPR", "WHEN_EXPR", "CONDITION", "RULE_EXPR"])),
    severity: norm(firstPresent(row, ["SEVERITY", "RISK_LEVEL"])).toUpperCase() === "HARD" ? "HARD" : "SOFT",
    action: norm(firstPresent(row, ["ACTION", "IMMEDIATE_ACTION", "GATE_RESULT"])),
    immediateActions: norm(firstPresent(row, ["IMMEDIATE_ACTIONS", "IMMEDIATE_ACTION", "ACTIONS"])),
    rationale: norm(firstPresent(row, ["RATIONALE", "REASON", "CLINICAL_RATIONALE"])),
  };
}
```

### Bundle validation

```typescript
export function validateComplaintBundle(cfg: ComplaintConfig): BundleIssue[] {
  const issues: BundleIssue[] = [];

  if (!cfg.registry?.ccId) issues.push({ level: "ERROR", code: "CC_ID_MISSING", message: "Registry ccId missing." });
  if (!cfg.registry?.engineType) issues.push({ level: "ERROR", code: "ENGINE_TYPE_MISSING", message: "..." });
  if (!cfg.coreQuestions?.length) issues.push({ level: "ERROR", code: "QUESTIONS_MISSING", message: "No questions defined." });
  if (!cfg.outputTemplates?.length) issues.push({ level: "ERROR", code: "TEMPLATES_MISSING", message: "No output templates defined." });
  if (!cfg.dispositionRules?.length) {
    issues.push({ level: "ERROR", code: "DISP_RULES_MISSING", message: "No disposition rules defined." });
  } else {
    const defaults = cfg.dispositionRules.filter(r => isTruthyExpr(r.whenExpr));
    if (defaults.length === 0) issues.push({ level: "WARN", code: "DISP_NO_DEFAULT", message: "No default catch-all disposition rule." });
    if (defaults.length > 1) issues.push({ level: "WARN", code: "DISP_MULTIPLE_DEFAULTS", message: `Multiple defaults (${defaults.length}).` });
    const hasEscalation = cfg.dispositionRules.some(r => {
      const l = r.dispositionLevel.toUpperCase();
      return l.includes("ER") || l.includes("EMERG") || l === "ER_SEND";
    });
    if (!hasEscalation) issues.push({ level: "WARN", code: "DISP_NO_ESCALATION", message: "No escalation disposition rule found." });
  }

  if (cfg.registry.engineType === "GENERIC_V1") {
    if (!cfg.clusterScoringRules?.length)
      issues.push({ level: "ERROR", code: "CSR_MISSING", message: "No cluster scoring rules for GENERIC_V1 engine." });
    if (!cfg.redFlagRules?.length)
      issues.push({ level: "WARN", code: "RF_RULES_MISSING", message: "No red flag rules defined for GENERIC_V1." });
  }

  return issues;
}
```

### loadComplaintConfig — the main loader (summary)

```typescript
export async function loadComplaintConfig(
  ccId: string,
  options: LoadComplaintConfigOptions = {}   // { strict?: boolean }
): Promise<ComplaintConfig | null> {
  // 1. Check 60s in-memory cache
  // 2. Fetch COMPLAINT_REGISTRY, find entry by ccId or alias
  // 3. Fetch all 18 tables in Promise.all()
  // 4. Run corruption guards (assertCoreQuestionsNotCorrupt, etc.)
  // 5. If load fails and stale cache exists → return stale (fail-open)
  // 6. Normalize each table into typed arrays using row-to-type functions
  // 7. Filter to this complaint's ccId (or global rows where appropriate)
  // 8. Run validateComplaintBundle()
  // 9. If strict=true (default): throw on ERROR-level issues
  //    If strict=false (pipeline viz): warn and continue
  // 10. Cache result for 60s, return ComplaintConfig
}
```

---

## 6. Full Source: `server/routes/clinicalPipelineRoutes.ts`

The World B pipeline API — all three endpoints.

### Expression matching (the core clinical logic)

```typescript
function normalizeFeature(value: any): string {
  return String(value ?? "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function exprMatches(expr: string | undefined, tokens: Set<string>): boolean {
  const raw = String(expr ?? "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  // Always-fire expressions
  if (["true", "1", "always", "default"].includes(lower)) return true;

  // Tokenize the expression, filter stopwords, check if ANY candidate token is in input
  const candidates = raw
    .split(/[^a-zA-Z0-9_]+/)
    .map(normalizeFeature)
    .filter(t => t && !["and", "or", "not", "if", "then", "true", "false", "yes", "no"].includes(t));

  return candidates.some(candidate => tokens.has(candidate));
}

function rowMatchesInput(row: SheetRow, tokens: Set<string>): boolean {
  // First try structured expression field
  const expr = getAny(row, ["WHEN_EXPR", "TRIGGER_EXPR", "ASK_IF", "INDICATIONS_CLUSTER", "CONDITION", "CONDITION_ID"]);
  if (exprMatches(expr, tokens)) return true;

  // Fallback: does ANY token in user input appear ANYWHERE in the row's values?
  const searchable = Object.entries(row)
    .filter(([key]) => !key.startsWith("__"))
    .map(([, value]) => String(value ?? "")).join(" ");
  const rowTokens = new Set(searchable.split(/[^a-zA-Z0-9_]+/).map(normalizeFeature).filter(Boolean));
  return Array.from(tokens).some(token => rowTokens.has(token));
}
```

### Red flag escalation logic

```typescript
const redFlagForcesEscalation = triggeredRedFlags.some(row => {
  const severity = getAny(row, ["SEVERITY", "severity"]).toUpperCase();
  const action = getAny(row, ["ACTION", "action", "IMMEDIATE_ACTIONS", "immediateActions"]).toUpperCase();
  return severity === "HARD"
    || action.includes("ER")
    || action.includes("ESCALATE")
    || action.includes("911");
});
```

### Cluster scoring

```typescript
const scoredClusters = new Map<string, { clusterId: string; score: number; evidence: any[] }>();
for (const row of cfg.clusterScoringRules) {
  if (!exprMatches(row.whenExpr, tokens) && !rowMatchesInput(row as unknown as SheetRow, tokens)) continue;
  const current = scoredClusters.get(row.clusterId) ?? { clusterId: row.clusterId, score: 0, evidence: [] };
  current.score += row.points;
  current.evidence.push({ ruleId: row.ruleId, points: row.points, evidenceLabel: row.evidenceLabel });
  scoredClusters.set(row.clusterId, current);
}
```

### Disposition selection (first match wins by priority)

```typescript
const dispositionRule = cfg.dispositionRules.find(row => exprMatches(row.whenExpr, tokens))
  ?? cfg.dispositionRules.find(row => ["true", "always", "default"].includes(row.whenExpr.toLowerCase()))
  ?? cfg.dispositionRules[0]   // last resort: take first by priority sort
  ?? null;

const finalDisposition = redFlagForcesEscalation
  ? "ESCALATE_IMMEDIATELY"
  : dispositionRule?.dispositionLevel ?? "routine";
```

---

## 7. Full Source: `server/clinical/ruleExecutionEngine.ts`

The second engine — DB-backed, reads from `kb_master_rules` table. Used by the Master Rule Map dashboard for dry-run simulation.

### Step order (note: DIFFERENT from World B order above)

```typescript
const PIPELINE_STEPS = [
  { step: 1,  name: "Complaint Identification",    ruleType: null              },
  { step: 2,  name: "Modifier Collection",         ruleType: "modifier"        },
  { step: 3,  name: "Core Questions",              ruleType: "question"        },
  { step: 4,  name: "Secondary Questions",         ruleType: "question"        },
  { step: 5,  name: "Red Flag Safety Screen",      ruleType: "red_flag"        },
  { step: 6,  name: "Cluster Scoring",             ruleType: "cluster_scoring" },
  { step: 7,  name: "Diagnosis Ranking",           ruleType: "diagnosis"       },
  { step: 8,  name: "Disposition Determination",   ruleType: "disposition"     },
  { step: 9,  name: "Workup Selection",            ruleType: "workup"          },
  { step: 10, name: "Medication Group Selection",  ruleType: "medication"      },
  { step: 11, name: "Medication Safety Filters",   ruleType: "medication"      },
  { step: 12, name: "Plan Generation",             ruleType: "plan"            },
  { step: 13, name: "Audit Trail",                 ruleType: null              },
];
```

### Rule evaluation logic (DB engine)

```typescript
function evaluateRule(rule: any, inputs: PipelineInputs): boolean {
  switch (rule.logic_type) {
    case "threshold": {
      // Parses "O2_sat < 94" from logic_description string
      for (const field of rule.input_fields ?? []) {
        const val = inputs[field];
        const ltMatch = rule.logic_description.match(new RegExp(field + "\\s*<\\s*([\\d.]+)"));
        const gtMatch = rule.logic_description.match(new RegExp(field + "\\s*>\\s*([\\d.]+)"));
        if (ltMatch && Number(val) < Number(ltMatch[1])) return true;
        if (gtMatch && Number(val) > Number(gtMatch[1])) return true;
      }
      return false;
    }
    case "boolean": {
      const queryDeps = rule.question_dependencies ?? [];
      if (queryDeps.length === 0) return true; // unconditional
      return queryDeps.some(dep => {
        const v = inputs[dep];
        return v === true || v === "yes" || v === "true" || v === 1;
      });
    }
    case "scoring": {
      return (rule.question_dependencies ?? []).length === 0
        || rule.question_dependencies.some(dep => inputs[dep] === true || inputs[dep] === "yes" || inputs[dep] === 1);
    }
    case "mapping": {
      // Fires unless a blocking modifier (no_penicillin, etc.) is active
      return (rule.modifier_dependencies ?? []).every(dep => {
        if (dep.startsWith("no_")) {
          const allergyKey = dep.replace("no_", "");
          return !inputs[allergyKey] && !inputs["allergy_" + allergyKey];
        }
        return true;
      });
    }
    case "conditional": {
      const hasQuery = !rule.question_dependencies?.length
        || rule.question_dependencies.some(d => inputs[d] !== undefined);
      const hasModifier = !rule.modifier_dependencies?.length
        || rule.modifier_dependencies.some(d => inputs[d] !== undefined);
      return hasQuery && hasModifier;
    }
  }
  return false;
}
```

### Hard-stop escalation (DB engine)

```typescript
if (rule.rule_type === "red_flag") {
  stepRedFlag = true;
  const impact = rule.disposition_impact ?? rule.outputs?.escalation;
  if (impact && ["ER_NOW", "ED_NOW", "CALL_911"].includes(impact)) {
    hardStop = true;
    hardStopReason = `${rule.rule_name}: ${rule.logic_description}`;
    stepEscalation = impact;
    finalDisposition = impact;
    criticalFlagsHit.push(rule.rule_id);
  }
}

// Short-circuit: after hardStop, only CRITICAL-level rules continue evaluating
if (hardStop && rule.safety_level !== "CRITICAL") continue;
```

---

## 8. The `kb_master_rules` Table Schema (27 columns)

```sql
CREATE TABLE kb_master_rules (
  rule_id              TEXT PRIMARY KEY,
  rule_name            TEXT NOT NULL,
  rule_type            TEXT NOT NULL,      -- red_flag | diagnosis | cluster_scoring | medication | disposition | question | modifier | workup | plan
  priority             INTEGER DEFAULT 50,
  complaint_id         TEXT,               -- NULL = applies to ALL complaints
  cluster_id           TEXT,
  diagnosis_id         TEXT,
  modifier_dependencies TEXT[],
  question_dependencies TEXT[],
  red_flag_dependencies TEXT[],
  input_fields          TEXT[],
  logic_description     TEXT,              -- human-readable; threshold parser reads this
  logic_type            TEXT,              -- boolean | threshold | scoring | mapping | conditional
  source_tab            TEXT,              -- which Google Sheet tab this rule came from
  target_tabs           TEXT[],
  outputs               JSONB,
  disposition_impact    TEXT,              -- er_send | routine | urgent | ER_NOW | ED_NOW | CALL_911
  medication_impact     TEXT,
  workup_impact         TEXT,
  safety_level          TEXT DEFAULT 'LOW', -- LOW | MODERATE | HIGH | CRITICAL
  override_rules        TEXT[],
  confidence_weight     NUMERIC DEFAULT 1.0,
  active                BOOLEAN DEFAULT TRUE,
  version               TEXT DEFAULT '1.0',
  last_updated          TIMESTAMPTZ DEFAULT NOW(),
  owner                 TEXT,
  notes                 TEXT
);
```

---

## 9. Key Design Tensions / Known Issues

### 9A. Two Engines, Different Step Orders

| Step | World B Pipeline (`clinicalPipelineRoutes.ts`) | DB Engine (`ruleExecutionEngine.ts`) |
|---:|---|---|
| 1 | Complaint Identification | Complaint Identification |
| 2 | **Differential Diagnosis** | Modifier Collection |
| 3A | Modifier Collection | Core Questions |
| 3B | Question Engine | Secondary Questions |
| 4 | Workup Selection | Red Flag Safety Screen |
| 5 | Medication Safety | Cluster Scoring |
| 6 | Red Flag Screen | Diagnosis Ranking |
| 7 | Cluster Scoring | **Disposition Determination** |
| 8 | Diagnosis Ranking | **Workup Selection** |
| 9 | Disposition + Plan | **Medication Group Selection** |
| 10 | _(absent)_ | **Medication Safety Filters** |
| 11 | _(absent)_ | **Plan Generation** |
| 12 | _(absent)_ | _(not mapped)_ |
| 13 | Audit Trail (stub) | Audit Trail |

The World B pipeline has Steps 10–12 absent entirely. The DB engine puts differential diagnosis after modifiers and questions (not before). These should be reconciled.

### 9B. Expression Matching Limitations

`exprMatches` and `rowMatchesInput` use token-level matching, not a proper expression parser. This means:

- `"fever AND rash"` — would match if the user enters `fever` (only one token needs to match, not both)
- `"NOT chest_pain"` — `NOT` is a stopword; the rule would fire when `chest_pain` is in tokens, opposite of intent
- `"O2_sat < 94"` — the `<` is stripped; this reduces to a token match on `o2_sat`, not a numeric threshold check

This is intentional for the World B dashboard trace (which is "explainability, not execution") — but needs to be clearly documented as NOT the authoritative clinical evaluator.

### 9C. `as unknown as SheetRow[]` Casts

Several typed arrays are cast back to `SheetRow[]` in the pipeline route:

```typescript
...toSourceRows(cfg.redFlagRules as unknown as SheetRow[], "RED_FLAG_RULES"),
...toSourceRows(cfg.clusterScoringRules as unknown as SheetRow[], "CLUSTER_SCORING_RULES"),
...toSourceRows(cfg.scoringDefs as unknown as SheetRow[], "SCORING_DEFS"),
```

This works because the typed structs (`RedFlagRule`, `ClusterScoringRule`) are subsets of `SheetRow`, but TypeScript cannot verify this statically. If a field is renamed or removed from the type, the cast silently succeeds.

### 9D. Stale-Cache Fail-Open Behavior

In `loadComplaintConfig`, if the Google Sheet fetch fails AND a stale cache entry exists, the stale config is returned silently:

```typescript
} catch (loadErr) {
  if (cached) {
    console.warn(`Using last-known-good stale config`, loadErr);
    return cached.config;
  }
  throw loadErr;
}
```

This is intentional (availability over freshness) but means a physician could receive clinical suggestions based on outdated knowledge without knowing it.

### 9E. Audit Trail Is a Stub

Step 13 currently logs a note that a trace "should" be recorded. No real write happens. Before real patient encounters, every trace must append a tamper-evident audit event with:
- Physician identity (from auth session)
- Complaint + symptom tokens
- All fired rules (with IDs and version)
- Final disposition
- Timestamp

### 9F. Corruption Guards

Five tables have corruption guards (`assertCoreQuestionsNotCorrupt`, etc.). The other 13 World B tables (MODIFIERS, GLOBAL_CLUSTER_MASTER, etc.) have no guards. A blank or malformed Google Sheet would silently return zero rows, which degrades clinical reasoning without raising an alert.

---

## 10. Questions for Claude

1. **Is the `exprMatches` token-matching approach acceptable for a UI trace tool, or does it create a clinical safety risk by giving physicians a false impression of how rules actually fire?**

2. **The World B pipeline puts Differential Diagnosis at Step 2 (before questions). The DB engine puts it at Step 7 (after disposition). Which ordering is clinically correct for urgent care triage, and what's the evidence-based rationale?**

3. **Steps 10–12 (Medication Group, Medication Safety, Plan Generation) exist in the DB engine but not in the World B pipeline. Should the World B pipeline be extended to include them, or should they live only in the DB engine?**

4. **The `rowMatchesInput` fallback (scan ALL row values for ANY input token) will fire on nearly any row that mentions a body system. For example, a chest pain token would match rows about cardiac medications even if their `WHEN_EXPR` says "false". How should this fallback be constrained?**

5. **For HIPAA compliance, what is the minimum audit-write implementation before this system should handle real patient-physician encounters?**

6. **The stale-cache fail-open pattern (returning outdated clinical rules on API failure) is availability-first. Is this appropriate for an FDA-adjacent CDS tool, or should it fail closed?**

7. **We have 18 tables loaded in parallel per request, cached for 60s. Under load (50 physicians × 5 requests/min), estimate the Google Sheets API quota risk and recommend a caching architecture.**

8. **The `as unknown as SheetRow[]` double-cast pattern — what is the correct TypeScript pattern for treating typed structs polymorphically as generic row maps?**

9. **The `validateComplaintBundle` only checks typed layers (core questions, disposition, output templates). It does not validate the World B layers (MODIFIERS, GLOBAL_CLUSTER_MASTER, etc.). What validation should be added for those?**

10. **Are there any patterns in this architecture that would fail an FDA 21 CFR Part 11 audit for electronic records and electronic signatures in clinical decision support?**

---

## 11. File Map

| File | Purpose |
|---|---|
| `server/data/registry.ts` | Google Sheets / CSV table registry + TTL cache |
| `server/services/complaintConfigLoader.ts` | Loads + validates 18-table ComplaintConfig bundle |
| `server/routes/clinicalPipelineRoutes.ts` | World B pipeline API (bundle + trace endpoints) |
| `server/clinical/ruleExecutionEngine.ts` | DB-backed 13-step dry-run engine (`kb_master_rules`) |
| `server/routes/masterRules.routes.ts` | CRUD + dry-run API for `kb_master_rules` |
| `server/scripts/exportMasterRulesToSheets.ts` | Exports `kb_master_rules` → MASTER_RULE_MAP Google Sheet tab |
| `client/src/pages/ClinicalDecisionPipelinePage.tsx` | Physician-facing pipeline visualization (11 steps, World B Map tab, Live Trace) |
| `client/src/pages/MasterRuleMapPage.tsx` | Master Rule Map dashboard (rule table, pipeline dry-run, export) |
| `docs/GOOGLE_SHEETS_WORLD_B_PIPELINE_MAP.md` | Canonical step-order documentation |

---

## 12. Technology Stack

- **Backend**: Node.js + Express + TypeScript
- **ORM**: Drizzle ORM → PostgreSQL
- **Knowledge Base**: Google Sheets (live) + CSV files (CI/offline fallback)
- **Auth**: Role-based (`admin`, `physician`, `clinician`) — pipeline routes require physician/admin
- **Cache**: In-memory Map (per-process; not Redis — Redis is used for BullMQ job queues only)
- **Audit**: PostgreSQL `audit_logs` table (append-only, real writes not yet wired to pipeline)
- **Frontend**: React + Vite + shadcn/ui + TanStack Query

---

*End of review package. Total code reviewed: ~1,200 lines of TypeScript across 4 core files.*
