import { Router } from "express";
import {
  listOutcomes,
  getOutcomeByCaseId,
  addOutcome,
  updateOutcome,
  getOutcomeStats,
} from "../sl3/outcomeStore";

const router = Router();

router.get("/api/sl3/outcomes", async (_req, res) => {
  try {
    const outcomes = await listOutcomes();
    res.json({ outcomes });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/sl3/outcomes/stats", async (_req, res) => {
  try {
    const stats = await getOutcomeStats();
    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/sl3/outcomes/case/:caseId", async (req, res) => {
  try {
    const outcome = await getOutcomeByCaseId(req.params.caseId);
    if (!outcome) return res.status(404).json({ error: "Not found" });
    res.json(outcome);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/api/sl3/outcomes", async (req, res) => {
  try {
    const { caseId, complaint, engineDisposition, actualDisposition, patientReported, followupStatus, physicianNotes } = req.body;
    if (!caseId || !complaint || !engineDisposition || !actualDisposition || !followupStatus) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const outcome = await addOutcome({ caseId, complaint, engineDisposition, actualDisposition, patientReported: patientReported ?? "", followupStatus, physicianNotes: physicianNotes ?? "" });
    res.json(outcome);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/api/sl3/outcomes/:id", async (req, res) => {
  try {
    const updated = await updateOutcome(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
