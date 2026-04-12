/**
 * Medical Plugin Registry
 * In-memory registry of clinical "muscle" plugins — deterministic, auditable services.
 * Supports health-check tracking, enable/disable toggle, and latency simulation.
 */

export interface Plugin {
  name:        string;
  description: string;
  status:      "healthy" | "degraded" | "disabled";
  latencyMs:   number;
  callCount:   number;
  lastCalled:  string | null;
  readOnly:    boolean;
}

const INITIAL_PLUGINS: Plugin[] = [
  { name: "diagnosis",    description: "Cognitive Brain diagnosis engine",          status: "healthy", latencyMs: 13,  callCount: 0, lastCalled: null, readOnly: true  },
  { name: "disposition",  description: "Disposition engine (ED/UC/HOME/FOLLOW_UP)", status: "healthy", latencyMs: 8,   callCount: 0, lastCalled: null, readOnly: true  },
  { name: "debate",       description: "Multi-specialist debate council",            status: "healthy", latencyMs: 25,  callCount: 0, lastCalled: null, readOnly: true  },
  { name: "monologue",    description: "Clinical internal monologue engine",         status: "healthy", latencyMs: 15,  callCount: 0, lastCalled: null, readOnly: true  },
  { name: "orders",       description: "Clinical order placement (safety-gated)",    status: "healthy", latencyMs: 40,  callCount: 0, lastCalled: null, readOnly: false },
  { name: "fhir",         description: "FHIR R4 EHR read/write adapter",            status: process.env.FHIR_BASE_URL ? "healthy" : "degraded", latencyMs: 120, callCount: 0, lastCalled: null, readOnly: false },
  { name: "billing",      description: "CPT/ICD coding + payer optimisation",       status: "healthy", latencyMs: 20,  callCount: 0, lastCalled: null, readOnly: false },
  { name: "evidence",     description: "PubMed + ClinicalTrials evidence retrieval", status: "healthy", latencyMs: 350, callCount: 0, lastCalled: null, readOnly: true  },
  { name: "audit",        description: "Audit hash chain + trace store",             status: "healthy", latencyMs: 3,   callCount: 0, lastCalled: null, readOnly: true  },
];

const plugins = new Map<string, Plugin>(INITIAL_PLUGINS.map((p) => [p.name, { ...p }]));

export function listPlugins(): Plugin[] {
  return [...plugins.values()];
}

export function getPlugin(name: string): Plugin | undefined {
  return plugins.get(name);
}

export function togglePlugin(name: string, status: Plugin["status"]): boolean {
  const p = plugins.get(name);
  if (!p) return false;
  p.status = status;
  return true;
}

export function recordPluginCall(name: string, latencyMs?: number) {
  const p = plugins.get(name);
  if (!p) return;
  p.callCount++;
  p.lastCalled = new Date().toISOString();
  if (latencyMs !== undefined) p.latencyMs = Math.round((p.latencyMs * 0.8) + (latencyMs * 0.2)); // EWA
}
