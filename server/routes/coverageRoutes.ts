import express from "express";
import { getPackRepository } from "../repos/getPackRepository";
import { computeSystemCoverage } from "../engines/coverageEngine";
import { buildParsedSymptomPacksFromRows } from "../engines/normalizedPackBuilder";
import { parseModifierPackRow, parseClinicianAlgorithmRow } from "../engines/packRowParser";
import { runMassSimulation } from "../engines/massSimulationEngine";
import { generatePacksFromData } from "../engines/autoPackGenerator";

const router = express.Router();
const repo = getPackRepository();

router.get("/coverage", async (_req, res) => {
  const [symptomRows, modifierRows, algorithmRows, questionRows] = await Promise.all([
    repo.getSymptomRows(),
    repo.getModifierRows(),
    repo.getAlgorithmRows(),
    repo.getQuestionRows(),
  ]);

  const coverage = computeSystemCoverage(symptomRows, modifierRows, algorithmRows, questionRows);
  res.json({ coverage });
});

router.post("/simulate-all", async (req, res) => {
  const raw = Number(req.body.n || 500);
  const cap = Math.min(Math.max(Number.isFinite(raw) ? raw : 500, 1), 2000);

  const [symptomRows, questionRows, modifierRows, algorithmRows] = await Promise.all([
    repo.getSymptomRows(),
    repo.getQuestionRows(),
    repo.getModifierRows(),
    repo.getAlgorithmRows(),
  ]);

  const symptomPacks = buildParsedSymptomPacksFromRows(symptomRows, questionRows);
  const modifierPacks = modifierRows.filter(m => m.isActive).map(parseModifierPackRow);
  const clinicianAlgorithms = algorithmRows.filter(a => a.isActive).map(parseClinicianAlgorithmRow);

  if (symptomPacks.length === 0) {
    return res.json({ error: "No active symptom packs found", totalRuns: 0 });
  }

  const result = runMassSimulation(symptomPacks, modifierPacks, clinicianAlgorithms, cap);

  const { cases, ...summary } = result;

  res.json({
    ...summary,
    sampleCases: cases.slice(0, 20),
  });
});

router.get("/generated-packs", async (_req, res) => {
  const [symptomRows, modifierRows, algorithmRows, questionRows] = await Promise.all([
    repo.getSymptomRows(),
    repo.getModifierRows(),
    repo.getAlgorithmRows(),
    repo.getQuestionRows(),
  ]);

  const packs = generatePacksFromData(symptomRows, modifierRows, algorithmRows, questionRows);
  res.json({ packs });
});

export default router;
