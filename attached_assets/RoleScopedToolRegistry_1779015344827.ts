/**
 * RoleScopedToolRegistry — small, distinct toolsets per agent role.
 *
 * The problem the article describes: as you add tools over time, every
 * agent ends up seeing all of them. The action space inflates, tool
 * descriptions overlap, the model picks the wrong one.
 *
 * The fix: each role gets a minimal, curated tool list. The differential
 * agent doesn't see `cpt_lookup`. The billing agent doesn't see
 * `heart_score_calc`. The triage agent doesn't see anything that requires
 * a confirmed diagnosis.
 *
 * This registry also enforces NAMING DISCIPLINE — overlapping tool names
 * (e.g., `search_kb` vs `kb_lookup` vs `lookup_guidelines`) are flagged
 * at registration time, before they confuse a model in production.
 */

import { AgentRole } from "./types";

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  /** Roles allowed to call this tool. Single role is preferred. */
  allowedRoles: AgentRole[];
  /** Short keyword for collision detection (e.g., "kb_search", "calc"). */
  capabilityTag: string;
}

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "enum";
  required: boolean;
  description: string;
  enumValues?: string[];
}

export class ToolNamingViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolNamingViolation";
  }
}

export class RoleScopedToolRegistry {
  private tools: Map<string, ToolSchema> = new Map();
  /** capabilityTag → role → tool name. For collision detection. */
  private byCapability: Map<string, Map<AgentRole, string>> = new Map();

  register(tool: ToolSchema): void {
    if (this.tools.has(tool.name)) {
      throw new ToolNamingViolation(`Tool name '${tool.name}' already registered.`);
    }
    // Detect cross-role overlap on the same capability.
    for (const role of tool.allowedRoles) {
      const capMap = this.byCapability.get(tool.capabilityTag) ?? new Map();
      const existing = capMap.get(role);
      if (existing && existing !== tool.name) {
        throw new ToolNamingViolation(
          `Capability '${tool.capabilityTag}' already has tool '${existing}' for role '${role}'. ` +
            `Refusing to register '${tool.name}'. Two tools that do the same thing for the same ` +
            `role is exactly the failure mode this registry exists to prevent.`,
        );
      }
      capMap.set(role, tool.name);
      this.byCapability.set(tool.capabilityTag, capMap);
    }
    this.tools.set(tool.name, tool);
  }

  /** Tools visible to a given role. */
  toolsFor(role: AgentRole): ToolSchema[] {
    return [...this.tools.values()].filter((t) => t.allowedRoles.includes(role));
  }

  /** Names only — convenient for prompt assembly. */
  toolNamesFor(role: AgentRole): string[] {
    return this.toolsFor(role).map((t) => t.name);
  }

  /** Is this role allowed to call this tool? */
  canCall(role: AgentRole, toolName: string): boolean {
    const tool = this.tools.get(toolName);
    if (!tool) return false;
    return tool.allowedRoles.includes(role);
  }

  /** Audit: how big is each role's action space? */
  actionSpaceSizes(): Record<AgentRole, number> {
    const result: Record<AgentRole, number> = {
      triage: 0,
      differential: 0,
      disposition: 0,
      billing: 0,
      supervisor: 0,
    };
    for (const t of this.tools.values()) {
      for (const r of t.allowedRoles) result[r] += 1;
    }
    return result;
  }
}

// ─── Recommended Auralyn tool set ──────────────────────────────────────────
//
// This is a STARTING POINT. The principle: each tool has exactly one
// purpose, and is exposed to exactly the roles that need it.

