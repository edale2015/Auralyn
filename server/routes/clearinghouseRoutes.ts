import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { build837P } from "../billing/x12Mapper";
import { submitToClearinghouse, getSubmissionLog } from "../billing/clearinghouseService";
import { checkClaimStatus } from "../billing/claimStatusService";

const router = Router();

router.post("/build-x12", requireRole(["admin"]), (req: Request, res: Response) => {
  const { claimId, patientName, provider, icd10, cpt, amount, dateOfService } = req.body;
  if (!claimId || !icd10 || !cpt) {
    return res.status(400).json({ error: "claimId, icd10, cpt required" });
  }
  const payload = build837P({ claimId, patientName, provider, icd10, cpt, amount, dateOfService });
  res.json(payload);
});

router.post("/submit", requireRole(["admin"]), async (req: Request, res: Response) => {
  const { claimId, patientName, provider, icd10, cpt, amount, dateOfService } = req.body;
  if (!claimId || !icd10 || !cpt) {
    return res.status(400).json({ error: "claimId, icd10, cpt required" });
  }
  try {
    const result = await submitToClearinghouse({ claimId, patientName, provider, icd10, cpt, amount, dateOfService });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/status/:claimId", requireRole(["admin", "physician"]), async (req: Request, res: Response) => {
  try {
    const status = await checkClaimStatus(req.params.claimId);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/submissions", requireRole(["admin"]), (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(getSubmissionLog(limit));
});

export default router;
