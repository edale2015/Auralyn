import { Router } from "express";
import { z } from "zod";
import { scoreContract, scoreAllPayers, getPayerLeaderboard } from "./contractEngine";
import { predictDenialByPayer, batchPredictDenial } from "./denialPredictor";
import { simulateContractChange } from "./contractSimulator";

const router = Router();

router.get("/score/:payerId", (req, res) => {
  try {
    const result = scoreContract(req.params.payerId);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/score", (_req, res) => {
  try {
    const results = scoreAllPayers();
    res.json({ ok: true, payers: results, count: results.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/leaderboard", (_req, res) => {
  try {
    const board = getPayerLeaderboard();
    res.json({ ok: true, leaderboard: board });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const denialSchema = z.object({
  payerId: z.string().min(1),
  cptCode: z.string().min(1),
  icd10: z.string().optional(),
});

router.post("/predict-denial", (req, res) => {
  const parsed = denialSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const result = predictDenialByPayer(parsed.data.payerId, parsed.data.cptCode, parsed.data.icd10);
  res.json({ ok: true, ...result });
});

const batchDenialSchema = z.object({
  payerId: z.string().min(1),
  cptCodes: z.array(z.string()).min(1),
  icd10: z.string().optional(),
});

router.post("/predict-denial/batch", (req, res) => {
  const parsed = batchDenialSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const results = batchPredictDenial(parsed.data.payerId, parsed.data.cptCodes, parsed.data.icd10);
  res.json({ ok: true, predictions: results, count: results.length });
});

const simSchema = z.object({
  payerId: z.string().min(1),
  payerName: z.string().optional(),
  currentRate: z.number().min(0),
  proposedRate: z.number().min(0),
  visitVolume: z.number().min(1),
  denialRate: z.number().min(0).max(1).optional(),
  avgCaseMix: z.number().min(0).max(1).optional(),
  negotiationCostHours: z.number().min(0).optional(),
  hourlyRate: z.number().min(0).optional(),
});

router.post("/simulate", (req, res) => {
  const parsed = simSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const result = simulateContractChange(parsed.data);
  res.json({ ok: true, ...result });
});

export default router;
