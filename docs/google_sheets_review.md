# Auralyn — Google Sheets Architecture Review

**Prepared for Claude review.**
**Date:** 2026-05-01
**Spreadsheet ID:** `1TzouZxa1BXmxUxtw0f9OirRO8KyYTlH4YSlimm97QCA`

---

## 1. Environment Variables

| Variable | Used by | Notes |
|---|---|---|
| `SHEETS_SPREADSHEET_ID` | Most files | Primary ID — same sheet |
| `PACKS_SPREADSHEET_ID` | Pack repos, export scripts | First in fallback chain |
| `GOOGLE_SHEET_ID` | Legacy fallback | Third in chain |
| `SHEETS_SPREADSHEET_ID_STAGING` | Staging pipeline | Not widely used yet |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | All write operations | Service account: `jan26medassist@medicalm-dec9d.iam.gserviceaccount.com` |

All three read IDs (`PACKS_SPREADSHEET_ID ?? SHEETS_SPREADSHEET_ID ?? GOOGLE_SHEET_ID`) resolve to the **same spreadsheet** in production. The fallback chain is consistent across all scripts.

---

## 2. Full Tab Inventory

The single spreadsheet contains (or is expected to contain) the following tabs, grouped by role:

### Group A — Pack Definition Tabs
*Read + written by the Pack system (`server/repos/googleSheetsPackRepository.ts`, `server/engines/googleSheetsMigrationEngine.ts`)*

| Tab | Columns | Direction | Maps to |
|---|---|---|---|
| `Symptom_Packs` | 13 | RW | In-memory pack objects |
| `Pack_Questions` | 11 | RW | Pack question objects |
| `Modifier_Packs` | 9 | RW | Modifier pack objects |
| `Clinician_Algorithms` | 10 | RW | Algorithm definitions |
| `Plan_Templates` | 9 | RW | Plan template objects |
| `Pack_Audit_Log` | 12 | Append | Audit trail |
| `Import_Mapping_Log` | 6 | Append | Import history |
| `Import_Errors` | 7 | Append | Import error log |

**Column specs:**
```
Symptom_Packs:        id | system | title | isActive | version | tags | aliases | likelyDisposition | questionsJson | redFlags | autoEscalateRules | autoReviewRules | planTemplateKey
Pack_Questions:       id | packId | questionId | prompt | type | priority | required | optionsJson | helpText | isActive | version
Modifier_Packs:       id | system | title | isActive | version | tags | appliesToSymptoms | triggers | riskAdjustmentsJson
Clinician_Algorithms: id | system | title | isActive | version | tags | entryCriteria | requiredInputs | outputActions | notes
Plan_Templates:       key | diagnosisLabel | defaultDisposition | summary | homeCare | medsJson | followUp | returnPrecautions | patientMessage
Pack_Audit_Log:       id | entityType | entityId | action | actorId | actorName | at | beforeJson | afterJson | validationOk | validationIssuesJson | notes
Import_Mapping_Log:   id | at | sourceTab | targetTab | status | detailsJson
Import_Errors:        id | at | sourceTab | rowNumber | severity | message | rawJson
```

---

### Group B — Canonical Clinical Rule Tabs
*Read by `importClinicalSheetsToDb.ts` → upserted into 6 PostgreSQL KB tables. Idempotent (ON CONFLICT DO UPDATE).*

| Tab | Direction | PostgreSQL Table | Row count (DB) | API trigger |
|---|---|---|---|---|
| `COMPLAINT_REGISTRY` | Read | `kb_complaints` | — | `POST /api/admin/sheets/sync` |
| `RED_FLAG_RULES` | Read | `kb_red_flag_rules` | 418 | same |
| `CLINICAL_DIAGNOSES` | Read | `kb_diagnosis_rules` | 2,198 | same |
| `CLINICAL_MEDICATIONS` | Read | `kb_treatment_rules` | 1,227 | same |
| `CLINICAL_MODIFIERS` | Read | `kb_modifiers` | — | same |
| `DISPOSITION_RULES` | Read | `kb_disposition_rules` | 364 | same |

**Column mapping (CLINICAL_DIAGNOSES → kb_diagnosis_rules):**
Uses dynamic column detection via header name matching (col index not hardcoded). Key columns: Diagnosis ID, System, Chief Complaint, Diagnosis name, Red Flag flag, active.

---

### Group C — System-Specific Clinical Tabs (37 tabs)
*Read by `importAllSystemSheetsToDb.ts` → same 5 PostgreSQL tables. Triggered by `POST /api/admin/sheets/import-diagnoses` / `import-medications`.*

