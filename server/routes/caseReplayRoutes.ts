import express from "express";
import { ClinicalSkillOrchestrator } from "../orchestrator/clinicalSkillOrchestrator";
import { getSavedCaseDetail } from "../services/savedCasesService";

const router = express.Router();

router.get("/api/skill-layer/cases/:caseId/replay-compare", async (req, res) => {
  try {
    const detail = await getSavedCaseDetail(req.params.caseId);

    const rawText =
      (req.query.rawText as string) ||
      (detail?.skillRuns?.[0]
        ? (() => {
            try {
              const parsed = JSON.parse(detail.skillRuns![0].inputSummary ?? "{}");
              return parsed.rawText ?? "";
            } catch {
              return "";
            }
          })()
        : "");

    const complaintId =
      (req.query.complaintId as string) ||
      detail?.caseAudit?.complaintId ||
      detail?.caseAudit?.complaint_id ||
      "";

    const orchestrator = new ClinicalSkillOrchestrator();

    const baseContext = {
      caseId: `REPLAY_${req.params.caseId}`,
      rawText,
      complaintId,
      modifiers: {},
      knownFacts: {},
      priorSkillOutputs: {},
      config: { strictMode: true, enableAudit: true },
    };

    const [sequential, graph] = await Promise.all([
      orchestrator.run({
        ...baseContext,
        config: { ...baseContext.config, orchestrationMode: "sequential" },
      }),
      orchestrator.run({
        ...baseContext,
        config: { ...baseContext.config, orchestrationMode: "graph" },
      }),
    ]);

    res.json({ ok: true, sequential, graph });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

export default router;
