/**
 * Scope Delegation — dynamic, time-bound authority transfer between agents
 * Triage Agent can temporarily grant Workup Agent limited lab-ordering rights.
 */

export interface ScopeDelegation {
  id:             string;
  delegatedBy:    string;
  delegatedTo:    string;
  actions:        string[];
  reason:         string;
  createdAt:      number;
  expiresAt:      number;
  revoked?:       boolean;
}

const delegations: ScopeDelegation[] = [];
const TTL_DEFAULT_MS = 5 * 60 * 1000; // 5 minutes

function delegationId(): string {
  return `DEL-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

export function delegateScope(
  fromAgent:      string,
  toAgent:        string,
  allowedActions: string[],
  reason          = "task delegation",
  ttlMs           = TTL_DEFAULT_MS
): ScopeDelegation {
  const now = Date.now();
  const d: ScopeDelegation = {
    id:          delegationId(),
    delegatedBy: fromAgent,
    delegatedTo: toAgent,
    actions:     allowedActions,
    reason,
    createdAt:   now,
    expiresAt:   now + ttlMs,
  };
  delegations.push(d);
  console.log(`[ScopeDelegate] ${fromAgent} → ${toAgent}: [${allowedActions.join(",")}] for ${ttlMs / 1000}s`);
  return d;
}

export function revokeDelegate(id: string): boolean {
  const d = delegations.find((d) => d.id === id);
  if (d) { d.revoked = true; return true; }
  return false;
}

export function isDelegated(toAgent: string, action: string): boolean {
  const now = Date.now();
  return delegations.some(
    (d) => d.delegatedTo === toAgent && d.actions.includes(action) && d.expiresAt > now && !d.revoked
  );
}

export function getActiveDelegations(): ScopeDelegation[] {
  const now = Date.now();
  return delegations.filter((d) => d.expiresAt > now && !d.revoked);
}

export function getAllDelegations(): ScopeDelegation[] {
  return [...delegations];
}
