import express from "express";
import {
  symptomPackRows,
  modifierPackRows,
  clinicianAlgorithmRows,
} from "../config/packRows.seed";

const router = express.Router();

router.get("/all", (_req, res) => {
  res.json({
    symptomPackRows,
    modifierPackRows,
    clinicianAlgorithmRows,
  });
});

router.get("/systems", (_req, res) => {
  const systems = Array.from(
    new Set([
      ...symptomPackRows.map(x => x.system),
      ...modifierPackRows.map(x => x.system),
      ...clinicianAlgorithmRows.map(x => x.system),
    ])
  ).sort();

  res.json({ systems });
});

router.post("/symptom", (req, res) => {
  const row = req.body;
  const idx = symptomPackRows.findIndex(x => x.id === row.id);
  if (idx >= 0) symptomPackRows[idx] = row;
  else symptomPackRows.push(row);
  res.json({ ok: true, row });
});

router.post("/modifier", (req, res) => {
  const row = req.body;
  const idx = modifierPackRows.findIndex(x => x.id === row.id);
  if (idx >= 0) modifierPackRows[idx] = row;
  else modifierPackRows.push(row);
  res.json({ ok: true, row });
});

router.post("/algorithm", (req, res) => {
  const row = req.body;
  const idx = clinicianAlgorithmRows.findIndex(x => x.id === row.id);
  if (idx >= 0) clinicianAlgorithmRows[idx] = row;
  else clinicianAlgorithmRows.push(row);
  res.json({ ok: true, row });
});

export default router;
