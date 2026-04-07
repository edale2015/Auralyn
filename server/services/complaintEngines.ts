import type { CaseState } from "../../shared/agentTypes";
import type { ComplaintConfig, CoreQuestion, RedFlagRule, DispositionRule, OutputTemplate } from "./complaintConfigLoader";
import { evaluateExpr } from "./exprEval";
import { computeCentor } from "../agent/scoring/centor";
import { computeEaracheScore } from "../agent/scoring/earacheScore";
import { computeCoughScore } from "../agent/scoring/coughScore";
import { computeChestPainScore } from "../agent/scoring/chestPainScore";
import { computeDizzinessScore } from "../agent/scoring/dizzinessScore";
import { computeAbdPainScore } from "../agent/scoring/abdPainScore";
import { computeUtiScore } from "../agent/scoring/utiScore";
import { computeTesticularPainScore } from "../agent/scoring/testicularPainScore";
import { computePelvicPainScore } from "../agent/scoring/pelvicPainScore";
import { computeHeadacheScore } from "../agent/scoring/headacheScore";

export type ScoringModuleId =
  | "CENTOR"
  | "EARACHE_SCORE"
  | "COUGH_SCORE"
  | "CHEST_PAIN_SCORE"
  | "DIZZINESS_SCORE"
  | "ABD_PAIN_SCORE"
  | "UTI_SCORE"
  | "TESTICULAR_PAIN_SCORE"
  | "PELVIC_PAIN_SCORE"
  | "HEADACHE_SCORE";

const KNOWN_SCORER_MODULES = new Set<string>([
  "CENTOR",
  "EARACHE_SCORE",
  "COUGH_SCORE",
  "CHEST_PAIN_SCORE",
  "DIZZINESS_SCORE",
  "ABD_PAIN_SCORE",
  "UTI_SCORE",
  "TESTICULAR_PAIN_SCORE",
  "PELVIC_PAIN_SCORE",
  "HEADACHE_SCORE",
]);

