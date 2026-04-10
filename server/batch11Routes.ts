import { Router, Request, Response } from "express";

import { simulatePayerContract, batchSimulateContracts, sendPush } from "./revenue/payerContract";
import { buildSlides, slidesToMarkdown } from "./exec/slideBuilder";
import { nextSecondaryQuestion, collectModifiers, fastTrack } from "./clinical/intakeDynamic";
import { buildPhysicianSummary, dispositionFollowup } from "./clinical/caseSpeedPanel";

const router = Router();

// ── Epic Sandbox ────────────────────────────────────────────────────────────
router.post("/epic/sandbox/test-flow", async (req: Request, res: Response) => {
  try {
    const { token } = req.body ?? {};
    const { epicTestPatientFlow } = await import("./integrations/epicSandbox");
    const result = await epicTestPatientFlow(token ?? "");
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ── Payer Contract ──────────────────────────────────────────────────────────
router.post("/revenue/payer-contract/simulate", (req: Request, res: Response) => {
  const claim = req.body;
  if (!claim) return res.status(400).json({ error: "claim body required" });
  res.json({ reimbursement: simulatePayerContract(claim), claim });
});

router.post("/revenue/payer-contract/batch", (req: Request, res: Response) => {
  const { claims } = req.body ?? {};
  if (!Array.isArray(claims)) return res.status(400).json({ error: "claims[] required" });
  res.json(batchSimulateContracts(claims));
});

router.post("/patient/push", (req: Request, res: Response) => {
  const { patientId, msg } = req.body ?? {};
  if (!patientId || !msg) return res.status(400).json({ error: "patientId and msg required" });
  sendPush(String(patientId), String(msg));
  res.json({ ok: true, patientId, msg });
});

// ── Slide Builder ───────────────────────────────────────────────────────────
router.post("/exec/slides", (req: Request, res: Response) => {
  const metrics = req.body ?? {};
  const slides = buildSlides(metrics);
  res.json({ slides, count: slides.length });
});

router.post("/exec/slides/markdown", (req: Request, res: Response) => {
  const metrics = req.body ?? {};
  const slides = buildSlides(metrics);
  res.json({ markdown: slidesToMarkdown(slides) });
});

// ── Dynamic Intake ──────────────────────────────────────────────────────────
router.post("/intake/next-question", (req: Request, res: Response) => {
  const context = req.body ?? {};
  const question = nextSecondaryQuestion(context);
  res.json({ question, done: question === null });
});

router.post("/intake/collect-modifiers", (req: Request, res: Response) => {
  const patient = req.body ?? {};
  res.json(collectModifiers(patient));
});

router.post("/intake/fast-track", (req: Request, res: Response) => {
  const patient = req.body ?? {};
  const disposition = fastTrack(patient);
  res.json({ fastTracked: disposition !== null, disposition });
});

// ── Case Speed Panel ────────────────────────────────────────────────────────
router.post("/clinical/physician-summary", (req: Request, res: Response) => {
  const caseData = req.body ?? {};
  res.json(buildPhysicianSummary(caseData));
});

router.post("/clinical/disposition-followup", (req: Request, res: Response) => {
  const { disposition } = req.body ?? {};
  if (!disposition) return res.status(400).json({ error: "disposition required" });
  res.json({ disposition, followup: dispositionFollowup(String(disposition)) });
});

export default router;
