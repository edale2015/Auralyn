import express from "express";
import { runClinicalWorkflow } from "../workflows/clinicalWorkflowEngine";
import { auditTraceService } from "../services/auditTraceService";
import { medicalMCP } from "../mcp/medicalMCP";

const router = express.Router();

/**
 * POST /api/workflow/run
 * Run the 8-step clinical workflow pipeline for a patient complaint.
 */
router.post("/run", async (req, res) => {
  try {
    const { patientId, complaint } = req.body;
    if (!patientId || !complaint) {
      res.status(400).json({ error: "patientId and complaint are required" });
      return;
    }
    const result = await runClinicalWorkflow(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Workflow failed",
    });
  }
});

/**
 * GET /api/workflow/trace/:traceId
 * Retrieve full step-by-step audit trace for a workflow run.
 */
router.get("/trace/:traceId", (req, res) => {
  const steps = auditTraceService.getTrace(req.params.traceId);
  res.json({
    traceId: req.params.traceId,
    summary: auditTraceService.summarize(req.params.traceId),
    steps,
  });
});

/**
 * GET /api/workflow/tools
 * List all registered MedicalMCP tools.
 */
router.get("/tools", (_req, res) => {
  res.json({ tools: medicalMCP.listTools(), count: medicalMCP.listTools().length });
});

export default router;
