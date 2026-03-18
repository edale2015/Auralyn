import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { auditMiddleware } from "../middleware/auditMiddleware";
import { runClinicalPipeline, PipelineInput } from "../pipeline/unifiedClinicalPipeline";
import { runContinuousImprovement } from "../agents/selfImprovementOrchestrator";
import { simulateAndTrain } from "../engines/simulationTrainingLoop";
import { buildEncounter } from "../integrations/fhirController";
import { normalizeSystem } from "../utils/normalize";

const router = Router();
const auth = requireRole(["admin", "physician"]);

const stubRepo = {
  getSymptomPacks: async () => [],
  getQuestionRows: async (_packId: string) => [],
  getModifiers: async () => [],
  getRules: async (_packId: string) => [],
  getClusters: async () => [],
  getTriageMap: async () => ({} as Record<string, string>),
  getPlans: async () => [],
};

router.post("/run", auth, auditMiddleware("RUN_PIPELINE"), async (req: Request, res: Response) => {
  try {
    const input: PipelineInput = {
      text: req.body.text || "",
      answers: req.body.answers || {},
      channel: req.body.channel || "web",
      patientId: req.body.patientId,
    };
    const result = await runClinicalPipeline(input, stubRepo);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/run-fhir", auth, auditMiddleware("RUN_PIPELINE_FHIR"), async (req: Request, res: Response) => {
  try {
    const input: PipelineInput = {
      text: req.body.text || "",
      answers: req.body.answers || {},
      channel: req.body.channel || "web",
      patientId: req.body.patientId,
    };
    const result = await runClinicalPipeline(input, stubRepo);
    const encounter = buildEncounter(result);
    res.json({ ok: true, encounter, triage: result.triage, diagnosis: result.diagnosis });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/self-improve", auth, auditMiddleware("SELF_IMPROVE"), async (_req: Request, res: Response) => {
  try {
    const result = await runContinuousImprovement();
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/simulate-all", auth, auditMiddleware("SIMULATE"), async (req: Request, res: Response) => {
  try {
    const count = req.body.count || 100;
    const result = await simulateAndTrain([], count);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/normalize-system", auth, (req: Request, res: Response) => {
  const system = req.body.system || "";
  res.json({ original: system, normalized: normalizeSystem(system) });
});

export default router;
