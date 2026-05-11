/**
 * clinicalOntologyInference.ts
 * server/ontology/clinicalOntologyInference.ts
 *
 * ONTOLOGY INFERENCE ENGINE — WIN 23
 *
 * THE ARTICLE'S CONTRIBUTION TO AURALYN:
 * Auralyn already has:
 *   - clinicalOntology.ts: entity/property/relationship definitions
 *   - ontologyFirewall.ts: four SHACL-style safety gates
 *   - clinicalKnowledgeGraph.ts: graph nodes and edges
 *   - bayesianConfidenceUpdater.ts: probabilistic scoring
 *
 * What is missing (from the article's "Kinetic Layer" and inference concepts):
 *
 * 1. INFERENCE RULES — derive new clinical facts from existing ones
 *    "IF CHF AND hypertension AND age>65 THEN risk_class = HIGH"
 *    Currently this logic is scattered across pipeline.ts and modifiers.
 *    A formal inference engine makes it explicit, auditable, and testable.
 *
 * 2. ACTION CONSTRAINTS — permission rules baked into the ontology
 *    "IF disposition = ER_SEND AND actor != physician THEN BLOCK"
 *    Currently enforced in route middleware. Ontology-level enforcement
 *    means the rule follows the data everywhere, not just at the API layer.
 *
 * 3. GRAPH TRAVERSAL RETRIEVAL — follow edges to retrieve connected subgraphs
 *    "Give me everything connected to chest_pain within 2 hops"
 *    Currently KB retrieval is 5 separate table queries.
 *    Graph traversal retrieves the same data as a connected subgraph
 *    with edge weights guiding relevance.
 *
 * THIS MODULE ADDS:
 *   - InferenceRule schema (IF conditions → THEN assertions)
 *   - runInference() — applies rules to patient context, derives new facts
 *   - ActionConstraint schema — permission gates at ontology level
 *   - checkActionPermission() — validates actions against ontology
 *   - traverseGraph() — follow edges from a complaint to retrieve connected KB
 */

import { db }  from "../db";
import { sql } from "drizzle-orm";
import { appendAuditEvent } from "../governance/audit";

// ─── Inference rule schema ────────────────────────────────────────────────────
// OWL-style: IF all conditions are true THEN assert all conclusions

export interface InferenceCondition {
  field:    string;
  operator: "eq" | "gt" | "lt" | "gte" | "lte" | "in" | "not_in" | "exists";
  value:    any;
  source:   "patient" | "modifiers" | "vitals" | "pmh" | "medications";
}

export interface InferenceAssertion {
  field:      string;
  value:      any;
  confidence: number;
}

export interface InferenceRule {
  ruleId:        string;
  name:          string;
  description:   string;
  conditions:    InferenceCondition[];
  assertions:    InferenceAssertion[];
  priority:      number;
  clinicalBasis: string;
  active:        boolean;
}

// ─── Clinical inference rules ─────────────────────────────────────────────────