export function assertScorerKnown(module: string, ccId: string): void {
  if (!KNOWN_SCORER_MODULES.has(module)) {
    throw new Error(
      `[Scoring] Unknown scoring module "${module}" for complaint "${ccId}" — execution blocked to prevent silent misdiagnosis`
    );
  }
}

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
    console.log("RF CHECK:", rule.rfId, "=>", fires);
    if (!fires) continue;

    console.log("RF FIRED:", rule.rfId);

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
    } else if (def.module === "EARACHE_SCORE") {
      const result = computeEaracheScore(state);
      scores[def.scoreId.toLowerCase()] = result.earache_score;
      scores["oe_score"] = result.oe_score;
      scores["aom_score"] = result.aom_score;
      scores["tmj_score"] = result.tmj_score;
      scores["etd_score"] = result.etd_score;
      components[def.scoreId] = {
        earache_score: result.earache_score,
        oe_score: result.oe_score,
        aom_score: result.aom_score,
        tmj_score: result.tmj_score,
        etd_score: result.etd_score,
        cluster: result.cluster,
        inputsUsed: result.inputsUsed,
      };

      for (const input of def.inputs) {
        if (input.startsWith("demographics.")) continue;
        if (!(input in state.answers) || state.answers[input] === null) {
          missingInputs.push(input);
        }
      }
    } else if (def.module === "COUGH_SCORE") {
      const result = computeCoughScore(state);
      scores[def.scoreId.toLowerCase()] = result.cough_score;
      scores["pe_score"] = result.pe_score;
      scores["pneumonia_score"] = result.pneumonia_score;
      scores["asthma_exac_score"] = result.asthma_exac_score;
      scores["copd_exac_score"] = result.copd_exac_score;
      scores["viral_uri_score"] = result.viral_uri_score;
      scores["infection_score"] = result.infection_score;
      scores["pnd_score"] = result.pnd_score;
      scores["gerd_score"] = result.gerd_score;
      components[def.scoreId] = {
        cough_score: result.cough_score,
        pe_score: result.pe_score,
        pneumonia_score: result.pneumonia_score,
        asthma_exac_score: result.asthma_exac_score,
        copd_exac_score: result.copd_exac_score,
        viral_uri_score: result.viral_uri_score,
        infection_score: result.infection_score,
        pnd_score: result.pnd_score,
        gerd_score: result.gerd_score,
        cluster: result.cluster,
        inputsUsed: result.inputsUsed,
      };

      for (const input of def.inputs) {
        if (input.startsWith("demographics.")) continue;
        if (!(input in state.answers) || state.answers[input] === null) {
          missingInputs.push(input);
        }
      }
    } else if (def.module === "CHEST_PAIN_SCORE") {
      const result = computeChestPainScore(state);
      scores[def.scoreId.toLowerCase()] = result.chest_pain_score;
      scores["acs_score"] = result.acs_score;
      scores["pe_cp_score"] = result.pe_score;
      scores["dissection_score"] = result.dissection_score;
      scores["pericarditis_score"] = result.pericarditis_score;
      scores["pneumonia_cp_score"] = result.pneumonia_score;
      scores["gerd_cp_score"] = result.gerd_score;
      scores["msk_score"] = result.msk_score;
      scores["anxiety_score"] = result.anxiety_score;
      components[def.scoreId] = {
        ...result,
      };

      for (const input of def.inputs) {
        if (input.startsWith("demographics.")) continue;
        if (!(input in state.answers) || state.answers[input] === null) {
          missingInputs.push(input);
        }
      }
    } else if (def.module === "DIZZINESS_SCORE") {
      const result = computeDizzinessScore(state);
      scores[def.scoreId.toLowerCase()] = result.dizziness_score;
      scores["bppv_score"] = result.bppv_score;
      scores["vest_neuritis_score"] = result.vest_neuritis_score;
      scores["stroke_score"] = result.stroke_score;
      scores["orthostatic_score"] = result.orthostatic_score;
      scores["cardiac_score"] = result.cardiac_score;
      scores["hypoglycemia_score"] = result.hypoglycemia_score;
      scores["anemia_score"] = result.anemia_score;
      scores["medication_score"] = result.medication_score;
      components[def.scoreId] = {
        ...result,
      };

      for (const input of def.inputs) {
        if (input.startsWith("demographics.")) continue;
        if (!(input in state.answers) || state.answers[input] === null) {
          missingInputs.push(input);
        }
      }
    } else if (def.module === "ABD_PAIN_SCORE") {
      const result = computeAbdPainScore(state);
      scores[def.scoreId.toLowerCase()] = result.abd_pain_score;
      scores["gastroenteritis_score"] = result.gastroenteritis_score;
      scores["appendicitis_score"] = result.appendicitis_score;
      scores["cholecystitis_score"] = result.cholecystitis_score;
      scores["pancreatitis_score"] = result.pancreatitis_score;
      scores["gi_bleed_score"] = result.gi_bleed_score;
      scores["aaa_score"] = result.aaa_score;
      scores["diverticulitis_score"] = result.diverticulitis_score;
      scores["renal_colic_score"] = result.renal_colic_score;
      scores["ectopic_score"] = result.ectopic_score;
      scores["mesenteric_score"] = result.mesenteric_score;
      components[def.scoreId] = {
        ...result,
      };

      for (const input of def.inputs) {
        if (input.startsWith("demographics.")) continue;
        if (!(input in state.answers) || state.answers[input] === null) {
          missingInputs.push(input);
        }
      }
    } else if (def.module === "UTI_SCORE") {
      const result = computeUtiScore(state);
      scores[def.scoreId.toLowerCase()] = result.uti_score;
      scores["cystitis_score"] = result.cystitis_score;
      scores["pyelo_score"] = result.pyelo_score;
      scores["urosepsis_score"] = result.urosepsis_score;
      scores["pregnancy_uti_score"] = result.pregnancy_uti_score;
      scores["male_uti_score"] = result.male_uti_score;
      scores["uti_immuno_score"] = result.immuno_score;
      scores["hematuria_score"] = result.hematuria_score;
      scores["uti_renal_stone_score"] = result.renal_stone_score;
      scores["sti_mimic_score"] = result.sti_mimic_score;
      scores["no_uti_score"] = result.no_uti_score;
      components[def.scoreId] = { ...result };

      for (const input of def.inputs) {
        if (input.startsWith("demographics.")) continue;
        if (!(input in state.answers) || state.answers[input] === null) {
          missingInputs.push(input);
        }
      }
    } else if (def.module === "TESTICULAR_PAIN_SCORE") {
      const result = computeTesticularPainScore(state);
      scores[def.scoreId.toLowerCase()] = result.testicular_pain_score;
      scores["torsion_score"] = result.torsion_score;
      scores["epid_sti_score"] = result.epid_sti_score;
      scores["epid_enteric_score"] = result.epid_enteric_score;
      scores["fournier_score"] = result.fournier_score;
      scores["hernia_score"] = result.hernia_score;
      scores["prostatitis_score"] = result.prostatitis_score;
      scores["tp_trauma_score"] = result.trauma_score;
      scores["varicocele_score"] = result.varicocele_score;
      scores["stone_ref_score"] = result.stone_ref_score;
      scores["benign_tp_score"] = result.benign_tp_score;
      components[def.scoreId] = { ...result };

      for (const input of def.inputs) {
        if (input.startsWith("demographics.")) continue;
        if (!(input in state.answers) || state.answers[input] === null) {
          missingInputs.push(input);
        }
      }
    } else if (def.module === "PELVIC_PAIN_SCORE") {
      const result = computePelvicPainScore(state);
      scores[def.scoreId.toLowerCase()] = result.pelvic_pain_score;
      scores["pp_ectopic_score"] = result.ectopic_score;
      scores["pp_torsion_score"] = result.pp_torsion_score;
      scores["pid_score"] = result.pid_score;
      scores["ruptured_cyst_score"] = result.ruptured_cyst_score;
      scores["endometriosis_score"] = result.endometriosis_score;
      scores["fibroids_score"] = result.fibroids_score;
      scores["pp_uti_mimic_score"] = result.uti_mimic_score;
      scores["pp_appendicitis_score"] = result.pp_appendicitis_score;
      scores["pp_sepsis_score"] = result.pp_sepsis_score;
      scores["benign_pp_score"] = result.benign_pp_score;
      components[def.scoreId] = { ...result };

      for (const input of def.inputs) {
        if (input.startsWith("demographics.")) continue;
        if (!(input in state.answers) || state.answers[input] === null) {
          missingInputs.push(input);
        }
      }
    } else if (def.module === "HEADACHE_SCORE") {
      const result = computeHeadacheScore(state);
      scores[def.scoreId.toLowerCase()] = result.headache_score;
      scores["tension_score"] = result.tension_score;
      scores["migraine_score"] = result.migraine_score;
      scores["sah_score"] = result.sah_score;
      scores["meningitis_ha_score"] = result.meningitis_ha_score;
      scores["stroke_ha_score"] = result.stroke_ha_score;
      scores["gca_score"] = result.gca_score;
      scores["co_toxin_score"] = result.co_toxin_score;
      scores["trauma_ha_score"] = result.trauma_ha_score;
      scores["htn_ha_score"] = result.htn_ha_score;
      scores["cluster_ha_score"] = result.cluster_ha_score;
      components[def.scoreId] = { ...result };

      for (const input of def.inputs) {
        if (input.startsWith("demographics.")) continue;
        if (!(input in state.answers) || state.answers[input] === null) {
          missingInputs.push(input);
        }
      }
    } else {
      assertScorerKnown(def.module, config.registry.ccId);
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
    cough_duration: String(state.answers?.Q_COUGH_DUR ?? "N/A"),
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
