import type { CaseState } from "../../shared/agentTypes";

export interface CareGap {
  gap_id: string;
  domain: string;
  severity: "INFO" | "IMPORTANT" | "URGENT_SOON";
  recommended_action: string;
  evidence: string[];
}

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

export function evaluateCareGaps(state: CaseState): CareGap[] {
  if (state.redFlagGate?.gateResult === "ER_SEND") return [];
  if (state.routing.state === "EMERGENT_ESCALATION") return [];

  const gaps: CareGap[] = [];
  const allMeds = [
    ...(state.fhirPrefill?.meds ?? []),
    ...(state.modifiers?.meds ?? []),
    ...(state.dm?.meds ?? []),
    ...(state.htn?.meds ?? []),
  ].map(m => m.toLowerCase());

  const allProblems = [
    ...(state.fhirPrefill?.problems ?? []),
    ...(state.modifiers?.pmh ?? []),
  ].map(p => p.toLowerCase());

  const noPcpAccess = state.social?.pcpAccessDelay === true;
  const severityBoost = (base: CareGap["severity"]): CareGap["severity"] => {
    if (!noPcpAccess) return base;
    if (base === "INFO") return "IMPORTANT";
    if (base === "IMPORTANT") return "URGENT_SOON";
    return base;
  };

  const DM_MEDS = ["metformin", "insulin", "glipizide", "glyburide", "glimepiride", "empagliflozin", "dapagliflozin", "canagliflozin", "sitagliptin"];
  const SULFO_INSULIN = ["glipizide", "glyburide", "glimepiride", "insulin"];
  const GLP1_MEDS = ["semaglutide", "tirzepatide", "liraglutide", "dulaglutide", "exenatide", "ozempic", "wegovy", "mounjaro"];
  const HTN_MEDS = ["lisinopril", "losartan", "amlodipine", "metoprolol", "hydrochlorothiazide", "enalapril", "valsartan"];
  const ACE_ARB_DIURETIC = ["lisinopril", "enalapril", "losartan", "valsartan", "irbesartan", "hydrochlorothiazide", "chlorthalidone", "indapamide"];

  const hasDM = state.dm?.hasDM === true || allMeds.some(m => DM_MEDS.some(d => m.includes(d))) ||
    allProblems.some(p => p.includes("diabetes"));
  const hasHTN = state.htn?.hasHTN === true || allMeds.some(m => HTN_MEDS.some(d => m.includes(d))) ||
    allProblems.some(p => p.includes("hypertension"));
  const hasGLP1 = !!state.glp1?.agent || allMeds.some(m => GLP1_MEDS.some(d => m.includes(d)));
  const hasBariatric = !!state.bariatric?.surgeryType ||
    allProblems.some(p => ["bariatric", "gastric bypass", "sleeve", "roux-en-y", "lap band"].some(t => p.includes(t)));
  const hasObesity = (state.metabolic?.bmi && state.metabolic.bmi >= 30) ||
    allProblems.some(p => p.includes("obesity") || p.includes("overweight"));
  const hasAnticoag = allMeds.some(m => ["warfarin", "eliquis", "apixaban", "xarelto", "rivaroxaban"].some(d => m.includes(d))) ||
    state.fhirPrefill?.derivedFlags?.onAnticoagulant;

  if (!hasDM && !hasHTN && !hasGLP1 && !hasBariatric && !hasObesity && !hasAnticoag) {
    return [];
  }

  if (hasDM) {
    const hasA1c = state.dm?.lastA1c !== undefined && state.dm.lastA1c > 0;
    if (!hasA1c) {
      gaps.push({
        gap_id: "CG_DM_A1C_UNKNOWN",
        domain: "DM",
        severity: severityBoost("IMPORTANT"),
        recommended_action: "Order HbA1c — last value unknown or outdated",
        evidence: ["Diabetes detected but no recent A1c on file"],
      });
    }

    gaps.push({
      gap_id: "CG_DM_URINE_ALBUMIN",
      domain: "DM",
      severity: severityBoost("IMPORTANT"),
      recommended_action: "Urine albumin-to-creatinine ratio (UACR) — screen for nephropathy",
      evidence: ["Annual screening recommended for all DM patients"],
    });

    gaps.push({
      gap_id: "CG_DM_EYE_EXAM",
      domain: "DM",
      severity: severityBoost("INFO"),
      recommended_action: "Dilated eye exam referral — screen for retinopathy",
      evidence: ["Annual dilated eye exam recommended for DM patients"],
    });

    const hasStatin = allMeds.some(m => ["atorvastatin", "rosuvastatin", "simvastatin", "pravastatin", "lovastatin", "statin"].some(s => m.includes(s)));
    if (!hasStatin) {
      gaps.push({
        gap_id: "CG_DM_STATIN_ELIGIBILITY",
        domain: "DM",
        severity: "INFO",
        recommended_action: "Evaluate statin eligibility — most DM patients age 40-75 benefit from moderate-intensity statin",
        evidence: ["ADA guidelines recommend statin therapy for most adults with diabetes"],
      });
    }

    const hasSulfoOrInsulin = allMeds.some(m => SULFO_INSULIN.some(d => m.includes(d)));
    if (hasSulfoOrInsulin) {
      gaps.push({
        gap_id: "CG_DM_HYPO_EDUCATION",
        domain: "DM",
        severity: severityBoost("IMPORTANT"),
        recommended_action: "Hypoglycemia recognition and management education — patient on sulfonylurea/insulin",
        evidence: [`Hypoglycemia-risk medications: ${allMeds.filter(m => SULFO_INSULIN.some(d => m.includes(d))).join(", ")}`],
      });
    }
  }

  if (hasHTN) {
    if (!state.htn?.homeBP) {
      gaps.push({
        gap_id: "CG_HTN_HOME_BP_LOG",
        domain: "HTN",
        severity: severityBoost("INFO"),
        recommended_action: "Initiate home blood pressure monitoring log",
        evidence: ["Home BP monitoring recommended for HTN management and medication titration"],
      });
    }

    const hasACEARBDiuretic = allMeds.some(m => ACE_ARB_DIURETIC.some(d => m.includes(d)));
    if (hasACEARBDiuretic) {
      gaps.push({
        gap_id: "CG_HTN_LABS_MONITORING",
        domain: "HTN",
        severity: severityBoost("IMPORTANT"),
        recommended_action: "BMP (potassium, creatinine) for ACE/ARB/diuretic monitoring",
        evidence: [`Monitoring labs needed for: ${allMeds.filter(m => ACE_ARB_DIURETIC.some(d => m.includes(d))).join(", ")}`],
      });
    }

    if (hasObesity) {
      const snoring = norm(state.chiefComplaint).includes("snor") ||
        state.answers["Q_SNORING"] === "yes" ||
        allProblems.some(p => p.includes("snoring") || p.includes("sleep apnea") || p.includes("osa"));
      const osaNotDiagnosed = !allProblems.some(p => p.includes("sleep apnea") || p.includes("osa"));
      if ((snoring || osaNotDiagnosed) && hasObesity) {
        gaps.push({
          gap_id: "CG_HTN_OSA_SCREEN",
          domain: "HTN",
          severity: severityBoost("INFO"),
          recommended_action: "Screen for obstructive sleep apnea (STOP-BANG or Epworth) — obesity + HTN increases risk",
          evidence: ["Obesity + hypertension is a strong predictor of undiagnosed OSA"],
        });
      }
    }
  }

  if (hasBariatric) {
    gaps.push({
      gap_id: "CG_BARI_MICRONUTRIENT_PANEL",
      domain: "BARIATRIC",
      severity: severityBoost("IMPORTANT"),
      recommended_action: "Annual micronutrient panel — iron, B12, folate, vitamin D, calcium, zinc, copper, thiamine",
      evidence: ["Bariatric surgery patients require lifelong micronutrient monitoring"],
    });

    const hasVomiting = state.answers["Q_VOMITING"] === "yes" || norm(state.chiefComplaint).includes("vomit");
    if (hasVomiting) {
      gaps.push({
        gap_id: "CG_BARI_THIAMINE_RISK",
        domain: "BARIATRIC",
        severity: severityBoost("URGENT_SOON"),
        recommended_action: "Check thiamine level — vomiting in bariatric patient risks Wernicke encephalopathy",
        evidence: ["Persistent vomiting in bariatric patients depletes thiamine stores rapidly"],
      });
    }
  }

  if (hasGLP1) {
    gaps.push({
      gap_id: "CG_GLP1_LEAN_MASS",
      domain: "GLP1",
      severity: "INFO",
      recommended_action: "Recommend adequate protein intake (1.2-1.5 g/kg/day) and resistance training to preserve lean mass during weight loss",
      evidence: ["GLP-1 RA-induced weight loss includes significant lean mass loss without resistance exercise"],
    });

    gaps.push({
      gap_id: "CG_GLP1_GALLBLADDER_PANCREATITIS",
      domain: "GLP1",
      severity: severityBoost("INFO"),
      recommended_action: "Educate patient on gallbladder and pancreatitis warning signs — RUQ pain, severe epigastric pain radiating to back",
      evidence: ["GLP-1 RA therapy associated with increased risk of cholelithiasis and acute pancreatitis"],
    });
  }

  if (hasAnticoag) {
    gaps.push({
      gap_id: "CG_ANTICOAG_MONITORING",
      domain: "ANTICOAG",
      severity: severityBoost("IMPORTANT"),
      recommended_action: "Verify anticoagulation monitoring and adherence — INR for warfarin, renal function for DOACs",
      evidence: [`Patient on anticoagulation therapy`],
    });
  }

  if (noPcpAccess) {
    gaps.push({
      gap_id: "CG_NO_PCP_NAVIGATION",
      domain: "ACCESS",
      severity: "URGENT_SOON",
      recommended_action: "Provide community clinic navigation resources — patient lacks regular PCP access",
      evidence: ["social.pcpAccessDelay = true", "Gap urgency boosted due to limited access to care"],
    });
  }

  return gaps;
}
