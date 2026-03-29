import { Router, Request, Response } from "express";
import { detectHCCs, getHCCCaptureStats } from "../billing/hccCapture";
import { requiresPriorAuth, getPriorAuthStats } from "../billing/priorAuth";
import { validateModifier, getModifierStats } from "../billing/modifierEngine";
import { preSubmitCheck, getPreSubmissionStats } from "../billing/preSubmission";

const router = Router();

// ── HCC Capture ───────────────────────────────────────────────────────────────
router.post("/hcc/detect", (req: Request, res: Response) => {
  const { symptoms = [], history = [] } = req.body;
  res.json(detectHCCs(symptoms, history));
});

router.get("/hcc/stats", (_req: Request, res: Response) => {
  res.json(getHCCCaptureStats());
});

router.get("/hcc/demo", (_req: Request, res: Response) => {
  res.json(detectHCCs(
    ["chest tightness", "shortness of breath"],
    ["diabetes", "chf", "copd", "atrial fibrillation"],
  ));
});

// ── Prior Authorization ───────────────────────────────────────────────────────
router.post("/prior-auth/check", (req: Request, res: Response) => {
  res.json(requiresPriorAuth(req.body));
});

router.get("/prior-auth/stats", (_req: Request, res: Response) => {
  res.json(getPriorAuthStats());
});

router.get("/prior-auth/demo", (_req: Request, res: Response) => {
  res.json({
    mri:        requiresPriorAuth({ procedure: "MRI" }),
    ctScan:     requiresPriorAuth({ procedure: "CT_SCAN" }),
    bloodDraw:  requiresPriorAuth({ cpt: "36415" }),
    emergency:  requiresPriorAuth({ procedure: "MRI", emergency: true }),
  });
});

// ── Modifier Validation ───────────────────────────────────────────────────────
router.post("/modifier/validate", (req: Request, res: Response) => {
  res.json(validateModifier(req.body));
});

router.get("/modifier/stats", (_req: Request, res: Response) => {
  res.json(getModifierStats());
});

router.get("/modifier/demo", (_req: Request, res: Response) => {
  res.json({
    mod25Valid:   validateModifier({ modifier: "25", documentation: true, separateService: true }),
    mod25Invalid: validateModifier({ modifier: "25", documentation: false }),
    mod59:        validateModifier({ modifier: "59", separateService: true }),
    noModifier:   validateModifier({}),
  });
});

// ── Pre-Submission Pipeline ───────────────────────────────────────────────────
router.post("/pre-submit/check", (req: Request, res: Response) => {
  res.json(preSubmitCheck(req.body));
});

router.get("/pre-submit/stats", (_req: Request, res: Response) => {
  res.json(getPreSubmissionStats());
});

router.get("/pre-submit/demo", (_req: Request, res: Response) => {
  const goodClaim = preSubmitCheck({
    icd10: "J02.0", cpt: "99213", documentation: true,
    modifier: "25", separateService: true,
    symptoms: ["sore throat"], history: ["diabetes", "chf"],
    patientId: "demo-patient-001",
  } as any);
  const badClaim = preSubmitCheck({
    icd10: "J02.0", cpt: "99285", documentation: false,
    modifier: "25", separateService: false, procedure: "MRI",
  });
  res.json({ goodClaim, badClaim });
});

// ── Unified Billing Status ────────────────────────────────────────────────────
router.get("/status", (_req: Request, res: Response) => {
  res.json({
    hccCapture:    getHCCCaptureStats(),
    priorAuth:     getPriorAuthStats(),
    modifierEngine:getModifierStats(),
    preSubmission: getPreSubmissionStats(),
  });
});

export default router;
