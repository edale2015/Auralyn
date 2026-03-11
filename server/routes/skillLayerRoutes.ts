import { Router, Request, Response } from "express";
import { ClinicalSkillOrchestrator } from "../orchestrator/clinicalSkillOrchestrator";
import { buildChartNoteBlock } from "../services/chartNoteBuilder";
import { buildDischargeInstructionBlock } from "../services/dischargeInstructionBuilder";
import { buildAuditTrace } from "../services/auditTraceService";
import { enqueueCallbackIfNeeded } from "../services/callbackQueueService";
import { saveTenantCaseRecord } from "../platform/tenantCaseStore";

export const skillLayerRouter = Router();

skillLayerRouter.post("/run", async (req: Request, res: Response) => {
  try {
    const orchestrator = new ClinicalSkillOrchestrator();
    const state = await orchestrator.run({
      caseId: req.body.caseId ?? `CASE_${Date.now()}`,
      rawText: req.body.rawText ?? "",
      modifiers: req.body.modifiers ?? {},
      knownFacts: {},
      priorSkillOutputs: {},
      config: {
        strictMode: true,
        enableAudit: true,
      },
    });

    const siteId = req.body.siteId ?? "default";
    const complaintId =
      state.skillResults?.identify_chief_complaint?.result?.complaint_id ?? "";
    const disposition =
      state.skillResults?.determine_disposition?.result?.disposition ?? "";

    saveTenantCaseRecord({
      siteId,
      caseId: state.context?.caseId ?? "",
      complaintId,
      disposition,
      payload: {
        complaintId,
        disposition,
        orchestrationMode: state.completedSkills?.length ? "completed" : "unknown",
        topDifferential: (
          state.skillResults?.generate_differential?.result?.differential_list ?? []
        ).slice(0, 3),
      },
    }).catch(() => {});

    res.json({ ok: true, state });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

skillLayerRouter.post("/chart-note", async (req: Request, res: Response) => {
  try {
    const note = buildChartNoteBlock(req.body.context);
    res.json({ ok: true, note });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

skillLayerRouter.post("/discharge", async (req: Request, res: Response) => {
  try {
    const instructions = buildDischargeInstructionBlock(req.body.context);
    res.json({ ok: true, instructions });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

skillLayerRouter.post("/audit-trace", async (req: Request, res: Response) => {
  try {
    const trace = buildAuditTrace(req.body.context);
    res.json({ ok: true, trace });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

skillLayerRouter.post("/callback-queue", async (req: Request, res: Response) => {
  try {
    const result = await enqueueCallbackIfNeeded(req.body.context);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});
