export interface ProtocolRule {
  protocolId: string;
  ruleId: string;
  condition: string;
  action: string;
  severity?: string;
}

export interface Conflict {
  ruleA: ProtocolRule;
  ruleB: ProtocolRule;
  reason: string;
  severity: "critical" | "high" | "medium" | "low";
}

const DEMO_RULES: ProtocolRule[] = [
  { protocolId: "PROTO_RESP", ruleId: "R1", condition: "fever > 101 AND cough", action: "escalate_urgent", severity: "high" },
  { protocolId: "PROTO_ENT", ruleId: "R2", condition: "fever > 101 AND cough", action: "self_care_with_followup", severity: "medium" },
  { protocolId: "PROTO_RESP", ruleId: "R3", condition: "sore_throat AND difficulty_swallowing", action: "escalate_er", severity: "critical" },
  { protocolId: "PROTO_ENT", ruleId: "R4", condition: "sore_throat AND difficulty_swallowing", action: "escalate_urgent", severity: "high" },
  { protocolId: "PROTO_NEURO", ruleId: "R5", condition: "headache AND neck_stiffness", action: "escalate_er", severity: "critical" },
  { protocolId: "PROTO_RESP", ruleId: "R6", condition: "nasal_congestion AND sneezing", action: "self_care", severity: "low" },
  { protocolId: "PROTO_ALLERGY", ruleId: "R7", condition: "nasal_congestion AND sneezing", action: "self_care", severity: "low" },
  { protocolId: "PROTO_RESP", ruleId: "R8", condition: "shortness_of_breath AND chest_pain", action: "escalate_er", severity: "critical" },
  { protocolId: "PROTO_CARDIAC", ruleId: "R9", condition: "shortness_of_breath AND chest_pain", action: "escalate_er", severity: "critical" },
  { protocolId: "PROTO_ENT", ruleId: "R10", condition: "ear_pain AND fever", action: "escalate_urgent", severity: "medium" },
  { protocolId: "PROTO_PEDS", ruleId: "R11", condition: "ear_pain AND fever", action: "self_care_with_followup", severity: "medium" },
];

export class ProtocolConflictDetector {
  detect(rules?: ProtocolRule[]): Conflict[] {
    const ruleSet = rules?.length ? rules : DEMO_RULES;
    const conflicts: Conflict[] = [];

    for (let i = 0; i < ruleSet.length; i++) {
      for (let j = i + 1; j < ruleSet.length; j++) {
        if (
          ruleSet[i].condition === ruleSet[j].condition &&
          ruleSet[i].action !== ruleSet[j].action
        ) {
          const hasEscalationConflict =
            (ruleSet[i].action.includes("er") && !ruleSet[j].action.includes("er")) ||
            (!ruleSet[i].action.includes("er") && ruleSet[j].action.includes("er"));

          const severity = hasEscalationConflict
            ? "critical"
            : ruleSet[i].action.includes("escalate") || ruleSet[j].action.includes("escalate")
              ? "high"
              : "medium";

          conflicts.push({
            ruleA: ruleSet[i],
            ruleB: ruleSet[j],
            reason: `Same condition "${ruleSet[i].condition}" produces conflicting actions: "${ruleSet[i].action}" vs "${ruleSet[j].action}"`,
            severity,
          });
        }
      }
    }

    return conflicts.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.severity] - order[b.severity];
    });
  }

  getSummary(rules?: ProtocolRule[]) {
    const ruleSet = rules?.length ? rules : DEMO_RULES;
    const conflicts = this.detect(ruleSet);
    return {
      totalRules: ruleSet.length,
      totalConflicts: conflicts.length,
      bySeverity: {
        critical: conflicts.filter((c) => c.severity === "critical").length,
        high: conflicts.filter((c) => c.severity === "high").length,
        medium: conflicts.filter((c) => c.severity === "medium").length,
        low: conflicts.filter((c) => c.severity === "low").length,
      },
      conflicts,
    };
  }
}

export const protocolConflictDetector = new ProtocolConflictDetector();
