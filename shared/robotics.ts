export type RobotMode =
  | "MANUAL_JOG"
  | "GUIDED_POSITION"
  | "TARGET_LOCK"
  | "SAFE_HOME"
  | "E_STOP";

export interface RobotPose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

export interface RobotLimits {
  xMin: number; xMax: number;
  yMin: number; yMax: number;
  zMin: number; zMax: number;
  maxVelocity: number;
  maxAngularVelocity: number;
}

export interface RobotCommand {
  commandId: string;
  type:
    | "moveToPose"
    | "jog"
    | "stop"
    | "home"
    | "setMode"
    | "captureFrame"
    | "attachTool"
    | "detachTool";
  pose?: RobotPose;
  delta?: Partial<RobotPose>;
  velocity?: number;
  mode?: RobotMode;
  tool?: "otoscope" | "ekg_camera" | "oral_camera" | "stethoscope";
  issuedBy: string;
  issuedAt: string;
}

export interface SafetyState {
  estopActive: boolean;
  humanPresent: boolean;
  clinicianApproved: boolean;
  collisionRisk: "LOW" | "MEDIUM" | "HIGH";
  withinSafeZone: boolean;
}
