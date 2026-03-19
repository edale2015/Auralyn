import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/requireRole";
import { autoCodeDiagnosisCluster, batchAutoCode, searchICD10 } from "../billing/diagnosisAutoCoder";

const router = Router();

const clusterSchema = z.object({
  diagnosis: z.string().min(1, "diagnosis required"),
  differentials: z.array(z.string()).optional(),
  triage: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

router.post("/code", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = clusterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message, details: parsed.error.issues });
  }
  const { diagnosis, differentials, triage, confidence } = parsed.data;
  const result = autoCodeDiagnosisCluster({ primary: diagnosis, differentials, triage, confidence });
  res.json(result);
});

const batchSchema = z.object({
  clusters: z.array(
    z.object({
      primary: z.string().min(1),
      differentials: z.array(z.string()).optional(),
      triage: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    })
  ).min(1, "clusters[] must have at least one entry"),
});

router.post("/batch", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message, details: parsed.error.issues });
  }
  const results = batchAutoCode(parsed.data.clusters);
  res.json({ count: results.length, results });
});

router.get("/search", requireRole(["admin", "physician"]), (req, res) => {
  const q = (req.query.q as string) || "";
  if (!q) {
    return res.status(400).json({ error: "q query param required" });
  }
  const matches = searchICD10(q);
  res.json({ query: q, count: matches.length, matches });
});

export default router;
