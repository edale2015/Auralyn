import type { RobotCommand, RobotLimits, SafetyState } from "../../shared/robotics";

export class RoboticSafetyGate {
  constructor(private limits: RobotLimits) {}

  validate(command: RobotCommand, safety: SafetyState) {
    if (safety.estopActive) return { allowed: false, reason: "E-STOP is active" };
    if (!safety.humanPresent) return { allowed: false, reason: "No supervised operator detected" };
    if (!safety.clinicianApproved && command.type !== "stop" && command.type !== "setMode") {
      return { allowed: false, reason: "Clinician approval required" };
    }
    if (safety.collisionRisk === "HIGH") return { allowed: false, reason: "High collision risk" };

    if (command.pose) {
      const { x, y, z } = command.pose;
      if (
        x < this.limits.xMin || x > this.limits.xMax ||
        y < this.limits.yMin || y > this.limits.yMax ||
        z < this.limits.zMin || z > this.limits.zMax
      ) {
        return { allowed: false, reason: "Requested pose is outside safe bounds" };
      }
    }

    if ((command.velocity ?? 0) > this.limits.maxVelocity) {
      return { allowed: false, reason: "Velocity exceeds limit" };
    }

    return { allowed: true };
  }
}
