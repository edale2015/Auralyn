/**
 * fhirPatientContext.ts
 *
 * Unified interface for fetching a patient's clinical context from any
 * connected EHR. Returns a normalized PatientContext object regardless
 * of whether the source is eCW (FHIR R4), Athena (proprietary REST),
 * Epic (FHIR R4 + SMART), or mock data.
 *
 * PatientContext feeds into:
 *   - Intake pre-population (intakePrePopulationService.ts)
 *   - CDS sidebar enrichment (CaseReview PatientContextPanel)
 *   - Prior auth skeleton (priorAuthSkeleton.ts)
 */

export type EhrVendor = "ecw" | "athena" | "epic" | "mock";

export interface PatientDemographics {
  name?:      string;
  dob?:       string;
  sex?:       string;
  age?:       number;
  mrn?:       string;
  phone?:     string;
  insurance?: string;
}

export interface Medication {
  name:       string;
  dose?:      string;
  route?:     string;
  frequency?: string;
  status:     "active" | "inactive" | "unknown";
}

export interface Allergy {
  substance: string;
  reaction?: string;
  severity?: "mild" | "moderate" | "severe" | "unknown";
  status:    "active" | "inactive" | "unknown";
}

export interface Condition {
  display:   string;
  icdCode?:  string;
  status:    "active" | "resolved" | "unknown";
  onsetDate?: string;
}

export interface LabResult {
  name:   string;
  value:  string;
  unit?:  string;
  date:   string;
  flag?:  "high" | "low" | "critical" | "normal";
}

export interface PatientContext {
  vendor:       EhrVendor;
  patientId:    string;
  fetchedAt:    string;
  partial:      boolean;
  errors:       string[];
  demographics: PatientDemographics;
  medications:  Medication[];
  allergies:    Allergy[];
  conditions:   Condition[];
  labs:         LabResult[];
  intakePatch: {
    name?:       string;
    dob?:        string;
    age?:        number;
    sex?:        string;
    medications: string[];
    allergies:   string[];
    conditions:  string[];
  };
}

export interface FetchContextOptions {
  vendor:       EhrVendor;
  patientId:    string;
  accessToken?: string;
  practiceId?:  string;
  fhirBase?:    string;
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function normalizeMedications(raw: any[], vendor: EhrVendor): Medication[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (vendor === "ecw" || vendor === "epic") {
      const display =
        item.medicationCodeableConcept?.text ??
        item.medicationCodeableConcept?.coding?.[0]?.display ??
        item.medication?.display ??
        item.display ?? "Unknown medication";
      return {
        name:   display,
        dose:   item.dosageInstruction?.[0]?.text,
        status: item.status === "active" ? "active" :
                item.status === "stopped" || item.status === "completed" ? "inactive" : "unknown",
      };
    }
    if (vendor === "athena") {
      return {
        name:      item.medicationname ?? item.medication ?? "Unknown",
        dose:      item.dosageinfo ?? item.dose,
        frequency: item.frequency,
        status:    item.isstopped === "true" ? "inactive" : "active",
      };
    }
    return { name: String(item), status: "unknown" as const };
  });
}

function normalizeAllergies(raw: any[], vendor: EhrVendor): Allergy[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (vendor === "ecw" || vendor === "epic") {
      return {
        substance: item.code?.text ?? item.code?.coding?.[0]?.display ?? "Unknown",
        reaction:  item.reaction?.[0]?.manifestation?.[0]?.text,
        severity:  (item.reaction?.[0]?.severity as any) ?? "unknown",
        status:    item.clinicalStatus?.coding?.[0]?.code === "active" ? "active" : "unknown",
      };
    }
    if (vendor === "athena") {
      return {
        substance: item.allergenname ?? item.substance ?? "Unknown",
        reaction:  item.reactions,
        severity:  (item.severity?.toLowerCase() as any) ?? "unknown",
        status:    item.deactivated === "true" ? "inactive" : "active",
      };
    }
    return { substance: String(item), status: "unknown" as const };
  });
}

function normalizeConditions(raw: any[], vendor: EhrVendor): Condition[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (vendor === "ecw" || vendor === "epic") {
      return {
        display:   item.code?.text ?? item.code?.coding?.[0]?.display ?? "Unknown",
        icdCode:   item.code?.coding?.find((c: any) => c.system?.includes("icd"))?.code,
        status:    item.clinicalStatus?.coding?.[0]?.code === "active" ? "active" :
                   item.clinicalStatus?.coding?.[0]?.code === "resolved" ? "resolved" : "unknown",
        onsetDate: item.onsetDateTime ?? item.onsetPeriod?.start,
      };
    }
    if (vendor === "athena") {
      return {
        display:   item.codedescription ?? item.problem ?? "Unknown",
        icdCode:   item.icdcode,
        status:    item.status === "ACTIVE" ? "active" :
                   item.status === "RESOLVED" ? "resolved" : "unknown",
        onsetDate: item.onsetdate,
      };
    }
    return { display: String(item), status: "unknown" as const };
  });
}

