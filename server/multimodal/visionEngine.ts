import { analyzeImage as analyzeImageBase } from "./multimodalEngine";
import { auditLog } from "../security/auditLogger";

export interface ClinicalVisionResult {
  findings: string[];
  redFlags: string[];
  confidence: number;
  severity: "normal" | "mild" | "moderate" | "severe";
  clinicalContext: string;
  requiresEscalation: boolean;
}

const RED_FLAG_PATTERNS = [
  { pattern: /severe|critical|emergency/i, flag: "Severe finding detected" },
  { pattern: /exudate|purulent/i, flag: "Possible infection — exudate present" },
  { pattern: /erythema|inflam/i, flag: "Significant inflammation" },
  { pattern: /perforation|rupture/i, flag: "Possible perforation or rupture" },
  { pattern: /abscess/i, flag: "Possible abscess" },
  { pattern: /petechiae|purpura/i, flag: "Skin bleeding — possible serious cause" },
  { pattern: /necrosis/i, flag: "Necrotic tissue present" },
  { pattern: /cyanosis/i, flag: "Possible cyanosis — oxygen concern" },
];

function extractRedFlags(summary: string): string[] {
  const flags: string[] = [];
  for (const { pattern, flag } of RED_FLAG_PATTERNS) {
    if (pattern.test(summary)) flags.push(flag);
  }
  if (summary.toLowerCase().includes("normal") && flags.length === 0) return [];
  return flags;
}

function mapSeverityToConfidence(severity: ClinicalVisionResult["severity"]): number {
  return { normal: 0.9, mild: 0.78, moderate: 0.72, severe: 0.85 }[severity] ?? 0.7;
}

export async function analyzeImage(input: { imageUrl: string; context?: string; patientId?: string }): Promise<ClinicalVisionResult> {
  auditLog({
    actor: "vision_engine",
    action: "image_analysis_started",
    entityType: "image",
    patientId: input.patientId,
    details: { hasContext: Boolean(input.context) },
  });

  const base = await analyzeImageBase(input.imageUrl);

  const contextSummary = `${base.description ?? ""} ${input.context ?? ""}`.trim();

  const redFlags = extractRedFlags(contextSummary);
  const confidence = mapSeverityToConfidence(base.severity);

  const findings: string[] = [];
  if (base.description) findings.push(base.description);
  if (base.severity !== "normal") findings.push(`Severity: ${base.severity}`);

  const requiresEscalation = redFlags.length > 0 || base.severity === "severe";

  auditLog({
    actor: "vision_engine",
    action: "image_analysis_complete",
    entityType: "image",
    patientId: input.patientId,
    details: { redFlagCount: redFlags.length, severity: base.severity, requiresEscalation },
  });

  return {
    findings,
    redFlags,
    confidence,
    severity: base.severity,
    clinicalContext: contextSummary || "General clinical image",
    requiresEscalation,
  };
}

export async function analyzeEarImage(imageUrl: string, patientId?: string): Promise<ClinicalVisionResult> {
  return analyzeImage({ imageUrl, context: "Otoscopic ear examination image — assess for otitis media, perforation, effusion, or normal tympanic membrane", patientId });
}

export async function analyzeThroatImage(imageUrl: string, patientId?: string): Promise<ClinicalVisionResult> {
  return analyzeImage({ imageUrl, context: "Throat/pharynx examination — assess for exudate, tonsillar enlargement, erythema, strep signs", patientId });
}

export async function analyzeRashImage(imageUrl: string, patientId?: string): Promise<ClinicalVisionResult> {
  return analyzeImage({ imageUrl, context: "Skin rash examination — assess for distribution, color, petechiae, urticaria, cellulitis, or other dermatologic findings", patientId });
}

export async function analyzeWoundImage(imageUrl: string, patientId?: string): Promise<ClinicalVisionResult> {
  return analyzeImage({ imageUrl, context: "Wound/injury assessment — evaluate for depth, signs of infection, necrosis, or need for closure", patientId });
}

export async function triageImageByComplaint(imageUrl: string, complaint: string, patientId?: string): Promise<ClinicalVisionResult> {
  const contextMap: Record<string, string> = {
    ear_pain: "Otoscopic ear examination",
    sore_throat: "Throat/pharynx examination",
    rash: "Skin rash assessment",
    wound: "Wound/injury assessment",
  };
  const context = contextMap[complaint] ?? `Clinical image for ${complaint}`;
  return analyzeImage({ imageUrl, context, patientId });
}
