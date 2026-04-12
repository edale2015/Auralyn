/**
 * Agent Scope Engine (ASE) — unified, enforceable scope contract layer
 * Models express authority, implied authority, and denied actions per agent role.
 * Every AI action in the system must be evaluated through this engine.
 */

export type ScopeRule = {
  role:         string;
  description?: string;
  express:      string[];              // Hard-coded explicit permissions
  implied?:     string[];              // Conditional — allowed if needed for task
  denied?:      string[];              // Explicitly blocked — never allowed
  restricted?:  Record<string, string>;// Action → override requirement
  constraints?: {
    requires?:     string[];           // e.g. ["physician_signed", "confidence > 0.9"]
    audit_level?:  "LOW" | "MEDIUM" | "HIGH";
    maxConfidence?:number;
    minConfidence?:number;
  };
};

export type ActionRequest = {
  agentRole:  string;
  action:     string;
  context:    Record<string, any>;
};

export type ScopeDecision = {
  allowed:          boolean;
  reason?:          string;
  requiresOverride?:boolean;
  auditLevel?:      "LOW" | "MEDIUM" | "HIGH";
  authority?:       "express" | "implied" | "denied" | "restricted" | "unknown";
};

// ── Pre-configured medical agent scope rules ──────────────────────────────────
export const MEDICAL_SCOPE_RULES: ScopeRule[] = [
  {
    role:        "triage_agent",
    description: "Reads patient data, runs triage scoring, generates disposition recommendations",
    express:     ["read:patient_data", "read:vitals", "execute:triage_decision", "read:risk_score"],
    implied:     ["read:kb_rules", "read:clinical_scores", "read:news2", "read:qsofa"],
    denied:      ["write:ehr", "execute:orders", "modify:billing", "execute:prescription", "write:patient_data"],
    constraints: { audit_level: "MEDIUM" },
  },
  {
    role:        "treatment_agent",
    description: "Suggests evidence-based treatments — cannot prescribe without physician override",
    express:     ["suggest:treatment", "read:diagnosis", "read:formulary", "suggest:labs"],
    implied:     ["read:patient_data", "read:clinical_guidelines"],
    denied:      ["write:ehr", "modify:billing"],
    restricted:  { "execute:prescription": "physician_override_required" },
    constraints: { audit_level: "HIGH", requires: ["physician_signed"] },
  },
  {
    role:        "ehr_agent",
    description: "Writes to EHR and submits orders — highest risk, requires physician sign + high confidence",
    express:     ["write:ehr", "submit:orders", "read:patient_data", "execute:ui_click"],
    implied:     ["read:vitals"],
    denied:      ["modify:billing", "delete:patient_data"],
    constraints: { audit_level: "HIGH", requires: ["physician_signed", "confidence > 0.9"] },
  },
  {
    role:        "escalation_agent",
    description: "Triggers escalations to ER/ICU/RRT — critical-only actions",
    express:     ["execute:escalation", "send:alert", "read:patient_data", "read:vitals"],
    implied:     ["read:risk_score", "read:news2"],
    denied:      ["write:ehr", "execute:prescription", "modify:billing"],
    constraints: { audit_level: "HIGH" },
  },
  {
    role:        "learning_agent",
    description: "Updates RLHF weights from outcomes — bounded by FDA-safe ±2% cap",
    express:     ["read:outcomes", "modify:weights", "read:feedback"],
    implied:     ["read:patient_data"],
    denied:      ["write:ehr", "execute:orders", "execute:escalation"],
    constraints: { audit_level: "HIGH", requires: ["confidence > 0.9"] },
  },
  {
    role:        "intervention_agent",
    description: "Suggests and scope-gated executes clinical interventions — sepsis bundles, fluids, escalation",
    express:     ["suggest:intervention", "suggest:treatment", "read:patient_data", "read:vitals", "read:risk_score"],
    implied:     ["order:labs", "send:alert"],
    denied:      ["write:ehr", "modify:billing", "delete:patient_data"],
    restricted:  { "execute:escalation": "physician_override_required" },
    constraints: { audit_level: "HIGH", requires: ["confidence > 0.9"] },
  },
  {
    role:        "billing_agent",
    description: "CPT coding and revenue — reads only, modifies billing with physician review",
    express:     ["read:cpt_codes", "suggest:billing", "read:diagnosis"],
    implied:     ["read:patient_data"],
    restricted:  { "modify:billing": "physician_review_required" },
    denied:      ["write:ehr", "execute:orders", "execute:escalation"],
    constraints: { audit_level: "MEDIUM" },
  },
];

