export interface RawInput {
  text: string;
  source: "web" | "telegram" | "whatsapp";
  userId?: string;
  metadata?: Record<string, any>;
}

export interface InterfaceResult {
  input: RawInput;
  receivedAt: number;
  channel: string;
}

export class InterfaceLayer {
  receive(input: RawInput): InterfaceResult {
    return {
      input,
      receivedAt: Date.now(),
      channel: input.source,
    };
  }
}

export const interfaceLayer = new InterfaceLayer();
