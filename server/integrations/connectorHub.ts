export type ConnectorFn = (payload: Record<string, any>) => Promise<unknown>;

const connectors: Record<string, ConnectorFn> = {};

export function registerConnector(name: string, fn: ConnectorFn): void {
  connectors[name] = fn;
}

export function listConnectors(): string[] {
  return Object.keys(connectors);
}

export async function callConnector(name: string, payload: Record<string, any>): Promise<unknown> {
  const fn = connectors[name];
  if (!fn) throw new Error(`Connector not registered: ${name}`);
  return fn(payload);
}

export async function checkIntegrations(): Promise<Record<string, "ok" | "down">> {
  const targets = listConnectors();
  const results: Record<string, "ok" | "down"> = {};
  for (const t of targets) {
    try {
      await callConnector(t, { text: "ping" });
      results[t] = "ok";
    } catch {
      results[t] = "down";
    }
  }
  return results;
}
