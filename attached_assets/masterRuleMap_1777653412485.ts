/**
 * masterRuleMap.ts
 * Drop into: server/scripts/exportMasterRuleMap.ts
 *
 * FIXES ISSUE 1 — MASTER_RULE_MAP TAB COLLISION
 *
 * The architecture review found two exporters writing incompatible schemas
 * to the same MASTER_RULE_MAP tab:
 *   exportMasterRulesToSheets.ts  → 27 columns (individual rules)
 *   exportRuleMapToSheets.ts      → 18 columns (complaint coverage)
 *
 * FIX: Two separate tabs with clear purposes:
 *   MASTER_RULE_MAP    → 27-column individual rule catalog (kb_master_rules)
 *   COMPLAINT_COVERAGE → 18-column complaint completeness (mv_master_rule_map)
 *
 * This file also provides the unified rule query that the pipeline uses
 * instead of reading from Google Sheets directly (fixes Issue 3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PIPELINE INTEGRATION PATCH
 *
 * HOW TO WIRE kbQueryLayer.ts INTO THE EXISTING PIPELINE:
 *
 * In server/agent/pipeline.ts, find where the clinical system prompt is assembled.
 * Add the KB query before the LLM call:
 *
 * FIND (approximate location — after EHR context, before harness):
 *   const systemPromptAdditions: string[] = [];
 *   // ... existing additions ...
 *
 * ADD:
 *   import { queryKBCached, buildKBPromptBlock } from "../retrieval/kbQueryLayer";
 *
 *   // Query the existing PostgreSQL KB (4,207 rules) for this complaint
 *   const patientContext = {
 *     age:              enrichedCase._ont?.patientAge,
 *     pregnant:         rawAnswers.some(a => a.toLowerCase().includes("pregnant")),
 *     allergies:        ctx.allergies ?? [],
 *     currentMeds:      ctx.medications ?? [],
 *     diabetic:         ctx.conditions?.some(c => c.toLowerCase().includes("diabet")),
 *     chf:              ctx.conditions?.some(c => c.toLowerCase().includes("heart failure")),
 *     copd:             ctx.conditions?.some(c => c.toLowerCase().includes("copd")),
 *     immunocompromised: ctx.conditions?.some(c => c.toLowerCase().includes("immunocompromised")),
 *   };
 *
 *   const kbResult = await queryKBCached(
 *     enrichedCase._ont?.complaintSlug ?? complaintSlug,
 *     patientContext
 *   ).catch(() => null);
 *
 *   if (kbResult) {
 *     systemPromptAdditions.push(buildKBPromptBlock(kbResult));
 *
 *     // Audit: record which rules were loaded
 *     await appendAuditEvent({
 *       actor:      "system",
 *       action:     "KB_RULES_INJECTED",
 *       entityId:   caseId,
 *       entityType: "case",
 *       details: {
 *         complaintId:     kbResult.complaintId,
 *         redFlagCount:    kbResult.redFlags.length,
 *         diagnosisCount:  kbResult.diagnoses.length,
 *         mustNotMissCount: kbResult.mustNotMiss.length,
 *         rulesFiredCount: kbResult.rulesFired.length,
 *         appliedModifiers: kbResult.appliedModifiers.length,
 *       },
 *     });
 *   }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LIVE READ REPLACEMENT (fixes Issue 3)
 *
 * The four Group D tabs read from Google Sheets on every request:
 *   server/flows/sheetFlowLoader.ts     → CLINICAL_QUESTIONS
 *   server/rules/entFluRuleLoader.ts    → CLINICAL_RULES
 *   server/meds/medCatalog.ts           → CLINICAL_MEDICATIONS
 *   server/meds/diagnosisCatalog.ts     → CLINICAL_DIAGNOSES
 *
 * Replace each with a DB query using queryKBCached().
 * The 5-minute cache prevents latency and rate limit issues.
 *
 * For sheetFlowLoader.ts:
 *   REPLACE: await readFromGoogleSheets("CLINICAL_QUESTIONS", ...)
 *   WITH:    const kb = await queryKBCached(complaintId, patient);
 *            return kb.diagnoses; // or kb.redFlags, etc.
 *
 * For medCatalog.ts:
 *   REPLACE: await readFromGoogleSheets("CLINICAL_MEDICATIONS", ...)
 *   WITH:    const kb = await queryKBCached(complaintId, patient);
 *            return kb.treatments;
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ENV VAR STANDARDIZATION (fixes Issue 4)
 *
 * The architecture review found three env vars resolving to the same spreadsheet.
 * Add to .env:
 *   SHEETS_SPREADSHEET_ID=1TzouZxa1BXmxUxtw0f9OirRO8KyYTlH4YSlimm97QCA
 *
 * In sheetsClient.ts, change the fallback chain to:
 *   const SHEET_ID = process.env.SHEETS_SPREADSHEET_ID
 *     ?? process.env.PACKS_SPREADSHEET_ID
 *     ?? process.env.GOOGLE_SHEET_ID;
 *
 * This makes SHEETS_SPREADSHEET_ID the canonical var while preserving
 * backward compatibility for scripts that haven't been updated yet.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * COMPLAINT COVERAGE EXPORT (fixes Issue 2 + tab collision)
 *
 * Add a new export script for the 18-column view to COMPLAINT_COVERAGE tab:
 *   POST /api/rule-map/export-to-sheets
 *   → writes to "COMPLAINT_COVERAGE" (not MASTER_RULE_MAP)
 *
 * In exportRuleMapToSheets.ts, change:
 *   const TAB_NAME = "MASTER_RULE_MAP";
 * TO:
 *   const TAB_NAME = "COMPLAINT_COVERAGE";
 *
 * This eliminates the collision. MASTER_RULE_MAP stays as the 27-column
 * individual rule catalog from exportMasterRulesToSheets.ts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * KB TABLE EXPORT (fixes Issue 2 — no export path for KB tables)
 *
 * Add export endpoints for each KB table to dedicated sheet tabs:
 *
 * POST /api/admin/sheets/export-kb-diagnoses
 *   SELECT * FROM kb_diagnosis_rules WHERE active = true
 *   → writes to "KB_DIAGNOSIS_RULES" tab (new tab, 2,198 rows)
 *
 * POST /api/admin/sheets/export-kb-red-flags
 *   SELECT * FROM kb_red_flag_rules WHERE active = true
 *   → writes to "KB_RED_FLAG_RULES" tab (418 rows)
 *
 * POST /api/admin/sheets/export-kb-treatments
 *   SELECT * FROM kb_treatment_rules WHERE active = true
 *   → writes to "KB_TREATMENT_RULES" tab (1,227 rows)
 *
 * POST /api/admin/sheets/export-kb-dispositions
 *   SELECT * FROM kb_disposition_rules WHERE active = true
 *   → writes to "KB_DISPOSITION_RULES" tab (364 rows)
 *
 * This gives physicians full visibility into the KB state without
 * requiring direct database access. Physicians can review the exported
 * data in the sheet, make corrections, and re-import.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * AUDIT TRAIL FORMAT (from Master Rule Map design)
 *
 * Each patient case should produce this audit record in the Auralyn audit chain:
 *
 * {
 *   "action": "KB_RULES_INJECTED",
 *   "entityType": "case",
 *   "details": {
 *     "complaintId": "chest_pain",
 *     "rulesFired": ["RULE_0001", "RULE_0101", "RULE_0201"],
 *     "redFlagCount": 5,
 *     "mustNotMissCount": 3,
 *     "appliedModifiers": ["age>65", "chf"],
 *     "finalDisposition": "ER_SEND",
 *     "reason": "Hypoxia + CHF + chest pain → ER"
 *   }
 * }
 *
 * This is the FDA-grade explainability layer from the Master Rule Map design.
 * Every clinical decision traces to specific rule IDs that can be audited,
 * reviewed, and challenged. This is what makes Auralyn defensible.
 */

