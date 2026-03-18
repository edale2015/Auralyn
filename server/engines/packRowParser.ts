import {
  SymptomPackRow,
  ModifierPackRow,
  ClinicianAlgorithmRow,
  ParsedSymptomPack,
  ParsedModifierPack,
  ParsedClinicianAlgorithm,
  IntakeQuestion,
  ModifierRiskAdjustment,
} from "../../shared/packRows";

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseSymptomPackRow(row: SymptomPackRow): ParsedSymptomPack {
  const questions = safeParseJson<IntakeQuestion[]>(row.questionsJson, []).sort(
    (a, b) => a.priority - b.priority
  );

  return {
    id: row.id,
    system: row.system,
    title: row.title,
    aliases: row.aliases,
    likelyDisposition: row.likelyDisposition,
    questions,
    redFlags: row.redFlags,
    autoEscalateRules: row.autoEscalateRules,
    autoReviewRules: row.autoReviewRules,
    planTemplateKey: row.planTemplateKey,
    tags: row.tags,
  };
}

export function parseModifierPackRow(row: ModifierPackRow): ParsedModifierPack {
  const riskAdjustments = safeParseJson<ModifierRiskAdjustment[]>(
    row.riskAdjustmentsJson,
    []
  );

  return {
    id: row.id,
    system: row.system,
    title: row.title,
    appliesToSymptoms: row.appliesToSymptoms,
    triggers: row.triggers,
    riskAdjustments,
    tags: row.tags,
  };
}

export function parseClinicianAlgorithmRow(
  row: ClinicianAlgorithmRow
): ParsedClinicianAlgorithm {
  return {
    id: row.id,
    system: row.system,
    title: row.title,
    entryCriteria: row.entryCriteria,
    requiredInputs: row.requiredInputs,
    outputActions: row.outputActions,
    notes: row.notes,
    tags: row.tags,
  };
}
