import { EventEmitter } from "events";

export const controlBus = new EventEmitter();
controlBus.setMaxListeners(100);

export type ControlEventType =
  | "update"
  | "alert"
  | "reset"
  | "model_switch"
  | "template_repair"
  | "simulation_done"
  | "stress_done"
  | "export_done";

export function broadcast(event: ControlEventType | string, data: unknown): void {
  controlBus.emit(event, data);
  controlBus.emit("update", { event, data, ts: Date.now() });
}
