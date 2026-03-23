import type { RobotCommand, RobotPose } from "../../shared/robotics";

export interface RobotDeviceAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getPose(): Promise<RobotPose>;
  execute(command: RobotCommand): Promise<{ ok: boolean; message: string }>;
}
