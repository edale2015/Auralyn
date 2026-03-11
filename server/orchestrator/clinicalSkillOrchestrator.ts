import { OrchestratorState, SkillContext, SkillResult } from "../skills/shared/skillTypes";
import { evaluatePlatformPrinciples } from "./platformPrinciplesPolicy";
import { appendCaseAuditLog, appendSkillRunLog } from "../skills/shared/auditLogger";
import { assertSkillResultShape } from "../skills/shared/schemaValidators";

import { collectModifiers } from "../skills/intake/collectModifiers";
import { extractMedToConditionTriggers } from "../skills/intake/extractMedToConditionTriggers";
import { identifyChiefComplaint } from "../skills/intake/identifyChiefComplaint";
import { normalizePatientStory } from "../skills/intake/normalizePatientStory";

import { detectRedFlags } from "../skills/safety/detectRedFlags";
import { determineDisposition } from "../skills/safety/determineDisposition";

import { runComplaintQuestionBundle } from "../skills/questions/runComplaintQuestionBundle";
import { triggerGlobalSecondaryQuestions } from "../skills/questions/triggerGlobalSecondaryQuestions";
import { selectNextBestQuestion } from "../skills/questions/selectNextBestQuestion";

import { scoreDifferentialClusters } from "../skills/reasoning/scoreDifferentialClusters";
import { applyClinicalScore } from "../skills/reasoning/applyClinicalScore";
import { generateDifferential } from "../skills/reasoning/generateDifferential";

import { checkConsistencyAndGaps } from "../skills/audit/checkConsistencyAndGaps";

import { generateEmergencyWarning } from "../skills/output/generateEmergencyWarning";
import { generateAssessmentPlan } from "../skills/output/generateAssessmentPlan";
import { generatePhysicianReviewPacket } from "../skills/output/generatePhysicianReviewPacket";

import { attachOutcomeStub } from "../skills/outcomes/attachOutcomeStub";
import { measureWorkflowValue } from "../skills/analytics/measureWorkflowValue";

import { runReasoningGraph } from "../reasoning-graph/graphRunner";
import { canonicalizeComplaintId } from "../skills/shared/complaintAliasRegistry";
import { getComplaintRolloutMode } from "../config/siteConfigRegistry";

type SkillRunner = (context: SkillContext) => Promise<SkillResult>;
type SkillRunnerMap = Record<string, SkillRunner>;

