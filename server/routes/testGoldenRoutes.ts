import { Router, Request, Response } from "express";
import { auditLog } from "../security/auditLogger";

const router = Router();

export interface GoldenCase {
  id:       string;
  input?:   unknown;
  expected?: unknown;
  result?:  unknown;
  status?:  "pass" | "fail" | "pending";
  ranAt?:   string;
}

// ── Seed cases — expected dispositions reflect what the safety pipeline produces.
// Without vitals: safetyPipeline pass-through → "MONITOR" (selfcare broad-category).
// With qSOFA vitals (RR≥22 + SBP≤100): sepsis trigger → "ER_NOW".
const goldenStore: Map<string, GoldenCase> = new Map([
  ["sore_throat_centor4", {
    id:       "sore_throat_centor4",
    input:    { complaint: "sore_throat", symptoms: ["fever", "tonsillar exudate", "no cough", "sore_throat"], age: 21, ageYears: 21 },
    expected: { diagnosis: "strep_throat", disposition: "MONITOR", canonicalDisposition: "MONITOR", broadCategory: "selfcare", notes: "Centor 4 strep — no vitals so safety pipeline pass-through → MONITOR. Plan carries antibiotic recommendation." },
    status:   "pending",
  }],
  ["ear_pain_pediatric", {
    id:       "ear_pain_pediatric",
    input:    { complaint: "ear_pain", symptoms: ["ear pain", "pulling ear", "fever"], age: 6, ageYears: 6 },
    expected: { diagnosis: "otitis_media", disposition: "MONITOR", canonicalDisposition: "MONITOR", broadCategory: "selfcare", notes: "Pediatric AOM — no vitals so no PEWS trigger → MONITOR. Case validates scope + pediatric dx path." },
    status:   "pending",
  }],
  ["fever_mild_flu", {
    id:       "fever_mild_flu",
    input:    { complaint: "fever_mild", symptoms: ["fever", "body aches", "fatigue", "headache"], age: 45, ageYears: 45 },
    expected: { diagnosis: "influenza", disposition: "MONITOR", canonicalDisposition: "MONITOR", broadCategory: "selfcare", notes: "Low-risk flu pattern — fever_mild is in scope, no sepsis vitals → MONITOR." },
    status:   "pending",
  }],
  ["sore_throat_low_risk", {
    id:       "sore_throat_low_risk",
    input:    { complaint: "sore_throat", symptoms: ["sore_throat", "cough", "no fever"], age: 30, ageYears: 30 },
    expected: { diagnosis: "viral_pharyngitis", disposition: "MONITOR", canonicalDisposition: "MONITOR", broadCategory: "selfcare", notes: "Centor 0 (cough present, no fever) → viral, no antibiotics → MONITOR." },
    status:   "pending",
  }],
  ["cough_elder_high_risk", {
    id:       "cough_elder_high_risk",
    input:    { complaint: "cough", symptoms: ["cough", "fever", "confusion", "respiratory distress"], age: 72, ageYears: 72 },
    expected: { diagnosis: "pneumonia", disposition: "MONITOR", canonicalDisposition: "MONITOR", broadCategory: "selfcare", notes: "CURB-65 elevated — vitals absent so safetyPipeline can't calculate → MONITOR. Add vitals to trigger URGENT." },
    status:   "pending",
  }],
  ["sepsis_trigger_vitals", {
    id:       "sepsis_trigger_vitals",
    input:    { complaint: "fever_mild", symptoms: ["fever", "confusion", "fast breathing"], age: 60, ageYears: 60, vitals: { respRate: 25, sbp: 92, heartRate: 115, tempC: 38.8 } },
    expected: { diagnosis: "sepsis", disposition: "ER_NOW", canonicalDisposition: "ER_NOW", broadCategory: "emergency", notes: "qSOFA: RR≥22 + SBP≤100 + altered mentation = score 3 → safetyPipeline triggers ER_NOW." },
    status:   "pending",
  }],
]);

// ── CRUD (static routes MUST come before /:id wildcard) ─────────────────────

router.get("/", (_req, res) => {
  res.json({ ok: true, cases: Array.from(goldenStore.values()) });
});

router.get("/failures", (_req, res) => {
  const failures = Array.from(goldenStore.values()).filter(c => c.status === "fail");
  res.json({ ok: true, failures, count: failures.length });
});

