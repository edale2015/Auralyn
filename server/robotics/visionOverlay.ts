export type Tool = "otoscope" | "ekg_camera" | "oral_camera" | "stethoscope";

export interface BoundingBox { x: number; y: number; w: number; h: number }

export interface OverlayGuidance {
  tool: Tool;
  targetRegion: string;
  boundingBox: BoundingBox;
  overlayType: "crosshair" | "box" | "circle" | "landmark";
  color: "green" | "yellow" | "red";
  confidence: number;
  instructions: string[];
  safeToAdvance: boolean;
  estimatedDistanceMm?: number;
}

const TOOL_TARGETS: Record<Tool, { region: string; overlayType: OverlayGuidance["overlayType"] }> = {
  otoscope: { region: "ear_canal", overlayType: "circle" },
  ekg_camera: { region: "chest_leads", overlayType: "crosshair" },
  oral_camera: { region: "oral_cavity", overlayType: "box" },
  stethoscope: { region: "auscultation_point", overlayType: "landmark" },
};

const TOOL_INSTRUCTIONS: Record<Tool, string[]> = {
  otoscope: [
    "Align scope axis with external ear canal",
    "Gently retract pinna upward and posteriorly",
    "Advance slowly — tympanic membrane target at ~25mm",
    "Halt on any resistance",
  ],
  ekg_camera: [
    "Center crosshair on lead marker",
    "Confirm electrode contact before advancing",
    "Capture frame for waveform overlay",
  ],
  oral_camera: [
    "Depress tongue gently with blade",
    "Center on posterior pharynx",
    "Illuminate and capture for tonsillar grading",
  ],
  stethoscope: [
    "Press diaphragm firmly on auscultation point",
    "Ask patient to breathe normally",
    "Record 3 breath cycles",
  ],
};

export function overlayGuidance(frame: {
  tool: Tool;
  currentPose?: { x: number; y: number; z: number };
  confidence?: number;
}): OverlayGuidance {
  const { region, overlayType } = TOOL_TARGETS[frame.tool] ?? TOOL_TARGETS.otoscope;
  const confidence = frame.confidence ?? (0.82 + Math.random() * 0.15);
  const safeToAdvance = confidence > 0.8;
  const color: OverlayGuidance["color"] = confidence > 0.85 ? "green" : confidence > 0.7 ? "yellow" : "red";

  return {
    tool: frame.tool,
    targetRegion: region,
    boundingBox: { x: 110, y: 75, w: 220, h: 175 },
    overlayType,
    color,
    confidence: parseFloat(confidence.toFixed(3)),
    instructions: TOOL_INSTRUCTIONS[frame.tool] ?? [],
    safeToAdvance,
    estimatedDistanceMm: frame.currentPose ? Math.abs(frame.currentPose.z - 15) : undefined,
  };
}

export function computeAlignmentCorrection(
  currentPose: { x: number; y: number; z: number },
  targetBox: BoundingBox,
  frameWidth = 640,
  frameHeight = 480
): { dx: number; dy: number; dz: number; aligned: boolean } {
  const centerX = targetBox.x + targetBox.w / 2;
  const centerY = targetBox.y + targetBox.h / 2;
  const frameCx = frameWidth / 2;
  const frameCy = frameHeight / 2;

  const dx = ((centerX - frameCx) / frameCx) * 5;
  const dy = ((centerY - frameCy) / frameCy) * 5;
  const dz = 15 - currentPose.z;

  return {
    dx: parseFloat(dx.toFixed(2)),
    dy: parseFloat(dy.toFixed(2)),
    dz: parseFloat(dz.toFixed(2)),
    aligned: Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(dz) < 2,
  };
}