export const CLINICAL_INFERENCE_RULES: InferenceRule[] = [
  {
    ruleId:      "INF_HIGH_RISK_ELDERLY_CHF",
    name:        "Elderly CHF High-Risk Modifier",
    description: "Patient >65 with CHF is high-risk for decompensation",
    conditions: [
      { field: "age", operator: "gte", value: 65,   source: "patient" },
      { field: "chf", operator: "eq",  value: true, source: "pmh" },
    ],
    assertions: [
      { field: "risk_class",         value: "HIGH", confidence: 0.90 },
      { field: "lower_er_threshold", value: true,   confidence: 0.90 },
      { field: "requires_ekg",       value: true,   confidence: 0.85 },
    ],
    priority:      1,
    clinicalBasis: "ACC/AHA Heart Failure Guidelines 2022",
    active:        true,
  },

  {
    ruleId:      "INF_DIABETIC_INFECTION_RISK",
    name:        "Diabetic Infection High-Risk",
    description: "Diabetic patients with skin/soft tissue infection have higher risk of rapid progression",
    conditions: [
      { field: "diabetic",       operator: "eq", value: true, source: "pmh" },
      { field: "skin_infection", operator: "eq", value: true, source: "patient" },
    ],
    assertions: [
      { field: "risk_class",          value: "HIGH", confidence: 0.85 },
      { field: "lower_er_threshold",  value: true,   confidence: 0.80 },
      { field: "glucose_check",       value: true,   confidence: 0.95 },
      { field: "malignant_oe_screen", value: true,   confidence: 0.70 },
    ],
    priority:      1,
    clinicalBasis: "IDSA Skin and Soft Tissue Infection Guidelines 2014",
    active:        true,
  },

  {
    ruleId:      "INF_ANTICOAG_BLEEDING_RISK",
    name:        "Anticoagulated Patient Bleeding Risk",
    description: "Patient on anticoagulation with any trauma or bleeding complaint",
    conditions: [
      { field: "anticoagulated", operator: "eq", value: true, source: "medications" },
    ],
    assertions: [
      { field: "bleeding_risk_elevated", value: true, confidence: 0.95 },
      { field: "nsaid_contraindicated",  value: true, confidence: 0.95 },
      { field: "lower_er_threshold",     value: true, confidence: 0.75 },
    ],
    priority:      1,
    clinicalBasis: "ACCP Antithrombotic Guidelines",
    active:        true,
  },

  {
    ruleId:      "INF_SSRI_NSAID_GI_RISK",
    name:        "SSRI + NSAID GI Bleeding Risk",
    description: "Concurrent SSRI and NSAID use significantly increases GI bleeding risk",
    conditions: [
      { field: "on_ssri",  operator: "eq", value: true, source: "medications" },
      { field: "on_nsaid", operator: "eq", value: true, source: "medications" },
    ],
    assertions: [
      { field: "gi_bleeding_risk",   value: "ELEVATED", confidence: 0.90 },
      { field: "ppi_recommended",    value: true,       confidence: 0.85 },
      { field: "nsaid_caution_flag", value: true,       confidence: 0.90 },
    ],
    priority:      2,
    clinicalBasis: "FDA Drug Safety Communication: SSRIs and Bleeding Risk",
    active:        true,
  },

  {
    ruleId:      "INF_IMMUNOCOMP_FEVER_RISK",
    name:        "Immunocompromised Fever High-Risk",
    description: "Immunocompromised patient with fever requires lower escalation threshold",
    conditions: [
      { field: "immunocompromised", operator: "eq", value: true, source: "pmh" },
      { field: "fever",             operator: "eq", value: true, source: "patient" },
    ],
    assertions: [
      { field: "risk_class",          value: "HIGH", confidence: 0.95 },
      { field: "lower_er_threshold",  value: true,   confidence: 0.90 },
      { field: "blood_cultures_flag", value: true,   confidence: 0.85 },
      { field: "neutropenic_screen",  value: true,   confidence: 0.80 },
    ],
    priority:      1,
    clinicalBasis: "IDSA Febrile Neutropenia Guidelines 2010",
    active:        true,
  },

  {
    ruleId:      "INF_PREGNANCY_CRITICAL_SCREEN",
    name:        "Pregnant Patient Critical Screen",
    description: "Pregnant patient requires ectopic screen for any abdominal/pelvic complaint",
    conditions: [
      { field: "pregnant",       operator: "eq", value: true, source: "patient" },
      { field: "abdominal_pain", operator: "eq", value: true, source: "patient" },
    ],
    assertions: [
      { field: "ectopic_screen_required", value: true, confidence: 0.95 },
      { field: "bhcg_required",           value: true, confidence: 0.95 },
      { field: "lower_er_threshold",      value: true, confidence: 0.85 },
    ],
    priority:      1,
    clinicalBasis: "ACOG Practice Bulletin: Ectopic Pregnancy",
    active:        true,
  },

  {
    ruleId:      "INF_HYPOXIA_ESCALATION",
    name:        "Hypoxia Automatic Escalation",
    description: "SpO2 < 94% on room air requires immediate escalation regardless of complaint",
    conditions: [
      { field: "o2_sat", operator: "lt", value: 94, source: "vitals" },
    ],
    assertions: [
      { field: "escalate_immediately", value: true,      confidence: 1.0 },
      { field: "disposition_floor",    value: "ER_SEND", confidence: 1.0 },
      { field: "oxygen_indicated",     value: true,      confidence: 1.0 },
    ],
    priority:      0,
    clinicalBasis: "WHO Oxygen Therapy Guidelines; ACEP Clinical Policy",
    active:        true,
  },

  {
    ruleId:      "INF_ANTIPSYCHOTIC_QT_RISK",
    name:        "Antipsychotic QT Prolongation Risk",
    description: "Patient on antipsychotic requires QT monitoring before certain antibiotics",
    conditions: [
      { field: "on_antipsychotic", operator: "eq", value: true, source: "medications" },
    ],
    assertions: [
      { field: "qt_prolongation_risk",    value: true, confidence: 0.90 },
      { field: "fluoroquinolone_caution", value: true, confidence: 0.85 },
      { field: "macrolide_caution",       value: true, confidence: 0.85 },
      { field: "ekg_before_abx",          value: true, confidence: 0.70 },
    ],
    priority:      2,
    clinicalBasis: "FDA Drug Safety Communication: QT Prolongation",
    active:        true,
  },

  {
    ruleId:      "INF_PE_HIGH_RISK_CLUSTER",
    name:        "PE High-Risk Clinical Cluster",
    description: "Pleuritic chest pain + tachycardia + recent immobility = high PE pretest probability",
    conditions: [
      { field: "pleuritic_pain",    operator: "eq",  value: true, source: "patient" },
      { field: "heart_rate",        operator: "gte", value: 100,  source: "vitals" },
      { field: "recent_immobility", operator: "eq",  value: true, source: "pmh" },
    ],
    assertions: [
      { field: "pe_high_pretest",      value: true, confidence: 0.85 },
      { field: "wells_score_elevated", value: true, confidence: 0.80 },
      { field: "dimer_indicated",      value: true, confidence: 0.90 },
      { field: "lower_er_threshold",   value: true, confidence: 0.85 },
    ],
    priority:      1,
    clinicalBasis: "Wells PE Score; ACEP Clinical Policy: PE",
    active:        true,
  },
];