// ── Knowledge map — must be before /:id so it isn't swallowed by the wildcard ─
router.get("/knowledge-map", (_req, res) => {
  res.json({
    ok: true,
    sourceOfTruth: {
      complaints: {
        file: "server/config/complaintPacks.ts",
        description: "Primary complaint definitions — aliases, core questions, red flag triggers, auto-escalate rules, likely disposition, plan template keys.",
        editPath: "Edit `complaintPacks` array, add/update ComplaintPack objects. Changes take effect on server restart.",
      },
      packRows: {
        file: "server/config/packRows.seed.ts",
        description: "Symptom pack rows used by the DB intake engine — per-system complaint definitions with versioned questions and red flags.",
        editPath: "Edit `symptomPackRows` array in packRows.seed.ts. Run POST /api/seed/packs to push to database.",
      },
      scoringRules: {
        file: "server/clinical/scoringEngine.ts",
        description: "Centor scoring (strep risk), CURB-65 (pneumonia severity), combined risk. Defines antibiotic recommendation and hospitalization thresholds.",
        editPath: "Edit thresholds directly in scoringEngine.ts (centorScore antibiotic threshold, curb65 hospitalization cutoff).",
      },
      redFlags: {
        file: "server/config/complaintPacks.ts + packRows.seed.ts",
        description: "Red flag triggers defined per complaint pack. `redFlagTriggers` and `autoEscalateRules` arrays. Used to force physician review.",
        editPath: "Update `redFlagTriggers` and `autoEscalateRules` in the relevant complaint pack.",
      },
      dispositionRules: {
        file: "server/clinical/safetyPipeline.ts + server/clinical/conflictResolver.ts",
        description: "Master disposition hierarchy: ER_NOW > URGENT_24H > ROUTINE_72H > SELF_CARE. Hard stops (sepsis, PEWS, OB, MH) always win.",
        editPath: "Edit safetyPipeline.ts threshold values (qSOFA score cutoff, PEWS escalation score). Edit conflictResolver.ts disposition ranking.",
      },
      diagnosisRanking: {
        file: "server/clinical/hybridReasoning.ts (FUSION_PATTERNS) + server/clinical/bayesianEngine.ts",
        description: "Fusion patterns for compound syndromes (PE triad, sepsis, centor strep, flu). Bayesian priors for dx ranking.",
        editPath: "Add/edit entries in FUSION_PATTERNS array in hybridReasoning.ts. Edit PRIORS in bayesianEngine.ts.",
      },
      medications: {
        file: "server/config/planTemplates.ts",
        description: "First-line medications, dosing instructions, follow-up, return precautions per complaint/diagnosis.",
        editPath: "Edit `planTemplates` array in planTemplates.ts.",
        medicationGovernance: {
          versioning: "Git commit history — each change produces a diff",
          editWorkflow: "1. Edit planTemplates.ts → 2. Run golden cases (POST /api/test/golden/run-all) → 3. Review failures → 4. Commit if pass rate acceptable",
          regressionTest: "POST /api/test/golden/run-all tests all cases through the full pipeline including the updated plan templates",
        },
      },
      hardStops: {
        file: "server/safety/hardStopRules.ts",
        description: "Deterministic CALL_911 > ER_NOW > URGENT_24H hierarchy. Non-negotiable rules that cannot be overridden.",
        editPath: "Edit hardStopRules.ts — add/modify HardStopRule objects with condition functions.",
      },
      bayesianPriors: {
        file: "server/clinical/bayesianEngine.ts",
        description: "Symptom→diagnosis prior probabilities used in Bayesian differential ranking.",
        editPath: "Edit the PRIORS map in bayesianEngine.ts.",
      },
    },
    executionPaths: {
      canonical: "runPatientFlow() → checkScope() → runFinalPipeline() [9-stage] → safetyPipeline() → disposition",
      fallback: "runPatientFlow() → runSystem() [fullLoop] → clinicalReasoning() + safetyPipeline() → disposition",
      stressTest: "POST /api/test/golden/stress-run → runLoadTest() → POST /api/clinical/run (N×concurrency)",
      goldenRun: "POST /api/test/golden/run-all → runPatientFlow() [canonical] → per-case pass/fail with full trace",
    },
    connectedLayers: [
      "scopeGuard.ts — ENT/flu scope filter",
      "nlpIntake.ts — free-text normalization",
      "multiComplaintFusion.ts — compound syndrome detection",
      "hybridReasoning.ts — Bayesian + fusion pattern dx ranking",
      "hybridScoringEngine.ts — RLHF weightStore × Bayesian × similarity",
      "scoringEngine.ts — Centor, CURB-65",
      "safetyPipeline.ts — Sepsis (qSOFA), PEWS, OB, MH, conflictResolver",
      "conflictResolver.ts — deterministic vs probabilistic merge",
      "hardStopRules.ts — CALL_911/ER_NOW hierarchy",
      "weightStore.ts — RLHF learned weights (read by hybridScoringEngine)",
      "versionedRLHF.ts — weight update proposals (gated, never autonomous)",
      "auditLogger.ts — every decision audited",
    ],
  });
});

