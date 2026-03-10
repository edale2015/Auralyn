import { OrchestratorState, SkillContext, SkillResult } from "../skills/shared/skillTypes";
import { evaluatePlatformPrinciples } from "./platformPrinciplesPolicy";
import { attachOutcomeStub } from "../skills/outcomes/attachOutcomeStub";

async function runPlaceholderSkill(skillName: string, context: SkillContext): Promise<SkillResult> {
  const started = Date.now();

  return {
    skillId: `PLACEHOLDER_${skillName}`,
    skillName,
    version: "v1",
    status: "success",
    confidence: 0.75,
    result: {
      message: `${skillName} not yet fully implemented`,
      caseId: context.caseId,
    },
    audit: {
      tablesUsed: [],
      ruleHits: [],
      missingData: [],
      latencyMs: Date.now() - started,
    },
    nextRecommendedSkills: [],
  };
}

const DEFAULT_SEQUENCE = [
  "collect_modifiers",
  "extract_med_to_condition_triggers",
  "identify_chief_complaint",
  "normalize_patient_story",
  "detect_red_flags",
  "run_complaint_question_bundle",
  "trigger_global_secondary_questions",
  "select_next_best_question",
  "score_differential_clusters",
  "apply_clinical_score",
  "generate_differential",
  "check_consistency_and_gaps",
  "determine_disposition",
  "generate_emergency_warning",
  "generate_assessment_plan",
  "generate_physician_review_packet",
  "attach_outcome_stub",
  "measure_workflow_value",
] as const;

export class ClinicalSkillOrchestrator {
  async run(initialContext: SkillContext): Promise<OrchestratorState> {
    const state: OrchestratorState = {
      context: initialContext,
      skillResults: {},
      completedSkills: [],
      pendingSkills: [...DEFAULT_SEQUENCE],
      halted: false,
    };

    for (const skillName of DEFAULT_SEQUENCE) {
      if (state.halted) break;

      const contextForSkill: SkillContext = {
        ...state.context,
        priorSkillOutputs: state.skillResults,
      };

      let result: SkillResult;

      switch (skillName) {
        case "attach_outcome_stub":
          result = await attachOutcomeStub(contextForSkill);
          break;

        default:
          result = await runPlaceholderSkill(skillName, contextForSkill);
          break;
      }

      state.skillResults[skillName] = result;
      state.completedSkills.push(skillName);
      state.pendingSkills = state.pendingSkills.filter((s) => s !== skillName);

      if (skillName === "determine_disposition") {
        state.finalDisposition = result.result?.disposition ?? state.finalDisposition;
      }

      const escalationNeeded =
        state.skillResults["detect_red_flags"]?.result?.escalation_needed === true;

      if (skillName === "detect_red_flags" && escalationNeeded) {
        state.halted = false;
      }
    }

    state.platformChecks = evaluatePlatformPrinciples(state);
    return state;
  }
}
