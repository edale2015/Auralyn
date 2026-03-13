import * as fs from "fs/promises";
import * as path from "path";
import { FailureClassification, FailureType } from "./failureClassifier";

export type ProposalType =
  | "add_question"
  | "reorder_question"
  | "add_red_flag_question"
  | "strengthen_disp_rule"
  | "soften_disp_rule"
  | "raise_red_flag_weight"
  | "refine_trigger_condition"
  | "add_scoring_rule"
  | "raise_score_weight"
  | "add_diagnosis_cluster"
  | "add_modifier_followup"
  | "update_output_template"
  | "tighten_review_rule"
  | "loosen_review_rule";

export type RiskLevel = "low" | "medium" | "high";
export type ProposalStatus = "draft" | "needs_review" | "approved" | "rejected" | "implemented" | "regression_failed";

export interface Proposal {
  proposal_id: string;
  complaint: string;
  source_failure_cases: string[];
  target_table: string;
  proposal_type: ProposalType;
  risk_level: RiskLevel;
  proposed_change: Record<string, any>;
  rationale: string;
  expected_benefit: string;
  evidence: Array<{ case_id: string; failure_type: string; details: string }>;
  status: ProposalStatus;
  created_at: string;
  reviewed_at?: string;
  reviewer_notes?: string;
  approved_by?: string;
}

const FAILURE_TO_PROPOSAL: Record<FailureType, ProposalType[]> = {
  missing_required_question: ["add_question", "reorder_question"],
  missed_red_flag: ["add_red_flag_question", "strengthen_disp_rule"],
  undertriage: ["strengthen_disp_rule", "raise_red_flag_weight"],
  overtriage: ["soften_disp_rule", "refine_trigger_condition"],
  differential_underweight: ["add_scoring_rule", "raise_score_weight"],
  differential_missing: ["add_diagnosis_cluster", "add_scoring_rule"],
  template_output_problem: ["update_output_template"],
  missing_modifier: ["add_modifier_followup"],
  review_gate_problem: ["tighten_review_rule", "loosen_review_rule"],
  question_ordering_problem: ["reorder_question"],
  contradictory_logic: ["refine_trigger_condition"],
  insufficient_data_handling: ["add_question"],
  rule_threshold_problem: ["strengthen_disp_rule", "soften_disp_rule"],
  unknown: ["add_question"],
};

const RISK_MAP: Record<ProposalType, RiskLevel> = {
  add_question: "medium",
  reorder_question: "low",
  add_red_flag_question: "medium",
  strengthen_disp_rule: "high",
  soften_disp_rule: "high",
  raise_red_flag_weight: "high",
  refine_trigger_condition: "medium",
  add_scoring_rule: "medium",
  raise_score_weight: "medium",
  add_diagnosis_cluster: "medium",
  add_modifier_followup: "low",
  update_output_template: "low",
  tighten_review_rule: "medium",
  loosen_review_rule: "high",
};

let proposalCache: Map<string, Proposal> = new Map();
let cacheLoaded = false;
const PROPOSALS_PATH = path.join(process.cwd(), "data", "proposals.json");

async function loadProposals(): Promise<void> {
  if (cacheLoaded) return;
  try {
    const raw = await fs.readFile(PROPOSALS_PATH, "utf8");
    const arr: Proposal[] = JSON.parse(raw);
    for (const p of arr) proposalCache.set(p.proposal_id, p);
  } catch {}
  cacheLoaded = true;
}

async function persistProposals(): Promise<void> {
  await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true });
  await fs.writeFile(PROPOSALS_PATH, JSON.stringify(Array.from(proposalCache.values()), null, 2), "utf8");
}

