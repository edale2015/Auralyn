import * as fs from "fs/promises";
import * as path from "path";
import { PlatformPrinciplesCheck, SkillContext, SkillResult } from "./skillTypes";

const LOG_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function ensureLogDir(): Promise<void> {
  await fs.mkdir(LOG_DIR, { recursive: true });
}

function summarizeInput(context: SkillContext): string {
  return JSON.stringify({
    caseId: context.caseId,
    complaintId: context.complaintId,
    rawText: context.rawText?.slice(0, 300) ?? "",
    knownFactsKeys: Object.keys(context.knownFacts ?? {}),
    modifierKeys: Object.keys(context.modifiers ?? {}),
    priorSkillKeys: Object.keys(context.priorSkillOutputs ?? {}),
  });
}

function summarizeOutput(result: SkillResult): string {
  return JSON.stringify({
    status: result.status,
    confidence: result.confidence,
    resultKeys:
      result.result && typeof result.result === "object"
        ? Object.keys(result.result)
        : [],
    nextRecommendedSkills: result.nextRecommendedSkills ?? [],
  });
}

export async function appendSkillRunLog(
  context: SkillContext,
  result: SkillResult
): Promise<void> {
  await ensureLogDir();

  const record = {
    runId: `RUN_${context.caseId}_${result.skillName}_${Date.now()}`,
    caseId: context.caseId,
    timestamp: new Date().toISOString(),
    skillId: result.skillId,
    skillName: result.skillName,
    version: result.version,
    status: result.status,
    confidence: result.confidence,
    inputSummary: summarizeInput(context),
    outputSummary: summarizeOutput(result),
    ruleHits: result.audit.ruleHits,
    missingData: result.audit.missingData,
    nextRecommendedSkills: result.nextRecommendedSkills ?? [],
    latencyMs: result.audit.latencyMs,
  };

  const filePath = path.join(LOG_DIR, "skill_run_log.ndjson");
  await fs.appendFile(filePath, JSON.stringify(record) + "\n", "utf8");
}

export async function appendCaseAuditLog(params: {
  context: SkillContext;
  finalDisposition?: string;
  finalStatus?: string;
  completedSkills: string[];
  redFlagHits?: string[];
  differentialTop3?: string[];
  clinicalScoreUsed?: string;
  platformChecks?: PlatformPrinciplesCheck;
}): Promise<void> {
  await ensureLogDir();

  const record = {
    auditId: `AUDIT_${params.context.caseId}_${Date.now()}`,
    caseId: params.context.caseId,
    timestamp: new Date().toISOString(),
    complaintId: params.context.complaintId ?? "",
    complaintName: params.context.complaintName ?? params.context.complaintId ?? "",
    disposition: params.finalDisposition ?? "",
    finalStatus: params.finalStatus ?? "complete",
    decisionDataCaptured: params.platformChecks?.decisionDataCaptured ?? false,
    infrastructureReusable: params.platformChecks?.infrastructureReusable ?? false,
    outcomeAttachPoint: params.platformChecks?.outcomeAttachPoint ?? false,
    workflowEmbedded: params.platformChecks?.workflowEmbedded ?? false,
    networkEffectReady: params.platformChecks?.networkEffectReady ?? false,
    physicianTimeSaved: params.platformChecks?.physicianTimeSaved ?? false,
    regulatorySafe: params.platformChecks?.regulatorySafe ?? false,
    highValueComplaint: params.platformChecks?.highValueComplaint ?? false,
    productModuleAssigned: params.platformChecks?.productModuleAssigned ?? false,
    expertPathwayPreserved: params.platformChecks?.expertPathwayPreserved ?? false,
    skillSequence: params.completedSkills.join(">"),
    redFlagHits: params.redFlagHits ?? [],
    clinicalScoreUsed: params.clinicalScoreUsed ?? "",
    differentialTop3: params.differentialTop3 ?? [],
    strategicNotes: params.platformChecks?.strategicNotes ?? [],
  };

  const filePath = path.join(LOG_DIR, "case_audit_log.ndjson");
  await fs.appendFile(filePath, JSON.stringify(record) + "\n", "utf8");
}
