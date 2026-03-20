export async function verifyEndpoint(path: string): Promise<boolean> {
  try {
    const res = await fetch(path, { method: "GET" });
    return res.ok || res.status === 401 || res.status === 403;
  } catch {
    return false;
  }
}

export async function verifyAllEndpoints(paths: string[]): Promise<Record<string, boolean>> {
  const results = await Promise.all(
    paths.map(async p => ({ path: p, ok: await verifyEndpoint(p) }))
  );
  return Object.fromEntries(results.map(r => [r.path, r.ok]));
}

export const CRITICAL_ENDPOINTS = [
  "/api/clinical/run",
  "/api/monitoring/health",
  "/api/patients/queue",
  "/api/audit/recent",
  "/api/outcome/weights",
];