export class AgentScopeEngine {
  private rules: Map<string, ScopeRule>;
  private evaluationLog: Array<{ request: ActionRequest; decision: ScopeDecision; at: string }> = [];
  private readonly MAX_LOG = 2000;

  constructor(scopeRules: ScopeRule[] = MEDICAL_SCOPE_RULES) {
    this.rules = new Map(scopeRules.map((r) => [r.role, r]));
  }

  evaluate(request: ActionRequest): ScopeDecision {
    const rule = this.rules.get(request.agentRole);

    if (!rule) {
      const dec: ScopeDecision = { allowed: false, reason: "No scope defined for this agent role", authority: "unknown" };
      this._log(request, dec);
      return dec;
    }

    // ── DENIED (hard block — never passes) ─────────────────────────────────
    if (rule.denied?.includes(request.action)) {
      const dec: ScopeDecision = {
        allowed:    false,
        reason:     "Explicitly denied — action is outside this agent's scope contract",
        authority:  "denied",
        auditLevel: rule.constraints?.audit_level ?? "HIGH",
      };
      this._log(request, dec);
      return dec;
    }

    // ── RESTRICTED (requires override — allowed ONLY when satisfied) ────────
    if (rule.restricted?.[request.action]) {
      const overrideType = rule.restricted[request.action];
      const overrideKey  = overrideType.replace("_required", "");
      const satisfied    = request.context.physicianSigned || request.context[overrideKey];
      if (!satisfied) {
        const dec: ScopeDecision = {
          allowed:          false,
          requiresOverride: true,
          reason:           `${overrideType}: explicit physician approval needed`,
          authority:        "restricted",
          auditLevel:       "HIGH",
        };
        this._log(request, dec);
        return dec;
      }
      // Override satisfied — allow and audit at HIGH
      const dec: ScopeDecision = { allowed: true, authority: "restricted", auditLevel: "HIGH" };
      this._log(request, dec);
      return dec;
    }

    // ── EXPRESS (hard-coded explicit permission) ─────────────────────────────
    if (rule.express.includes(request.action)) {
      const dec = this._checkConstraints(rule, request, "express");
      this._log(request, dec);
      return dec;
    }

    // ── IMPLIED (conditional — allowed if needed for task completion) ────────
    if (rule.implied?.includes(request.action)) {
      const dec = this._checkConstraints(rule, request, "implied");
      this._log(request, dec);
      return dec;
    }

    // ── Default: outside scope ───────────────────────────────────────────────
    const dec: ScopeDecision = {
      allowed:   false,
      reason:    `Action "${request.action}" is outside the defined scope for role "${request.agentRole}"`,
      authority: "unknown",
      auditLevel:"HIGH",
    };
    this._log(request, dec);
    return dec;
  }

  private _checkConstraints(rule: ScopeRule, request: ActionRequest, authority: ScopeDecision["authority"]): ScopeDecision {
    const c = rule.constraints;
    if (!c) return { allowed: true, authority, auditLevel: "LOW" };

    if (c.requires?.includes("physician_signed") && !request.context.physicianSigned) {
      return { allowed: false, requiresOverride: true, reason: "Physician signature required before execution", authority, auditLevel: "HIGH" };
    }

    if (c.requires?.includes("confidence > 0.9") && (request.context.confidence ?? 0) < 0.9) {
      return { allowed: false, reason: `Confidence ${request.context.confidence ?? 0} < 0.9 required for this action`, authority, auditLevel: "HIGH" };
    }

    return { allowed: true, authority, auditLevel: c.audit_level ?? "MEDIUM" };
  }

  private _log(request: ActionRequest, decision: ScopeDecision) {
    if (this.evaluationLog.length >= this.MAX_LOG) this.evaluationLog.shift();
    this.evaluationLog.push({ request, decision, at: new Date().toISOString() });
  }

  getLog() { return [...this.evaluationLog]; }

  getStats() {
    const total   = this.evaluationLog.length;
    const allowed = this.evaluationLog.filter((e) => e.decision.allowed).length;
    const denied  = total - allowed;
    const overrides = this.evaluationLog.filter((e) => e.decision.requiresOverride).length;
    return { total, allowed, denied, overrides, allowedRate: total ? allowed / total : 1, deniedRate: total ? denied / total : 0 };
  }

  addRole(rule: ScopeRule) { this.rules.set(rule.role, rule); }
  getRole(role: string)    { return this.rules.get(role); }
  listRoles()              { return [...this.rules.keys()]; }
}

// Singleton instance used by action guard + scope controller
export const scopeEngine = new AgentScopeEngine(MEDICAL_SCOPE_RULES);