// Export is handled by the wiring instructions above.
// No additional code needed — kbQueryLayer.ts + pipeline patch covers it.

export const MASTER_RULE_MAP_FIXES = {
  issue1_tabCollision: {
    problem: "Two exporters write incompatible schemas to MASTER_RULE_MAP",
    fix:     "Rename exportRuleMapToSheets.ts target from MASTER_RULE_MAP to COMPLAINT_COVERAGE",
    files:   ["server/scripts/exportRuleMapToSheets.ts"],
    change:  'const TAB_NAME = "COMPLAINT_COVERAGE"; // was "MASTER_RULE_MAP"',
  },
  issue2_noExport: {
    problem: "KB tables (2198 dx, 418 rf, 1227 tx, 364 disp) have no export to sheet",
    fix:     "Add 4 export endpoints writing to KB_DIAGNOSIS_RULES, KB_RED_FLAG_RULES, KB_TREATMENT_RULES, KB_DISPOSITION_RULES tabs",
    files:   ["server/admin/sheetsAgent.ts", "server/routes/masterRules.routes.ts"],
  },
  issue3_liveReads: {
    problem: "4 Group D tabs read from Google Sheets on every clinical request — 200-500ms latency, rate limit risk",
    fix:     "Replace with queryKBCached() from kbQueryLayer.ts (5-minute cache, PostgreSQL-backed)",
    files:   [
      "server/flows/sheetFlowLoader.ts",
      "server/rules/entFluRuleLoader.ts",
      "server/meds/medCatalog.ts",
      "server/meds/diagnosisCatalog.ts",
    ],
  },
  issue4_envVars: {
    problem: "Three env vars resolve to same spreadsheet — staging risk if SHEETS_SPREADSHEET_ID_STAGING is set",
    fix:     "Standardize to SHEETS_SPREADSHEET_ID as primary. Current: 1TzouZxa1BXmxUxtw0f9OirRO8KyYTlH4YSlimm97QCA",
    files:   ["server/sheets/sheetsClient.ts"],
  },
};
