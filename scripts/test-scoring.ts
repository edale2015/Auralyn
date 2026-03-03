import { computeScoringSystems, type ScoringSystemResult } from "../server/engines/scoringSystemsEngine";

interface TestCase {
  label: string;
  complaint: string;
  answers: Record<string, any>;
  expected: Array<{
    scoreId: string;
    total: number;
    category?: string;
    firedCount: number;
  }>;
}

const cases: TestCase[] = [
  {
    label: "PERC all pass + Wells zero (low-risk SOB)",
    complaint: "pulm_shortness_of_breath",
    answers: {
      perc_age_lt_50: "yes", perc_hr_lt_100: "yes", perc_spo2_ge_95: "yes",
      perc_no_hemoptysis: "yes", perc_no_estrogen: "yes", perc_no_prior_dvt_pe: "yes",
      perc_no_unilateral_leg_swelling: "yes", perc_no_recent_surgery: "yes",
    },
    expected: [
      { scoreId: "PERC", total: 8, category: "pass", firedCount: 8 },
      { scoreId: "WELLS_PE", total: 0, category: "pe_unlikely", firedCount: 0 },
    ],
  },
  {
    label: "PERC partial (5/8) + Wells moderate",
    complaint: "pulm_shortness_of_breath",
    answers: {
      perc_age_lt_50: "yes", perc_hr_lt_100: "no", perc_spo2_ge_95: "yes",
      perc_no_hemoptysis: "yes", perc_no_estrogen: "no", perc_no_prior_dvt_pe: "yes",
      perc_no_unilateral_leg_swelling: "yes", perc_no_recent_surgery: "no",
      wells_clinical_dvt: "yes", wells_hr_gt_100: "yes",
    },
    expected: [
      { scoreId: "PERC", total: 5, category: "fail", firedCount: 5 },
      { scoreId: "WELLS_PE", total: 4.5, category: "intermediate", firedCount: 2 },
    ],
  },
  {
    label: "Centor high score (strep likely)",
    complaint: "ent_sore_throat",
    answers: {
      centor_fever: "yes", centor_no_cough: "yes", centor_tonsillar_exudate: "yes",
      centor_tender_nodes: "yes", centor_age_3_14: "yes",
    },
    expected: [
      { scoreId: "CENTOR", total: 5, category: "high", firedCount: 5 },
    ],
  },
  {
    label: "Centor low score (viral likely)",
    complaint: "ent_sore_throat",
    answers: {
      centor_fever: "no", centor_no_cough: "no", centor_age_45_plus: "yes",
    },
    expected: [
      { scoreId: "CENTOR", total: -1, category: "low", firedCount: 1 },
    ],
  },
  {
    label: "CURB-65 high (severe pneumonia)",
    complaint: "pulm_cough",
    answers: {
      curb_confusion: "yes", curb_urea_high: "yes", curb_rr_ge_30: "yes",
      curb_bp_low: "yes", curb_age_ge_65: "yes",
    },
    expected: [
      { scoreId: "CURB65", total: 5, category: "high", firedCount: 5 },
    ],
  },
  {
    label: "CURB-65 low (mild pneumonia)",
    complaint: "pulm_cough",
    answers: {
      curb_confusion: "no", curb_urea_high: "no", curb_age_ge_65: "yes",
    },
    expected: [
      { scoreId: "CURB65", total: 1, category: "low", firedCount: 1 },
    ],
  },
  {
    label: "HEART high score (high-risk chest pain)",
    complaint: "cardio_chest_pain",
    answers: {
      heart_history_high: "yes", heart_ecg_st_dev: "yes", heart_age_ge_65: "yes",
      heart_risk_factors_ge3: "yes", heart_troponin_elevated: "yes",
    },
    expected: [
      { scoreId: "HEART", total: 10, category: "high", firedCount: 5 },
    ],
  },
  {
    label: "HEART low score (low-risk chest pain)",
    complaint: "cardio_chest_pain",
    answers: {
      heart_troponin_normal: "yes", heart_age_45_64: "yes",
    },
    expected: [
      { scoreId: "HEART", total: 1, category: "low", firedCount: 2 },
    ],
  },
  {
    label: "No scoring system for unrelated complaint",
    complaint: "gi_abdominal_pain",
    answers: { something: "yes" },
    expected: [],
  },
];

async function main() {
  let pass = 0;
  let fail = 0;

  for (const tc of cases) {
    const state = { answers: tc.answers } as any;
    const results = await computeScoringSystems(tc.complaint, state);

    let ok = true;

    if (results.length !== tc.expected.length) {
      console.error(`  FAIL ${tc.label}: expected ${tc.expected.length} scores, got ${results.length}`);
      ok = false;
    } else {
      for (let i = 0; i < tc.expected.length; i++) {
        const exp = tc.expected[i]!;
        const got = results.find(r => r.scoreId === exp.scoreId);
        if (!got) {
          console.error(`  FAIL ${tc.label}: missing scoreId ${exp.scoreId}`);
          ok = false;
          continue;
        }
        if (got.total !== exp.total) {
          console.error(`  FAIL ${tc.label}: ${exp.scoreId} total expected ${exp.total}, got ${got.total}`);
          ok = false;
        }
        if (exp.category && got.category !== exp.category) {
          console.error(`  FAIL ${tc.label}: ${exp.scoreId} category expected ${exp.category}, got ${got.category}`);
          ok = false;
        }
        if (got.criteriaFired.length !== exp.firedCount) {
          console.error(`  FAIL ${tc.label}: ${exp.scoreId} fired expected ${exp.firedCount}, got ${got.criteriaFired.length}`);
          ok = false;
        }
      }
    }

    if (ok) {
      console.log(`  PASS ${tc.label}`);
      pass++;
    } else {
      fail++;
    }
  }

  console.log(`\n=== Scoring Systems Tests ===`);
  console.log(`PASS: ${pass}  |  FAIL: ${fail}  |  Total: ${pass + fail}`);

  if (fail > 0) {
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
