import { randomUUID } from "crypto";
import { MockRobotAdapter } from "./mockRobotAdapter";
import { RoboticSafetyGate } from "./safetyGate";
import type { RobotCommand, SafetyState } from "../../shared/robotics";

const adapter = new MockRobotAdapter();
const safetyGate = new RoboticSafetyGate({
  xMin: -200, xMax: 200,
  yMin: -200, yMax: 200,
  zMin: 0,    zMax: 300,
  maxVelocity: 40,
  maxAngularVelocity: 20,
});

export class RoboticController {
  async issueCommand(
    input: Omit<RobotCommand, "commandId" | "issuedAt">,
    safety: SafetyState
  ) {
    const command: RobotCommand = {
      ...input,
      commandId: randomUUID(),
      issuedAt: new Date().toISOString(),
    };

    const gate = safetyGate.validate(command, safety);
    if (!gate.allowed) {
      return { ok: false, rejected: true, reason: gate.reason, command };
    }

    const result = await adapter.execute(command);
    return {
      ok: result.ok,
      rejected: false,
      message: result.message,
      command,
      pose: await adapter.getPose(),
    };
  }

  async getPose() {
    return adapter.getPose();
  }
}
