/**
 * Agent Scope Claims — fine-grained value-bounded limits on top of coarse scope
 *
 * Article — "Agent Scope Is the Concept That Defines Modern AI Systems":
 *   "Modern systems go further. They combine coarse-grained scopes (broad
 *   permissions) with fine-grained claims (specific limits).
 *   Example: Scope: transactions:read + Claim: max_amount = $1000
 *   This is how you move from 'access control' to controlled intelligence."
 *
 * What's already present:
 *   agentScopeEngine.ts defines coarse permissions:
 *     express: ["read:patient_data", "execute:triage_decision", ...]
 *     denied:  ["write:ehr", "execute:prescription", ...]
 *   These answer "can this agent do X at all?" — YES/NO per action type.
 *
 * What's missing:
 *   Coarse scope says "triage_agent can read:patient_data" — but not:
 *     - How many patients per session? (max_patient_count)
 *     - How old can the records be? (max_record_age_days)
 *     - Can it read PHI outside current encounter? (phi_scope)
 *   Coarse scope says "treatment_agent can suggest:treatment" — but not:
 *     - What's the maximum dose it can suggest? (max_dose_mg)
 *     - Can it suggest controlled substances? (controlled_substance_allowed)
 *   Without claims, a "triage_agent can read:patient_data" claim is unbounded
 *   — it could read 50,000 patients' records. Claims are the bounds.
 *
 * Clinical analogies to the article's finance example:
 *   Finance: transactions:read + max_amount = $1000
 *   Medical: read:patient_data + max_patient_count = 10 + phi_scope = "current_encounter"
 *   Medical: suggest:treatment + max_dose_mg = 500 + controlled_substance_allowed = false
 *   Medical: write:ehr + require_physician_cosign = true + max_entries_per_session = 20
 */

import { randomUUID } from "crypto";

// ── Claim value types ─────────────────────────────────────────────────────────

export type ClaimValueType = "integer" | "float" | "boolean" | "string" | "enum" | "list";

export interface ClaimDefinition {
  name:        string;             // e.g. "max_patient_count"
  type:        ClaimValueType;
  description: string;
  applyTo:     string[];           // which coarse actions this claim constrains
  enumValues?: string[];           // for enum type
}

export interface ClaimValue {
  claim:    string;                // name of the claim
  value:    string | number | boolean | string[];
}

/** A full scope grant: a coarse permission + its claim bounds */
export interface ScopedGrant {
  grantId:      string;
  agentRole:    string;
  action:       string;            // coarse action this grant covers
  claims:       ClaimValue[];      // specific bounds on this grant
  issuedAt:     string;
  expiresAt?:   string;            // TTL for temporary scope expansions
  issuedBy:     string;            // "system" | physician-id | admin-id
  purpose?:     string;            // narrative: why was this scope granted?
}

export interface ClaimViolation {
  grantId:      string;
  agentRole:    string;
  action:       string;
  claim:        string;
  limit:        string | number | boolean | string[];
  actual:       string | number | boolean | string[];
  severity:     "WARN" | "BLOCK";
  message:      string;
}

// ── Claim catalog — all recognized claims across the medical system ────────────

export const CLAIM_CATALOG: ClaimDefinition[] = [
  {
    name: "max_patient_count",
    type: "integer",
    description: "Maximum number of distinct patient records accessible per session",
    applyTo: ["read:patient_data", "read:vitals", "read:outcomes", "read:risk_score"],
  },
  {
    name: "max_record_age_days",
    type: "integer",
    description: "Oldest patient record age (in days) the agent may access",
    applyTo: ["read:patient_data", "read:outcomes"],
  },
  {
    name: "phi_scope",
    type: "enum",
    description: "Which PHI the agent may access",
    applyTo: ["read:patient_data", "write:ehr"],
    enumValues: ["current_encounter", "current_visit", "last_90_days", "full_record"],
  },
  {
    name: "max_dose_mg",
    type: "float",
    description: "Maximum single-dose amount (mg) an agent may suggest for any medication",
    applyTo: ["suggest:treatment", "suggest:intervention"],
  },
  {
    name: "controlled_substance_allowed",
    type: "boolean",
    description: "Whether the agent may suggest controlled substances (Schedule I–V)",
    applyTo: ["suggest:treatment", "suggest:intervention"],
  },
  {
    name: "require_physician_cosign",
    type: "boolean",
    description: "Whether every EHR entry or order must be co-signed by a physician",
    applyTo: ["write:ehr", "submit:orders", "execute:prescription"],
  },
  {
    name: "max_entries_per_session",
    type: "integer",
    description: "Maximum EHR entries or order submissions per agent session",
    applyTo: ["write:ehr", "submit:orders"],
  },
  {
    name: "weight_delta_cap_pct",
    type: "float",
    description: "Maximum percentage weight change a learning agent may apply per RLHF cycle",
    applyTo: ["modify:weights"],
  },
  {
    name: "allowed_billing_codes",
    type: "list",
    description: "Explicit CPT code allowlist for billing agent suggestions",
    applyTo: ["suggest:billing", "modify:billing"],
  },
  {
    name: "max_escalation_tier",
    type: "enum",
    description: "Highest escalation tier the agent may trigger autonomously",
    applyTo: ["execute:escalation", "send:alert"],
    enumValues: ["TIER_1", "TIER_2", "TIER_3", "TIER_CRITICAL"],
  },
  {
    name: "patient_age_min",
    type: "integer",
    description: "Minimum patient age this agent may treat (blocks pediatric access below threshold)",
    applyTo: ["execute:triage_decision", "suggest:treatment"],
  },
  {
    name: "patient_age_max",
    type: "integer",
    description: "Maximum patient age this agent is scoped for (e.g. geriatric specialist scope)",
    applyTo: ["execute:triage_decision", "suggest:treatment"],
  },
];