// ─── Inference engine ─────────────────────────────────────────────────────────

export interface PatientContextForInference {
  age?:               number;
  pregnant?:          boolean;
  o2_sat?:            number;
  heart_rate?:        number;
  diabetic?:          boolean;
  chf?:               boolean;
  copd?:              boolean;
  immunocompromised?: boolean;
  renalDisease?:      boolean;
  anticoagulated?:    boolean;
  on_ssri?:           boolean;
  on_snri?:           boolean;
  on_nsaid?:          boolean;
  on_antipsychotic?:  boolean;
  fever?:             boolean;
  skin_infection?:    boolean;
  abdominal_pain?:    boolean;
  pleuritic_pain?:    boolean;
  recent_immobility?: boolean;
  [key: string]:      any;
}

export interface InferenceResult {
  derivedFacts:        Record<string, any>;
  firedRules:          string[];
  ruleDetails:         Array<{
    ruleId:        string;
    name:          string;
    clinicalBasis: string;
    assertions:    InferenceAssertion[];
  }>;
  escalateImmediately: boolean;
  dispositionFloor?:   string;
  highRiskFlags:       string[];
}

function evaluateCondition(
  condition: InferenceCondition,
  context:   PatientContextForInference
): boolean {
  const val = context[condition.field];
  if (val === undefined || val === null) return false;

  switch (condition.operator) {
    case "eq":     return val === condition.value;
    case "gt":     return Number(val) >  Number(condition.value);
    case "lt":     return Number(val) <  Number(condition.value);
    case "gte":    return Number(val) >= Number(condition.value);
    case "lte":    return Number(val) <= Number(condition.value);
    case "in":     return Array.isArray(condition.value) && condition.value.includes(val);
    case "not_in": return Array.isArray(condition.value) && !condition.value.includes(val);
    case "exists": return val !== undefined && val !== null;
    default:       return false;
  }
}

