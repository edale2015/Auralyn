export type IntegrationFn = (payload: unknown) => Promise<unknown>;

const integrations: Record<string, IntegrationFn> = {};

export function addIntegration(name: string, fn: IntegrationFn): void {
  integrations[name] = fn;
}

export function removeIntegration(name: string): boolean {
  if (!integrations[name]) return false;
  delete integrations[name];
  return true;
}

export function listIntegrations(): string[] {
  return Object.keys(integrations);
}

export async function runIntegration(name: string, payload: unknown): Promise<unknown> {
  const fn = integrations[name];
  if (!fn) throw new Error(`Integration '${name}' not registered`);
  return fn(payload);
}

export async function connectorHealth(
  connectors: Array<{ name: string; ping: () => Promise<void> }>
): Promise<Record<string, "ok" | "fail">> {
  const status: Record<string, "ok" | "fail"> = {};
  await Promise.all(
    connectors.map(async c => {
      try { await c.ping(); status[c.name] = "ok"; }
      catch { status[c.name] = "fail"; }
    })
  );
  return status;
}