**Diagnosis tabs → `kb_diagnosis_rules`:**
```
ENT_DIAGNOSIS_MASTER  GI_Diagnosis_Master  Derm_Diagnosis_Master
Cards_Diagnosis_Master  ENDO_DIAGNOSES_MASTER  ID_Diagnosis_Master
Pulm_Diagnosis_Master  Tox_Diagnosis_Master  UroGyn_Diagnosis_Master
ENV_DIAGNOSIS_MASTER  GLOBAL_DIAGNOSIS_FINAL
```

**Red Flag tabs → `kb_red_flag_rules`:**
```
ENT_RedFlags  GI_RedFlags  Derm_RedFlags  Cards_RedFlags
Endo_RedFlags  Env_RedFlags  Tox_RefFlags
```

**Medication tabs → `kb_treatment_rules`:**
```
ENT_Medications_Master  GI_Medications_Master  Derm_Medications_Master
Cards_Medications_Master  Endo_Medications_Master  Env_Medications_Master
Tox_Meds_Master  UroGyn_Medication_Master  Pulm_Meds_Master
GLOBAL_MEDICATIONS_FINAL
```

**Secondary Question tabs → `kb_questions`:**
```
GI_SECOND  ENDO_SECOND  DERM_SECOND  CARDS_SECOND
ENV_SECOND  TOX_SECOND  UROGYN_SECOND
```

**Modifier tabs → `kb_modifiers`:**
```
DERM_MODIFIERS
```

All system tabs use the same column layout as the canonical tabs (detected dynamically by header name). Rows with empty key columns are skipped.

---

### Group D — Live Runtime Tabs (read on every clinical request — no DB cache)
*Read directly from the sheet during AI clinical processing. No import step.*

| Tab | Read by | Frequency | Risk |
|---|---|---|---|
| `CLINICAL_QUESTIONS` | `server/flows/sheetFlowLoader.ts` | Every question flow request | Rate limit / latency |
| `CLINICAL_RULES` | `server/rules/entFluRuleLoader.ts` | Every ENT/flu rule evaluation | Rate limit / latency |
| `CLINICAL_MEDICATIONS` | `server/meds/medCatalog.ts` | Every medication lookup | Rate limit / latency |
| `CLINICAL_DIAGNOSES` | `server/meds/diagnosisCatalog.ts` | Every diagnosis lookup | Rate limit / latency |

**⚠ Note:** These tabs bypass the PostgreSQL import cycle entirely. Changes in the sheet take effect immediately in production without any import trigger. This is the fastest path to deploy rule changes but has no audit gate.

---

### Group E — Export Tabs (written by system → sheet)
*Direction: PostgreSQL → Google Sheet. No sheet-to-DB feedback loop.*

| Tab | Writer | Source | Columns | API trigger |
|---|---|---|---|---|
| `MASTER_RULE_MAP` | `exportMasterRulesToSheets.ts` | `kb_master_rules` | **27** | `POST /api/master-rules/export-to-sheets` |
| `MASTER_RULE_MAP` | `exportRuleMapToSheets.ts` | `mv_master_rule_map` (view) | **18** | `POST /api/rule-map/export-to-sheets` |
| `VALIDATION_REPORT` | `server/clinical/ruleMapValidator.ts` | Validation logic | 11 | `POST /api/rule-map/validate` |
| `TEST_RUNS` | `server/testing/sinks/sheetsSink.ts` | Test runner | Variable | Automated test runs |

**⚠ CONFLICT — MASTER_RULE_MAP written by two exporters with different schemas:**

`exportMasterRulesToSheets.ts` writes (27 columns — individual rules):
```
rule_id | rule_name | rule_type | priority | complaint_id | cluster_id | diagnosis_id
modifier_dependencies | question_dependencies | red_flag_dependencies | input_fields
logic_description | logic_type | source_tab | target_tabs | outputs
disposition_impact | medication_impact | workup_impact | safety_level
override_rules | confidence_weight | active | version | last_updated | owner | notes
```
Source: `kb_master_rules` table (263 active rules), sorted by priority ASC.

`exportRuleMapToSheets.ts` writes (18 columns — complaint-level coverage summary):
```
complaint_id | system | label | enabled | red_flag_count | diagnosis_count
treatment_count | question_count | disposition_count | cannot_miss_count
completeness_score | missing_red_flags | missing_diagnoses | missing_treatments
missing_questions | missing_disposition | missing_cannot_miss | last_exported_at
```
Source: `mv_master_rule_map` materialized view (89 complaints), sorted by completeness_score DESC.

