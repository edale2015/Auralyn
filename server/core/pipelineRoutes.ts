import { Router } from "express";
import { runFullPipeline } from "./masterClinicalPipeline";
import { isForcedEscalation } from "../safety/globalSafety";
import { runAllTests, STANDARD_TEST_CASES } from "../test/testHarness";
import { saveCase } from "../db/caseRepository";
import { analyzeFailure, applyFix } from "../ai/autoDebugger";
import { recordSREEvent } from "../sre/slaEngine";

const router = Router();

router.post("/run", async (req, res) => {
  const {
    caseId,
    patientId,
    complaint,
    symptoms,
    age,
    zip,
    source,
    vitals,
    answers,
  } = req.body;

  if (!complaint || !Array.isArray(symptoms)) {
    return res
      .status(400)
      .json({ ok: false, error: "complaint and symptoms[] are required" });
  }

  const id = caseId ?? `case-${Date.now()}`;

  try {
    const result = await runFullPipeline({
      caseId: id,
      patientId: patientId ?? `pt-${Date.now()}`,
      complaint,
      symptoms,
      age,
      zip,
      source,
      vitals,
      answers,
    });

    if (!("escalated" in result && result.escalated)) {
      const pipelineResult = result as any;
      saveCase({
        caseId: id,
        complaint,
        diagnosis: pipelineResult.disposition ?? complaint,
        riskScore: pipelineResult.systemRisk ?? null,
        physician: pipelineResult.physician ?? null,
        price: pipelineResult.price ?? null,
        billingCode: pipelineResult.billingCode ?? null,
        disposition: pipelineResult.disposition ?? null,
        malpracticeRisk: pipelineResult.malpracticeRisk ?? null,
      }).catch((e: Error) => console.error("[Pipeline] saveCase failed:", e.message));
    }

    recordSREEvent(true);
    return res.json({ ok: true, result });
  } catch (e: any) {
    recordSREEvent(false);
    if (isForcedEscalation(e)) {
      return res.status(200).json({ ok: true, result: { escalated: true, reason: e.reason } });
    }
    const analysis = await analyzeFailure(e, { caseId: req.body?.caseId });
    await applyFix(analysis.suggestedFix, { caseId: req.body?.caseId });
    console.error("[Pipeline] Unhandled error:", e?.message, "| fix:", analysis.suggestedFix.type);
    return res.status(500).json({ ok: false, error: e?.message ?? "Internal error", suggestedFix: analysis.suggestedFix.type });
  }
});

router.post("/test", async (_req, res) => {
  try {
    const report = await runAllTests(STANDARD_TEST_CASES);
    return res.json({ ok: true, report });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

router.get("/status", (_req, res) => {
  res.json({
    ok: true,
    pipeline: "master_clinical_pipeline",
    version: "1.0.0",
    modules: [
      "case_memory",
      "system_risk",
      "malpractice_risk",
      "global_safety_kill_switch",
      "physician_routing",
      "dynamic_pricing",
      "billing_optimization",
      "funnel_tracking",
      "cfr11_audit",
    ],
    principles: [
      "no_fake_success",
      "no_local_only_state",
      "no_silent_risk",
      "no_fire_and_forget",
      "no_blind_automation",
      "no_isolated_brains",
    ],
  });
});

export default router;
