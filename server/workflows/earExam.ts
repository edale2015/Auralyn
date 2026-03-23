import { analyzeImage } from "../multimodal/multimodalEngine";
import { logMetric } from "../monitoring/metrics";
import { auditLog } from "../security/auditLogger";

export interface EarExamInput {
  patientId: string;
  earImage?: string | null;
  side?: "left" | "right";
}

export type EarExamClassification =
  | "normal"
  | "otitis_media"
  | "otitis_externa"
  | "cerumen_impaction"
  | "tympanic_membrane_perforation"
  | "indeterminate";

export interface EarExamResult {
  patientId: string;
  side: string;
  classification: EarExamClassification;
  confidence: number;
  findings: string[];
  severity: string;
  recommendedAction: string;
  completedAt: string;
}

async function positionArm(target: string): Promise<void> {
  console.log(`[EarExam] Positioning arm: ${target}`);
  await new Promise(r => setTimeout(r, 20));
}

async function captureImage(): Promise<string> {
  await new Promise(r => setTimeout(r, 10));
  return "captured_frame_placeholder";
}

function classifyEar(analysis: Awaited<ReturnType<typeof analyzeImage>>): {
  classification: EarExamClassification;
  recommendedAction: string;
} {
  if (analysis.confidence < 0.5) {
    return { classification: "indeterminate", recommendedAction: "repeat_examination" };
  }

  const label = analysis.rawLabel ?? "";
  if (label.includes("otitis_media")) return { classification: "otitis_media", recommendedAction: "antibiotic_consideration" };
  if (label.includes("otitis_externa")) return { classification: "otitis_externa", recommendedAction: "topical_treatment" };
  if (label.includes("cerumen")) return { classification: "cerumen_impaction", recommendedAction: "cerumenolytic_irrigation" };
  if (label.includes("perforation")) return { classification: "tympanic_membrane_perforation", recommendedAction: "urgent_ENT_referral" };
  if (analysis.severity === "normal") return { classification: "normal", recommendedAction: "reassure_and_monitor" };

  return { classification: "indeterminate", recommendedAction: "physician_review" };
}

export async function earExamWorkflow(patient: EarExamInput): Promise<EarExamResult> {
  const start = Date.now();

  auditLog({ actor: "system", action: "ear_exam_started", patientId: patient.patientId });

  await positionArm(`ear_${patient.side ?? "right"}`);

  const view = await analyzeImage(patient.earImage);

  const captured = await captureImage();
  const capturedAnalysis = await analyzeImage(captured);

  const merged = capturedAnalysis.confidence > view.confidence ? capturedAnalysis : view;
  const { classification, recommendedAction } = classifyEar(merged);

  const result: EarExamResult = {
    patientId: patient.patientId,
    side: patient.side ?? "right",
    classification,
    confidence: merged.confidence,
    findings: merged.findings,
    severity: merged.severity,
    recommendedAction,
    completedAt: new Date().toISOString(),
  };

  logMetric("workflow.ear_exam.latency", Date.now() - start, "latency", { patientId: patient.patientId });
  auditLog({
    actor: "system",
    action: "ear_exam_completed",
    patientId: patient.patientId,
    details: { classification, confidence: merged.confidence },
  });

  return result;
}