export function runInference(
  context: PatientContextForInference,
  rules:   InferenceRule[] = CLINICAL_INFERENCE_RULES
): InferenceResult {

  const derivedFacts:  Record<string, any>            = {};
  const firedRules:    string[]                        = [];
  const ruleDetails:   InferenceResult["ruleDetails"]  = [];
  const highRiskFlags: string[]                        = [];

  const sorted = [...rules].filter(r => r.active).sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    const allConditionsMet = rule.conditions.every(c => evaluateCondition(c, context));

    if (allConditionsMet) {
      firedRules.push(rule.ruleId);
      ruleDetails.push({
        ruleId:        rule.ruleId,
        name:          rule.name,
        clinicalBasis: rule.clinicalBasis,
        assertions:    rule.assertions,
      });

      for (const assertion of rule.assertions) {
        const existing = derivedFacts[assertion.field];
        if (existing === undefined || (existing._confidence ?? 0) < assertion.confidence) {
          derivedFacts[assertion.field]                       = assertion.value;
          derivedFacts[`${assertion.field}_confidence`]       = assertion.confidence;
          derivedFacts[`${assertion.field}_source`]           = rule.ruleId;
        }
      }

      if (rule.name.includes("High-Risk") || rule.name.includes("Escalation")) {
        highRiskFlags.push(rule.name);
      }
    }
  }

  const escalateImmediately = derivedFacts["escalate_immediately"] === true;
  const dispositionFloor    = derivedFacts["disposition_floor"] as string | undefined;

  return {
    derivedFacts,
    firedRules,
    ruleDetails,
    escalateImmediately,
    dispositionFloor,
    highRiskFlags,
  };
}

// ─── Action constraint schema (Kinetic Layer) ─────────────────────────────────

export interface ActionConstraint {
  actionId:   string;
  actionName: string;
  conditions: Array<{
    field:    string;
    operator: "eq" | "not_eq" | "in";
    value:    any;
    source:   "actor" | "case" | "derived";
  }>;
  effect:     "ALLOW" | "BLOCK";
  reason:     string;
}

export const ACTION_CONSTRAINTS: ActionConstraint[] = [
  {
    actionId:   "BLOCK_SELF_CARE_WITH_RED_FLAG",
    actionName: "Block SELF_CARE disposition when red flags present",
    conditions: [
      { field: "disposition",    operator: "eq", value: "SELF_CARE", source: "case" },
      { field: "red_flag_fired", operator: "eq", value: true,        source: "case" },
    ],
    effect: "BLOCK",
    reason: "Red flag rules prohibit self-care disposition — patient safety",
  },
  {
    actionId:   "BLOCK_NON_PHYSICIAN_APPROVAL",
    actionName: "Block case approval by non-physician",
    conditions: [
      { field: "role", operator: "not_eq", value: "physician", source: "actor" },
    ],
    effect: "BLOCK",
    reason: "Physician gate — only physicians may approve clinical cases",
  },
  {
    actionId:   "ALLOW_PHYSICIAN_OVERRIDE",
    actionName: "Allow physician to override any AI recommendation",
    conditions: [
      { field: "role", operator: "eq", value: "physician", source: "actor" },
    ],
    effect: "ALLOW",
    reason: "Physician override always wins — G2 gate",
  },
];

