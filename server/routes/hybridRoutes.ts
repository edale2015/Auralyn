import { Router, Request, Response } from "express";
import { evaluateCase, getHybridEngineStats, updateProbabilisticFromOutcome } from "../hybrid-reasoning/hybridController";
import { loadDataset, getDatasetStats, generateDataset, ADVERSARIAL_CASES } from "../hybrid-reasoning/clinicalDataset";
import { runSafetyCheck, getAllRedFlags } from "../hybrid-reasoning/safetyLayer";
import { addTimelineEvent, getCaseProgression, getAllTimelines } from "../hybrid-reasoning/symptomTimeline";
import { recordPrediction, getCalibrationReport, recordDriftSnapshot, getDriftReport } from "../hybrid-reasoning/calibrationChecker";
import { recordOverride, getOverrideStats } from "../hybrid-reasoning/overrideLearning";
import { runExtractionConfidence } from "../hybrid-reasoning/extractionConfidence";
import { getLockedRegistry, checkLockedRules, verifyRuleIntegrity } from "../hybrid-reasoning/lockedSafetyRegistry";
import { recordOutcomeFeedback, getOutcomeFeedbackStats, getRecentFeedbacks } from "../hybrid-reasoning/outcomeFeedback";
import * as fs from "fs/promises";
import * as path from "path";

const router = Router();

