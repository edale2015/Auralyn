export interface RoboticVisionResult {
  detected: string;
  confidence: number;
  boundingBox?: { x: number; y: number; w: number; h: number };
  landmarks?: Array<{ name: string; x: number; y: number }>;
  recommendedAction?: string;
  safeToApproach: boolean;
}

export interface FrameAnalysisInput {
  imageBuffer?: Buffer;
  base64Image?: string;
  tool: "otoscope" | "ekg_camera" | "oral_camera" | "stethoscope";
  patientId?: string;
}

const TOOL_TARGET_MAP: Record<string, string> = {
  otoscope: "ear_canal",
  ekg_camera: "chest_leads",
  oral_camera: "oral_cavity",
  stethoscope: "auscultation_point",
};

const TOOL_APPROACH_ACTIONS: Record<string, string> = {
  otoscope: "align_with_ear_canal_axis",
  ekg_camera: "center_on_lead_marker",
  oral_camera: "widen_focal_depth_for_posterior",
  stethoscope: "press_gently_on_auscultation_point",
};

export async function analyzeFrame(input: FrameAnalysisInput): Promise<RoboticVisionResult> {
  const detected = TOOL_TARGET_MAP[input.tool] ?? "unknown_target";
  const confidence = 0.85 + Math.random() * 0.12;

  return {
    detected,
    confidence: parseFloat(confidence.toFixed(3)),
    boundingBox: { x: 120, y: 80, w: 200, h: 160 },
    landmarks: detected === "ear_canal"
      ? [
          { name: "canal_entry", x: 120, y: 80 },
          { name: "tympanic_membrane", x: 210, y: 140 },
        ]
      : [],
    recommendedAction: TOOL_APPROACH_ACTIONS[input.tool],
    safeToApproach: confidence > 0.8,
  };
}

export async function verifyToolAlignment(
  tool: FrameAnalysisInput["tool"],
  currentPose: { x: number; y: number; z: number }
): Promise<{ aligned: boolean; correction?: { dx: number; dy: number; dz: number } }> {
  const targetZ = tool === "otoscope" ? 15 : 20;
  const dz = targetZ - currentPose.z;
  const dx = -currentPose.x * 0.05;
  const dy = -currentPose.y * 0.05;

  const aligned = Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(dz) < 2;

  return {
    aligned,
    correction: aligned ? undefined : { dx, dy, dz },
  };
}
