import type { CaseState } from "../../shared/agentTypes";
import type { ComplaintConfig, CoreQuestion, RedFlagRule, DispositionRule, OutputTemplate } from "./complaintConfigLoader";
import { evaluateExpr } from "./exprEval";
import { computeCentor } from "../agent/scoring/centor";

export interface QuestionResult {
  nextQuestion: CoreQuestion | null;
  allAnswered: boolean;
  requiredMissing: string[];
  questionsEvaluated: number;
}

export function runCoreQuestions(state: CaseState, config: ComplaintConfig): QuestionResult {
  const answered = new Set(Object.keys(state.answers));
  let nextQuestion: CoreQuestion | null = null;
  const requiredMissing: string[] = [];
  let evaluated = 0;

  for (const q of config.coreQuestions) {
    evaluated++;
    const shouldAsk = evaluateExpr(q.askIf, state);
    if (!shouldAsk) continue;

    if (!answered.has(q.qId)) {
      if (q.required) requiredMissing.push(q.qId);
      if (!nextQuestion) nextQuestion = q;
    }
  }

  return {
    nextQuestion,
    allAnswered: requiredMissing.length === 0 && nextQuestion === null,
    requiredMissing,
    questionsEvaluated: evaluated,
  };
}

export interface RedFlagResult {
  triggeredFlags: Array<{
    rfId: string;
    label: string;
    severity: "HARD" | "SOFT";
    action: string;
    immediateActions: string[];
    rationale: string;
  }>;
  anySeverity: "HARD" | "SOFT" | "NONE";
  gateResult: "ER_SEND" | "ESCALATE" | "PASS";
}

export function runRedFlagsComplaint(state: CaseState, rules: RedFlagRule[]): RedFlagResult {
  const triggered: RedFlagResult["triggeredFlags"] = [];
  let hasHard = false;
  let hasSoft = false;
  let hasErSend = false;

  for (const rule of rules) {
    const fires = evaluateExpr(rule.triggerExpr, state);
    if (!fires) continue;

    const immediateActions = rule.immediateActions
      .split(";")
      .map(s => s.trim())
      .filter(Boolean);

    triggered.push({
      rfId: rule.rfId,
      label: rule.label,
      severity: rule.severity,
      action: rule.action,
      immediateActions,
      rationale: rule.rationale,
    });

    if (rule.severity === "HARD") hasHard = true;
    else hasSoft = true;

    if (rule.action === "ER_SEND") hasErSend = true;
  }

  const gateResult: "ER_SEND" | "ESCALATE" | "PASS" = hasErSend
    ? "ER_SEND"
    : hasHard || hasSoft
      ? "ESCALATE"
      : "PASS";

  return {
    triggeredFlags: triggered,
    anySeverity: hasHard ? "HARD" : hasSoft ? "SOFT" : "NONE",
    gateResult,
  };
}

export interface ScoringResult {
  scores: Record<string, number>;
  components: Record<string, any>;
  missingInputs: string[];
}

export function runScoring(state: CaseState, config: ComplaintConfig): ScoringResult {
  const scores: Record<string, number> = {};
  const components: Record<string, any> = {};
  const missingInputs: string[] = [];

  for (const def of config.scoringDefs) {
    if (def.module === "CENTOR") {
      const result = computeCentor(state);
      scores[def.scoreId.toLowerCase()] = result.centor;
      components[def.scoreId] = {
        score: result.centor,
        inputsUsed: result.inputsUsed,
      };

      for (const input of def.inputs) {
        if (input.startsWith("demographics.")) continue;
        if (!(input in state.answers) || state.answers[input] === null) {
          missingInputs.push(input);
        }
      }
    }
  }

  return { scores, components, missingInputs };
}

export interface DispositionResult {
  dispositionLevel: string;
  rationaleTemplateId: string;
  confidenceHint: string;
  matchedRuleId: string;
  rulesEvaluated: number;
}

export function runDisposition(state: CaseState, rules: DispositionRule[]): DispositionResult {
  let rulesEvaluated = 0;

  for (const rule of rules) {
    rulesEvaluated++;
    const matches = evaluateExpr(rule.whenExpr, state);
    if (matches) {
      return {
        dispositionLevel: rule.dispositionLevel,
        rationaleTemplateId: rule.rationaleTemplateId,
        confidenceHint: rule.confidenceHint,
        matchedRuleId: rule.dispRuleId,
        rulesEvaluated,
      };
    }
  }

  return {
    dispositionLevel: "routine",
    rationaleTemplateId: "",
    confidenceHint: "LOW",
    matchedRuleId: "FALLBACK",
    rulesEvaluated,
  };
}

export interface TemplateRenderResult {
  templateId: string;
  label: string;
  rendered: string;
  channel: string;
}

export function renderTemplate(
  template: OutputTemplate,
  state: CaseState,
  extras: Record<string, string> = {}
): TemplateRenderResult {
  let body = template.body;

  const vars: Record<string, string> = {
    centor_score: String(state.scores?.centor ?? "N/A"),
    duration_days: String(state.answers?.Q_DURATION_DAYS ?? "N/A"),
    age: String(state.demographics?.age ?? "N/A"),
    sex: state.demographics?.sex ?? "N/A",
    chief_complaint: state.chiefComplaint ?? "N/A",
    disposition: state.disposition ?? "pending",
    red_flag_labels: (state.redFlagGate?.flagsFound ?? []).map(f => f.label).join(", ") || "none",
    immediate_actions: (state.redFlagGate?.flagsFound ?? [])
      .flatMap(f => f.immediateActions)
      .join("; ") || "",
    ...extras,
  };

  for (const [key, val] of Object.entries(vars)) {
    body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
  }

  return {
    templateId: template.templateId,
    label: template.label,
    rendered: body,
    channel: template.channel,
  };
}

export function findTemplate(templates: OutputTemplate[], templateId: string): OutputTemplate | null {
  return templates.find(t => t.templateId === templateId) ?? null;
}