export function checkActionPermission(
  actionName: string,
  actor:      { role: string; id: string },
  caseState:  Record<string, any>
): { permitted: boolean; reason: string } {

  const relevantConstraints = ACTION_CONSTRAINTS.filter(c =>
    c.actionName.toLowerCase().includes(actionName.toLowerCase()) ||
    actionName.toLowerCase().includes(c.actionId.toLowerCase())
  );

  for (const constraint of relevantConstraints) {
    const allConditionsMet = constraint.conditions.every(cond => {
      const context =
        cond.source === "actor" ? actor :
        cond.source === "case"  ? caseState : {};

      const val = (context as any)[cond.field];
      switch (cond.operator) {
        case "eq":     return val === cond.value;
        case "not_eq": return val !== cond.value;
        case "in":     return Array.isArray(cond.value) && cond.value.includes(val);
        default:       return false;
      }
    });

    if (allConditionsMet) {
      return { permitted: constraint.effect === "ALLOW", reason: constraint.reason };
    }
  }

  return { permitted: true, reason: "No constraint applies" };
}

// ─── Graph traversal retrieval ────────────────────────────────────────────────

export interface GraphNode {
  id:    string;
  type:  "complaint" | "diagnosis" | "red_flag" | "treatment" | "disposition" | "modifier";
  label: string;
  data:  Record<string, any>;
}

export interface GraphEdge {
  from:     string;
  to:       string;
  relation: string;
  weight:   number;
}

export interface SubGraph {
  nodes:         GraphNode[];
  edges:         GraphEdge[];
  rootComplaint: string;
  hops:          number;
}

export async function traverseComplaintGraph(
  complaintId: string,
  maxHops:     number = 2
): Promise<SubGraph> {

  const nodes:   GraphNode[] = [];
  const edges:   GraphEdge[] = [];
  const visited              = new Set<string>();

  nodes.push({
    id:    complaintId,
    type:  "complaint",
    label: complaintId.replace(/_/g, " "),
    data:  { complaintId },
  });
  visited.add(complaintId);

  const redFlags = await db.execute(sql`
    SELECT id, rule_name, condition_text, action_text, safety_level
    FROM kb_red_flag_rules
    WHERE LOWER(complaint_id) = ${complaintId} AND active = true
    LIMIT 10
  `).catch(() => ({ rows: [] }));

  for (const rf of redFlags.rows as any[]) {
    const nodeId = `rf_${rf.id}`;
    if (!visited.has(nodeId)) {
      nodes.push({
        id:    nodeId,
        type:  "red_flag",
        label: rf.rule_name,
        data:  { condition: rf.condition_text, action: rf.action_text, severity: rf.safety_level },
      });
      edges.push({ from: complaintId, to: nodeId, relation: "has_red_flag", weight: 1.0 });
      visited.add(nodeId);
    }
  }

  const diagnoses = await db.execute(sql`
    SELECT id, diagnosis_name, confidence_weight, disposition_default, red_flag
    FROM kb_diagnosis_rules
    WHERE LOWER(chief_complaint) = ${complaintId} AND active = true
    ORDER BY COALESCE(confidence_weight, 0.5) DESC
    LIMIT 15
  `).catch(() => ({ rows: [] }));

  for (const dx of diagnoses.rows as any[]) {
    const nodeId = `dx_${dx.id}`;
    if (!visited.has(nodeId)) {
      nodes.push({
        id:    nodeId,
        type:  "diagnosis",
        label: dx.diagnosis_name,
        data:  {
          confidence:  dx.confidence_weight,
          disposition: dx.disposition_default,
          mustNotMiss: dx.red_flag === true || dx.red_flag === "t",
        },
      });
      edges.push({
        from:     complaintId,
        to:       nodeId,
        relation: "has_diagnosis",
        weight:   Number(dx.confidence_weight ?? 0.5),
      });
      visited.add(nodeId);

      if (maxHops >= 2) {
        const treatments = await db.execute(sql`
          SELECT id, medication_name, dose, route, contraindications
          FROM kb_treatment_rules
          WHERE LOWER(complaint_id) = ${complaintId} AND active = true
          LIMIT 5
        `).catch(() => ({ rows: [] }));

        for (const tx of treatments.rows as any[]) {
          const txNodeId = `tx_${tx.id}`;
          if (!visited.has(txNodeId)) {
            nodes.push({
              id:    txNodeId,
              type:  "treatment",
              label: tx.medication_name,
              data:  { dose: tx.dose, route: tx.route, contraindications: tx.contraindications },
            });
            edges.push({ from: nodeId, to: txNodeId, relation: "treated_by", weight: 0.7 });
            visited.add(txNodeId);
          }
        }
      }
    }
  }

  const dispositions = await db.execute(sql`
    SELECT id, disposition, criteria, priority
    FROM kb_disposition_rules
    WHERE LOWER(complaint_id) = ${complaintId} AND active = true
    ORDER BY priority ASC
    LIMIT 5
  `).catch(() => ({ rows: [] }));

  for (const disp of dispositions.rows as any[]) {
    const nodeId = `disp_${disp.id}`;
    if (!visited.has(nodeId)) {
      nodes.push({
        id:    nodeId,
        type:  "disposition",
        label: disp.disposition,
        data:  { criteria: disp.criteria, priority: disp.priority },
      });
      edges.push({ from: complaintId, to: nodeId, relation: "has_disposition", weight: 0.8 });
      visited.add(nodeId);
    }
  }

  await appendAuditEvent({
    actor:      "system",
    action:     "ONTOLOGY_GRAPH_TRAVERSAL",
    entityId:   complaintId,
    entityType: "complaint",
    details: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      hops:      maxHops,
    },
  }).catch(console.error);

  return { nodes, edges, rootComplaint: complaintId, hops: maxHops };
}

