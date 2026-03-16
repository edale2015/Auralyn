import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { runClinicalReasoningAgent, ClinicalReasoningInput } from "../agents/msClinicalReasoningAgent";
import { runChartAgent, ChartInput } from "../agents/msChartAgent";

export const clinicalAgentRouter = Router();

clinicalAgentRouter.post("/api/agents/clinical-reasoning", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const input: ClinicalReasoningInput = {
      complaint: req.body.complaint,
      answers: req.body.answers || {},
      redFlags: req.body.redFlags,
      patientAge: req.body.patientAge,
      patientSex: req.body.patientSex,
      existingDiagnoses: req.body.existingDiagnoses,
    };

    if (!input.complaint) {
      return res.status(400).json({ error: "complaint is required" });
    }

    const result = await runClinicalReasoningAgent(input);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Clinical reasoning agent failed" });
  }
});

clinicalAgentRouter.post("/api/agents/chart", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const input: ChartInput = {
      complaint: req.body.complaint,
      answers: req.body.answers || {},
      disposition: req.body.disposition || "OFFICE_VISIT",
      differentialDiagnoses: req.body.differentialDiagnoses,
      redFlags: req.body.redFlags,
      physicianNotes: req.body.physicianNotes,
    };

    if (!input.complaint) {
      return res.status(400).json({ error: "complaint is required" });
    }

    const result = await runChartAgent(input);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Chart agent failed" });
  }
});

clinicalAgentRouter.post("/api/agents/full-pipeline", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { complaint, answers, redFlags, patientAge, patientSex, physicianNotes } = req.body;

    if (!complaint) {
      return res.status(400).json({ error: "complaint is required" });
    }

    const reasoning = await runClinicalReasoningAgent({
      complaint,
      answers: answers || {},
      redFlags,
      patientAge,
      patientSex,
    });

    const chart = await runChartAgent({
      complaint,
      answers: answers || {},
      disposition: reasoning.recommendedDisposition,
      differentialDiagnoses: reasoning.differentialDiagnoses,
      redFlags,
      physicianNotes,
    });

    res.json({
      reasoning,
      chart,
      totalLatencyMs: reasoning.latencyMs + chart.latencyMs,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Full pipeline failed" });
  }
});
