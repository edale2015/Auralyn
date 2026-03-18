import { SymptomPackRow, ModifierPackRow, ClinicianAlgorithmRow } from "../../shared/packRows";
import { PackQuestionRow } from "../../shared/packQuestionRows";
import { planTemplates } from "../config/planTemplates";

export interface SystemCoverage {
  system: string;
  complaints: number;
  modifiers: boolean;
  questions: boolean;
  rules: boolean;
  plans: boolean;
  status: "COMPLETE" | "INCOMPLETE";
  complaintList: string[];
  modifierCount: number;
  questionCount: number;
}

export function computeSystemCoverage(
  symptomRows: SymptomPackRow[],
  modifierRows: ModifierPackRow[],
  algorithmRows: ClinicianAlgorithmRow[],
  questionRows: PackQuestionRow[]
): SystemCoverage[] {
  const planKeys = new Set(planTemplates.map(t => t.key));
  const systems: Record<string, {
    complaints: string[];
    modifiers: number;
    questions: number;
    hasRules: boolean;
    hasPlans: boolean;
  }> = {};

  for (const row of symptomRows) {
    if (!systems[row.system]) {
      systems[row.system] = { complaints: [], modifiers: 0, questions: 0, hasRules: false, hasPlans: false };
    }
    systems[row.system].complaints.push(row.title);

    if (row.autoEscalateRules.length > 0 || row.autoReviewRules.length > 0) {
      systems[row.system].hasRules = true;
    }

    if (row.planTemplateKey && planKeys.has(row.planTemplateKey)) {
      systems[row.system].hasPlans = true;
    }
  }

  for (const mod of modifierRows) {
    if (!systems[mod.system]) {
      systems[mod.system] = { complaints: [], modifiers: 0, questions: 0, hasRules: false, hasPlans: false };
    }
    systems[mod.system].modifiers++;
  }

  for (const alg of algorithmRows) {
    if (!systems[alg.system]) {
      systems[alg.system] = { complaints: [], modifiers: 0, questions: 0, hasRules: false, hasPlans: false };
    }
    if (alg.entryCriteria.length > 0) {
      systems[alg.system].hasRules = true;
    }
  }

  for (const s of symptomRows) {
    try {
      const embedded = JSON.parse(s.questionsJson);
      if (Array.isArray(embedded) && embedded.length > 0 && systems[s.system]) {
        systems[s.system].questions += embedded.length;
      }
    } catch {}
  }

  for (const q of questionRows) {
    if (!q.isActive) continue;
    const symptom = symptomRows.find(s => s.id === q.packId);
    if (symptom && systems[symptom.system]) {
      systems[symptom.system].questions++;
    }
  }

  return Object.entries(systems)
    .map(([system, data]) => ({
      system,
      complaints: data.complaints.length,
      modifiers: data.modifiers > 0,
      questions: data.questions > 0,
      rules: data.hasRules,
      plans: data.hasPlans,
      status: (data.modifiers > 0 && data.questions > 0 && data.hasRules && data.hasPlans)
        ? "COMPLETE" as const
        : "INCOMPLETE" as const,
      complaintList: data.complaints,
      modifierCount: data.modifiers,
      questionCount: data.questions,
    }))
    .sort((a, b) => a.system.localeCompare(b.system));
}
