import { auditLog } from "../security/auditLogger";
import { logMetric } from "../monitoring/metrics";

export type RobotCommand =
  | { type: "move"; axis: "x" | "y" | "z"; value: number }
  | { type: "rotate"; joint: string; angle: number }
  | { type: "capture_image" }
  | { type: "start_video" }
  | { type: "stop_video" }
  | { type: "home" }
  | { type: "set_light"; intensity: number }
  | { type: "focus"; target: "throat" | "ear" | "wound" | "skin" | "general" };

export interface RobotCommandResult {
  success: boolean;
  command: RobotCommand;
  executedAt: string;
  simulatedResult?: any;
  error?: string;
}

const commandLog: Array<RobotCommandResult> = [];
const MAX_LOG = 200;

export async function sendRobotCommand(cmd: RobotCommand): Promise<RobotCommandResult> {
  const robotUrl = process.env.ROBOT_API_URL;
  const executedAt = new Date().toISOString();

  auditLog({ actor: "robot_controller", action: `cmd_${cmd.type}`, details: { command: cmd } });

  if (!robotUrl) {
    const simulated = simulateCommand(cmd);
    const result: RobotCommandResult = { success: true, command: cmd, executedAt, simulatedResult: simulated };
    appendLog(result);
    logMetric("robot.command.simulated", 1, "robotics");
    return result;
  }

  try {
    const res = await fetch(`${robotUrl}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
    });

    if (!res.ok) {
      throw new Error(`Robot API error: ${res.status}`);
    }

    const data = await res.json() as any;
    const result: RobotCommandResult = { success: true, command: cmd, executedAt, simulatedResult: data };
    appendLog(result);
    logMetric("robot.command.success", 1, "robotics");
    return result;
  } catch (err: any) {
    logMetric("robot.command.error", 1, "robotics");
    const result: RobotCommandResult = { success: false, command: cmd, executedAt, error: err.message };
    appendLog(result);
    return result;
  }
}

function simulateCommand(cmd: RobotCommand): any {
  switch (cmd.type) {
    case "move": return { axis: cmd.axis, moved: cmd.value, position: { x: 0, y: 0, z: 0, [cmd.axis]: cmd.value } };
    case "rotate": return { joint: cmd.joint, angle: cmd.angle, status: "rotated" };
    case "capture_image": return { captured: true, imageId: `img-${Date.now()}`, format: "png" };
    case "start_video": return { streaming: true, streamId: `stream-${Date.now()}` };
    case "stop_video": return { streaming: false };
    case "home": return { homed: true, position: { x: 0, y: 0, z: 0 } };
    case "set_light": return { intensity: cmd.intensity, status: "set" };
    case "focus": return { target: cmd.target, focused: true };
    default: return { status: "executed" };
  }
}

function appendLog(result: RobotCommandResult): void {
  commandLog.push(result);
  if (commandLog.length > MAX_LOG) commandLog.shift();
}

export async function runExamProtocol(protocol: "throat" | "ear" | "wound"): Promise<RobotCommandResult[]> {
  const sequences: Record<string, RobotCommand[]> = {
    throat: [
      { type: "home" },
      { type: "set_light", intensity: 90 },
      { type: "focus", target: "throat" },
      { type: "move", axis: "z", value: 10 },
      { type: "capture_image" },
    ],
    ear: [
      { type: "home" },
      { type: "set_light", intensity: 85 },
      { type: "focus", target: "ear" },
      { type: "move", axis: "x", value: 5 },
      { type: "rotate", joint: "wrist", angle: 30 },
      { type: "capture_image" },
    ],
    wound: [
      { type: "home" },
      { type: "set_light", intensity: 100 },
      { type: "focus", target: "wound" },
      { type: "start_video" },
      { type: "capture_image" },
    ],
  };

  const cmds = sequences[protocol] ?? [];
  const results: RobotCommandResult[] = [];
  for (const cmd of cmds) {
    results.push(await sendRobotCommand(cmd));
  }
  return results;
}

export function getRobotCommandLog(): RobotCommandResult[] {
  return [...commandLog];
}