export const AURALYN_DEFAULT_TOOLS: ToolSchema[] = [
  // ─── Triage tools ───────────────────────────────────────────────────────
  {
    name: "intake_vitals_lookup",
    description: "Read the vitals captured during patient intake. Use ONLY for the current encounter.",
    capabilityTag: "intake_read",
    allowedRoles: ["triage"],
    parameters: {
      encounterId: { type: "string", required: true, description: "Current encounter id" },
    },
  },
  {
    name: "red_flag_rule_check",
    description: "Run the deterministic red-flag rule engine against the current chief complaint and vitals.",
    capabilityTag: "red_flag_check",
    allowedRoles: ["triage", "supervisor"],
    parameters: {
      encounterId: { type: "string", required: true, description: "Current encounter id" },
    },
  },

  // ─── Differential tools ─────────────────────────────────────────────────
  {
    name: "kb_search_clinical",
    description:
      "Search the clinical knowledge base for diagnostic criteria, differential considerations, " +
      "and finding interpretations. Returns ranked chunks with citations.",
    capabilityTag: "kb_search_clinical",
    allowedRoles: ["differential", "disposition", "supervisor"],
    parameters: {
      query: { type: "string", required: true, description: "Natural-language clinical query" },
      maxResults: { type: "number", required: false, description: "Default 5, max 10" },
    },
  },
  {
    name: "risk_score_calc",
    description:
      "Compute a validated clinical risk score (HEART, Wells, PERC, NEXUS, PECARN, etc.). " +
      "Returns score, interpretation, and the inputs used.",
    capabilityTag: "risk_calc",
    allowedRoles: ["differential", "disposition"],
    parameters: {
      scoreName: {
        type: "enum",
        required: true,
        description: "Which validated score to compute",
        enumValues: ["HEART", "Wells_PE", "PERC", "NEXUS_C_spine", "Centor", "PECARN_head"],
      },
      inputs: { type: "string", required: true, description: "JSON-encoded score inputs" },
    },
  },

  // ─── Disposition tools ──────────────────────────────────────────────────
  {
    name: "protocol_lookup",
    description:
      "Look up a specific clinic protocol or guideline for a defined condition. Differs from " +
      "kb_search_clinical in that it returns the AUTHORITATIVE protocol, not ranked excerpts.",
    capabilityTag: "protocol_lookup",
    allowedRoles: ["disposition", "supervisor"],
    parameters: {
      protocolId: { type: "string", required: true, description: "Protocol identifier" },
    },
  },
  {
    name: "ed_transfer_check",
    description:
      "Check whether a candidate ED transfer disposition meets the preconditions for THIS clinic " +
      "(insurance, transport availability, accepting facility). Does NOT initiate transfer.",
    capabilityTag: "transfer_check",
    allowedRoles: ["disposition", "supervisor"],
    parameters: {
      encounterId: { type: "string", required: true, description: "Current encounter id" },
    },
  },

  // ─── Billing tools ──────────────────────────────────────────────────────
  {
    name: "cpt_em_code_lookup",
    description:
      "Look up CPT/E&M codes appropriate for a documented finding-and-decision set. Returns " +
      "candidate codes WITH the documentation requirements for each.",
    capabilityTag: "billing_code_lookup",
    allowedRoles: ["billing"],
    parameters: {
      visitType: { type: "string", required: true, description: "Visit type code" },
      complexity: {
        type: "enum",
        required: true,
        description: "Documented complexity level",
        enumValues: ["straightforward", "low", "moderate", "high"],
      },
    },
  },
  {
    name: "claim_scrubber",
    description:
      "Run the proposed claim through pre-submission scrubbing rules. Returns specific issues " +
      "that would cause denial.",
    capabilityTag: "claim_scrub",
    allowedRoles: ["billing"],
    parameters: {
      claimPayload: { type: "string", required: true, description: "JSON-encoded claim draft" },
    },
  },

  // ─── Supervisor tools ───────────────────────────────────────────────────
  {
    name: "supervisor_add_hard_constraint",
    description:
      "Add a hard constraint to the encounter (e.g., 'cannot discharge without ECG'). Cannot " +
      "be removed by other agents.",
    capabilityTag: "constraint_add",
    allowedRoles: ["supervisor"],
    parameters: {
      constraint: { type: "string", required: true, description: "The constraint to add" },
    },
  },
  {
    name: "supervisor_review_artifacts",
    description: "Pull a summary view of all artifacts produced in this encounter.",
    capabilityTag: "artifact_review",
    allowedRoles: ["supervisor"],
    parameters: {},
  },
];

/** Convenience: build a registry with the recommended Auralyn defaults. */
export function buildDefaultRegistry(): RoleScopedToolRegistry {
  const r = new RoleScopedToolRegistry();
  for (const t of AURALYN_DEFAULT_TOOLS) r.register(t);
  return r;
}
