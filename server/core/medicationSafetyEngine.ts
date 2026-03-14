export type MedicationCandidate = {
  name: string;
  indication?: string;
  dose?: string;
};

export type MedicationSafetyInput = {
  complaint: string;
  topDiagnoses?: string[];
  candidateMedications: MedicationCandidate[];
  answeredQuestions?: Record<string, any>;
  allergies?: string[];
};

export type MedicationSafetyResult = {
  medication: string;
  allowed: boolean;
  severity: "info" | "warning" | "block";
  reasons: string[];
  saferAlternatives: string[];
};

export type MedicationSafetyOutput = {
  safeMedications:    MedicationCandidate[];
  flaggedMedications: MedicationSafetyResult[];
  blockedCount: number;
  warningCount: number;
};

function norm(s: string): string {
  return (s || "").trim().toLowerCase();
}

function hasAny(text: string, needles: string[]): boolean {
  const t = norm(text);
  return needles.some((n) => t.includes(norm(n)));
}

export function medicationSafetyEngine(
  input: MedicationSafetyInput
): MedicationSafetyOutput {
  const a             = input.answeredQuestions || {};
  const allergies     = (input.allergies || []).map(norm);
  const pregnant      = !!a.pregnant;
  const age           = Number(a.age || a.patient_age);
  const anticoagulated = !!a.anticoagulated;
  const ckd           = !!a.ckd || !!a.kidney_disease;
  const liverDisease  = !!a.liver_disease;
  const asthma        = !!a.asthma;
  const ulcer         = !!a.peptic_ulcer_disease;
  const g6pd          = !!a.g6pd;
  const qtRisk        = !!a.qt_prolongation_history;

  const flaggedMedications: MedicationSafetyResult[] = [];
  const safeMedications: MedicationCandidate[]        = [];

  for (const med of input.candidateMedications) {
    const reasons: string[]          = [];
    const saferAlternatives: string[] = [];
    let severity: "info" | "warning" | "block" = "info";

    const name = norm(med.name);

    // ── Allergy block ───────────────────────────────────────────────────────
    if (
      allergies.some(
        (al) =>
          name.includes(al) ||
          (al.includes("penicillin") &&
            hasAny(name, ["amoxicillin", "augmentin", "penicillin", "ampicillin"]))
      )
    ) {
      severity = "block";
      reasons.push("Medication may conflict with recorded allergy");
      saferAlternatives.push("Use non-cross-reactive alternative");
    }

    // ── Pregnancy ────────────────────────────────────────────────────────────
    if (pregnant) {
      if (hasAny(name, ["doxycycline", "tetracycline"])) {
        severity = "block";
        reasons.push("Tetracyclines contraindicated in pregnancy");
        saferAlternatives.push("amoxicillin", "azithromycin");
      }
      if (hasAny(name, ["bactrim", "trimethoprim-sulfamethoxazole", "trimethoprim"])) {
        severity = "block";
        reasons.push("TMP-SMX avoid in pregnancy (esp. 1st trimester and near term)");
        saferAlternatives.push("cephalexin", "amoxicillin-clavulanate");
      }
      if (hasAny(name, ["ibuprofen", "naproxen", "ketorolac"])) {
        if (severity !== "block") severity = "warning";
        reasons.push("NSAIDs: avoid in 3rd trimester; caution in 1st/2nd");
        saferAlternatives.push("acetaminophen");
      }
      if (hasAny(name, ["ciprofloxacin", "levofloxacin", "fluoroquinolone"])) {
        if (severity !== "block") severity = "warning";
        reasons.push("Fluoroquinolones: avoid in pregnancy if possible");
        saferAlternatives.push("amoxicillin-clavulanate", "cephalexin");
      }
    }

    // ── Paediatric ───────────────────────────────────────────────────────────
    if (Number.isFinite(age) && age < 18) {
      if (hasAny(name, ["aspirin"])) {
        severity = "block";
        reasons.push("Aspirin in children — Reye's syndrome risk");
        saferAlternatives.push("acetaminophen", "ibuprofen (if ≥6 months)");
      }
      if (hasAny(name, ["ciprofloxacin", "levofloxacin", "fluoroquinolone"])) {
        if (severity !== "block") severity = "warning";
        reasons.push("Fluoroquinolones — cartilage risk; avoid in children unless no alternative");
        saferAlternatives.push("Use paediatric first-line option");
      }
    }

    // ── Renal ─────────────────────────────────────────────────────────────
    if (ckd) {
      if (hasAny(name, ["ibuprofen", "naproxen", "ketorolac"])) {
        severity = "block";
        reasons.push("NSAID may worsen kidney injury in CKD");
        saferAlternatives.push("acetaminophen");
      }
      if (hasAny(name, ["nitrofurantoin"])) {
        if (severity !== "block") severity = "warning";
        reasons.push("Nitrofurantoin ineffective and potentially toxic in reduced renal function");
        saferAlternatives.push("culture-guided alternative");
      }
      if (hasAny(name, ["metformin"])) {
        if (severity !== "block") severity = "warning";
        reasons.push("Metformin: caution / dose adjust in CKD; avoid if eGFR < 30");
        saferAlternatives.push("clinician-guided dose adjustment");
      }
    }

    // ── Liver ────────────────────────────────────────────────────────────
    if (liverDisease) {
      if (hasAny(name, ["acetaminophen", "tylenol", "paracetamol"])) {
        if (severity !== "block") severity = "warning";
        reasons.push("Acetaminophen: caution in liver disease; use lowest effective dose");
        saferAlternatives.push("reduced dose or clinician-guided alternative analgesic");
      }
      if (hasAny(name, ["statins", "atorvastatin", "simvastatin", "rosuvastatin"])) {
        if (severity !== "block") severity = "warning";
        reasons.push("Statins: monitor liver function in pre-existing liver disease");
        saferAlternatives.push("clinician review before initiating");
      }
    }

    // ── Anticoagulation / bleeding risk ──────────────────────────────────
    if (anticoagulated) {
      if (hasAny(name, ["ibuprofen", "naproxen", "ketorolac", "aspirin"])) {
        severity = "block";
        reasons.push("NSAID / antiplatelet increases major bleeding risk while anticoagulated");
        saferAlternatives.push("acetaminophen");
      }
    }

    // ── Peptic ulcer disease ────────────────────────────────────────────
    if (ulcer) {
      if (hasAny(name, ["ibuprofen", "naproxen", "ketorolac"])) {
        severity = "block";
        reasons.push("NSAID may worsen / re-open peptic ulcer");
        saferAlternatives.push("acetaminophen");
      }
    }

    // ── Asthma ────────────────────────────────────────────────────────────
    if (asthma) {
      if (hasAny(name, ["propranolol", "nadolol", "timolol", "atenolol"])) {
        if (severity !== "block") severity = "warning";
        reasons.push("Non-selective β-blocker may worsen bronchospasm in asthma");
        saferAlternatives.push("cardioselective β-blocker if needed; consult clinician");
      }
      if (hasAny(name, ["aspirin", "ibuprofen", "naproxen", "ketorolac"])) {
        if (severity !== "block") severity = "warning";
        reasons.push("NSAID / aspirin — aspirin-exacerbated respiratory disease risk");
        saferAlternatives.push("acetaminophen");
      }
    }

    // ── G6PD ─────────────────────────────────────────────────────────────
    if (g6pd) {
      if (hasAny(name, ["bactrim", "trimethoprim-sulfamethoxazole", "nitrofurantoin", "dapsone", "primaquine"])) {
        if (severity !== "block") severity = "warning";
        reasons.push("Possible haemolysis risk in G6PD deficiency");
        saferAlternatives.push("use safer alternative if possible");
      }
    }

    // ── QT prolongation ──────────────────────────────────────────────────
    if (qtRisk) {
      if (hasAny(name, ["azithromycin", "clarithromycin", "levofloxacin", "ciprofloxacin", "moxifloxacin", "ondansetron"])) {
        if (severity !== "block") severity = "warning";
        reasons.push("Medication may prolong QT interval — caution with known QT risk");
        saferAlternatives.push("non-QT-prolonging alternative");
      }
    }

    // ── Bucket ────────────────────────────────────────────────────────────
    if (reasons.length > 0) {
      flaggedMedications.push({
        medication: med.name,
        allowed: severity !== "block",
        severity,
        reasons,
        saferAlternatives,
      });
      if (severity !== "block") safeMedications.push(med);
    } else {
      safeMedications.push(med);
    }
  }

  return {
    safeMedications,
    flaggedMedications,
    blockedCount: flaggedMedications.filter((f) => f.severity === "block").length,
    warningCount: flaggedMedications.filter((f) => f.severity === "warning").length,
  };
}
