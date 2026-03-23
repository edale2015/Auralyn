export type DesktopAction =
  | { type: "moveMouse"; x: number; y: number }
  | { type: "click"; button?: "left" | "right" }
  | { type: "typeText"; text: string }
  | { type: "pressKey"; key: string }
  | { type: "wait"; ms: number }
  | { type: "captureScreen" };

export type DesktopAdapterResult = {
  ok: boolean;
  details?: any;
};

export interface DesktopAdapter {
  execute(action: DesktopAction): Promise<DesktopAdapterResult>;
}

export class NullDesktopAdapter implements DesktopAdapter {
  async execute(action: DesktopAction): Promise<DesktopAdapterResult> {
    return {
      ok: true,
      details: { mode: "null-adapter", action },
    };
  }
}

export function createDesktopAdapter(): DesktopAdapter {
  return new NullDesktopAdapter();
}
