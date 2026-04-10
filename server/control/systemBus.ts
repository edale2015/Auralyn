import { controlBus } from "./controlBus";

export const systemBus = controlBus;

export function publish(event: string, data: unknown): void {
  controlBus.emit(event, data);
}

export function subscribe(event: string, handler: (data: unknown) => void): void {
  controlBus.on(event, handler);
}

export function unsubscribe(event: string, handler: (data: unknown) => void): void {
  controlBus.off(event, handler);
}

export function publishUpdate(data: unknown): void {
  publish("update", data);
}