// ─── Prompt block from subgraph ───────────────────────────────────────────────

export function buildGraphPromptBlock(subgraph: SubGraph): string {
  const sections: string[] = [
    `## ONTOLOGY GRAPH CONTEXT — ${subgraph.rootComplaint.replace(/_/g, " ").toUpperCase()}`,
    `(${subgraph.nodes.length} nodes, ${subgraph.edges.length} edges, ${subgraph.hops} hops)`,
    "",
  ];

  const redFlags     = subgraph.nodes.filter(n => n.type === "red_flag");
  const mustMiss     = subgraph.nodes.filter(n => n.type === "diagnosis" && n.data.mustNotMiss);
  const diagnoses    = subgraph.nodes.filter(n => n.type === "diagnosis" && !n.data.mustNotMiss);
  const dispositions = subgraph.nodes.filter(n => n.type === "disposition");
  const treatments   = subgraph.nodes.filter(n => n.type === "treatment");

  if (redFlags.length > 0) {
    sections.push("### 🚨 RED FLAGS (graph edge: complaint → red_flag)");
    redFlags.forEach(n => sections.push(`- ${n.label}: ${n.data.condition} → ${n.data.action}`));
    sections.push("");
  }

  if (mustMiss.length > 0) {
    sections.push("### ⚠ MUST-NOT-MISS DIAGNOSES (graph edge: complaint → diagnosis [must_not_miss])");
    mustMiss.forEach(n => sections.push(`- ${n.label} → default disposition: ${n.data.disposition ?? "REVIEW"}`));
    sections.push("");
  }

  if (diagnoses.length > 0) {
    sections.push("### DIFFERENTIAL (sorted by confidence weight)");
    diagnoses
      .sort((a, b) => (b.data.confidence ?? 0.5) - (a.data.confidence ?? 0.5))
      .forEach(n => sections.push(`- ${n.label} [confidence: ${n.data.confidence ?? "unweighted"}]`));
    sections.push("");
  }

  if (dispositions.length > 0) {
    sections.push("### DISPOSITION RULES (graph edge: complaint → disposition)");
    dispositions.forEach(n => sections.push(`- [P${n.data.priority}] ${n.label}: ${n.data.criteria}`));
    sections.push("");
  }

  if (treatments.length > 0) {
    sections.push("### TREATMENTS (graph edge: diagnosis → treatment)");
    treatments.forEach(n => {
      const dose  = n.data.dose  ? ` | ${n.data.dose}`  : "";
      const route = n.data.route ? ` ${n.data.route}`   : "";
      sections.push(`- ${n.label}${dose}${route}`);
    });
  }

  return sections.join("\n");
}