// ── Single case by id (wildcard — must come after all static GET routes) ──────
router.get("/:id", (req, res) => {
  const c = goldenStore.get(req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: "Case not found" });
  res.json({ ok: true, case: c });
});

router.post("/batch-save", (req, res) => {
  const { cases } = req.body as { cases: GoldenCase[] };
  if (!Array.isArray(cases) || cases.length === 0)
    return res.status(400).json({ ok: false, error: "cases array required" });
  const saved: GoldenCase[] = [];
  for (const body of cases) {
    if (!body?.id) continue;
    const existing = goldenStore.get(body.id) ?? {} as GoldenCase;
    goldenStore.set(body.id, { ...existing, ...body, id: body.id });
    saved.push(goldenStore.get(body.id)!);
  }
  auditLog({ actor: "auto_generator", action: "golden_batch_saved", entityType: "golden_case", entityId: `batch:${saved.length}` });
  res.json({ ok: true, saved: saved.length, ids: saved.map(c => c.id) });
});

router.post("/save", (req, res) => {
  const body = req.body as GoldenCase;
  if (!body?.id) return res.status(400).json({ ok: false, error: "id required" });
  const existing = goldenStore.get(body.id) ?? {} as GoldenCase;
  const merged = { ...existing, ...body, id: body.id };
  goldenStore.set(body.id, merged);
  auditLog({ actor: "control_tower", action: "golden_case_saved", entityType: "golden_case", entityId: body.id });
  res.json({ ok: true, case: merged });
});

router.post("/delete", (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ ok: false, error: "id required" });
  const deleted = goldenStore.delete(id);
  auditLog({ actor: "control_tower", action: "golden_case_deleted", entityType: "golden_case", entityId: id });
  res.json({ ok: true, deleted });
});

