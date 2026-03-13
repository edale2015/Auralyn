import { Router, Request, Response } from "express";
import { ClinicalSkillOrchestrator } from "../orchestrator/clinicalSkillOrchestrator";

const router = Router();

function buildFhirLiteOutput(state: any) {
  const sr = state.skillResults ?? {};
  return {
    resourceType: "ClinicalTriageResult",
    version: "1.0",
    caseId: state.context?.caseId ?? "",
    chiefComplaint: sr.identify_chief_complaint?.result?.complaint_id ?? "",
    disposition: state.finalDisposition ?? sr.determine_disposition?.result?.disposition ?? "",
    redFlags: sr.detect_red_flags?.result?.triggered_flags ?? sr.detect_red_flags?.result?.red_flags ?? [],
    differential: (sr.generate_differential?.result?.differential_list ?? []).slice(0, 5),
    assessment: sr.generate_assessment_plan?.result?.assessment_text ?? "",
    plan: sr.generate_assessment_plan?.result?.plan_text ?? "",
    hpi: sr.generate_assessment_plan?.result?.hpi_text ?? "",
    patientInstructions: sr.generate_physician_review_packet?.result?.patient_instructions ?? "",
    clinicalScore: sr.apply_clinical_score?.result ?? null,
    completedSkills: state.completedSkills ?? [],
    generatedAt: new Date().toISOString(),
  };
}

async function runOrchestrator(rawText: string, complaintOverride?: string) {
  const orchestrator = new ClinicalSkillOrchestrator();
  return orchestrator.run({
    caseId: `API_${Date.now()}`,
    rawText,
    modifiers: complaintOverride ? { complaint_override: complaintOverride } : {},
    knownFacts: {},
    priorSkillOutputs: {},
    config: { strictMode: true, enableAudit: true },
  });
}

router.post("/api/clinical/triage", async (req: Request, res: Response) => {
  try {
    const { rawText, complaint } = req.body;
    if (!rawText) return res.status(400).json({ ok: false, error: "rawText required" });
    const state = await runOrchestrator(rawText, complaint);
    const output = buildFhirLiteOutput(state);
    res.json({ ok: true, ...output });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

router.post("/api/clinical/differential", async (req: Request, res: Response) => {
  try {
    const { rawText, complaint } = req.body;
    if (!rawText) return res.status(400).json({ ok: false, error: "rawText required" });
    const state = await runOrchestrator(rawText, complaint);
    const sr = state.skillResults ?? {};
    res.json({
      ok: true,
      differential: sr.generate_differential?.result?.differential_list ?? [],
      reasoning: sr.generate_differential?.result?.reasoning_summary ?? "",
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

router.post("/api/clinical/documentation", async (req: Request, res: Response) => {
  try {
    const { rawText, complaint } = req.body;
    if (!rawText) return res.status(400).json({ ok: false, error: "rawText required" });
    const state = await runOrchestrator(rawText, complaint);
    const sr = state.skillResults ?? {};
    res.json({
      ok: true,
      hpi: sr.generate_assessment_plan?.result?.hpi_text ?? rawText,
      assessment: sr.generate_assessment_plan?.result?.assessment_text ?? "",
      plan: sr.generate_assessment_plan?.result?.plan_text ?? "",
      disposition: state.finalDisposition ?? "",
      patientInstructions: sr.generate_physician_review_packet?.result?.patient_instructions ?? "",
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

router.post("/api/clinical/care-plan", async (req: Request, res: Response) => {
  try {
    const { rawText, complaint } = req.body;
    if (!rawText) return res.status(400).json({ ok: false, error: "rawText required" });
    const state = await runOrchestrator(rawText, complaint);
    const output = buildFhirLiteOutput(state);
    res.json({ ok: true, carePlan: output });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

export default router;
