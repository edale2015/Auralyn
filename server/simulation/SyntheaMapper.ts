/**
 * AURALYN — Synthea FHIR R4 → Auralyn Complaint Pack Mapper
 *
 * Maps Synthea FHIR R4 patient bundles to Auralyn complaint packs
 * based on ICD-10 codes found in the patient's conditions.
 *
 * Data sources:
 *   1K–10K records:  https://synthea.mitre.org/downloads
 *   100K+ records:   aws s3 ls s3://synthea-open-data/ --no-sign-request
 *
 * Usage:
 *   const fs = require("fs");
 *   const bundle = JSON.parse(fs.readFileSync("patient.json", "utf8"));
 *   const mapped = mapSyntheaToAuralyn(bundle);
 *   if (mapped.complaintId) {
 *     // Feed mapped.patientProfile into EncounterSimulationEngine
 *   }
 *
 * File: server/simulation/SyntheaMapper.ts
 */

export interface SyntheaBundle {
  resourceType: "Bundle";
  entry: Array<{
    resource: {
      resourceType: string;
      [key: string]: any;
    };
  }>;
}

export interface MappedSyntheaPatient {
  complaintId:    string | null;
  patientProfile: {
    age:                number;
    sex:                string;
    comorbidities:      string[];
    currentMedications: string[];
    allergies:          string[];
  };
  conditions:     string[];
  medications:    string[];
  allergies:      string[];
  vitals:         {
    temp?:        number;
    heartRate?:   number;
    bpSystolic?:  number;
    o2sat?:       number;
  };
}

// ICD-10 → Auralyn complaint pack mapping
// Based on most common urgent care chief complaints
const ICD10_TO_COMPLAINT: Record<string, string> = {
  "R07.9":  "chest_pain",
  "R07.1":  "chest_pain",
  "I21":    "chest_pain",
  "I20":    "chest_pain",
  "I26":    "chest_pain",
  "I71":    "chest_pain",

  "R10.9":  "abdominal_pain",
  "K37":    "abdominal_pain",
  "K81.0":  "abdominal_pain",
  "K57":    "abdominal_pain",
  "K85":    "abdominal_pain",
  "N20":    "abdominal_pain",

  "G43.9":  "headache",
  "G44.309":"headache",
  "R51":    "headache",

  "N30.00": "gu_uti",
  "N39.0":  "gu_uti",
  "N10":    "gu_uti",
  "N73.9":  "gu_uti",

  "J06.9":  "uri",
  "J02.9":  "uri",
  "J20.9":  "uri",
  "J18.9":  "uri",
  "J45.9":  "uri",

  "M54.5":  "msk_back_pain",
  "M54.4":  "msk_back_pain",
  "M25.5":  "msk_joint_pain",

  "L30.9":  "derm_rash",
  "L03.9":  "derm_rash",
  "B02.9":  "derm_rash",
};

/**
 * Map a Synthea FHIR R4 bundle to an Auralyn complaint pack and patient profile.
 * Returns null for complaintId if no supported ICD-10 is found.
 */
export function mapSyntheaToAuralyn(bundle: SyntheaBundle): MappedSyntheaPatient {
  const resources = bundle.entry?.map(e => e.resource) || [];

  // Extract patient demographics
  const patient  = resources.find(r => r.resourceType === "Patient");
  const age      = patient?.birthDate
    ? Math.floor((Date.now() - new Date(patient.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : 0;

  // Extract conditions and map to complaint pack
  const conditionCodes = resources
    .filter(r => r.resourceType === "Condition")
    .map(c => c.code?.coding?.[0]?.code as string || "");

  let complaintId: string | null = null;
  for (const icd of conditionCodes) {
    if (ICD10_TO_COMPLAINT[icd]) {
      complaintId = ICD10_TO_COMPLAINT[icd];
      break;
    }
    const five = icd.substring(0, 5);
    if (ICD10_TO_COMPLAINT[five]) {
      complaintId = ICD10_TO_COMPLAINT[five];
      break;
    }
    const three = icd.substring(0, 3);
    if (ICD10_TO_COMPLAINT[three]) {
      complaintId = ICD10_TO_COMPLAINT[three];
      break;
    }
  }

  // Extract medications
  const medications = resources
    .filter(r => r.resourceType === "MedicationRequest" && r.status === "active")
    .map((m: any) =>
      m.medicationCodeableConcept?.text ||
      m.medicationCodeableConcept?.coding?.[0]?.display ||
      "Unknown"
    );

  // Extract allergies
  const allergies = resources
    .filter(r => r.resourceType === "AllergyIntolerance")
    .map((a: any) =>
      a.code?.text ||
      a.code?.coding?.[0]?.display ||
      "Unknown"
    );

  // Extract key vitals from Observations (LOINC codes)
  const observations = resources.filter(r => r.resourceType === "Observation");
  const vitals: MappedSyntheaPatient["vitals"] = {};
  for (const obs of observations) {
    const code  = obs.code?.coding?.[0]?.code;
    const value = obs.valueQuantity?.value;
    if (code === "8310-5") vitals.temp       = value;
    if (code === "8867-4") vitals.heartRate  = value;
    if (code === "8480-6") vitals.bpSystolic = value;
    if (code === "2708-6") vitals.o2sat      = value;
  }

  return {
    complaintId,
    patientProfile: {
      age,
      sex:                patient?.gender || "unknown",
      comorbidities:      conditionCodes,
      currentMedications: medications,
      allergies,
    },
    conditions:  conditionCodes,
    medications,
    allergies,
    vitals,
  };
}

/**
 * Filter an array of mapped Synthea patients to those with a supported complaint.
 */
export function filterMappedPatients(
  patients: MappedSyntheaPatient[],
  complaintIds?: string[]
): MappedSyntheaPatient[] {
  return patients.filter(p => {
    if (!p.complaintId) return false;
    if (complaintIds && complaintIds.length > 0) {
      return complaintIds.includes(p.complaintId);
    }
    return true;
  });
}
