import { processInput, fuseData } from "./multimodalEngine";
import { analyzeImage as clinicalAnalyzeImage } from "./visionEngine";
import { auditLog } from "../security/auditLogger";
import { logMetric } from "../monitoring/metrics";

export interface OrchestratorInput {
  text?: string;
  imageUrl?: string;
  audioTranscript?: string;
  videoFrame?: string;
  session?: any;
  patientId?: string;
  complaint?: string;
}

export interface FusedSignal {
  type: "text" | "vision" | "voice" | "video";
  data: string;
  weight: number;
}

export interface OrchestratorResult {
  structured: {
    dominantSignal: string;
    riskScore: number;
    severityScore: number;
    signals: FusedSignal[];
    redFlags: string[];
    recommendation: string;
  };
  nextStep: "self_service" | "physician_review" | "emergency_911" | "collect_more";
  requiresEscalation: boolean;
  completedAt: string;
}

function decideNextStep(result: OrchestratorResult["structured"]): OrchestratorResult["nextStep"] {
  if (result.riskScore > 0.7 || result.redFlags.length > 0) return "emergency_911";
  if (result.riskScore > 0.35 || result.severityScore > 0.5) return "physician_review";
  if (result.signals.length < 2) return "collect_more";
  return "self_service";
}

export async function runMultimodalFlow(input: OrchestratorInput): Promise<OrchestratorResult> {
  const start = Date.now();
  auditLog({ actor: "multimodal_orchestrator", action: "flow_started", patientId: input.patientId, details: { hasText: !!input.text, hasImage: !!input.imageUrl, hasAudio: !!input.audioTranscript } });

  const signals: FusedSignal[] = [];
  const redFlags: string[] = [];

  if (input.text) signals.push({ type: "text", data: input.text, weight: 1.0 });
  if (input.audioTranscript) signals.push({ type: "voice", data: input.audioTranscript, weight: 0.9 });
  if (input.videoFrame) signals.push({ type: "video", data: input.videoFrame, weight: 0.8 });

  if (input.imageUrl) {
    try {
      const vision = await clinicalAnalyzeImage({ imageUrl: input.imageUrl, context: input.complaint, patientId: input.patientId });
      signals.push({ type: "vision", data: vision.clinicalContext, weight: 1.2 });
      redFlags.push(...vision.redFlags);
      if (vision.requiresEscalation) {
        signals[signals.length - 1].weight = 2.0;
      }
    } catch (_) {
      signals.push({ type: "vision", data: "image received but could not be analyzed", weight: 0.3 });
    }
  }

  const baseText = [input.text, input.audioTranscript, input.videoFrame].filter(Boolean).join(" ") || "";

  const multimodalOutput = await processInput({
    text: baseText || undefined,
    image: input.imageUrl,
  });

  const fused = fuseData(multimodalOutput);

  const weightedRisk = signals.reduce((acc, s) => acc + (s.weight * fused.fusedRisk), 0) / Math.max(1, signals.reduce((acc, s) => acc + s.weight, 0));

  const recommendation = redFlags.length > 0
    ? "Immediate physician evaluation required based on visual findings"
    : weightedRisk > 0.5
    ? "Physician review recommended"
    : "Supportive care — monitor and follow up if symptoms worsen";

  const structured: OrchestratorResult["structured"] = {
    dominantSignal: fused.dominantSignal,
    riskScore: Math.min(1, weightedRisk),
    severityScore: fused.severityScore,
    signals,
    redFlags,
    recommendation,
  };

  const nextStep = decideNextStep(structured);
  const requiresEscalation = nextStep === "emergency_911" || nextStep === "physician_review";

  logMetric("orchestrator.latency", Date.now() - start, "latency");
  logMetric("orchestrator.signals", signals.length, "quality");
  if (redFlags.length > 0) logMetric("orchestrator.red_flags", redFlags.length, "safety");

  auditLog({ actor: "multimodal_orchestrator", action: "flow_complete", patientId: input.patientId, details: { nextStep, riskScore: structured.riskScore, redFlagCount: redFlags.length } });

  return { structured, nextStep, requiresEscalation, completedAt: new Date().toISOString() };
}
