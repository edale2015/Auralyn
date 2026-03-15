export interface GuidelineResult {
  rules: string[];
  scores: Record<string, { score: number; interpretation: string }>;
  requiredTests: string[];
  redFlags: string[];
}

export function guidelineEngine(caseData: {
  complaint?: string;
  symptoms?: string[];
  answers?: Record<string, unknown>;
  vitals?: Record<string, number>;
  profile?: { age?: number; sex?: string; pregnant?: boolean; smoker?: boolean };
}): GuidelineResult {
  const rules: string[] = [];
  const scores: Record<string, { score: number; interpretation: string }> = {};
  const requiredTests: string[] = [];
  const redFlags: string[] = [];

  const complaint = caseData.complaint?.toLowerCase() ?? '';
  const symptoms = caseData.symptoms ?? [];
  const answers = caseData.answers ?? {};
  const vitals = caseData.vitals ?? {};
  const profile = caseData.profile ?? {};

  // ─── Chest pain ──────────────────────────────────────────────────────────
  if (complaint.includes('chest_pain') || symptoms.includes('chest_pain')) {
    requiredTests.push('ECG', 'Troponin');
    rules.push('HEART score applicable for chest pain triage');
    if (symptoms.includes('diaphoresis') || symptoms.includes('radiation')) {
      redFlags.push('High-risk chest pain features — ACS protocol');
    }
  }

  // ─── Sore throat / Centor ────────────────────────────────────────────────
  if (complaint.includes('sore_throat') || symptoms.includes('sore_throat')) {
    let centor = 0;
    if (answers['q_st_fever'] === true || symptoms.includes('fever')) centor++;
    if (answers['q_st_exudate'] === true) centor++;
    if (answers['q_st_cough_absent'] === true || !symptoms.includes('cough')) centor++;
    if ((profile.age ?? 0) < 15) centor++;
    if ((profile.age ?? 0) > 44) centor--;
    const interp = centor <= 1 ? 'No antibiotics (low risk)' : centor <= 3 ? 'Consider rapid strep' : 'Treat empirically';
    scores['centor'] = { score: centor, interpretation: interp };
    requiredTests.push('Rapid strep test');
    rules.push(`Centor score: ${centor} — ${interp}`);
  }

  // ─── Cough / CURB-65 ─────────────────────────────────────────────────────
  if (complaint.includes('cough') || symptoms.includes('cough')) {
    if (symptoms.includes('fever') && symptoms.includes('shortness_of_breath')) {
      requiredTests.push('Chest X-ray');
      rules.push('Possible pneumonia — CURB-65 assessment recommended');
      let curb = 0;
      if ((profile.age ?? 0) >= 65) curb++;
      if (vitals.respiratoryRate >= 30) curb++;
      if (vitals.systolicBP !== undefined && vitals.systolicBP < 90) curb++;
      if (vitals.BUN !== undefined && vitals.BUN > 19) curb++;
      const interpCurb = curb >= 2 ? 'Consider admission' : 'Outpatient treatment appropriate';
      scores['curb65'] = { score: curb, interpretation: interpCurb };
      rules.push(`CURB-65: ${curb} — ${interpCurb}`);
    }
  }

  // ─── Dyspnea / Wells PE ──────────────────────────────────────────────────
  if (symptoms.includes('shortness_of_breath')) {
    let wells = 0;
    if (symptoms.includes('hemoptysis')) wells += 1;
    if (symptoms.includes('pleuritic_pain')) wells += 1.5;
    if (answers['q_pe_immobility'] === true) wells += 1.5;
    if (symptoms.includes('unilateral_leg_swelling')) wells += 3;
    const interpWells = wells >= 5 ? 'High PE probability — CT-PE indicated' : wells >= 2 ? 'Moderate — D-dimer first' : 'Low probability';
    if (wells > 0) {
      scores['wells_pe'] = { score: wells, interpretation: interpWells };
      rules.push(`Wells PE score: ${wells} — ${interpWells}`);
      if (wells >= 5) { requiredTests.push('CT-PE'); redFlags.push('High Wells PE score'); }
      else if (wells >= 2) requiredTests.push('D-dimer');
    }
  }

  // ─── Ankle / Ottawa ──────────────────────────────────────────────────────
  if (complaint.includes('ankle') || complaint.includes('foot_pain')) {
    rules.push('Ottawa Ankle Rules apply — assess bone tenderness at malleoli');
  }

  return { rules, scores, requiredTests: [...new Set(requiredTests)], redFlags };
}
