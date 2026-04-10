import { Router } from "express";
import { predictAdmission, explainPrediction, dataDrift, trainModel } from "./admissionModel";
import { buildFeatures } from "./featureStore";

const router = Router();

router.post("/predict", (req, res) => {
  try {
    const input = req.body ?? {};
    const prediction = predictAdmission(input);
    const features   = buildFeatures(input);
    res.json({ ok: true, prediction, features });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/features", (req, res) => {
  try {
    const features = buildFeatures(req.body ?? {});
    res.json({ ok: true, features });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/explain", (req, res) => {
  try {
    const explanation = explainPrediction(req.body ?? {});
    res.json({ ok: true, ...explanation });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/drift", (req, res) => {
  try {
    const { baseline, current } = req.body ?? {};
    if (!Array.isArray(baseline) || !Array.isArray(current)) {
      return res.status(400).json({ ok: false, error: "baseline and current arrays required" });
    }
    const drift = dataDrift(baseline, current);
    res.json({ ok: true, ...drift });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/train", async (req, res) => {
  try {
    const { rows } = req.body ?? {};
    if (!Array.isArray(rows)) {
      return res.status(400).json({ ok: false, error: "rows array required" });
    }
    const result = await trainModel(rows);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
