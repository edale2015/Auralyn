import { OrchestratorState, SkillContext, SkillResult } from "../skills/shared/skillTypes";
import { evaluatePlatformPrinciples } from "./platformPrinciplesPolicy";
import { attachOutcomeStub } from "../skills/outcomes/attachOutcomeStub";
import { appendCaseAuditLog, appendSkillRunLog } from "../skills/shared/auditLogger";
import { collectModifiers } from "../skills/intake/collectModifiers";
import { identifyChiefComplaint } from "../skills/intake/identifyChiefComplaint";
import { normalizePatientStory } from "../skills/intake/normalizePatientStory";
import { detectRedFlags } from "../skills/safety/detectRedFlags";
import { runComplaintQuestionBundle } from "../skills/questions/runComplaintQuestionBundle";
import { selectNextBestQuestion } from "../skills/questions/selectNextBestQuestion";
import { scoreDifferentialClusters } from "../skills/reasoning/scoreDifferentialClusters";
import { applyClinicalScore } from "../skills/reasoning/applyClinicalScore";
import { generateDifferential } from "../skills/reasoning/generateDifferential";
import { determineDisposition } from "../skills/safety/determineDisposition";
import { generatePhysicianReviewPacket } from "../skills/output/generatePhysicianReviewPacket";
import { assertSkillResultShape } from "../skills/shared/schemaValidators";

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

      const priorComplaintId =
        state.skillResults["identify_chief_complaint"]?.result?.complaint_id ??
        state.context.complaintId;

      const currentModifiers =
        state.skillResults["collect_modifiers"]?.result?.modifiers ??
        state.context.modifiers;

      const normalizedFacts =
        state.skillResults["normalize_patient_story"]?.result?.structured_facts ??
        state.context.knownFacts;

      const contextForSkill: SkillContext = {
        ...state.context,
        complaintId: priorComplaintId,
        modifiers: currentModifiers,
        knownFacts: normalizedFacts,
        priorSkillOutputs: state.skillResults,
      };

      let result: SkillResult;

      switch (skillName) {
        case "collect_modifiers":
          result = await collectModifiers(contextForSkill);
          break;
        case "identify_chief_complaint":
          result = await identifyChiefComplaint(contextForSkill);
          break;
        case "normalize_patient_story":
          result = await normalizePatientStory(contextForSkill);
          break;
        case "detect_red_flags":
          result = await detectRedFlags(contextForSkill);
          break;
        case "run_complaint_question_bundle":
          result = await runComplaintQuestionBundle(contextForSkill);
          break;
        case "select_next_best_question":
          result = await selectNextBestQuestion(contextForSkill);
          break;
        case "score_differential_clusters":
          result = await scoreDifferentialClusters(contextForSkill);
          break;
        case "apply_clinical_score":
          result = await applyClinicalScore(contextForSkill);
          break;
        case "generate_differential":
          result = await generateDifferential(contextForSkill);
          break;
        case "determine_disposition":
          result = await determineDisposition(contextForSkill);
          break;
        case "generate_physician_review_packet":
          result = await generatePhysicianReviewPacket(contextForSkill);
          break;
        case "attach_outcome_stub":
          result = await attachOutcomeStub(contextForSkill);
          break;
        default:
          result = await runPlaceholderSkill(skillName, contextForSkill);
          break;
      }

      assertSkillResultShape(result, skillName);

      state.skillResults[skillName] = result;
      state.completedSkills.push(skillName);
      state.pendingSkills = state.pendingSkills.filter((s) => s !== skillName);

      await appendSkillRunLog(contextForSkill, result);

      if (skillName === "identify_chief_complaint" && result.result?.complaint_id) {
        state.context.complaintId = result.result.complaint_id;
      }
      if (skillName === "collect_modifiers" && result.result?.modifiers) {
        state.context.modifiers = result.result.modifiers;
      }
      if (skillName === "normalize_patient_story" && result.result?.structured_facts) {
        state.context.knownFacts = result.result.structured_facts;
      }
      if (skillName === "determine_disposition") {
        state.finalDisposition = result.result?.disposition ?? state.finalDisposition;
      }
    }

    state.platformChecks = evaluatePlatformPrinciples(state);

    await appendCaseAuditLog({
      context: state.context,
      finalDisposition: state.finalDisposition,
      finalStatus: state.halted ? "halted" : "complete",
      completedSkills: state.completedSkills,
      redFlagHits:
        state.skillResults["detect_red_flags"]?.result?.rationale_refs ?? [],
      differentialTop3:
        state.skillResults["generate_differential"]?.result?.differential_list
          ?.slice?.(0, 3)
          ?.map?.((d: any) => d.diagnosis ?? String(d)) ?? [],
      clinicalScoreUsed:
        state.skillResults["apply_clinical_score"]?.result?.score_name ?? "",
      platformChecks: state.platformChecks,
    });

    return state;
  }
}