// ── Pre-configured grants for Auralyn medical agents ─────────────────────────

export const MEDICAL_DEFAULT_GRANTS: ScopedGrant[] = [
  {
    grantId:   "grant-triage-001",
    agentRole: "triage_agent",
    action:    "read:patient_data",
    issuedAt:  new Date().toISOString(),
    issuedBy:  "system",
    purpose:   "Standard triage session access",
    claims: [
      { claim: "max_patient_count",    value: 50 },
      { claim: "max_record_age_days",  value: 30 },
      { claim: "phi_scope",            value: "current_encounter" },
    ],
  },
  {
    grantId:   "grant-triage-002",
    agentRole: "triage_agent",
    action:    "execute:triage_decision",
    issuedAt:  new Date().toISOString(),
    issuedBy:  "system",
    purpose:   "Standard triage decision execution",
    claims: [
      { claim: "patient_age_min", value: 18 },   // adult scope only
      { claim: "patient_age_max", value: 110 },
    ],
  },
  {
    grantId:   "grant-treatment-001",
    agentRole: "treatment_agent",
    action:    "suggest:treatment",
    issuedAt:  new Date().toISOString(),
    issuedBy:  "system",
    purpose:   "Evidence-based treatment suggestion",
    claims: [
      { claim: "max_dose_mg",                  value: 1000 },
      { claim: "controlled_substance_allowed", value: false },
    ],
  },
  {
    grantId:   "grant-ehr-001",
    agentRole: "ehr_agent",
    action:    "write:ehr",
    issuedAt:  new Date().toISOString(),
    issuedBy:  "system",
    purpose:   "EHR documentation within encounter",
    claims: [
      { claim: "require_physician_cosign", value: true },
      { claim: "max_entries_per_session",  value: 20 },
      { claim: "phi_scope",                value: "current_encounter" },
    ],
  },
  {
    grantId:   "grant-ehr-002",
    agentRole: "ehr_agent",
    action:    "submit:orders",
    issuedAt:  new Date().toISOString(),
    issuedBy:  "system",
    purpose:   "Order submission within encounter",
    claims: [
      { claim: "require_physician_cosign", value: true },
      { claim: "max_entries_per_session",  value: 10 },
    ],
  },
  {
    grantId:   "grant-learning-001",
    agentRole: "learning_agent",
    action:    "modify:weights",
    issuedAt:  new Date().toISOString(),
    issuedBy:  "system",
    purpose:   "FDA-bounded RLHF weight updates",
    claims: [
      { claim: "weight_delta_cap_pct", value: 2.0 },
    ],
  },
  {
    grantId:   "grant-escalation-001",
    agentRole: "escalation_agent",
    action:    "execute:escalation",
    issuedAt:  new Date().toISOString(),
    issuedBy:  "system",
    purpose:   "Autonomous escalation — TIER_2 max",
    claims: [
      { claim: "max_escalation_tier", value: "TIER_2" },
    ],
  },
  {
    grantId:   "grant-billing-001",
    agentRole: "billing_agent",
    action:    "suggest:billing",
    issuedAt:  new Date().toISOString(),
    issuedBy:  "system",
    purpose:   "CPT code suggestion — office visit codes only",
    claims: [
      { claim: "allowed_billing_codes", value: ["99202","99203","99204","99205","99211","99212","99213","99214","99215"] },
    ],
  },
];

// ── Claim evaluator ───────────────────────────────────────────────────────────

export interface ClaimCheckInput {
  agentRole:  string;
  action:     string;
  requestedValues: Record<string, string | number | boolean | string[]>;
}

export interface ClaimCheckResult {
  passed:     boolean;
  violations: ClaimViolation[];
  grants:     ScopedGrant[];    // which grants were evaluated
}

class ScopeClaimsEngine {
  private grants: Map<string, ScopedGrant[]> = new Map();  // agentRole → grants

  constructor(grants: ScopedGrant[]) {
    for (const g of grants) {
      const list = this.grants.get(g.agentRole) ?? [];
      list.push(g);
      this.grants.set(g.agentRole, list);
    }
  }

