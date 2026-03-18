import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { mapToBilling, getICD10Catalog, mapToICD10, mapToCPT } from "../billing/codingEngine";
import { buildClaim } from "../billing/claimBuilder";
import { submitClaim, getSubmittedClaims, getClaimById } from "../billing/submitClaim";

const router = Router();

router.post("/code", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { diagnosis, visitType } = req.body;
  if (!diagnosis) return res.status(400).json({ error: "diagnosis required" });
  res.json(mapToBilling(diagnosis, visitType || "routine"));
});

router.get("/icd10-catalog", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(getICD10Catalog());
});

router.post("/lookup-icd10", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { diagnosis } = req.body;
  res.json({ diagnosis, icd10: mapToICD10(diagnosis || "") });
});

router.post("/lookup-cpt", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { visitType } = req.body;
  res.json({ visitType, cpt: mapToCPT(visitType || "routine") });
});

router.post("/build-claim", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { result, patient } = req.body;
  if (!result || !patient?.id) {
    return res.status(400).json({ error: "result and patient.id required" });
  }
  const claim = buildClaim(result, patient);
  res.json(claim);
});

router.post("/submit-claim", requireRole(["admin"]), async (req: Request, res: Response) => {
  const { result, patient } = req.body;
  if (!result || !patient?.id) {
    return res.status(400).json({ error: "result and patient.id required" });
  }
  const claim = buildClaim(result, patient);
  const submission = await submitClaim(claim);
  res.json(submission);
});

router.get("/claims", requireRole(["admin"]), (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(getSubmittedClaims(limit));
});

router.get("/claims/:claimId", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const claim = getClaimById(req.params.claimId);
  if (!claim) return res.status(404).json({ error: "Claim not found" });
  res.json(claim);
});

export default router;
