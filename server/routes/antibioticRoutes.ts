import { Router } from "express";
import { generateAntibioticDemandResponse } from "../services/communication/antibioticDemandEngine";
import { detectAntibioticDemand } from "../services/communication/antibioticDemandDetector";
import {
  createDelayedPrescription,
  activateDelayedPrescription,
  buildActivationCriteria,
} from "../services/communication/delayedPrescriptionService";
import { logAntibioticDemandEvent, getAntibioticDemandStats } from "../services/communication/outcomeTracker";

const router = Router();

router.post("/antibiotic-demand", (req, res) => {
  try {
    const result = generateAntibioticDemandResponse(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: "Failed to process antibiotic demand", detail: err.message });
  }
});

router.post("/detect-demand", (req, res) => {
  try {
    const { text } = req.body;
    if (typeof text !== "string") {
      return res.status(400).json({ ok: false, error: "text (string) required" });
    }
    res.json(detectAntibioticDemand(text));
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/delayed-rx/create", async (req, res) => {
  try {
    const {
      patientId,
      medication = "Azithromycin 500mg x1 then 250mg x4 days (Z-Pak)",
      instructions = "Start only if activation criteria develop. Do not use prophylactically.",
      activationCriteria,
      fever,
      throatPain,
      worsening,
      expiresInDays,
    } = req.body;

    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId required" });
    }

    const criteria = activationCriteria ?? buildActivationCriteria({ fever, throatPain, worsening });
    const result = await createDelayedPrescription({ patientId, medication, instructions, activationCriteria: criteria, expiresInDays });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/delayed-rx/activate", async (req, res) => {
  try {
    const { rxId } = req.body;
    if (!rxId) return res.status(400).json({ ok: false, error: "rxId required" });
    const result = await activateDelayedPrescription(rxId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/activation-criteria", (req, res) => {
  try {
    const criteria = buildActivationCriteria(req.body);
    res.json({ criteria });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/log-event", async (req, res) => {
  try {
    const result = await logAntibioticDemandEvent(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/stats", (_req, res) => {
  try {
    res.json(getAntibioticDemandStats());
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
