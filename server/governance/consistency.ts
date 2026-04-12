export interface ConsistencyInput {
  diagnosis:   string;
  medications: string[];
  disposition: string;
  centorScore?: number;
  probability?: number;
}

export interface ConsistencyResult {
  consistent:         boolean;
  corrected:          boolean;
  medications:        string[];
  disposition:        string;
  violations:         string[];
  corrections:        string[];
}

const VIRAL_DIAGNOSES = new Set([
  "viral_uri",
  "viral_pharyngitis",
  "viral_rhinitis",
  "common_cold",
  "influenza",
  "viral_bronchitis",
  "viral_tonsillitis",
]);

const ANTIBIOTIC_MEDICATIONS = new Set([
  "antibiotic",
  "amoxicillin",
  "azithromycin",
  "penicillin",
  "cephalexin",
  "augmentin",
  "clindamycin",
  "doxycycline",
  "zithromax",
  "zpack",
  "z-pack",
]);

export function enforceConsistency(input: ConsistencyInput): ConsistencyResult {
  const violations: string[]   = [];
  const corrections: string[]  = [];
  let medications  = [...input.medications];
  let disposition  = input.disposition;
  let corrected    = false;

  const diagLower = input.diagnosis.toLowerCase();
  const isViral   = VIRAL_DIAGNOSES.has(diagLower);

  if (isViral) {
    const antibioticsPresent = medications.filter((m) =>
      ANTIBIOTIC_MEDICATIONS.has(m.toLowerCase().split(" ")[0])
    );

    if (antibioticsPresent.length > 0) {
      violations.push(
        `Antibiotic(s) prescribed for viral diagnosis '${input.diagnosis}': ${antibioticsPresent.join(", ")}`
      );
      medications = medications.filter(
        (m) => !ANTIBIOTIC_MEDICATIONS.has(m.toLowerCase().split(" ")[0])
      );
      corrections.push("Removed antibiotic(s) — not indicated for viral illness");
      corrected = true;
    }
  }

  if (
    (input.centorScore ?? 0) >= 4 &&
    input.diagnosis.toLowerCase().includes("viral") &&
    !medications.some((m) => ANTIBIOTIC_MEDICATIONS.has(m.toLowerCase().split(" ")[0]))
  ) {
    violations.push(
      `Centor ≥4 with viral diagnosis '${input.diagnosis}' — potential under-treatment`
    );
  }

  if (disposition === "er_now" && medications.includes("discharge_home")) {
    violations.push("Contradiction: er_now disposition with home discharge instruction");
    corrections.push("Removed conflicting discharge_home instruction");
    medications = medications.filter((m) => m !== "discharge_home");
    corrected = true;
  }

  return {
    consistent:  violations.length === 0,
    corrected,
    medications,
    disposition,
    violations,
    corrections,
  };
}