function normalizeDemographics(raw: any, vendor: EhrVendor): PatientDemographics {
  if (!raw) return {};
  if (vendor === "ecw" || vendor === "epic") {
    const name    = raw.name?.[0];
    const fullName = name
      ? [name.given?.join(" "), name.family].filter(Boolean).join(" ")
      : undefined;
    const dobStr = raw.birthDate;
    const age    = dobStr
      ? Math.floor((Date.now() - new Date(dobStr).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : undefined;
    return {
      name:  fullName,
      dob:   dobStr,
      sex:   raw.gender,
      age,
      mrn:   raw.identifier?.find((id: any) => id.type?.coding?.[0]?.code === "MR")?.value,
      phone: raw.telecom?.find((t: any) => t.system === "phone")?.value,
    };
  }
  if (vendor === "athena") {
    const dob = raw.dob;
    const age = dob
      ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : undefined;
    return {
      name:      [raw.firstname, raw.lastname].filter(Boolean).join(" ") || undefined,
      dob:       raw.dob,
      sex:       raw.sex?.toLowerCase(),
      age,
      mrn:       raw.patientid?.toString(),
      phone:     raw.mobilephone ?? raw.homephone,
      insurance: raw.primaryinsuranceid,
    };
  }
  return {};
}

// ─── Athena fetcher ───────────────────────────────────────────────────────────

async function fetchFromAthena(options: FetchContextOptions): Promise<Partial<PatientContext>> {
  const base       = process.env.ATHENA_API_BASE;
  const practiceId = options.practiceId ?? process.env.ATHENA_PRACTICE_ID;
  const token      = options.accessToken ?? process.env.ATHENA_TOKEN;
  const errors: string[] = [];

  if (!base || !practiceId || !token) {
    return {
      partial: true,
      errors:  ["Athena credentials not configured (ATHENA_API_BASE, ATHENA_PRACTICE_ID, ATHENA_TOKEN)"],
    };
  }

  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const pid     = options.patientId;
  const root    = `${base}/${practiceId}`;

  const [patientRes, allergyRes, medRes, problemRes] = await Promise.allSettled([
    fetch(`${root}/patients/${pid}`,             { headers }),
    fetch(`${root}/patients/${pid}/allergies`,   { headers }),
    fetch(`${root}/patients/${pid}/medications`, { headers }),
    fetch(`${root}/patients/${pid}/problems`,    { headers }),
  ]);

  const getJson = async (res: PromiseSettledResult<Response>, label: string) => {
    if (res.status === "rejected") { errors.push(`${label}: ${res.reason}`); return null; }
    if (!res.value.ok)             { errors.push(`${label}: HTTP ${res.value.status}`); return null; }
    return res.value.json().catch(() => { errors.push(`${label}: JSON parse error`); return null; });
  };

  const patient   = await getJson(patientRes,  "patient");
  const allergies = await getJson(allergyRes,  "allergies");
  const meds      = await getJson(medRes,      "medications");
  const problems  = await getJson(problemRes,  "problems");

  return {
    demographics: normalizeDemographics(patient, "athena"),
    medications:  normalizeMedications(meds?.medications ?? [], "athena"),
    allergies:    normalizeAllergies(allergies?.allergies ?? [], "athena"),
    conditions:   normalizeConditions(problems?.problems ?? [], "athena"),
    errors,
  };
}

// ─── FHIR R4 fetcher (eCW + Epic) ────────────────────────────────────────────

async function fetchFromFhirR4(
  options: FetchContextOptions,
  vendor: "ecw" | "epic"
): Promise<Partial<PatientContext>> {
  const fhirBase = options.fhirBase ?? process.env.EHR_FHIR_BASE_URL ?? process.env.FHIR_BASE;
  const token    = options.accessToken;
  const errors: string[] = [];

  if (!fhirBase || !token) {
    return {
      partial: true,
      errors:  [`${vendor}: FHIR base URL or access token missing`],
    };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept:        "application/fhir+json",
  };
  const pid = options.patientId;

  const [patientRes, medRes, allergyRes, conditionRes, labRes] = await Promise.allSettled([
    fetch(`${fhirBase}/Patient/${pid}`,                                 { headers }),
    fetch(`${fhirBase}/MedicationRequest?patient=${pid}&status=active`, { headers }),
    fetch(`${fhirBase}/AllergyIntolerance?patient=${pid}`,              { headers }),
    fetch(`${fhirBase}/Condition?patient=${pid}&clinical-status=active`,{ headers }),
    fetch(`${fhirBase}/Observation?patient=${pid}&category=laboratory&_sort=-date&_count=20`, { headers }),
  ]);

  const getBundle = async (res: PromiseSettledResult<Response>, label: string) => {
    if (res.status === "rejected") { errors.push(`${label}: ${res.reason}`); return []; }
    if (!res.value.ok)             { errors.push(`${label}: HTTP ${res.value.status}`); return []; }
    const bundle = await res.value.json().catch(() => null);
    return bundle?.entry?.map((e: any) => e.resource) ?? [];
  };

  const patientRaw = await (async () => {
    if (patientRes.status === "rejected") { errors.push(`patient: ${patientRes.reason}`); return null; }
    if (!patientRes.value.ok)             { errors.push(`patient: HTTP ${patientRes.value.status}`); return null; }
    return patientRes.value.json().catch(() => null);
  })();

  const meds       = await getBundle(medRes,       "medications");
  const allergyRaw = await getBundle(allergyRes,   "allergies");
  const condRaw    = await getBundle(conditionRes, "conditions");
  const labRaw     = await getBundle(labRes,       "labs");

  const labs: LabResult[] = labRaw.map((obs: any) => ({
    name:  obs.code?.text ?? obs.code?.coding?.[0]?.display ?? "Unknown",
    value: obs.valueQuantity?.value?.toString() ?? obs.valueString ?? "—",
    unit:  obs.valueQuantity?.unit,
    date:  obs.effectiveDateTime ?? obs.issued ?? "",
    flag:  obs.interpretation?.[0]?.coding?.[0]?.code === "H"  ? "high" :
           obs.interpretation?.[0]?.coding?.[0]?.code === "L"  ? "low"  :
           obs.interpretation?.[0]?.coding?.[0]?.code === "HH" ? "critical" : "normal",
  }));

  return {
    demographics: normalizeDemographics(patientRaw, vendor),
    medications:  normalizeMedications(meds,        vendor),
    allergies:    normalizeAllergies(allergyRaw,    vendor),
    conditions:   normalizeConditions(condRaw,      vendor),
    labs,
    errors,
  };
}

// ─── Mock fetcher (dev / demo) ────────────────────────────────────────────────

function fetchMock(patientId: string): Partial<PatientContext> {
  return {
    demographics: {
      name:      "Test Patient",
      dob:       "1975-06-15",
      sex:       "female",
      age:       50,
      mrn:       patientId,
      phone:     "+15551234567",
      insurance: "BlueCross",
    },
    medications: [
      { name: "Lisinopril 10mg",    dose: "10mg",  frequency: "daily",        status: "active" },
      { name: "Metformin 500mg",    dose: "500mg", frequency: "twice daily",   status: "active" },
      { name: "Atorvastatin 20mg",  dose: "20mg",  frequency: "nightly",       status: "active" },
    ],
    allergies: [
      { substance: "Penicillin",   reaction: "rash",  severity: "moderate", status: "active" },
      { substance: "Sulfa drugs",  reaction: "hives", severity: "mild",     status: "active" },
    ],
    conditions: [
      { display: "Essential hypertension",       icdCode: "I10",   status: "active" },
      { display: "Type 2 diabetes mellitus",     icdCode: "E11.9", status: "active" },
      { display: "Hyperlipidemia",               icdCode: "E78.5", status: "active" },
    ],
    labs: [
      { name: "HbA1c", value: "7.8", unit: "%",              date: "2026-03-01", flag: "high" },
      { name: "eGFR",  value: "72",  unit: "mL/min/1.73m2",  date: "2026-03-01", flag: "normal" },
      { name: "LDL",   value: "128", unit: "mg/dL",          date: "2026-03-01", flag: "high" },
    ],
    errors: [],
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchPatientContext(
  options: FetchContextOptions
): Promise<PatientContext> {
  const { vendor, patientId } = options;
  let partial: Partial<PatientContext> = {};

  try {
    switch (vendor) {
      case "athena": partial = await fetchFromAthena(options);         break;
      case "ecw":    partial = await fetchFromFhirR4(options, "ecw");  break;
      case "epic":   partial = await fetchFromFhirR4(options, "epic"); break;
      case "mock":   partial = fetchMock(patientId);                   break;
      default:
        partial = { errors: [`Unknown vendor: ${vendor}`], partial: true };
    }
  } catch (err: any) {
    partial = { errors: [`Unexpected error: ${err.message}`], partial: true };
  }

  const demographics = partial.demographics ?? {};
  const medications  = partial.medications  ?? [];
  const allergies    = partial.allergies    ?? [];
  const conditions   = partial.conditions   ?? [];
  const labs         = partial.labs         ?? [];
  const errors       = partial.errors       ?? [];

  const intakePatch = {
    name:        demographics.name,
    dob:         demographics.dob,
    age:         demographics.age,
    sex:         demographics.sex,
    medications: medications
      .filter(m => m.status === "active")
      .map(m => [m.name, m.dose, m.frequency].filter(Boolean).join(" ")),
    allergies:   allergies
      .filter(a => a.status === "active")
      .map(a => a.substance),
    conditions:  conditions
      .filter(c => c.status === "active")
      .map(c => c.display),
  };

  return {
    vendor,
    patientId,
    fetchedAt:  new Date().toISOString(),
    partial:    errors.length > 0,
    errors,
    demographics,
    medications,
    allergies,
    conditions,
    labs,
    intakePatch,
  };
}
