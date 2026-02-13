import { fhirGet } from "../integrations/ehr/fhirClient";

export interface PrefillResult {
  meds: string[];
  allergies: string[];
  problems: string[];
  vitalsSummary?: string;
  derivedFlags: {
    onAnticoagulant: boolean;
    hasAsthmaCOPD: boolean;
    immunosuppressed: boolean;
    pregnant: boolean;
    ckd: boolean;
    hepatic: boolean;
  };
  provenance: Array<{
    resourceId: string;
    resourceType: string;
    lastUpdated?: string;
  }>;
}

const ANTICOAGULANTS = [
  "warfarin", "coumadin", "heparin", "enoxaparin", "lovenox",
  "rivaroxaban", "xarelto", "apixaban", "eliquis", "dabigatran", "pradaxa",
  "edoxaban", "savaysa", "fondaparinux", "arixtra",
];

const ASTHMA_COPD_TERMS = [
  "asthma", "copd", "chronic obstructive", "reactive airway",
  "bronchospasm", "emphysema", "chronic bronchitis",
];

const IMMUNOSUPPRESSANTS = [
  "prednisone", "methotrexate", "azathioprine", "cyclosporine",
  "tacrolimus", "mycophenolate", "rituximab", "infliximab",
  "adalimumab", "etanercept", "biologics",
];

const CKD_TERMS = ["chronic kidney", "ckd", "renal failure", "dialysis", "esrd"];
const HEPATIC_TERMS = ["cirrhosis", "liver failure", "hepatic", "liver disease"];

function matchesAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some(t => lower.includes(t));
}

function extractProvenance(resource: any): { resourceId: string; resourceType: string; lastUpdated?: string } {
  return {
    resourceId: resource?.id ?? "unknown",
    resourceType: resource?.resourceType ?? "unknown",
    lastUpdated: resource?.meta?.lastUpdated,
  };
}

export async function fetchFhirPrefill(
  fhirBaseUrl: string,
  accessToken: string,
  patientId: string
): Promise<PrefillResult> {
  const result: PrefillResult = {
    meds: [],
    allergies: [],
    problems: [],
    derivedFlags: {
      onAnticoagulant: false,
      hasAsthmaCOPD: false,
      immunosuppressed: false,
      pregnant: false,
      ckd: false,
      hepatic: false,
    },
    provenance: [],
  };

  try {
    const medBundle = await fhirGet(
      `${fhirBaseUrl}/MedicationRequest?patient=${patientId}&status=active`,
      accessToken
    );
    if (medBundle?.entry) {
      for (const e of medBundle.entry) {
        const med = e.resource;
        const name = med?.medicationCodeableConcept?.text
          ?? med?.medicationCodeableConcept?.coding?.[0]?.display
          ?? "Unknown medication";
        result.meds.push(name);
        result.provenance.push(extractProvenance(med));

        if (matchesAny(name, ANTICOAGULANTS)) result.derivedFlags.onAnticoagulant = true;
        if (matchesAny(name, IMMUNOSUPPRESSANTS)) result.derivedFlags.immunosuppressed = true;
      }
    }
  } catch (err: any) {
    console.warn(`[FhirPrefill] MedicationRequest fetch failed: ${err.message}`);
  }

  try {
    const allergyBundle = await fhirGet(
      `${fhirBaseUrl}/AllergyIntolerance?patient=${patientId}&clinical-status=active`,
      accessToken
    );
    if (allergyBundle?.entry) {
      for (const e of allergyBundle.entry) {
        const allergy = e.resource;
        const name = allergy?.code?.text
          ?? allergy?.code?.coding?.[0]?.display
          ?? "Unknown allergy";
        result.allergies.push(name);
        result.provenance.push(extractProvenance(allergy));
      }
    }
  } catch (err: any) {
    console.warn(`[FhirPrefill] AllergyIntolerance fetch failed: ${err.message}`);
  }

  try {
    const condBundle = await fhirGet(
      `${fhirBaseUrl}/Condition?patient=${patientId}&clinical-status=active`,
      accessToken
    );
    if (condBundle?.entry) {
      for (const e of condBundle.entry) {
        const cond = e.resource;
        const name = cond?.code?.text
          ?? cond?.code?.coding?.[0]?.display
          ?? "Unknown condition";
        result.problems.push(name);
        result.provenance.push(extractProvenance(cond));

        if (matchesAny(name, ASTHMA_COPD_TERMS)) result.derivedFlags.hasAsthmaCOPD = true;
        if (matchesAny(name, CKD_TERMS)) result.derivedFlags.ckd = true;
        if (matchesAny(name, HEPATIC_TERMS)) result.derivedFlags.hepatic = true;
      }
    }
  } catch (err: any) {
    console.warn(`[FhirPrefill] Condition fetch failed: ${err.message}`);
  }

  try {
    const obsBundle = await fhirGet(
      `${fhirBaseUrl}/Observation?patient=${patientId}&category=vital-signs&_sort=-date&_count=5`,
      accessToken
    );
    if (obsBundle?.entry) {
      const vitals: string[] = [];
      for (const e of obsBundle.entry) {
        const obs = e.resource;
        const code = obs?.code?.text ?? obs?.code?.coding?.[0]?.display ?? "";
        const value = obs?.valueQuantity?.value ?? obs?.valueString ?? "";
        const unit = obs?.valueQuantity?.unit ?? "";
        if (code && value) vitals.push(`${code}: ${value} ${unit}`.trim());
        result.provenance.push(extractProvenance(obs));
      }
      if (vitals.length) result.vitalsSummary = vitals.join("; ");
    }
  } catch (err: any) {
    console.warn(`[FhirPrefill] Observation fetch failed: ${err.message}`);
  }

  try {
    const pregBundle = await fhirGet(
      `${fhirBaseUrl}/Condition?patient=${patientId}&code=77386006`,
      accessToken
    );
    if (pregBundle?.entry?.length > 0) {
      result.derivedFlags.pregnant = true;
    }
  } catch {
    // pregnancy detection is best-effort
  }

  return result;
}

export function buildPrefillFromManualEntry(
  allergies: string[],
  meds: string[],
  pmh: string[],
  pregnant: boolean
): PrefillResult {
  const result: PrefillResult = {
    meds,
    allergies,
    problems: pmh,
    derivedFlags: {
      onAnticoagulant: meds.some(m => matchesAny(m, ANTICOAGULANTS)),
      hasAsthmaCOPD: pmh.some(p => matchesAny(p, ASTHMA_COPD_TERMS)),
      immunosuppressed: meds.some(m => matchesAny(m, IMMUNOSUPPRESSANTS)),
      pregnant,
      ckd: pmh.some(p => matchesAny(p, CKD_TERMS)),
      hepatic: pmh.some(p => matchesAny(p, HEPATIC_TERMS)),
    },
    provenance: [],
  };
  return result;
}