async function runPlaceholderSkill(skillName: string, context: SkillContext): Promise<SkillResult> {
  const started = Date.now();
  return {
    skillId: `PLACEHOLDER_${skillName}`,
    skillName,
    version: "v1",
    status: "success",
    confidence: 0.75,
    reasoning_summary: `${skillName} has not yet been fully implemented — placeholder output.`,
    result: {
      message: `${skillName} not yet fully implemented`,
      caseId: context.caseId,
    },
    audit: {
      tablesUsed: [],
      ruleHits: [],
      missingData: [],
      latencyMs: Date.now() - started,
      estimatedCostUsd: 0,
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


function buildSkillRunnerMap(): SkillRunnerMap {
  return {
    collect_modifiers: collectModifiers,
    extract_med_to_condition_triggers: extractMedToConditionTriggers,
    identify_chief_complaint: identifyChiefComplaint,
    normalize_patient_story: normalizePatientStory,
    detect_red_flags: detectRedFlags,
    determine_disposition: determineDisposition,
    run_complaint_question_bundle: runComplaintQuestionBundle,
    trigger_global_secondary_questions: triggerGlobalSecondaryQuestions,
    select_next_best_question: selectNextBestQuestion,
    score_differential_clusters: scoreDifferentialClusters,
    apply_clinical_score: applyClinicalScore,
    generate_differential: generateDifferential,
    check_consistency_and_gaps: checkConsistencyAndGaps,
    generate_emergency_warning: generateEmergencyWarning,
    generate_assessment_plan: generateAssessmentPlan,
    generate_physician_review_packet: generatePhysicianReviewPacket,
    attach_outcome_stub: attachOutcomeStub,
    measure_workflow_value: measureWorkflowValue,
  };
}

function buildContextForSkill(
  baseContext: SkillContext,
  skillResults: Record<string, SkillResult>
): SkillContext {
  const complaintId =
    skillResults["identify_chief_complaint"]?.result?.complaint_id ?? baseContext.complaintId;
  const modifiers =
    skillResults["collect_modifiers"]?.result?.modifiers ?? baseContext.modifiers;
  const knownFacts =
    skillResults["normalize_patient_story"]?.result?.structured_facts ?? baseContext.knownFacts;

  return {
    ...baseContext,
    complaintId,
    modifiers,
    knownFacts,
    priorSkillOutputs: skillResults,
  };
}

function getExecutionMode(
  context: SkillContext
): "sequential" | "graph" | "compare" {
  const requested = context.config?.orchestrationMode as string | undefined;
  const siteId = (context as any).metadata?.siteId ?? "default";
  const complaint = canonicalizeComplaintId(context.complaintId);

  if (requested === "sequential") return "sequential";
  if (requested === "graph") return "graph";
  if (requested === "compare") return "compare";

  if (complaint) {
    return getComplaintRolloutMode(complaint, siteId);
  }

  return "sequential";
}

async function buildAuditLogArgs(state: OrchestratorState) {
  return {
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
  };
}

async function runSequentialMode(
  initialContext: SkillContext,
  runSkill: SkillRunnerMap
): Promise<OrchestratorState> {
  const state: OrchestratorState = {
    context: initialContext,
    skillResults: {},
    completedSkills: [],
    pendingSkills: [...DEFAULT_SEQUENCE],
    halted: false,
  };

  for (const skillName of DEFAULT_SEQUENCE) {
    if (state.halted) break;

    const contextForSkill = buildContextForSkill(state.context, state.skillResults);
    const runner = runSkill[skillName] ?? ((ctx) => runPlaceholderSkill(skillName, ctx));
    const result = await runner(contextForSkill);

    assertSkillResultShape(result, skillName);

    state.skillResults[skillName] = result;
    state.completedSkills.push(skillName);
    state.pendingSkills = state.pendingSkills.filter((s) => s !== skillName);

    await appendSkillRunLog(contextForSkill, {
      ...result,
      audit: {
        ...result.audit,
        complaintFamily: canonicalizeComplaintId(contextForSkill.complaintId),
      },
    });

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
  await appendCaseAuditLog(await buildAuditLogArgs(state));
  return state;
}

async function runGraphMode(
  initialContext: SkillContext,
  runSkill: SkillRunnerMap
): Promise<OrchestratorState> {
  const graphResult = await runReasoningGraph({
    initialContext,
    runSkill: Object.fromEntries(
      Object.entries(runSkill).map(([skillName, runner]) => [
        skillName,
        async (context: SkillContext) => {
          const result = await runner(context);
          assertSkillResultShape(result, skillName);
          await appendSkillRunLog(context, {
            ...result,
            audit: {
              ...result.audit,
              complaintFamily: canonicalizeComplaintId(context.complaintId),
            },
          });
          return result;
        },
      ])
    ),
  });

  const finalContext = buildContextForSkill(initialContext, graphResult.skillResults);

  const state: OrchestratorState = {
    context: finalContext,
    skillResults: graphResult.skillResults,
    completedSkills: graphResult.completedSkills,
    pendingSkills: DEFAULT_SEQUENCE.filter((s) => !graphResult.completedSkills.includes(s)),
    halted: false,
    finalDisposition:
      graphResult.skillResults["determine_disposition"]?.result?.disposition,
  };

  state.platformChecks = evaluatePlatformPrinciples(state);
  await appendCaseAuditLog(await buildAuditLogArgs(state));
  return state;
}

export class ClinicalSkillOrchestrator {
  async run(initialContext: SkillContext): Promise<OrchestratorState> {
    const runSkill = buildSkillRunnerMap();
    const mode = getExecutionMode(initialContext);

    if (mode === "compare") {
      const sequential = await runSequentialMode(initialContext, runSkill);
      try {
        const graph = await runGraphMode(
          { ...initialContext, config: { ...initialContext.config, orchestrationMode: "graph" } },
          runSkill
        );
        console.log("[Orchestrator] COMPARE MODE DIFF", {
          caseId: initialContext.caseId,
          sequentialDisposition: sequential.finalDisposition,
          graphDisposition: graph.finalDisposition,
          sequentialComplaint:
            sequential.skillResults?.identify_chief_complaint?.result?.complaint_id,
          graphComplaint:
            graph.skillResults?.identify_chief_complaint?.result?.complaint_id,
        });
      } catch (err) {
        console.error("[Orchestrator] Compare mode graph run failed:", err);
      }
      return sequential;
    }

    if (mode === "graph") {
      try {
        return await runGraphMode(initialContext, runSkill);
      } catch (err) {
        console.error("[Orchestrator] Graph mode failed, falling back to sequential:", err);
        return runSequentialMode(
          {
            ...initialContext,
            config: { ...initialContext.config, orchestrationMode: "sequential" },
          },
          runSkill
        );
      }
    }

    return runSequentialMode(initialContext, runSkill);
  }
}