Both exporters **clear `MASTER_RULE_MAP!A:Z` before writing**, so whichever runs last overwrites the other entirely.

---

### Group F — Test/Utility Tab
| Tab | Writer | Notes |
|---|---|---|
| `TEST_RUNS` | `server/testing/sinks/sheetsSink.ts` | Configured via `TEST_RUNS_SHEET_TAB` env var |

---

## 3. Data Flow Diagram

```
GOOGLE SHEET                          POSTGRESQL DATABASE
─────────────────────────────────     ───────────────────────────────────

[Group B — Canonical Clinical]        
COMPLAINT_REGISTRY    ──import──►  kb_complaints
RED_FLAG_RULES        ──import──►  kb_red_flag_rules      (418 rows)
CLINICAL_DIAGNOSES    ──import──►  kb_diagnosis_rules     (2,198 rows)
CLINICAL_MEDICATIONS  ──import──►  kb_treatment_rules     (1,227 rows)
CLINICAL_MODIFIERS    ──import──►  kb_modifiers
DISPOSITION_RULES     ──import──►  kb_disposition_rules   (364 rows)

[Group C — System-Specific (37 tabs)]
ENT_DIAGNOSIS_MASTER  ──import──►  kb_diagnosis_rules     ┐ same tables,
GI_Diagnosis_Master   ──import──►  kb_diagnosis_rules     │ ON CONFLICT
... (11 dx tabs)                                          │ DO UPDATE
ENT_RedFlags          ──import──►  kb_red_flag_rules      │
... (7 rf tabs)                                           │
ENT_Medications_Master──import──►  kb_treatment_rules     │
... (10 med tabs)                                         │
GI_SECOND...          ──import──►  kb_questions           │
DERM_MODIFIERS        ──import──►  kb_modifiers           ┘

                                    kb_master_rules        (263 rules)
                                      ↑ seeded from the 4 source tables above
                                    mv_master_rule_map     (89 complaints)
                                      ↑ materialized view over kb_complaints + KB tables

[Group E — Exports]               
MASTER_RULE_MAP  ◄──export(27col)── kb_master_rules
MASTER_RULE_MAP  ◄──export(18col)── mv_master_rule_map    ← CONFLICT (same tab)
VALIDATION_REPORT◄──export──────── validation logic
TEST_RUNS        ◄──append──────── test runner

[Group D — Live Runtime (no DB step)]
CLINICAL_QUESTIONS    ──live read──► question flow engine  (per request)
CLINICAL_RULES        ──live read──► ENT/flu rule engine   (per request)
CLINICAL_MEDICATIONS  ──live read──► medication catalog    (per request)
CLINICAL_DIAGNOSES    ──live read──► diagnosis catalog     (per request)

[Group A — Pack Tabs]
Symptom_Packs         ──read──────► pack objects (in-memory)
Pack_Questions        ──read──────► pack question objects
Modifier_Packs        ──read──────► modifier objects
Clinician_Algorithms  ──read──────► algorithm objects
                      ◄──write───── pack system (upsert on change)
Pack_Audit_Log        ◄──append───── every pack mutation
```

---

## 4. API Endpoints That Touch Sheets

| Method | Path | Operation | Target Tab(s) |
|---|---|---|---|
| POST | `/api/admin/sheets/sync` | Import Group B (6 canonical tabs) → DB | reads COMPLAINT_REGISTRY, RED_FLAG_RULES, CLINICAL_DIAGNOSES, CLINICAL_MEDICATIONS, CLINICAL_MODIFIERS, DISPOSITION_RULES |
| POST | `/api/admin/sheets/import-medications` | Import ENT medications from sheet → DB | reads ENT_Medications_Master |
| POST | `/api/admin/sheets/import-diagnoses` | Import ENT diagnoses from sheet → DB | reads ENT_DIAGNOSIS_MASTER |
| POST | `/api/rule-map/export-to-sheets` | Export mv_master_rule_map → sheet | writes MASTER_RULE_MAP (18 cols) |
| POST | `/api/rule-map/validate` | Run validation, write report | writes VALIDATION_REPORT |
| POST | `/api/master-rules/export-to-sheets` | Export kb_master_rules → sheet | writes MASTER_RULE_MAP (27 cols) |

---

## 5. Issues Identified

