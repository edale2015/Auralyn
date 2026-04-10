import type { ComponentType } from "react";

export const panels: Record<string, ComponentType<any>> = {};

export function registerPanel(name: string, component: ComponentType<any>): void {
  panels[name] = component;
}

export function unregisterPanel(name: string): void {
  delete panels[name];
}

export function listPanels(): string[] {
  return Object.keys(panels);
}
