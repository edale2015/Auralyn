import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  estimateImpact,
  buildCausalReport,
  getRecentCausalReports,
  CausalInput,
  PatientOutcome,
} from "../rwe/causalEngine";

const router = Router();
const auth = requireRole(["admin", "physician"]);

const DEMO_AI_GROUP: PatientOutcome[] = [
  { patientId: "a1", recovered: true, resolutionDays: 3, escalated: false },
  { patientId: "a2", recovered: true, resolutionDays: 4, escalated: false },
  { patientId: "a3", recovered: false, resolutionDays: 9, escalated: true },
  { patientId: "a4", recovered: true, resolutionDays: 2, escalated: false },
  { patientId: "a5", recovered: true, resolutionDays: 3, escalated: false },
  { patientId: "a6", recovered: true, resolutionDays: 5, escalated: false },
  { patientId: "a7", recovered: false, resolutionDays: 8, escalated: true },
  { patientId: "a8", recovered: true, resolutionDays: 3, escalated: false },
];

const DEMO_CONTROL_GROUP: PatientOutcome[] = [
  { patientId: "c1", recovered: true, resolutionDays: 6, escalated: false },
  { patientId: "c2", recovered: false, resolutionDays: 10, escalated: true },
  { patientId: "c3", recovered: false, resolutionDays: 12, escalated: true },
  { patientId: "c4", recovered: true, resolutionDays: 7, escalated: false },
  { patientId: "c5", recovered: false, resolutionDays: 9, escalated: true },
  { patientId: "c6", recovered: true, resolutionDays: 5, escalated: false },
  { patientId: "c7", recovered: false, resolutionDays: 11, escalated: true },
  { patientId: "c8", recovered: true, resolutionDays: 6, escalated: false },
];

router.post("/estimate", auth as any, (req: Request, res: Response) => {
  try {
    const input: CausalInput = {
      aiGroup: req.body?.aiGroup ?? DEMO_AI_GROUP,
      controlGroup: req.body?.controlGroup ?? DEMO_CONTROL_GROUP,
    };
    const metrics = estimateImpact(input);
    res.json({ ok: true, metrics });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/report", auth as any, (req: Request, res: Response) => {
  try {
    const input: CausalInput = {
      aiGroup: req.body?.aiGroup ?? DEMO_AI_GROUP,
      controlGroup: req.body?.controlGroup ?? DEMO_CONTROL_GROUP,
      studyLabel: req.body?.studyLabel ?? "Auralyn — Causal Impact Study",
      minSampleSize: req.body?.minSampleSize ?? 5,
    };
    const report = buildCausalReport(input);
    res.json({ ok: true, report });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.get("/reports", auth as any, (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 10), 50);
  const reports = getRecentCausalReports(limit);
  res.json({ ok: true, reports, count: reports.length });
});

router.get("/demo", auth as any, (_req: Request, res: Response) => {
  const input: CausalInput = {
    aiGroup: DEMO_AI_GROUP,
    controlGroup: DEMO_CONTROL_GROUP,
    studyLabel: "Auralyn Demo — ENT Triage Causal Study",
    minSampleSize: 5,
  };
  const report = buildCausalReport(input);
  res.json({ ok: true, report, demoMode: true });
});

export default router;
