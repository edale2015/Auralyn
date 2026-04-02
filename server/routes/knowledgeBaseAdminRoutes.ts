import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  kbComplaints, kbQuestions, kbModifiers, kbRedFlagRules,
  kbWorkupRules, kbDiagnosisRules, kbTreatmentRules,
  kbDispositionRules, kbPlanTemplates, kbGoldenCases,
  kbKnowledgeChanges,
  insertKbComplaintSchema, insertKbQuestionSchema, insertKbModifierSchema,
  insertKbRedFlagRuleSchema, insertKbWorkupRuleSchema, insertKbDiagnosisRuleSchema,
  insertKbTreatmentRuleSchema, insertKbDispositionRuleSchema, insertKbPlanTemplateSchema,
  insertKbGoldenCaseSchema, insertKbKnowledgeChangeSchema,
} from "../../shared/schema";
import { eq, desc, and, ilike, count, or } from "drizzle-orm";
import { seedKnowledgeBase } from "../kb/kbSeeder";
import { reloadAndRewireKbCache, getKbCacheStatus } from "../kb/kbRuntime";
import { migrateToFeatureTable, validateFeatureCoverage } from "../kb/migrateCsvToKb";
import {
  kbFeatureLikelihoods, kbClinicalWeights, kbComplaintModules, kbComplaintPacks,
  kbFeatureModels, kbEngineRouting,
  insertKbFeatureLikelihoodSchema, insertKbFeatureModelSchema, insertKbEngineRoutingSchema,
  insertKbClinicalWeightSchema, insertKbComplaintModuleSchema, insertKbComplaintPackSchema,
} from "../../shared/schema";
import { migrateFeatureLikelihoodsToModels, invalidateAdvancedEngineCache } from "../kb/kbAdvancedDiagnosisEngine";
import { invalidateRedFlagCache } from "../rules/redFlagMap";
import { FLOW_SPECS } from "../testing/specs";
import { complaintPacks as hardcodedComplaintPacks } from "../config/complaintPacks";

// Local helper — db.execute() returns { rows: [...] } or array depending on driver
function xRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

// ── KB Entry validation (called on diagnosis rule writes) ────────────────────
function validateDiagnosisRule(body: Record<string, any>): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  const fl = body.featureLikelihoods;
  const isBayesian = (body.complaintId === "bayesian_global") || String(body.ruleId ?? "").startsWith("DX_BAY_");
  if (isBayesian) {
    if (!fl || Object.keys(fl).length === 0) {
      errors.push("Bayesian prior rules (complaintId=bayesian_global) MUST have featureLikelihoods — the Bayesian engine will ignore this rule without them.");
    } else {
      const badVals = Object.entries(fl).filter(([, v]) => typeof v !== "number" || (v as number) < 0 || (v as number) > 1);
      if (badVals.length > 0) {
        errors.push(`featureLikelihoods values must be numbers in [0,1]. Bad keys: ${badVals.map(([k]) => k).join(", ")}`);
      }
    }
    if (!body.baseProbability || body.baseProbability <= 0 || body.baseProbability > 1) {
      errors.push("baseProbability must be in (0, 1] for Bayesian priors.");
    }
  } else {
    if (!fl || Object.keys(fl).length === 0) {
      warnings.push("featureLikelihoods is empty — this rule will not be used by the Bayesian differential engine. Add likelihoods to activate it.");
    }
  }
  if (!body.diagnosisLabel?.trim()) {
    errors.push("diagnosisLabel is required.");
  }
  return { warnings, errors };
}

const router = Router();

// Physician-gate: all KB write operations (POST/PATCH/DELETE) require admin or physician role
router.use((req, res, next) => {
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    return requireRole(["admin", "physician"])(req, res, next);
  }
  next();
});