  /** Issue a temporary or permanent scope expansion. */
  issueGrant(grant: Omit<ScopedGrant, "grantId" | "issuedAt">): ScopedGrant {
    const full: ScopedGrant = {
      ...grant,
      grantId:  `grant-${randomUUID().slice(0, 8)}`,
      issuedAt: new Date().toISOString(),
    };
    const list = this.grants.get(grant.agentRole) ?? [];
    list.push(full);
    this.grants.set(grant.agentRole, list);
    return full;
  }

  /** Revoke a specific grant by ID. */
  revokeGrant(grantId: string): boolean {
    let revoked = false;
    for (const [role, grants] of this.grants.entries()) {
      const filtered = grants.filter((g) => g.grantId !== grantId);
      if (filtered.length !== grants.length) {
        this.grants.set(role, filtered);
        revoked = true;
      }
    }
    return revoked;
  }

  /** Check whether an action request satisfies all fine-grained claims. */
  check(input: ClaimCheckInput): ClaimCheckResult {
    const agentGrants = this.grants.get(input.agentRole) ?? [];
    const actionGrants = agentGrants.filter(
      (g) => g.action === input.action && !this.isExpired(g)
    );

    if (actionGrants.length === 0) {
      return { passed: true, violations: [], grants: [] };  // no claims = no constraints
    }

    const violations: ClaimViolation[] = [];

    for (const grant of actionGrants) {
      for (const claimValue of grant.claims) {
        const requested = input.requestedValues[claimValue.claim];
        if (requested === undefined) continue;  // claim not being exercised — skip

        const violation = this.evaluateClaim(grant, claimValue, requested);
        if (violation) violations.push(violation);
      }
    }

    return { passed: violations.length === 0, violations, grants: actionGrants };
  }

  /** Get all grants for an agent role. */
  getGrants(agentRole: string): ScopedGrant[] {
    return (this.grants.get(agentRole) ?? []).filter((g) => !this.isExpired(g));
  }

  /** Get all grants in the system. */
  getAllGrants(): ScopedGrant[] {
    return [...this.grants.values()].flat().filter((g) => !this.isExpired(g));
  }

  private isExpired(grant: ScopedGrant): boolean {
    if (!grant.expiresAt) return false;
    return new Date(grant.expiresAt) < new Date();
  }

  private evaluateClaim(
    grant:   ScopedGrant,
    cv:      ClaimValue,
    actual:  string | number | boolean | string[]
  ): ClaimViolation | null {
    const def = CLAIM_CATALOG.find((c) => c.name === cv.claim);
    if (!def) return null;

    const limit = cv.value;

    switch (def.type) {
      case "integer":
      case "float": {
        if (typeof actual === "number" && typeof limit === "number" && actual > limit) {
          return {
            grantId:   grant.grantId,
            agentRole: grant.agentRole,
            action:    grant.action,
            claim:     cv.claim,
            limit,
            actual,
            severity:  "BLOCK",
            message:   `Claim "${cv.claim}" violated: requested ${actual} exceeds limit ${limit}`,
          };
        }
        break;
      }
      case "boolean": {
        if (actual === true && limit === false) {
          return {
            grantId:   grant.grantId,
            agentRole: grant.agentRole,
            action:    grant.action,
            claim:     cv.claim,
            limit,
            actual,
            severity:  "BLOCK",
            message:   `Claim "${cv.claim}" violated: action not permitted (limit=false)`,
          };
        }
        break;
      }
      case "enum": {
        const enumLimit = limit as string;
        const allowed   = def.enumValues ?? [];
        const limitIdx  = allowed.indexOf(enumLimit);
        const actualIdx = allowed.indexOf(actual as string);
        if (actualIdx > limitIdx) {
          return {
            grantId:   grant.grantId,
            agentRole: grant.agentRole,
            action:    grant.action,
            claim:     cv.claim,
            limit:     enumLimit,
            actual:    actual as string,
            severity:  "BLOCK",
            message:   `Claim "${cv.claim}" violated: "${actual}" exceeds permitted tier "${enumLimit}"`,
          };
        }
        break;
      }
      case "list": {
        const allowedList = limit as string[];
        const requestedList = Array.isArray(actual) ? actual : [actual as string];
        const blocked = requestedList.filter((v) => !allowedList.includes(String(v)));
        if (blocked.length > 0) {
          return {
            grantId:   grant.grantId,
            agentRole: grant.agentRole,
            action:    grant.action,
            claim:     cv.claim,
            limit:     allowedList,
            actual:    requestedList,
            severity:  "BLOCK",
            message:   `Claim "${cv.claim}" violated: values [${blocked.join(", ")}] not in allowlist`,
          };
        }
        break;
      }
    }

    return null;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
export const scopeClaimsEngine = new ScopeClaimsEngine(MEDICAL_DEFAULT_GRANTS);

// ── Convenience re-export ─────────────────────────────────────────────────────
export type { ScopeClaimsEngine };
