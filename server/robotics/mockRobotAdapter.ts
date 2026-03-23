import type { RobotCommand, RobotPose } from "../../shared/robotics";
import type { RobotDeviceAdapter } from "./deviceAdapter";

export class MockRobotAdapter implements RobotDeviceAdapter {
  private pose: RobotPose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };

  async connect() {}
  async disconnect() {}

  async getPose(): Promise<RobotPose> {
    return { ...this.pose };
  }

  async execute(command: RobotCommand): Promise<{ ok: boolean; message: string }> {
    switch (command.type) {
      case "moveToPose":
        if (command.pose) this.pose = { ...command.pose };
        return { ok: true, message: "Moved to pose" };
      case "jog":
        this.pose = {
          x: this.pose.x + (command.delta?.x ?? 0),
          y: this.pose.y + (command.delta?.y ?? 0),
          z: this.pose.z + (command.delta?.z ?? 0),
          rx: this.pose.rx + (command.delta?.rx ?? 0),
          ry: this.pose.ry + (command.delta?.ry ?? 0),
          rz: this.pose.rz + (command.delta?.rz ?? 0),
        };
        return { ok: true, message: "Jog completed" };
      case "stop":
        return { ok: true, message: "Motion stopped" };
      case "home":
        this.pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
        return { ok: true, message: "Returned home" };
      default:
        return { ok: true, message: `Executed ${command.type}` };
    }
  }
}
