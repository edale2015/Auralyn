import { Router, Request, Response } from "express";
import { normalizeDiagnosis, getDiagnosisById, getOntologyStats, ONTOLOGY_CONCEPTS } from "../ontology/diagnosisOntology";
import { hybridReasoning, multiComplaintFusion, getHybridReasoningStats } from "../clinical/hybridReasoning";

const router = Router();

// ── Diagnosis Ontology ────────────────────────────────────────────────────────
router.get("/ontology/concepts", (_req: Request, res: Response) => {
  res.json(ONTOLOGY_CONCEPTS);
});

router.get("/ontology/stats", (_req: Request, res: Response) => {
  res.json(getOntologyStats());
});

router.get("/ontology/normalize", (req: Request, res: Response) => {
  const input = req.query.dx as string;
  if (!input) return res.status(400).json({ error: "dx query param required" });
  const result = normalizeDiagnosis(input);
  res.json({ input, normalized: result, found: result !== null });
});

router.post("/ontology/normalize", (req: Request, res: Response) => {
  const { diagnoses } = req.body;
  if (!Array.isArray(diagnoses)) return res.status(400).json({ error: "diagnoses array required" });
  const results = diagnoses.map((dx: string) => ({ raw: dx, normalized: normalizeDiagnosis(dx) }));
  res.json(results);
});

router.get("/ontology/id/:id", (req: Request, res: Response) => {
  const concept = getDiagnosisById(req.params.id);
  if (!concept) return res.status(404).json({ error: "Concept not found" });
  res.json(concept);
});

router.get("/ontology/demo", (_req: Request, res: Response) => {
  const examples = ["URI", "strep throat", "common cold", "flu", "CHF", "diabetes", "pe"];
  res.json(examples.map((dx) => ({ input: dx, normalized: normalizeDiagnosis(dx) })));
});

// ── Multi-Complaint Fusion ────────────────────────────────────────────────────
router.post("/fusion/detect", (req: Request, res: Response) => {
  const { symptoms, complaint } = req.body;
  if (!Array.isArray(symptoms)) return res.status(400).json({ error: "symptoms array required" });
  res.json(multiComplaintFusion({ symptoms, complaint }));
});

router.get("/fusion/demo", (_req: Request, res: Response) => {
  res.json({
    peTriad: multiComplaintFusion({ symptoms: ["chest_pain", "shortness_of_breath", "leg_swelling"] }),
    sepsisSyndrome: multiComplaintFusion({ symptoms: ["fever", "tachycardia", "altered_mental_status"] }),
    strepCentor: multiComplaintFusion({ symptoms: ["sore_throat", "fever", "tonsillar_exudate", "no_cough"] }),
    noPattern: multiComplaintFusion({ symptoms: ["headache", "fatigue"] }),
  });
});

// ── Hybrid Reasoning Engine ───────────────────────────────────────────────────
router.post("/hybrid/reason", (req: Request, res: Response) => {
  const { symptoms, complaint, vitals, deterministic } = req.body;
  if (!Array.isArray(symptoms)) return res.status(400).json({ error: "symptoms array required" });
  res.json(hybridReasoning({ symptoms, complaint, vitals }, deterministic));
});

router.get("/hybrid/stats", (_req: Request, res: Response) => {
  res.json(getHybridReasoningStats());
});

router.get("/hybrid/demo", (_req: Request, res: Response) => {
  const peDemo    = hybridReasoning({ symptoms: ["chest_pain", "shortness_of_breath", "leg_swelling"] });
  const strepDemo = hybridReasoning({ symptoms: ["sore_throat", "fever", "tonsillar_exudate", "no_cough"] });
  const bayesDemo = hybridReasoning({ symptoms: ["sore_throat", "fever", "mild_cough"], complaint: "sore_throat" });

  res.json({
    peTriad: { mode: peDemo.reasoningMode, topDx: peDemo.topDiagnosis, confidence: peDemo.confidence, explain: peDemo.explainability },
    strepCentor: { mode: strepDemo.reasoningMode, topDx: strepDemo.topDiagnosis, confidence: strepDemo.confidence },
    bayesianOnly: { mode: bayesDemo.reasoningMode, topDx: bayesDemo.topDiagnosis, confidence: bayesDemo.confidence, differential: bayesDemo.differential.slice(0, 3) },
  });
});

export default router;