### Issue 1 — MASTER_RULE_MAP Tab Collision (HIGH)
Both export functions write to the same `MASTER_RULE_MAP` tab with incompatible column schemas (27 vs 18 columns). Each clears the tab before writing. The last export wins and completely overwrites the other.

**Recommendation:** Rename one tab:
- Keep `MASTER_RULE_MAP` → 27-column individual rule catalog (from `kb_master_rules`)
- Add `COMPLAINT_COVERAGE` → 18-column complaint completeness view (from `mv_master_rule_map`)

### Issue 2 — Source KB Tables Have No Sheet Export (MEDIUM)
Four KB tables that are the foundation of all clinical logic have no export path to the sheet:
| Table | Rows | Currently exported? |
|---|---|---|
| `kb_diagnosis_rules` | 2,198 | ❌ |
| `kb_treatment_rules` | 1,227 | ❌ |
| `kb_red_flag_rules` | 418 | ❌ |
| `kb_disposition_rules` | 364 | ❌ |

The sheet is the **source of truth** for these tables (import direction), but any DB-side changes (e.g., seeding from `kb_master_rules`) are invisible in the sheet.

**Recommendation:** Add export endpoints for each KB table to dedicated tabs (e.g., `KB_DIAGNOSIS_RULES`, `KB_RED_FLAG_RULES`, etc.) so physicians can audit the full KB state in the sheet.

### Issue 3 — Live Sheet Reads on Every Clinical Request (MEDIUM)
`CLINICAL_QUESTIONS`, `CLINICAL_RULES`, `CLINICAL_MEDICATIONS`, `CLINICAL_DIAGNOSES` are fetched from the Google Sheets API on every request. This creates:
- Latency risk (~200–500ms per read)
- Rate limit risk (Google Sheets API: 300 reads/min/project)
- No audit trail for changes (sheet edits take effect immediately in production)

**Recommendation:** Add a short in-memory cache (TTL 5 min) or promote these tabs through the import pipeline so the DB is the runtime source.

### Issue 4 — Env Var Ambiguity (LOW)
Three env vars (`PACKS_SPREADSHEET_ID`, `SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEET_ID`) all reference the same spreadsheet via a fallback chain. If the staging spreadsheet (`SHEETS_SPREADSHEET_ID_STAGING`) is ever set, some scripts (those that use `PACKS_SPREADSHEET_ID` first) will still hit production.

**Recommendation:** Standardize to a single `SHEETS_SPREADSHEET_ID` across all scripts, with `SHEETS_SPREADSHEET_ID_STAGING` for staging mode.

---

## 6. Files Reference

| File | Role |
|---|---|
| `server/sheets/sheetsClient.ts` | Singleton Sheets API client (RO + RW variants) |
| `server/sheets/sheetHelper.ts` | `getSheetRows()` utility for arbitrary tab reads |
| `server/sheets/sheetSyncEngine.ts` | File-based sync (XLSX upload → graph pipeline) |
| `server/repos/googleSheetsPackRepository.ts` | Pack CRUD against Group A tabs |
| `server/engines/googleSheetsMigrationEngine.ts` | Creates canonical tabs, validates headers, migrates legacy data |
| `server/scripts/importClinicalSheetsToDb.ts` | 6-tab canonical import → PostgreSQL (Group B) |
| `server/scripts/importAllSystemSheetsToDb.ts` | 37-tab system import → PostgreSQL (Group C) |
| `server/scripts/exportRuleMapToSheets.ts` | `mv_master_rule_map` → MASTER_RULE_MAP (18 cols) |
| `server/scripts/exportMasterRulesToSheets.ts` | `kb_master_rules` → MASTER_RULE_MAP (27 cols) |
| `server/clinical/ruleMapValidator.ts` | Validation → VALIDATION_REPORT tab |
| `server/flows/sheetFlowLoader.ts` | Live read: CLINICAL_QUESTIONS per request |
| `server/rules/entFluRuleLoader.ts` | Live read: CLINICAL_RULES per request |
| `server/meds/medCatalog.ts` | Live read: CLINICAL_MEDICATIONS per request |
| `server/meds/diagnosisCatalog.ts` | Live read: CLINICAL_DIAGNOSES per request |
| `server/admin/sheetsAgent.ts` | Admin sheet sync/import handlers |
| `server/testing/sinks/sheetsSink.ts` | Test result append → TEST_RUNS tab |
| `server/routes/masterRules.routes.ts` | `/api/master-rules/*` including export endpoint |
| `server/routes/masterRuleMap.routes.ts` | `/api/rule-map/*` including export + validate endpoints |
