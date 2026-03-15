import type { BrainCaseInput, DifferentialScore, QuestionScore } from '../../shared/clinicalEngineTypes';

const questionBank: Record<string, string[]> = {
  uti: ['q_uti_fever', 'q_uti_flank_pain', 'q_uti_pregnancy'],
  acute_coronary_syndrome: ['q_cp_exertional', 'q_cp_radiation', 'q_cp_shortness_of_breath'],
  pharyngitis: ['q_st_fever', 'q_st_exudate', 'q_st_cough_absent'],
  pneumonia: ['q_pna_productive_cough', 'q_pna_fever', 'q_pna_pleuritic_pain'],
  pulmonary_embolism: ['q_pe_leg_swelling', 'q_pe_immobility', 'q_pe_hemoptysis'],
  meningitis: ['q_men_neck_stiffness', 'q_men_photophobia', 'q_men_fever'],
  pyelonephritis: ['q_pyelo_flank_pain', 'q_pyelo_fever', 'q_pyelo_dysuria'],
};

export function runNextBestQuestionEngine(
  input: BrainCaseInput,
  differentials: DifferentialScore[]
): QuestionScore[] {
  const top = differentials[0]?.diagnosis;
  const candidates = questionBank[top || ''] || [];
  const unanswered = new Set(input.unansweredQuestions || candidates);
  return candidates
    .filter((q) => unanswered.has(q))
    .map((questionId, i) => ({
      questionId,
      score: Math.max(0.1, 1 - i * 0.15),
      reason: `Helpful for refining ${top ?? 'differential'}.`
    }));
}