router.post("/evaluate", async (req: Request, res: Response) => {
  try {
    const { complaint, features, age, sex, caseId, generateExplanation } = req.body;
    if (!complaint || !Array.isArray(features)) {
      return res.status(400).json({ error: "complaint and features[] are required" });
    }
    const result = await evaluateCase({ complaint, features, age, sex, caseId, generateExplanation });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/safety-check", (req: Request, res: Response) => {
  const { complaint, features } = req.body;
  if (!complaint || !Array.isArray(features)) {
    return res.status(400).json({ error: "complaint and features[] required" });
  }
  res.json(runSafetyCheck(complaint, features));
});

router.get("/safety-rules", (_req: Request, res: Response) => {
  res.json(getAllRedFlags());
});

router.get("/dataset/stats", async (_req: Request, res: Response) => {
  res.json(await getDatasetStats());
});

router.get("/dataset", async (req: Request, res: Response) => {
  const ds = await loadDataset();
  const page = parseInt(String(req.query.page ?? "1"));
  const limit = parseInt(String(req.query.limit ?? "20"));
  const complaint = req.query.complaint as string | undefined;
  const filtered = complaint ? ds.filter(c => c.complaint === complaint) : ds;
  const start = (page - 1) * limit;
  res.json({ cases: filtered.slice(start, start + limit), total: filtered.length, page, limit });
});

router.post("/dataset/regenerate", async (_req: Request, res: Response) => {
  try {
    const dataset = generateDataset(300);
    await fs.mkdir("data", { recursive: true });
    await fs.writeFile(path.join("data", "clinical_master_dataset.json"), JSON.stringify(dataset, null, 2), "utf8");
    res.json({ ok: true, generated: dataset.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/adversarial", (_req: Request, res: Response) => {
  res.json({ cases: ADVERSARIAL_CASES, total: ADVERSARIAL_CASES.length });
});

router.post("/adversarial/test", async (req: Request, res: Response) => {
  try {
    const { case_id } = req.body;
    const adv = ADVERSARIAL_CASES.find(c => c.case_id === case_id) ?? ADVERSARIAL_CASES[Math.floor(Math.random() * ADVERSARIAL_CASES.length)];
    const result = await evaluateCase({
      caseId: adv.case_id,
      complaint: adv.complaint,
      features: adv.key_features,
      age: adv.age,
      sex: adv.sex,
      generateExplanation: true,
    });
    const passed = result.disposition === adv.expected_disposition || result.layer1_safety.override;
    res.json({ adversarial_case: adv, hybrid_result: result, test_passed: passed, expected_disposition: adv.expected_disposition });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/stats", async (_req: Request, res: Response) => {
  res.json(await getHybridEngineStats());
});

router.post("/timeline/add", async (req: Request, res: Response) => {
  const { caseId, day, symptom, severity } = req.body;
  if (!caseId || day === undefined || !symptom) {
    return res.status(400).json({ error: "caseId, day, symptom required" });
  }
  res.json(await addTimelineEvent(caseId, day, symptom, severity));
});

router.get("/timeline/:caseId", async (req: Request, res: Response) => {
  res.json(await getCaseProgression(req.params.caseId));
});

router.get("/timeline", async (_req: Request, res: Response) => {
  res.json(await getAllTimelines());
});

router.post("/calibration/record", async (req: Request, res: Response) => {
  const { caseId, diagnosis, predicted_prob, actual_outcome } = req.body;
  if (!caseId || !diagnosis || predicted_prob === undefined || actual_outcome === undefined) {
    return res.status(400).json({ error: "caseId, diagnosis, predicted_prob, actual_outcome required" });
  }
  await recordPrediction(caseId, diagnosis, predicted_prob, actual_outcome);
  res.json({ ok: true });
});

router.get("/calibration/report", async (_req: Request, res: Response) => {
  res.json(await getCalibrationReport());
});

router.post("/calibration/drift", async (req: Request, res: Response) => {
  await recordDriftSnapshot(req.body);
  res.json({ ok: true });
});

router.get("/calibration/drift", async (_req: Request, res: Response) => {
  res.json(await getDriftReport());
});

router.post("/override", async (req: Request, res: Response) => {
  const { caseId, complaint, features, ai_disposition, ai_top_diagnosis, physician_disposition, physician_diagnosis, override_reason } = req.body;
  if (!caseId || !complaint || !ai_disposition || !physician_disposition) {
    return res.status(400).json({ error: "caseId, complaint, ai_disposition, physician_disposition required" });
  }
  const result = await recordOverride(caseId, complaint, features ?? [], ai_disposition, ai_top_diagnosis ?? "unknown", physician_disposition, physician_diagnosis, override_reason);
  res.json({ ok: true, override: result });
});

router.get("/override/stats", async (_req: Request, res: Response) => {
  res.json(await getOverrideStats());
});

router.post("/outcome", async (req: Request, res: Response) => {
  const { symptoms, final_diagnosis } = req.body;
  if (!symptoms || !final_diagnosis) return res.status(400).json({ error: "symptoms and final_diagnosis required" });
  updateProbabilisticFromOutcome(symptoms, final_diagnosis);
  res.json({ ok: true });
});

router.post("/extract", async (req: Request, res: Response) => {
  try {
    const { text, age, sex } = req.body;
    if (!text) return res.status(400).json({ error: "text is required" });
    const result = runExtractionConfidence(text, age, sex);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/safety-registry", async (_req: Request, res: Response) => {
  try {
    const registry = await getLockedRegistry();
    res.json(registry);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/safety-registry/check", async (req: Request, res: Response) => {
  try {
    const { complaint, features } = req.body;
    if (!complaint || !Array.isArray(features)) {
      return res.status(400).json({ error: "complaint and features[] required" });
    }
    const result = await checkLockedRules(complaint, features);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/safety-registry/verify", async (_req: Request, res: Response) => {
  try {
    const result = await verifyRuleIntegrity();
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/outcome-feedback", async (req: Request, res: Response) => {
  try {
    const { caseId, complaint, symptoms, aiDisposition, aiTopDiagnosis, aiConfidence, finalDisposition, finalDiagnosis, overrideReason } = req.body;
    if (!caseId || !complaint || !symptoms || !aiDisposition || !finalDisposition) {
      return res.status(400).json({ error: "caseId, complaint, symptoms, aiDisposition, finalDisposition are required" });
    }
    const feedback = await recordOutcomeFeedback({
      caseId, complaint, symptoms: Array.isArray(symptoms) ? symptoms : [symptoms],
      aiDisposition, aiTopDiagnosis: aiTopDiagnosis ?? "unknown",
      aiConfidence: aiConfidence ?? 0.5,
      finalDisposition, finalDiagnosis: finalDiagnosis ?? "unknown", overrideReason,
    });
    res.json({ ok: true, feedback });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/outcome-feedback/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getOutcomeFeedbackStats();
    res.json(stats);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/outcome-feedback/recent", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(String(req.query.limit ?? "20"));
    const feedbacks = await getRecentFeedbacks(limit);
    res.json(feedbacks);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
