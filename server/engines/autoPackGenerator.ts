import { SymptomPackRow, ModifierPackRow, ClinicianAlgorithmRow } from "../../shared/packRows";
import { PackQuestionRow } from "../../shared/packQuestionRows";

export interface GeneratedPack {
  id: string;
  title: string;
  system: string;
  questions: PackQuestionRow[];
  modifiers: ModifierPackRow[];
  algorithms: ClinicianAlgorithmRow[];
  hasQuestions: boolean;
  hasModifiers: boolean;
  hasAlgorithms: boolean;
  completeness: number;
}

export function generatePacksFromData(
  symptomRows: SymptomPackRow[],
  modifierRows: ModifierPackRow[],
  algorithmRows: ClinicianAlgorithmRow[],
  questionRows: PackQuestionRow[]
): GeneratedPack[] {
  return symptomRows.map(symptom => {
    const questions = questionRows.filter(q => q.packId === symptom.id && q.isActive);
    const modifiers = modifierRows.filter(m => m.isActive && m.appliesToSymptoms.includes(symptom.id));
    const algorithms = algorithmRows.filter(a => a.isActive && a.system === symptom.system);

    const hasQuestions = questions.length > 0;
    const hasModifiers = modifiers.length > 0;
    const hasAlgorithms = algorithms.length > 0;

    let completeness = 25;
    if (hasQuestions) completeness += 25;
    if (hasModifiers) completeness += 25;
    if (hasAlgorithms) completeness += 25;

    return {
      id: symptom.id,
      title: symptom.title,
      system: symptom.system,
      questions,
      modifiers,
      algorithms,
      hasQuestions,
      hasModifiers,
      hasAlgorithms,
      completeness,
    };
  });
}