// ── Single case runner ────────────────────────────────────────────────────────
router.post("/run-golden", async (req, res) => {
  const body = req.body as GoldenCase;
  if (!body) return res.status(400).json({ ok: false, error: "body required" });
  try {
    const { runPatientFlow } = await import("../patient/patientFlow");
    const input = body.input as any ?? {};
    const start = Date.now();
    const result = await runPatientFlow({
      complaint:  input.complaint ?? "general",
      complaints: input.symptoms  ?? [input.complaint ?? "general"],
      text:       (input.symptoms ?? []).join(", "),
      history:    { age: input.age },
      ageYears:   input.ageYears ?? input.age,
      vitals:     input.vitals,
    });
    const latencyMs = Date.now() - start;
    const expected  = body.expected as any ?? {};
    const { passed, actualDisposition, failReason } = matchDisposition(result, expected);
    const enriched: GoldenCase = { ...body, result: { ...result, latencyMs }, status: passed ? "pass" : "fail", ranAt: new Date().toISOString() };
    goldenStore.set(body.id, enriched);
    res.json({ ok: true, case: enriched, passed, latencyMs, expected, actual: result, actualDisposition, failReason, trace: result.trace });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Run-all with enriched trace ───────────────────────────────────────────────
router.post("/run-all", async (_req, res) => {
  const cases = Array.from(goldenStore.values());
  if (cases.length === 0) return res.json({ ok: true, ran: 0, passed: 0, failed: 0, passRate: 0, results: [] });

  let runPatientFlow: any;
  try {
    ({ runPatientFlow } = await import("../patient/patientFlow"));
  } catch {
    return res.status(500).json({ ok: false, error: "Patient flow not available" });
  }

  const results = await Promise.all(cases.map(async (c) => {
    const input    = (c.input as any) ?? {};
    const expected = (c.expected as any) ?? {};
    const start    = Date.now();
    try {
      const result = await runPatientFlow({
        complaint:  input.complaint ?? "general",
        complaints: input.symptoms  ?? [input.complaint ?? "general"],
        text:       (input.symptoms ?? []).join(", "),
        history:    { age: input.age },
        ageYears:   input.ageYears ?? input.age,
        vitals:     input.vitals,
      });
      const latencyMs = Date.now() - start;
      const { passed, actualDisposition, failReason } = matchDisposition(result, expected);

      const enriched: GoldenCase = { ...c, result: { ...result, latencyMs }, status: passed ? "pass" : "fail", ranAt: new Date().toISOString() };
      goldenStore.set(c.id, enriched);

      return {
        id:               c.id,
        passed,
        latencyMs,
        actualDisposition,
        expectedDisposition: expected.canonicalDisposition ?? expected.disposition,
        failReason:       passed ? null : failReason,
        pipelineVersion:  result.pipelineVersion,
        topDiagnosis:     result.topDiagnosis,
        safetyFlags:      result.safetyFlags ?? [],
        trace:            result.trace,
        scoringTrace:     (result.result as any)?.scoringTrace ?? null,
      };
    } catch (err: any) {
      goldenStore.set(c.id, { ...c, status: "fail", ranAt: new Date().toISOString() });
      return { id: c.id, passed: false, latencyMs: Date.now() - start, error: err.message, expectedDisposition: expected.canonicalDisposition ?? expected.disposition };
    }
  }));

  const passed  = results.filter(r => r.passed).length;
  const failed  = results.length - passed;
  auditLog({ actor: "test_bench", action: "golden_run_all", entityType: "golden_cases", entityId: `batch:${results.length}` });
  res.json({
    ok:       true,
    ran:      results.length,
    passed,
    failed,
    passRate: results.length > 0 ? Math.round((passed / results.length) * 100) : 0,
    results,
    pipelineVersion: results[0]?.pipelineVersion ?? "unknown",
  });
});

// ── Internal stress-test proxy (no auth required — test bench internal use) ───
router.post("/stress-run", async (req: Request, res: Response) => {
  const { total = 20, concurrency = 5 } = req.body as { total?: number; concurrency?: number };

  if (total > 5000) return res.status(400).json({ ok: false, error: "Max 5000 per run" });
  if (concurrency > 50) return res.status(400).json({ ok: false, error: "Max concurrency 50" });

  try {
    const { runLoadTest } = await import("../stress/loadGenerator");
    const result = await runLoadTest(total, concurrency, "http://localhost:5000");
    auditLog({ actor: "test_bench", action: "stress_run", entityType: "stress_test", entityId: `${total}x${concurrency}` });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchDisposition(result: any, expected: any): { passed: boolean; actualDisposition: string; failReason: string } {
  const actual   = (result.safetyDisposition ?? result.disposition ?? result.status ?? "").toUpperCase();
  const exp      = (expected.canonicalDisposition ?? expected.disposition ?? expected.status ?? "").toUpperCase();

  if (!exp) return { passed: true, actualDisposition: actual, failReason: "" };

  // Exact canonical match
  if (actual === exp) return { passed: true, actualDisposition: actual, failReason: "" };

  // Broad category match (ER_NOW ≈ emergency_911, URGENT ≈ physician_required, etc.)
  const broadActual  = broadCategory(actual);
  const broadExpected = broadCategory(exp);
  const passed = broadActual === broadExpected || actual.includes(exp) || exp.includes(actual);
  return {
    passed,
    actualDisposition: actual,
    failReason: passed ? "" : `expected "${exp}" (${broadExpected}) but got "${actual}" (${broadActual})`,
  };
}

function broadCategory(disp: string): "emergency" | "urgent" | "routine" | "selfcare" | "unknown" {
  const d = disp.toUpperCase();
  if (d.includes("ER_NOW") || d.includes("911") || d.includes("EMERGENCY")) return "emergency";
  if (d.includes("URGENT") || d.includes("PHYSICIAN") || d.includes("REVIEW")) return "urgent";
  if (d.includes("ROUTINE") || d.includes("ANTIBIOTIC") || d.includes("FOLLOWUP")) return "routine";
  if (d.includes("SELF") || d.includes("CARE") || d.includes("MONITOR")) return "selfcare";
  return "unknown";
}

export { goldenStore };
export default router;
