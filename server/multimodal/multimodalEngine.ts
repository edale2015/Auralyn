export interface ImageAnalysisResult {
  confidence: number;
  findings: string[];
  region: string;
  severity: "normal" | "mild" | "moderate" | "severe";
  rawLabel?: string;
}

export interface AudioAnalysisResult {
  confidence: number;
  findings: string[];
  patterns: string[];
  severity: "normal" | "mild" | "moderate";
}

export interface MultimodalInput {
  text?: string;
  image?: string | null;
  vitals?: {
    temperature?: number;
    heartRate?: number;
    oxygenSaturation?: number;
    systolicBp?: number;
    respRate?: number;
  };
  audio?: string | null;
  patientId?: string;
}

export interface MultimodalOutput {
  text?: string;
  vision?: ImageAnalysisResult;
  vitals?: MultimodalInput["vitals"];
  audio?: AudioAnalysisResult;
  severityScore: number;
  confidence: number;
  timestamp: string;
}

export async function analyzeImage(imageData: string | null | undefined): Promise<ImageAnalysisResult> {
  if (!imageData) {
    return { confidence: 0, findings: [], region: "unknown", severity: "normal", rawLabel: "no_image" };
  }

  await new Promise(r => setTimeout(r, 10));

  return {
    confidence: 0.87,
    findings: ["erythema", "mild_inflammation"],
    region: "ear_canal",
    severity: "mild",
    rawLabel: "otitis_media_suspect",
  };
}

export async function analyzeAudio(audioData: string | null | undefined): Promise<AudioAnalysisResult> {
  if (!audioData) {
    return { confidence: 0, findings: [], patterns: [], severity: "normal" };
  }

  await new Promise(r => setTimeout(r, 10));

  return {
    confidence: 0.76,
    findings: ["productive_cough", "mild_wheeze"],
    patterns: ["irregular_rhythm"],
    severity: "mild",
  };
}

export function fuseData(data: MultimodalOutput): { severityScore: number; fusedRisk: number; dominantSignal: string } {
  const visionRisk = data.vision
    ? { normal: 0, mild: 0.3, moderate: 0.6, severe: 0.9 }[data.vision.severity] ?? 0
    : 0;

  const vitalsRisk = data.vitals
    ? (() => {
        let r = 0;
        if ((data.vitals.temperature ?? 37) >= 38.5) r += 0.2;
        if ((data.vitals.oxygenSaturation ?? 99) < 94) r += 0.35;
        if ((data.vitals.respRate ?? 16) >= 25) r += 0.2;
        if ((data.vitals.systolicBp ?? 120) < 90) r += 0.25;
        return Math.min(r, 1);
      })()
    : 0;

  const textRisk = data.text ? 0.3 : 0;

  const severityScore = (visionRisk + vitalsRisk + textRisk) / Math.max(1,
    (data.vision ? 1 : 0) + (data.vitals ? 1 : 0) + (data.text ? 1 : 0));

  const fusedRisk = Math.max(visionRisk, vitalsRisk, textRisk);

  const dominantSignal = fusedRisk === visionRisk ? "vision"
    : fusedRisk === vitalsRisk ? "vitals"
    : "text";

  return { severityScore, fusedRisk, dominantSignal };
}

export async function processInput(input: MultimodalInput): Promise<MultimodalOutput> {
  const [vision, audio] = await Promise.all([
    analyzeImage(input.image),
    analyzeAudio(input.audio),
  ]);

  const output: MultimodalOutput = {
    text: input.text,
    vision: input.image ? vision : undefined,
    vitals: input.vitals,
    audio: input.audio ? audio : undefined,
    severityScore: 0,
    confidence: 0,
    timestamp: new Date().toISOString(),
  };

  const fused = fuseData(output);
  output.severityScore = fused.severityScore;
  output.confidence = Math.min(
    (input.image ? vision.confidence : 1) * (input.audio ? audio.confidence : 1),
    1
  );

  return output;
}
