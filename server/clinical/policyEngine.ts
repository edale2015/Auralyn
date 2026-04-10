export interface Policy {
  key:       string;
  enabled:   boolean;
  params?:   Record<string, unknown>;
  region?:   string;
  payer?:    string;
  updatedAt: string;
}

const defaultPolicies: Policy[] = [
  { key: "NY.requirePhysicianReview",    enabled: true,  region: "NY",           updatedAt: new Date().toISOString() },
  { key: "NY.mandatoryTriageEscalation", enabled: true,  region: "NY",           updatedAt: new Date().toISOString() },
  { key: "MEDICARE.extendedMentalHealth", enabled: true, payer: "MEDICARE",      updatedAt: new Date().toISOString() },
  { key: "MEDICAID.limitedOrdering",     enabled: false, payer: "MEDICAID",      updatedAt: new Date().toISOString() },
  { key: "global.aiAssistSuggestions",   enabled: true,                           updatedAt: new Date().toISOString() },
  { key: "global.ambulatoryFastTrack",   enabled: true,  params: { maxWait: 30 }, updatedAt: new Date().toISOString() },
  { key: "global.safetyKillSwitch",      enabled: false,                          updatedAt: new Date().toISOString() },
];

const policyStore = new Map<string, Policy>(
  defaultPolicies.map(p => [p.key, p])
);

export function getPolicy(key: string): Policy {
  return policyStore.get(key) ?? { key, enabled: false, updatedAt: new Date().toISOString() };
}

export function isPolicyEnabled(key: string): boolean {
  return getPolicy(key).enabled;
}

export function setPolicy(key: string, enabled: boolean, params?: Record<string, unknown>): Policy {
  const existing = policyStore.get(key);
  const updated: Policy = {
    ...existing,
    key,
    enabled,
    params:    params ?? existing?.params,
    updatedAt: new Date().toISOString(),
  };
  policyStore.set(key, updated);
  return updated;
}

export function getPoliciesForContext(opts: { region?: string; payer?: string }): Policy[] {
  return Array.from(policyStore.values()).filter(p => {
    if (opts.region && p.region && p.region !== opts.region) return false;
    if (opts.payer  && p.payer  && p.payer  !== opts.payer)  return false;
    return true;
  });
}

export function getAllPolicies(): Policy[] {
  return Array.from(policyStore.values());
}

export function globalKillSwitch(safetyMismatchRate: number, threshold = 0.02): void {
  if (safetyMismatchRate > threshold || isPolicyEnabled("global.safetyKillSwitch")) {
    throw new Error(`SYSTEM HALTED: Safety mismatch rate ${(safetyMismatchRate * 100).toFixed(2)}% exceeds ${(threshold * 100)}% threshold`);
  }
}