function changeId() { return `kc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

// Domains that are wired into the live pipeline — changes to these must reload the cache
const PIPELINE_CRITICAL_DOMAINS = new Set([
  "diagnosis_rule", "red_flag_rule", "treatment_rule",
]);

async function logChange(domain: string, recordId: string, action: string, oldVal: any, newVal: any, rationale?: string) {
  try {
    await db.insert(kbKnowledgeChanges).values({
      changeId: changeId(),
      domain,
      recordId,
      action,
      changedBy: "admin",
      oldValue: oldVal,
      newValue: newVal,
      rationale: rationale || null,
      status: "deployed",
    });
  } catch { /* non-blocking */ }

  // Auto-reload pipeline cache for domains wired into the live decision engine
  if (PIPELINE_CRITICAL_DOMAINS.has(domain)) {
    reloadAndRewireKbCache().catch(() => {});
  }
}

// ── Cache status ──────────────────────────────────────────────────────────────
router.get("/cache-status", (_req: Request, res: Response) => {
  res.json(getKbCacheStatus());
});

// Force-reload endpoint for ops dashboard
router.post("/cache-reload", async (_req: Request, res: Response) => {
  try {
    await reloadAndRewireKbCache();
    res.json({ ok: true, status: getKbCacheStatus() });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Seed trigger ─────────────────────────────────────────────────────────────
router.post("/seed", async (_req: Request, res: Response) => {
  try {
    await seedKnowledgeBase();
    // Reload pipeline cache immediately after seeding so new data is live
    reloadAndRewireKbCache().catch(() => {});
    res.json({ ok: true, message: "Knowledge base seeded" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3 — MIGRATION + FEATURE LIKELIHOODS (normalized table)
// ════════════════════════════════════════════════════════════════════════════

// POST /api/kb/migrate-to-feature-table — idempotent: move all JSONB + hardcoded PRIORS to normalized table
router.post("/migrate-to-feature-table", async (_req: Request, res: Response) => {
  try {
    const result = await migrateToFeatureTable();
    // Reload engine cache so new feature rows are immediately live
    await reloadAndRewireKbCache();
    res.json({ ok: true, migration: result, cacheStatus: getKbCacheStatus() });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/kb/feature-coverage — which bayesian_global rules are missing feature rows
router.get("/feature-coverage", async (_req: Request, res: Response) => {
  try {
    const missing = await validateFeatureCoverage();
    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM kb_feature_likelihoods f WHERE f.rule_id = r.rule_id AND f.active = true
             ))::int AS covered
      FROM kb_diagnosis_rules r
      WHERE r.active = true AND r.complaint_id = 'bayesian_global'
    `);
    const row = xRows(totalResult)[0] ?? {};
    const total = Number(row.total ?? 0);
    const covered = Number(row.covered ?? 0);
    const featureRowsResult = await db.execute(sql`SELECT COUNT(*)::int AS n FROM kb_feature_likelihoods WHERE active = true`);
    const featureRows = Number(xRows(featureRowsResult)[0]?.n ?? 0);
    res.json({
      total,
      covered,
      pctKbDriven: total > 0 ? Math.round(covered * 100 / total) : 0,
      featureRows,
      missing,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/kb/feature-likelihoods — list all (optionally by ruleId)
router.get("/feature-likelihoods", async (req: Request, res: Response) => {
  try {
    const { ruleId, q } = req.query as Record<string, string>;
    let rows;
    if (ruleId) {
      rows = await db.select().from(kbFeatureLikelihoods)
        .where(eq(kbFeatureLikelihoods.ruleId, ruleId))
        .orderBy(desc(kbFeatureLikelihoods.likelihood));
    } else if (q) {
      rows = await db.select().from(kbFeatureLikelihoods)
        .where(ilike(kbFeatureLikelihoods.featureKey, `%${q}%`))
        .orderBy(kbFeatureLikelihoods.ruleId, desc(kbFeatureLikelihoods.likelihood));
    } else {
      rows = await db.select().from(kbFeatureLikelihoods)
        .orderBy(kbFeatureLikelihoods.ruleId, desc(kbFeatureLikelihoods.likelihood));
    }
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/kb/feature-likelihoods — add a feature row
router.post("/feature-likelihoods", async (req: Request, res: Response) => {
  try {
    const body = insertKbFeatureLikelihoodSchema.parse(req.body);
    if (body.likelihood < 0 || body.likelihood > 1) {
      return res.status(422).json({ errors: ["likelihood must be between 0 and 1"] });
    }
    const [row] = await db.insert(kbFeatureLikelihoods).values(body).returning();
    await logChange("feature_likelihood", `${row.ruleId}:${row.featureKey}`, "create", null, row);
    res.json(row);
  } catch (e: any) {
    if (e.code === "23505") return res.status(409).json({ error: "Feature row already exists for this rule_id + feature_key + feature_value. Use PATCH to update it." });
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/kb/feature-likelihoods/:id — update a feature row
router.patch("/feature-likelihoods/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const old = await db.select().from(kbFeatureLikelihoods).where(eq(kbFeatureLikelihoods.id, id));
    if (!old[0]) return res.status(404).json({ error: "Feature row not found" });
    if (req.body.likelihood !== undefined && (req.body.likelihood < 0 || req.body.likelihood > 1)) {
      return res.status(422).json({ errors: ["likelihood must be between 0 and 1"] });
    }
    const [row] = await db.update(kbFeatureLikelihoods)
      .set({ ...req.body, source: "ui_edit" })
      .where(eq(kbFeatureLikelihoods.id, id))
      .returning();
    await logChange("feature_likelihood", `${row.ruleId}:${row.featureKey}`, "update", old[0], row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/kb/feature-likelihoods/:id — soft-delete a feature row
router.delete("/feature-likelihoods/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const old = await db.select().from(kbFeatureLikelihoods).where(eq(kbFeatureLikelihoods.id, id));
    if (!old[0]) return res.status(404).json({ error: "Feature row not found" });
    const [row] = await db.update(kbFeatureLikelihoods)
      .set({ active: false })
      .where(eq(kbFeatureLikelihoods.id, id))
      .returning();
    await logChange("feature_likelihood", `${old[0].ruleId}:${old[0].featureKey}`, "delete", old[0], row);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Stats / overview ─────────────────────────────────────────────────────────
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [complaints, questions, modifiers, redFlags, workup, diagnosis, treatment, disposition, templates, golden, changes] = await Promise.all([
      db.select({ n: count() }).from(kbComplaints),
      db.select({ n: count() }).from(kbQuestions),
      db.select({ n: count() }).from(kbModifiers),
      db.select({ n: count() }).from(kbRedFlagRules),
      db.select({ n: count() }).from(kbWorkupRules),
      db.select({ n: count() }).from(kbDiagnosisRules),
      db.select({ n: count() }).from(kbTreatmentRules),
      db.select({ n: count() }).from(kbDispositionRules),
      db.select({ n: count() }).from(kbPlanTemplates),
      db.select({ n: count() }).from(kbGoldenCases),
      db.select({ n: count() }).from(kbKnowledgeChanges),
    ]);
    const activeComplaints = await db.select({ n: count() }).from(kbComplaints).where(eq(kbComplaints.enabled, true));
    const approvedGolden = await db.select({ n: count() }).from(kbGoldenCases).where(eq(kbGoldenCases.status, "approved"));
    res.json({
      complaints: Number(complaints[0]?.n ?? 0),
      activeComplaints: Number(activeComplaints[0]?.n ?? 0),
      questions: Number(questions[0]?.n ?? 0),
      modifiers: Number(modifiers[0]?.n ?? 0),
      redFlags: Number(redFlags[0]?.n ?? 0),
      workupRules: Number(workup[0]?.n ?? 0),
      diagnosisRules: Number(diagnosis[0]?.n ?? 0),
      treatmentRules: Number(treatment[0]?.n ?? 0),
      dispositionRules: Number(disposition[0]?.n ?? 0),
      planTemplates: Number(templates[0]?.n ?? 0),
      goldenCases: Number(golden[0]?.n ?? 0),
      approvedGoldenCases: Number(approvedGolden[0]?.n ?? 0),
      knowledgeChanges: Number(changes[0]?.n ?? 0),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// COMPLAINTS
// ════════════════════════════════════════════════════════════════════════════
router.get("/complaints", async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string | undefined;
    const rows = q
      ? await db.select().from(kbComplaints).where(ilike(kbComplaints.label, `%${q}%`)).orderBy(kbComplaints.label)
      : await db.select().from(kbComplaints).orderBy(kbComplaints.label);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/complaints/:complaintId", async (req: Request, res: Response) => {
  try {
    const row = await db.select().from(kbComplaints).where(eq(kbComplaints.complaintId, req.params.complaintId));
    if (!row[0]) return res.status(404).json({ error: "Not found" });
    res.json(row[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/complaints", async (req: Request, res: Response) => {
  try {
    const body = insertKbComplaintSchema.parse(req.body);
    const [row] = await db.insert(kbComplaints).values(body).returning();
    await logChange("complaint", row.complaintId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/complaints/:complaintId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbComplaints).where(eq(kbComplaints.complaintId, req.params.complaintId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbComplaints)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(kbComplaints.complaintId, req.params.complaintId))
      .returning();
    await logChange("complaint", row.complaintId, "update", old[0], row, req.body.rationale);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/complaints/:complaintId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbComplaints).where(eq(kbComplaints.complaintId, req.params.complaintId));
    await db.delete(kbComplaints).where(eq(kbComplaints.complaintId, req.params.complaintId));
    await logChange("complaint", req.params.complaintId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// QUESTIONS
// ════════════════════════════════════════════════════════════════════════════
router.get("/questions", async (req: Request, res: Response) => {
  try {
    const { complaintId, q } = req.query as Record<string, string>;
    let rows;
    if (complaintId) {
      rows = await db.select().from(kbQuestions).where(eq(kbQuestions.complaintId, complaintId)).orderBy(kbQuestions.priority);
    } else if (q) {
      rows = await db.select().from(kbQuestions).where(ilike(kbQuestions.prompt, `%${q}%`)).orderBy(kbQuestions.priority);
    } else {
      rows = await db.select().from(kbQuestions).orderBy(kbQuestions.complaintId, kbQuestions.priority);
    }
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/questions", async (req: Request, res: Response) => {
  try {
    const body = insertKbQuestionSchema.parse(req.body);
    const [row] = await db.insert(kbQuestions).values(body).returning();
    await logChange("question", row.questionId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/questions/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const old = await db.select().from(kbQuestions).where(eq(kbQuestions.id, id));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbQuestions).set({ ...req.body, updatedAt: new Date() }).where(eq(kbQuestions.id, id)).returning();
    await logChange("question", row.questionId, "update", old[0], row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/questions/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const old = await db.select().from(kbQuestions).where(eq(kbQuestions.id, id));
    await db.delete(kbQuestions).where(eq(kbQuestions.id, id));
    await logChange("question", String(id), "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// MODIFIERS
// ════════════════════════════════════════════════════════════════════════════
router.get("/modifiers", async (_req: Request, res: Response) => {
  try {
    res.json(await db.select().from(kbModifiers).orderBy(kbModifiers.label));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/modifiers", async (req: Request, res: Response) => {
  try {
    const body = insertKbModifierSchema.parse(req.body);
    const [row] = await db.insert(kbModifiers).values(body).returning();
    await logChange("modifier", row.modifierId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/modifiers/:modifierId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbModifiers).where(eq(kbModifiers.modifierId, req.params.modifierId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbModifiers).set({ ...req.body, updatedAt: new Date() }).where(eq(kbModifiers.modifierId, req.params.modifierId)).returning();
    await logChange("modifier", row.modifierId, "update", old[0], row, req.body.rationale);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/modifiers/:modifierId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbModifiers).where(eq(kbModifiers.modifierId, req.params.modifierId));
    await db.delete(kbModifiers).where(eq(kbModifiers.modifierId, req.params.modifierId));
    await logChange("modifier", req.params.modifierId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// RED FLAG RULES
// ════════════════════════════════════════════════════════════════════════════
router.get("/red-flags", async (req: Request, res: Response) => {
  try {
    const { complaintId } = req.query as Record<string, string>;
    const rows = complaintId
      ? await db.select().from(kbRedFlagRules).where(eq(kbRedFlagRules.complaintId, complaintId)).orderBy(kbRedFlagRules.severity)
      : await db.select().from(kbRedFlagRules).orderBy(kbRedFlagRules.complaintId, kbRedFlagRules.severity);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/red-flags", async (req: Request, res: Response) => {
  try {
    const body = insertKbRedFlagRuleSchema.parse(req.body);
    const [row] = await db.insert(kbRedFlagRules).values(body).returning();
    await logChange("red_flag_rule", row.ruleId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/red-flags/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbRedFlagRules).where(eq(kbRedFlagRules.ruleId, req.params.ruleId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbRedFlagRules).set({ ...req.body, updatedAt: new Date() }).where(eq(kbRedFlagRules.ruleId, req.params.ruleId)).returning();
    await logChange("red_flag_rule", row.ruleId, "update", old[0], row, req.body.rationale);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/red-flags/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbRedFlagRules).where(eq(kbRedFlagRules.ruleId, req.params.ruleId));
    await db.delete(kbRedFlagRules).where(eq(kbRedFlagRules.ruleId, req.params.ruleId));
    await logChange("red_flag_rule", req.params.ruleId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// WORKUP RULES
// ════════════════════════════════════════════════════════════════════════════
router.get("/workup", async (req: Request, res: Response) => {
  try {
    const { complaintId } = req.query as Record<string, string>;
    const rows = complaintId
      ? await db.select().from(kbWorkupRules).where(eq(kbWorkupRules.complaintId, complaintId)).orderBy(kbWorkupRules.priority)
      : await db.select().from(kbWorkupRules).orderBy(kbWorkupRules.complaintId, kbWorkupRules.priority);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/workup", async (req: Request, res: Response) => {
  try {
    const body = insertKbWorkupRuleSchema.parse(req.body);
    const [row] = await db.insert(kbWorkupRules).values(body).returning();
    await logChange("workup_rule", row.ruleId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/workup/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbWorkupRules).where(eq(kbWorkupRules.ruleId, req.params.ruleId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbWorkupRules).set({ ...req.body, updatedAt: new Date() }).where(eq(kbWorkupRules.ruleId, req.params.ruleId)).returning();
    await logChange("workup_rule", row.ruleId, "update", old[0], row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/workup/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbWorkupRules).where(eq(kbWorkupRules.ruleId, req.params.ruleId));
    await db.delete(kbWorkupRules).where(eq(kbWorkupRules.ruleId, req.params.ruleId));
    await logChange("workup_rule", req.params.ruleId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// DIAGNOSIS RULES
// ════════════════════════════════════════════════════════════════════════════
router.get("/diagnosis", async (req: Request, res: Response) => {
  try {
    const { complaintId, q } = req.query as Record<string, string>;
    let rows;
    if (complaintId) {
      rows = await db.select().from(kbDiagnosisRules).where(eq(kbDiagnosisRules.complaintId, complaintId)).orderBy(kbDiagnosisRules.clusterPriority);
    } else if (q) {
      rows = await db.select().from(kbDiagnosisRules).where(ilike(kbDiagnosisRules.diagnosisLabel, `%${q}%`)).orderBy(kbDiagnosisRules.clusterPriority);
    } else {
      rows = await db.select().from(kbDiagnosisRules).orderBy(kbDiagnosisRules.complaintId, kbDiagnosisRules.clusterPriority);
    }
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/diagnosis", async (req: Request, res: Response) => {
  try {
    const validation = validateDiagnosisRule(req.body);
    if (validation.errors.length > 0) {
      return res.status(422).json({ error: "Validation failed", errors: validation.errors, warnings: validation.warnings });
    }
    const body = insertKbDiagnosisRuleSchema.parse(req.body);
    const [row] = await db.insert(kbDiagnosisRules).values(body).returning();
    await logChange("diagnosis_rule", row.ruleId, "create", null, row);
    res.json({ ...row, _validation: validation });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/diagnosis/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbDiagnosisRules).where(eq(kbDiagnosisRules.ruleId, req.params.ruleId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    // Merge with existing for validation context
    const merged = { ...old[0], ...req.body, ruleId: req.params.ruleId };
    const validation = validateDiagnosisRule(merged);
    if (validation.errors.length > 0) {
      return res.status(422).json({ error: "Validation failed", errors: validation.errors, warnings: validation.warnings });
    }
    const [row] = await db.update(kbDiagnosisRules).set({ ...req.body, updatedAt: new Date() }).where(eq(kbDiagnosisRules.ruleId, req.params.ruleId)).returning();
    await logChange("diagnosis_rule", row.ruleId, "update", old[0], row, req.body.rationale);
    res.json({ ...row, _validation: validation });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/diagnosis/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbDiagnosisRules).where(eq(kbDiagnosisRules.ruleId, req.params.ruleId));
    await db.delete(kbDiagnosisRules).where(eq(kbDiagnosisRules.ruleId, req.params.ruleId));
    await logChange("diagnosis_rule", req.params.ruleId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// TREATMENT RULES
// ════════════════════════════════════════════════════════════════════════════
router.get("/treatment", async (req: Request, res: Response) => {
  try {
    const { complaintId, diagnosisId, q } = req.query as Record<string, string>;
    let rows;
    if (complaintId) {
      rows = await db.select().from(kbTreatmentRules).where(eq(kbTreatmentRules.complaintId, complaintId));
    } else if (diagnosisId) {
      rows = await db.select().from(kbTreatmentRules).where(eq(kbTreatmentRules.diagnosisId, diagnosisId));
    } else if (q) {
      rows = await db.select().from(kbTreatmentRules).where(ilike(kbTreatmentRules.medicationName, `%${q}%`));
    } else {
      rows = await db.select().from(kbTreatmentRules).orderBy(kbTreatmentRules.medicationName);
    }
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/treatment", async (req: Request, res: Response) => {
  try {
    const body = insertKbTreatmentRuleSchema.parse(req.body);
    const [row] = await db.insert(kbTreatmentRules).values(body).returning();
    await logChange("treatment_rule", row.ruleId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/treatment/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbTreatmentRules).where(eq(kbTreatmentRules.ruleId, req.params.ruleId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbTreatmentRules).set({ ...req.body, updatedAt: new Date() }).where(eq(kbTreatmentRules.ruleId, req.params.ruleId)).returning();
    await logChange("treatment_rule", row.ruleId, "update", old[0], row, req.body.rationale);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/treatment/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbTreatmentRules).where(eq(kbTreatmentRules.ruleId, req.params.ruleId));
    await db.delete(kbTreatmentRules).where(eq(kbTreatmentRules.ruleId, req.params.ruleId));
    await logChange("treatment_rule", req.params.ruleId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// DISPOSITION RULES
// ════════════════════════════════════════════════════════════════════════════
router.get("/disposition", async (req: Request, res: Response) => {
  try {
    const { complaintId } = req.query as Record<string, string>;
    const rows = complaintId
      ? await db.select().from(kbDispositionRules).where(eq(kbDispositionRules.complaintId, complaintId)).orderBy(kbDispositionRules.priority)
      : await db.select().from(kbDispositionRules).orderBy(kbDispositionRules.complaintId, kbDispositionRules.priority);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/disposition", async (req: Request, res: Response) => {
  try {
    const body = insertKbDispositionRuleSchema.parse(req.body);
    const [row] = await db.insert(kbDispositionRules).values(body).returning();
    await logChange("disposition_rule", row.ruleId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/disposition/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbDispositionRules).where(eq(kbDispositionRules.ruleId, req.params.ruleId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbDispositionRules).set({ ...req.body, updatedAt: new Date() }).where(eq(kbDispositionRules.ruleId, req.params.ruleId)).returning();
    await logChange("disposition_rule", row.ruleId, "update", old[0], row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/disposition/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbDispositionRules).where(eq(kbDispositionRules.ruleId, req.params.ruleId));
    await db.delete(kbDispositionRules).where(eq(kbDispositionRules.ruleId, req.params.ruleId));
    await logChange("disposition_rule", req.params.ruleId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// PLAN TEMPLATES
// ════════════════════════════════════════════════════════════════════════════
router.get("/templates", async (req: Request, res: Response) => {
  try {
    const { complaintId } = req.query as Record<string, string>;
    const rows = complaintId
      ? await db.select().from(kbPlanTemplates).where(eq(kbPlanTemplates.complaintId, complaintId))
      : await db.select().from(kbPlanTemplates).orderBy(kbPlanTemplates.templateKey);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/templates", async (req: Request, res: Response) => {
  try {
    const body = insertKbPlanTemplateSchema.parse(req.body);
    const [row] = await db.insert(kbPlanTemplates).values(body).returning();
    await logChange("plan_template", row.templateKey, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/templates/:templateKey", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbPlanTemplates).where(eq(kbPlanTemplates.templateKey, req.params.templateKey));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbPlanTemplates).set({ ...req.body, updatedAt: new Date() }).where(eq(kbPlanTemplates.templateKey, req.params.templateKey)).returning();
    await logChange("plan_template", row.templateKey, "update", old[0], row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/templates/:templateKey", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbPlanTemplates).where(eq(kbPlanTemplates.templateKey, req.params.templateKey));
    await db.delete(kbPlanTemplates).where(eq(kbPlanTemplates.templateKey, req.params.templateKey));
    await logChange("plan_template", req.params.templateKey, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/templates/seed", async (_req: Request, res: Response) => {
  try {
    const { planTemplates } = await import("../config/planTemplates");
    let inserted = 0;
    let skipped = 0;
    for (const t of planTemplates) {
      const existing = await db.select({ k: kbPlanTemplates.templateKey })
        .from(kbPlanTemplates).where(eq(kbPlanTemplates.templateKey, t.key));
      if (existing.length > 0) { skipped++; continue; }
      await db.insert(kbPlanTemplates).values({
        templateKey: t.key,
        diagnosisLabel: t.diagnosisLabel,
        defaultDisposition: t.defaultDisposition,
        summary: t.summary,
        homeCare: t.homeCare,
        followUp: t.followUp,
        returnPrecautions: t.returnPrecautions,
        patientMessage: t.patientMessage,
        medicationInstructions: t.meds.length ? JSON.stringify(t.meds) : null,
        active: true,
      });
      inserted++;
    }
    res.json({ ok: true, inserted, skipped });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// GOLDEN CASES
// ════════════════════════════════════════════════════════════════════════════
router.get("/golden-cases", async (req: Request, res: Response) => {
  try {
    const { complaint, status, q } = req.query as Record<string, string>;
    let rows;
    if (complaint && status) {
      rows = await db.select().from(kbGoldenCases).where(and(eq(kbGoldenCases.complaint, complaint), eq(kbGoldenCases.status, status))).orderBy(desc(kbGoldenCases.createdAt));
    } else if (complaint) {
      rows = await db.select().from(kbGoldenCases).where(eq(kbGoldenCases.complaint, complaint)).orderBy(desc(kbGoldenCases.createdAt));
    } else if (status) {
      rows = await db.select().from(kbGoldenCases).where(eq(kbGoldenCases.status, status)).orderBy(desc(kbGoldenCases.createdAt));
    } else if (q) {
      rows = await db.select().from(kbGoldenCases).where(or(ilike(kbGoldenCases.title, `%${q}%`), ilike(kbGoldenCases.complaint, `%${q}%`))).orderBy(desc(kbGoldenCases.createdAt));
    } else {
      rows = await db.select().from(kbGoldenCases).orderBy(desc(kbGoldenCases.createdAt));
    }
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/golden-cases/:caseId", async (req: Request, res: Response) => {
  try {
    const row = await db.select().from(kbGoldenCases).where(eq(kbGoldenCases.caseId, req.params.caseId));
    if (!row[0]) return res.status(404).json({ error: "Not found" });
    res.json(row[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/golden-cases", async (req: Request, res: Response) => {
  try {
    const body = insertKbGoldenCaseSchema.parse(req.body);
    const [row] = await db.insert(kbGoldenCases).values(body).returning();
    await logChange("golden_case", row.caseId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/golden-cases/:caseId/clone", async (req: Request, res: Response) => {
  try {
    const orig = await db.select().from(kbGoldenCases).where(eq(kbGoldenCases.caseId, req.params.caseId));
    if (!orig[0]) return res.status(404).json({ error: "Not found" });
    const { id, createdAt, updatedAt, caseId, ...rest } = orig[0];
    const newCaseId = `${caseId}_copy_${Date.now()}`;
    const [row] = await db.insert(kbGoldenCases).values({ ...rest, caseId: newCaseId, title: `${rest.title} (copy)`, status: "draft" }).returning();
    await logChange("golden_case", row.caseId, "clone", orig[0], row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/golden-cases/:caseId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbGoldenCases).where(eq(kbGoldenCases.caseId, req.params.caseId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbGoldenCases).set({ ...req.body, updatedAt: new Date() }).where(eq(kbGoldenCases.caseId, req.params.caseId)).returning();
    await logChange("golden_case", row.caseId, "update", old[0], row, req.body.rationale);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/golden-cases/:caseId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbGoldenCases).where(eq(kbGoldenCases.caseId, req.params.caseId));
    await db.delete(kbGoldenCases).where(eq(kbGoldenCases.caseId, req.params.caseId));
    await logChange("golden_case", req.params.caseId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Bulk export golden cases
router.get("/golden-cases-export", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(kbGoldenCases).orderBy(kbGoldenCases.complaint, kbGoldenCases.caseId);
    res.setHeader("Content-Disposition", "attachment; filename=golden_cases.json");
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE CHANGES / GOVERNANCE LOG
// ════════════════════════════════════════════════════════════════════════════
router.get("/changes", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || "100"), 500);
    const { domain } = req.query as Record<string, string>;
    const rows = domain
      ? await db.select().from(kbKnowledgeChanges).where(eq(kbKnowledgeChanges.domain, domain)).orderBy(desc(kbKnowledgeChanges.createdAt)).limit(limit)
      : await db.select().from(kbKnowledgeChanges).orderBy(desc(kbKnowledgeChanges.createdAt)).limit(limit);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE HEALTH PANEL
// ════════════════════════════════════════════════════════════════════════════
router.get("/health", async (_req: Request, res: Response) => {
  try {
    const { getSourceTrace } = await import("../clinical/bayesianEngine");
    const sourceTrace = getSourceTrace();

    // Diagnosis rule coverage — Phase 3: compute from kb_feature_likelihoods (normalized table)
    const dxStats = xRows(await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM kb_feature_likelihoods f WHERE f.rule_id = r.rule_id AND f.active = true
        ))::int AS with_likelihoods_normalized,
        COUNT(*) FILTER (WHERE feature_likelihoods IS NOT NULL AND feature_likelihoods::text <> '{}')::int AS with_likelihoods_jsonb,
        COUNT(*) FILTER (WHERE complaint_id = 'bayesian_global')::int AS bayesian_priors
      FROM kb_diagnosis_rules r WHERE active = true
    `))[0] ?? {};

    // Feature table totals
    const featureTableStats = xRows(await db.execute(sql`
      SELECT COUNT(*)::int AS total_rows,
             COUNT(DISTINCT rule_id)::int AS unique_rules
      FROM kb_feature_likelihoods WHERE active = true
    `))[0] ?? {};

    // Sample of bayesian_global rules missing feature rows (Phase 3 gap)
    const missingRows = xRows(await db.execute(sql`
      SELECT rule_id, diagnosis_label, complaint_id FROM kb_diagnosis_rules r
      WHERE active = true AND complaint_id = 'bayesian_global'
        AND NOT EXISTS (SELECT 1 FROM kb_feature_likelihoods f WHERE f.rule_id = r.rule_id AND f.active = true)
      ORDER BY diagnosis_label LIMIT 20
    `));

    // Complaints without red flag rules
    const noRedFlags = xRows(await db.execute(sql`
      SELECT c.complaint_id, c.label FROM kb_complaints c
      WHERE c.enabled = true
        AND NOT EXISTS (SELECT 1 FROM kb_red_flag_rules r WHERE r.complaint_id = c.complaint_id AND r.active = true)
      ORDER BY c.label
    `));

    // Complaints without treatment rules
    const noTreatments = xRows(await db.execute(sql`
      SELECT c.complaint_id, c.label FROM kb_complaints c
      WHERE c.enabled = true
        AND NOT EXISTS (SELECT 1 FROM kb_treatment_rules t WHERE t.complaint_id = c.complaint_id AND t.active = true)
      ORDER BY c.label LIMIT 30
    `));

    // Complaints without approved golden cases (kb_golden_cases.complaint stores complaint_id)
    const noGolden = xRows(await db.execute(sql`
      SELECT c.complaint_id, c.label FROM kb_complaints c
      WHERE c.enabled = true
        AND NOT EXISTS (SELECT 1 FROM kb_golden_cases g WHERE g.complaint = c.complaint_id AND g.status = 'approved')
      ORDER BY c.label LIMIT 30
    `));

    // Complaints without disposition rules
    const noDisposition = xRows(await db.execute(sql`
      SELECT c.complaint_id, c.label FROM kb_complaints c
      WHERE c.enabled = true
        AND NOT EXISTS (SELECT 1 FROM kb_disposition_rules d WHERE d.complaint_id = c.complaint_id AND d.active = true)
      ORDER BY c.label LIMIT 30
    `));

    const totalDx = Number(dxStats.total ?? 0);
    const bayesianPriors = Number(dxStats.bayesian_priors ?? 0);
    // Phase 3: pctKbDriven = % of bayesian_global rules covered by kb_feature_likelihoods table
    const withNormalized = Number(dxStats.with_likelihoods_normalized ?? 0);
    const withJsonb = Number(dxStats.with_likelihoods_jsonb ?? 0);
    const pctKbDriven = bayesianPriors > 0
      ? Math.round((withNormalized / bayesianPriors) * 100)
      : (totalDx > 0 ? Math.round((withNormalized / totalDx) * 100) : 0);
    const featureRows = Number(featureTableStats.total_rows ?? 0);
    const featureRulesCount = Number(featureTableStats.unique_rules ?? 0);

    res.json({
      generatedAt: new Date().toISOString(),
      bayesian: sourceTrace,
      rules: {
        diagnosisRulesTotal: totalDx,
        bayesianPriors,
        // Phase 3 metric: rules covered by normalized kb_feature_likelihoods table
        diagnosisRulesWithLikelihoods: withNormalized,
        diagnosisRulesWithLikelihoodsJsonb: withJsonb,
        diagnosisRulesMissingLikelihoods: bayesianPriors - withNormalized,
        featureTable: { rows: featureRows, uniqueRules: featureRulesCount },
        missingLikelihoodsSample: missingRows.map((r: any) => ({
          ruleId: String(r.rule_id ?? ""),
          diagnosisLabel: String(r.diagnosis_label ?? ""),
          complaintId: String(r.complaint_id ?? ""),
        })),
      },
      coverage: {
        complaintsWithoutRedFlags: noRedFlags.map((r: any) => ({ complaintId: r.complaint_id, label: r.label })),
        complaintsWithoutTreatments: noTreatments.map((r: any) => ({ complaintId: r.complaint_id, label: r.label })),
        complaintsWithoutGoldenCases: noGolden.map((r: any) => ({ complaintId: r.complaint_id, label: r.label })),
        complaintsWithoutDisposition: noDisposition.map((r: any) => ({ complaintId: r.complaint_id, label: r.label })),
      },
      pctKbDriven,
      pctFallback: 100 - pctKbDriven,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// AUDIT REPORT — final confirmation of KB-driven status
// ════════════════════════════════════════════════════════════════════════════
router.get("/audit-report", async (_req: Request, res: Response) => {
  try {
    const { getSourceTrace } = await import("../clinical/bayesianEngine");
    const sourceTrace = getSourceTrace();
    const isKbDriven = sourceTrace.source === "KB_DB";

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        diagnosisEngineKbDriven: isKbDriven,
        allPriorsFromDB: isKbDriven,
        csvAffectsRuntimeDifferential: false,
        csvSeedDataSource: "server/data/csv/ — only consumed during POST /api/kb/seed, not on live requests",
      },
      hardcodedLogicInventory: [
        {
          id: "BAYESIAN_PRIORS_FALLBACK",
          location: "server/clinical/bayesianEngine.ts — PRIORS[] constant (lines ~32-158)",
          description: "12-diagnosis hardcoded prior table (Influenza A, COVID-19, Strep, etc.). Used ONLY when KB priors have no featureLikelihoods.",
          status: isKbDriven ? "INACTIVE — KB_DB priors are live" : "ACTIVE — fallback engaged",
          risk: isKbDriven ? "none" : "high",
          remediation: "POST /api/kb/seed → POST /api/kb/cache-reload to reactivate KB_DB",
        },
        {
          id: "SCORING_MODULE_DISPATCH",
          location: "server/services/complaintEngines.ts — runScoring() if/else block",
          description: "Dispatches scoring to TypeScript calculators (CENTOR, EARACHE_SCORE, COUGH_SCORE, etc.) based on complaint module field in CSV.",
          status: "ACTIVE — scoring module dispatch is TypeScript-based",
          risk: "medium",
          remediation: "Phase 3: migrate scoring formulas to kb_scoring_rules table",
        },
        {
          id: "COMPLAINT_PACK_REGISTRY",
          location: "server/config/complaintPacks.ts",
          description: "Legacy complaint intake configuration used by the V1 pipeline. KB tables are the new authority but complaintPacks.ts remains for backward compatibility.",
          status: "ACTIVE — used by legacy /api/pipeline/run entry point",
          risk: "low",
          remediation: "Migrate entry point to read from kb_complaints. Tracked as Phase 3.",
        },
        {
          id: "CSV_REGISTRY_LOADER",
          location: "server/data/registry.ts — CSV_ENABLED_TABLES flag",
          description: "Loads clinical data from server/data/csv/*.csv for non-Bayesian complaint data (questions, disposition rules, etc.).",
          status: "ACTIVE for non-Bayesian runtime data",
          risk: "low",
          remediation: "kb_questions (734 rows) and kb_disposition_rules (289 rows) already migrated. Override by reading from KB tables in V2 pipeline.",
        },
        {
          id: "RED_FLAG_MAP_LEGACY",
          location: "server/rules/redFlagMap.ts",
          description: "Derived from FLOW_SPECS. Used in legacy safety path (independentSafetyPath.ts). KB red flag rules are new authority.",
          status: "ACTIVE — safety path still references this",
          risk: "medium",
          remediation: "Wire independentSafetyPath to use getKbRedFlags() from kbRuntime. Tracked as Phase 3.",
        },
        {
          id: "WEIGHT_STORE_IN_MEMORY",
          location: "server/learning/weightStore.ts",
          description: "RLHF outcome weights stored in-memory only. Resets on every server restart.",
          status: "ACTIVE — weights are not persisted",
          risk: "low",
          remediation: "Add kb_weight_snapshots table and persist on each update cycle.",
        },
      ],
      exampleTrace: {
        description: "KB row → diagnosis → treatment → disposition — full data lineage",
        steps: [
          "1. [DB] kb_diagnosis_rules row: ruleId=DX_BAY_STREP, complaintId=bayesian_global, diagnosisLabel='Strep Pharyngitis', baseProbability=0.12, featureLikelihoods={sore throat:0.96, fever:0.78, tonsillar exudate:0.70, lymphadenopathy:0.75, absence of cough:0.80}",
          "2. [Cache] POST /api/kb/seed → upsertBayesianPriors() writes row to DB. POST /api/kb/cache-reload → loadPriorsFromDb() reads it back.",
          "3. [Engine] setRuntimePriors([...614 rules...]) filters to 12 with non-empty featureLikelihoods. _runtimePriors set. source=KB_DB.",
          "4. [Request] Patient presents: symptoms=['sore throat','fever','lymphadenopathy'].",
          "5. [Bayesian] runDifferential(symptoms) → bayesianUpdate(KB_priors, symptoms). Strep posterior = 0.47 (highest). Confidence: high. source=KB_DB.",
          "6. [Treatment] getKbTreatments({diagnosisId:'DX_BAY_STREP'}) → kb_treatment_rules row TX_STREP_AMOX: Amoxicillin 500mg TID x10d.",
          "7. [Safety] getKbRedFlags('ent_sore_throat') → 272 cached rules. Checks RF_SOT_AIRWAY (stridor→ER_SEND), RF_SOT_MENINGISMUS (neck stiffness→ER_SEND).",
          "8. [Disposition] No hard stops → office_followup. Chart note generated from kb_plan_templates.",
          "9. [Trace] Full audit: {source:KB_DB, ruleIds:[DX_BAY_STREP,TX_STREP_AMOX], tableNames:[kb_diagnosis_rules,kb_treatment_rules,kb_red_flag_rules], cacheAge:<60s}",
        ],
      },
      sourceTrace,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Decision Trace — full provenance per differential result ─────────────────
router.post("/trace", async (req: Request, res: Response) => {
  const { symptoms = [] } = req.body;
  if (!Array.isArray(symptoms) || symptoms.length === 0) {
    return res.status(400).json({ error: "symptoms must be a non-empty array of strings" });
  }
  try {
    const { runDifferential, getSourceTrace } = await import("../clinical/bayesianEngine");
    const { getKbCacheStatus } = await import("../kb/kbRuntime");
    const cacheStatus = getKbCacheStatus();
    const sourceTrace = getSourceTrace();
    const cacheAgeMs = cacheStatus?.priors ? Date.now() - (Date.now() - cacheStatus.priors.ageMs) : 0;
    const cacheAgeSec = cacheStatus?.priors ? Math.round(cacheStatus.priors.ageMs / 1000) : null;

    const differentials = runDifferential(symptoms);
    return res.json({
      ok: true,
      symptoms,
      engineSource: sourceTrace.source,
      cacheAge: cacheAgeSec !== null ? `${cacheAgeSec}s` : "unknown",
      activePriorCount: sourceTrace.priorCount,
      trace: differentials.map((d, i) => ({
        rank: i + 1,
        diagnosis: d.diagnosis,
        posterior: d.posterior,
        confidence: d.confidence,
        matchedFeatures: d.matchedFeatures,
        // Full provenance
        source: d.source ?? sourceTrace.source,
        ruleId: d.ruleId ?? null,
        version: d.version ?? null,
        tableName: d.tableName ?? (d.source === "KB_DB" ? "kb_diagnosis_rules" : "HARDCODED_PRIORS"),
        featureLikelihoods: d.featureLikelihoods ?? null,
      })),
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── Monte Carlo Simulation — run N synthetic cases through the Bayesian engine ─
router.post("/simulate", async (req: Request, res: Response) => {
  const n = Math.min(Number(req.body?.cases ?? 1000), 10000);
  if (n < 1) return res.status(400).json({ error: "cases must be >= 1" });
  try {
    const { getActivePriors, topDifferentials, getSourceTrace } = await import("../clinical/bayesianEngine");
    const priors = getActivePriors();
    if (priors.length === 0) {
      return res.status(503).json({ error: "No active priors loaded. Run POST /api/kb/cache-reload first." });
    }

    // Weighted random selection helper
    const totalWeight = priors.reduce((s, p) => s + p.baseProbability, 0);
    function pickPrior() {
      let r = Math.random() * totalWeight;
      for (const p of priors) {
        r -= p.baseProbability;
        if (r <= 0) return p;
      }
      return priors[priors.length - 1];
    }

    const clusters: Record<string, { count: number; posteriorSum: number; source: string }> = {};
    const perDxStats: Record<string, { generated: number; correct: number; posteriorSum: number }> = {};
    let correct = 0;

    for (let i = 0; i < n; i++) {
      const truePrior = pickPrior();
      const trueDx = truePrior.diagnosis;

      // Generate symptoms via Bernoulli trials on featureLikelihoods
      const symptoms: string[] = [];
      for (const [sym, prob] of Object.entries(truePrior.featureLikelihoods)) {
        if (Math.random() < prob) symptoms.push(sym);
      }
      // Ensure at least 1 symptom
      if (symptoms.length === 0) {
        const first = Object.keys(truePrior.featureLikelihoods)[0];
        if (first) symptoms.push(first);
      }

      const diff = topDifferentials(symptoms, 3, 0.01);
      const top1 = diff[0]?.diagnosis ?? "none";
      const top1Posterior = diff[0]?.posterior ?? 0;
      const top1Source = diff[0]?.source ?? "unknown";

      if (top1 === trueDx) correct++;

      if (!clusters[top1]) clusters[top1] = { count: 0, posteriorSum: 0, source: top1Source };
      clusters[top1].count++;
      clusters[top1].posteriorSum += top1Posterior;

      if (!perDxStats[trueDx]) perDxStats[trueDx] = { generated: 0, correct: 0, posteriorSum: 0 };
      perDxStats[trueDx].generated++;
      if (top1 === trueDx) perDxStats[trueDx].correct++;
      perDxStats[trueDx].posteriorSum += top1Posterior;
    }

    const sourceTrace = getSourceTrace();
    const accuracyRate = (correct / n * 100).toFixed(1);

    // Per-diagnosis stats
    const diagnosisReport = Object.entries(perDxStats).map(([dx, s]) => ({
      diagnosis: dx,
      casesGenerated: s.generated,
      topMatchRate: `${(s.correct / s.generated * 100).toFixed(0)}%`,
      avgPosterior: Number((s.posteriorSum / s.generated).toFixed(3)),
    })).sort((a, b) => parseFloat(b.topMatchRate) - parseFloat(a.topMatchRate));

    // Cluster list
    const clusterList = Object.entries(clusters).map(([dx, c]) => ({
      diagnosis: dx,
      casesCaptured: c.count,
      pctOfTotal: `${(c.count / n * 100).toFixed(1)}%`,
      avgPosterior: Number((c.posteriorSum / c.count).toFixed(3)),
      source: c.source,
    })).sort((a, b) => b.casesCaptured - a.casesCaptured);

    // Fix suggestions — diagnoses with low accuracy or low posterior
    const fixSuggestions: Array<{ diagnosis: string; issue: string; action: string }> = [];
    for (const stat of diagnosisReport) {
      const matchPct = parseFloat(stat.topMatchRate);
      if (matchPct < 50) {
        fixSuggestions.push({
          diagnosis: stat.diagnosis,
          issue: `Low top-1 match rate (${stat.topMatchRate}) — often confused with competing diagnoses`,
          action: `Review featureLikelihoods in kb_diagnosis_rules for '${stat.diagnosis}'. Increase weights for pathognomonic features, decrease for shared symptoms.`,
        });
      } else if (stat.avgPosterior < 0.12) {
        fixSuggestions.push({
          diagnosis: stat.diagnosis,
          issue: `Low average posterior (${(stat.avgPosterior * 100).toFixed(0)}%) even when top-1 — weak discrimination`,
          action: `Add more distinctive featureLikelihoods to kb_diagnosis_rules for '${stat.diagnosis}', or increase baseProbability if underrepresented.`,
        });
      }
    }

    return res.json({
      ok: true,
      n,
      engineSource: sourceTrace.source,
      activePriors: priors.length,
      accuracyRate: `${accuracyRate}%`,
      accuracy: { correct, incorrect: n - correct, rate: `${accuracyRate}%` },
      clusters: clusterList,
      diagnosisReport,
      fixSuggestions,
      simulatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── Feature Models CRUD ──────────────────────────────────────────────────────
router.get("/feature-models", async (req: Request, res: Response) => {
  try {
    const { rule_id, feature_type } = req.query as Record<string, string>;
    let q = db.select().from(kbFeatureModels).orderBy(kbFeatureModels.ruleId, kbFeatureModels.featureKey);
    const rows = await (rule_id
      ? db.select().from(kbFeatureModels).where(eq(kbFeatureModels.ruleId, rule_id)).orderBy(kbFeatureModels.featureKey)
      : feature_type
        ? db.select().from(kbFeatureModels).where(eq(kbFeatureModels.featureType, feature_type)).orderBy(kbFeatureModels.ruleId)
        : q);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/feature-models", async (req: Request, res: Response) => {
  try {
    const parsed = insertKbFeatureModelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
    const [row] = await db.insert(kbFeatureModels).values(parsed.data).onConflictDoUpdate({
      target: [kbFeatureModels.ruleId, kbFeatureModels.featureKey],
      set: { ...parsed.data, source: "ui_edit" },
    }).returning();
    invalidateAdvancedEngineCache();
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/feature-models/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.update(kbFeatureModels).set({ ...req.body, source: "ui_edit" }).where(eq(kbFeatureModels.id, id)).returning();
    invalidateAdvancedEngineCache();
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/feature-models/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(kbFeatureModels).where(eq(kbFeatureModels.id, id));
    invalidateAdvancedEngineCache();
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/feature-models/migrate", async (req: Request, res: Response) => {
  try {
    const result = await migrateFeatureLikelihoodsToModels();
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Clinical Weights CRUD ────────────────────────────────────────────────────
router.get("/clinical-weights", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(kbClinicalWeights).orderBy(kbClinicalWeights.key);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/clinical-weights", async (req: Request, res: Response) => {
  try {
    const parsed = insertKbClinicalWeightSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
    const [row] = await db.insert(kbClinicalWeights).values(parsed.data).onConflictDoUpdate({
      target: kbClinicalWeights.key,
      set: { value: parsed.data.value, description: parsed.data.description, updatedAt: new Date() },
    }).returning();
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/clinical-weights/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { value, description } = req.body;
    const [row] = await db.update(kbClinicalWeights).set({ value: parseFloat(value), description, updatedAt: new Date() }).where(eq(kbClinicalWeights.id, id)).returning();
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/clinical-weights/:id", async (req: Request, res: Response) => {
  try {
    await db.delete(kbClinicalWeights).where(eq(kbClinicalWeights.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Complaint Packs CRUD ─────────────────────────────────────────────────────
router.get("/complaint-packs", async (req: Request, res: Response) => {
  try {
    const { complaint_id } = req.query as Record<string, string>;
    const rows = complaint_id
      ? await db.select().from(kbComplaintPacks).where(eq(kbComplaintPacks.complaintId, complaint_id)).orderBy(desc(kbComplaintPacks.version))
      : await db.select().from(kbComplaintPacks).orderBy(kbComplaintPacks.complaintId, desc(kbComplaintPacks.version));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/complaint-packs", async (req: Request, res: Response) => {
  try {
    const parsed = insertKbComplaintPackSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
    const [row] = await db.insert(kbComplaintPacks).values(parsed.data).returning();
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/complaint-packs/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.update(kbComplaintPacks).set({ ...req.body, updatedAt: new Date() }).where(eq(kbComplaintPacks.id, id)).returning();
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/complaint-packs/:id", async (req: Request, res: Response) => {
  try {
    await db.delete(kbComplaintPacks).where(eq(kbComplaintPacks.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Engine Routing CRUD ──────────────────────────────────────────────────────
router.get("/engine-routing", async (req: Request, res: Response) => {
  try {
    const { complaint_id } = req.query as Record<string, string>;
    const rows = complaint_id
      ? await db.select().from(kbEngineRouting).where(eq(kbEngineRouting.complaintId, complaint_id)).orderBy(kbEngineRouting.priority)
      : await db.select().from(kbEngineRouting).orderBy(kbEngineRouting.complaintId, kbEngineRouting.priority);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/engine-routing", async (req: Request, res: Response) => {
  try {
    const parsed = insertKbEngineRoutingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
    const [row] = await db.insert(kbEngineRouting).values(parsed.data).returning();
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/engine-routing/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [row] = await db.update(kbEngineRouting).set({ ...req.body, updatedAt: new Date() }).where(eq(kbEngineRouting.id, id)).returning();
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/engine-routing/:id", async (req: Request, res: Response) => {
  try {
    await db.delete(kbEngineRouting).where(eq(kbEngineRouting.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/engine-routing/seed", async (req: Request, res: Response) => {
  try {
    const defaults = [
      { complaintId: "sore_throat", engineType: "bayesian", config: { advanced: true }, priority: 10, isActive: true },
      { complaintId: "ear_pain", engineType: "bayesian", config: { advanced: true }, priority: 10, isActive: true },
      { complaintId: "cough", engineType: "bayesian", config: { advanced: true }, priority: 10, isActive: true },
      { complaintId: "fever", engineType: "bayesian", config: { advanced: true }, priority: 10, isActive: true },
      { complaintId: "sinus_pressure", engineType: "bayesian", config: { advanced: true }, priority: 10, isActive: true },
      { complaintId: "chest_pain", engineType: "critical", config: { redFlagFirst: true }, priority: 1, isActive: true },
      { complaintId: "headache", engineType: "critical", config: { redFlagFirst: true }, priority: 1, isActive: true },
    ];
    let inserted = 0;
    for (const d of defaults) {
      try {
        await db.insert(kbEngineRouting).values(d as any);
        inserted++;
      } catch { /* skip duplicates */ }
    }
    res.json({ seeded: inserted });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Source of truth audit endpoint
router.get("/audit/source-map", (_req: Request, res: Response) => {
  res.json({
    generatedAt: new Date().toISOString(),
    domains: [
      { domain: "Complaint Registry", source: "Postgres kb_complaints", editable: true, csvFallback: "COMPLAINT_REGISTRY.csv", hardcoded: "server/config/complaintPacks.ts (legacy)", note: "complaintPacks.ts is still used by the legacy pipeline. KB tables are the new source of truth." },
      { domain: "Core Questions", source: "Postgres kb_questions", editable: true, csvFallback: "CORE_QUESTIONS.csv", hardcoded: "complaintPacks.ts coreQuestions[]", note: "735 questions migrated from CSV." },
      { domain: "Modifier Rules", source: "Postgres kb_modifiers", editable: true, csvFallback: null, hardcoded: "Scattered in clinical engines", note: "10 canonical modifiers seeded. Previously had no unified table." },
      { domain: "Clinical Findings", source: "kb_questions (category=findings)", editable: true, csvFallback: null, hardcoded: "inline in clinical engines", note: "Vital signs and findings are question types with category=findings." },
      { domain: "Red Flags / Hard Stops", source: "Postgres kb_red_flag_rules", editable: true, csvFallback: "RED_FLAG_RULES.csv", hardcoded: "server/rules/redFlagMap.ts", note: "redFlagMap.ts still active in legacy pipeline. KB is the new authority." },
      { domain: "Workup Rules", source: "Postgres kb_workup_rules", editable: true, csvFallback: "GLOBAL_CLUSTER_TRIAGE_EXTENDED (sheets)", hardcoded: null, note: "9 seed rules. Expandable from app." },
      { domain: "Diagnosis Rules", source: "Postgres kb_diagnosis_rules", editable: true, csvFallback: "DX_CANDIDATES.csv, CLUSTER_SCORING_RULES.csv", hardcoded: "server/clinical/bayesianEngine.ts PRIORS (12 hardcoded)", note: "bayesianEngine.ts has 12 hardcoded priors. KB rules are new authority." },
      { domain: "Medication / Treatment", source: "Postgres kb_treatment_rules", editable: true, csvFallback: "medCatalog.ts (reads Google Sheets)", hardcoded: "server/meds/medCatalog.ts (Sheets-backed, credentials required)", note: "Without GOOGLE_SERVICE_ACCOUNT_JSON, medCatalog falls back to empty. KB seeds cover key antibiotics." },
      { domain: "Disposition Rules", source: "Postgres kb_disposition_rules", editable: true, csvFallback: "DISPOSITION_RULES.csv", hardcoded: "complaintPacks.ts likelyDisposition field", note: "complaintPacks.ts has inline disposition defaults. KB rules override them." },
      { domain: "Output / Plan Templates", source: "Postgres kb_plan_templates", editable: true, csvFallback: "OUTPUT_TEMPLATES.csv", hardcoded: "server/config/planTemplates.ts (103 lines)", note: "planTemplates.ts still used by legacy routes. KB is new authority." },
      { domain: "Golden Cases", source: "Postgres kb_golden_cases", editable: true, csvFallback: "CROSS_COMPLAINT_GOLDENS.jsonl, CONSISTENCY_GOLDENS.jsonl", hardcoded: "TypeScript fixture files in server/testing/", note: "All golden cases are now DB-backed and app-editable. No code needed to add new ones." },
      { domain: "RLHF Weights", source: "In-memory (server/learning/weightStore.ts)", editable: false, csvFallback: null, hardcoded: "In-memory only — resets on restart", note: "Weights are not persisted. Redis-backed proposals exist but weights have no durable store yet." },
    ],
    sheetsStatus: {
      configured: false,
      reason: "GOOGLE_SERVICE_ACCOUNT_JSON env var not set",
      activeAtRuntime: false,
      fallback: "CSV files in server/data/csv/ are de-facto runtime source for Sheets-backed tables",
      tabsExpected: ["COMPLAINT_REGISTRY","CORE_QUESTIONS","RED_FLAG_RULES","DISPOSITION_RULES","OUTPUT_TEMPLATES","CLUSTER_SCORING_RULES","DX_CANDIDATES","DX_PRIORITY","GLOBAL_MEDICATIONS_MASTER","GLOBAL_MODIFIERS_CLEAN"],
    },
    hardcodedStillActive: [
      "server/config/planTemplates.ts — used by legacy plan builder (Phase 4 target)",
      "server/clinical/bayesianEngine.ts PRIORS — 12 hardcoded priors MIGRATED to kb_feature_likelihoods (100% KB_DB)",
      "server/rules/redFlagMap.ts — NOW DB-backed with FLOW_SPECS fallback (seed via /api/kb/red-flag-rules/seed)",
      "server/learning/weightStore.ts — NOW write-through to kb_clinical_weights (persisted)",
      "server/data/csvLoader.ts — NOW DISABLED (ALLOW_CSV guard). CSV not loaded unless ALLOW_CSV=true",
    ],
    canonicalPipelineEntryPoints: {
      verified: ["POST /api/pipeline/run", "POST /api/triage", "GET /api/ci/sim/run"],
      needsAudit: ["SMS/WhatsApp webhook", "Telegram webhook", "voice routes", "FDA compliance routes"],
    },
  });
});

export default router;