function generateProposalId(): string {
  return `PROP_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function buildProposedChange(type: ProposalType, failure: FailureClassification): Record<string, any> {
  switch (type) {
    case "add_question":
    case "add_red_flag_question":
      return {
        question_id: `${failure.complaint.toUpperCase().slice(0, 3)}_Q_${Date.now()}`,
        text: `[Review needed] Question derived from failure in: ${failure.actionable_hints[0] ?? "see rationale"}`,
        priority: type === "add_red_flag_question" ? 1 : 3,
        trigger: type === "add_red_flag_question" ? "ALWAYS" : "if_severe",
        question_type: "yes_no",
        rationale: failure.explanation,
      };
    case "reorder_question":
      return {
        question_id: "[identify from trace]",
        current_priority: "[see trace]",
        new_priority: "earlier",
        rationale: failure.explanation,
      };
    case "strengthen_disp_rule":
      return {
        rule_id: `${failure.complaint.toUpperCase().slice(0, 3)}_DISP_NEW_${Date.now()}`,
        complaint: failure.complaint,
        trigger_condition: "[derive from failed cases]",
        current_disposition: "[see trace]",
        proposed_disposition: "[one level higher]",
        severity: "high",
        rationale: failure.explanation,
      };
    case "soften_disp_rule":
      return {
        rule_id: "[identify from trace]",
        complaint: failure.complaint,
        action: "add_qualifying_condition_or_lower_threshold",
        rationale: failure.explanation,
      };
    case "add_scoring_rule":
    case "raise_score_weight":
      return {
        complaint: failure.complaint,
        diagnosis: "[from expected_top_diagnoses]",
        signal: "[symptom that should boost score]",
        current_weight: 0,
        proposed_weight: 0.15,
        rationale: failure.explanation,
      };
    case "add_diagnosis_cluster":
      return {
        complaint: failure.complaint,
        diagnosis_id: "[new diagnosis id]",
        diagnosis_label: "[from expected_top_diagnoses]",
        triggering_symptoms: "[from required_questions]",
        base_score: 0.3,
        rationale: failure.explanation,
      };
    case "add_modifier_followup":
      return {
        modifier: "[pmh/medication/allergy modifier missed]",
        question_text: "[follow-up question to add]",
        affects_complaints: [failure.complaint],
        rationale: failure.explanation,
      };
    case "update_output_template":
      return {
        template_section: "discharge_instructions",
        complaint: failure.complaint,
        change: "improve_clarity",
        rationale: failure.explanation,
      };
    default:
      return { complaint: failure.complaint, rationale: failure.explanation };
  }
}

export async function generateProposal(failure: FailureClassification): Promise<Proposal | null> {
  await loadProposals();
  const proposalTypes = FAILURE_TO_PROPOSAL[failure.primary_failure] ?? ["add_question"];
  const proposalType = proposalTypes[0];

  const dedupKey = `${failure.complaint}:${failure.primary_failure}:${proposalType}`;
  for (const p of proposalCache.values()) {
    const key = `${p.complaint}:${p.target_table}:${p.proposal_type}`;
    if (key === dedupKey && ["draft", "needs_review", "approved"].includes(p.status)) {
      p.source_failure_cases.push(failure.case_id);
      p.evidence.push({ case_id: failure.case_id, failure_type: failure.primary_failure, details: failure.explanation.slice(0, 200) });
      await persistProposals();
      return p;
    }
  }

  const targetTable =
    proposalType.includes("disp_rule") || proposalType === "raise_red_flag_weight" ? "DISP_RULES" :
    proposalType.includes("question") ? "CORE_QUESTIONS" :
    proposalType.includes("scoring") || proposalType.includes("score") ? "CLUSTER_SCORING_RULES" :
    proposalType === "add_diagnosis_cluster" ? "CLUSTER_SCORING_RULES" :
    proposalType === "add_modifier_followup" ? "GLOBAL_SECONDARY" :
    proposalType === "update_output_template" ? "OUTPUT_TEMPLATES" :
    "CORE_QUESTIONS";

  const proposal: Proposal = {
    proposal_id: generateProposalId(),
    complaint: failure.complaint,
    source_failure_cases: [failure.case_id],
    target_table: targetTable,
    proposal_type: proposalType,
    risk_level: RISK_MAP[proposalType],
    proposed_change: buildProposedChange(proposalType, failure),
    rationale: failure.explanation,
    expected_benefit: failure.actionable_hints[0] ?? "Improve triage accuracy.",
    evidence: [{ case_id: failure.case_id, failure_type: failure.primary_failure, details: failure.explanation.slice(0, 200) }],
    status: failure.severity === "critical" || RISK_MAP[proposalType] === "high" ? "needs_review" : "draft",
    created_at: new Date().toISOString(),
  };

  proposalCache.set(proposal.proposal_id, proposal);
  await persistProposals();
  return proposal;
}

export async function listProposals(complaint?: string, status?: ProposalStatus): Promise<Proposal[]> {
  await loadProposals();
  let results = Array.from(proposalCache.values());
  if (complaint) results = results.filter(p => p.complaint === complaint);
  if (status) results = results.filter(p => p.status === status);
  return results.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function updateProposalStatus(proposalId: string, status: ProposalStatus, reviewerNotes?: string, approvedBy?: string): Promise<Proposal | null> {
  await loadProposals();
  const p = proposalCache.get(proposalId);
  if (!p) return null;
  p.status = status;
  p.reviewed_at = new Date().toISOString();
  if (reviewerNotes) p.reviewer_notes = reviewerNotes;
  if (approvedBy) p.approved_by = approvedBy;
  await persistProposals();
  return p;
}

export async function getProposalDashboard(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byRisk: Record<string, number>;
  byComplaint: Array<{ complaint: string; open: number; high_risk: number; medium_risk: number; low_risk: number; top_theme: string }>;
}> {
  await loadProposals();
  const proposals = Array.from(proposalCache.values());
  const open = proposals.filter(p => ["draft", "needs_review"].includes(p.status));

  const byStatus: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  const byComplaintMap: Record<string, Proposal[]> = {};

  for (const p of proposals) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    byRisk[p.risk_level] = (byRisk[p.risk_level] ?? 0) + 1;
    if (!byComplaintMap[p.complaint]) byComplaintMap[p.complaint] = [];
    byComplaintMap[p.complaint].push(p);
  }

  const byComplaint = Object.entries(byComplaintMap).map(([complaint, props]) => {
    const openProps = props.filter(p => ["draft", "needs_review"].includes(p.status));
    const typeCounts: Record<string, number> = {};
    for (const p of openProps) typeCounts[p.proposal_type] = (typeCounts[p.proposal_type] ?? 0) + 1;
    const topTheme = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";
    return {
      complaint,
      open: openProps.length,
      high_risk: openProps.filter(p => p.risk_level === "high").length,
      medium_risk: openProps.filter(p => p.risk_level === "medium").length,
      low_risk: openProps.filter(p => p.risk_level === "low").length,
      top_theme: topTheme.replace(/_/g, " "),
    };
  }).sort((a, b) => b.open - a.open);

  return { total: proposals.length, byStatus, byRisk, byComplaint };
}
