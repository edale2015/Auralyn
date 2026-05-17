#!/bin/bash
# AURALYN — Synthea Integration Guide
# How to use the world's best synthetic patient dataset
# ============================================================

# ─── WHAT SYNTHEA IS ─────────────────────────────────────────
# Synthea is open-source synthetic patient generator from MITRE Corporation.
# Used by the US government, major health systems, and AI researchers worldwide.
# 1 million patient records available NOW — free, no privacy restrictions.
# Exports: FHIR R4, CSV, CCDA, OMOP.
# Covers: demographics, medications, conditions, encounters, vitals, labs.

# ─── OPTION A: DOWNLOAD PRE-BUILT DATA (fastest) ─────────────
# Go to: https://synthea.mitre.org/downloads
# Download FHIR R4 format (most useful for Auralyn)
# Available sizes: 1K, 10K, 100K patients

echo "Synthea download URLs:"
echo "  1K patients FHIR R4:   https://storage.googleapis.com/synthea-public/10k_fhir_r4_json.zip"
echo "  10K patients FHIR R4:  https://storage.googleapis.com/synthea-public/10k_fhir_r4_json.zip"
echo "  CSV format:            https://synthea.mitre.org/downloads"
echo ""
echo "Also on AWS Open Data (100K and 2.8M patients in OMOP format):"
echo "  s3://synthea-open-data/omop/"

# ─── OPTION B: GENERATE YOUR OWN (most flexible) ─────────────
# Install Java (required) then run Synthea to generate NYC-area
# urgent care patients matching your actual patient demographic

cat << 'GENERATE'
# Install Synthea
git clone https://github.com/synthetichealth/synthea.git
cd synthea

# Generate 10,000 NYC-area patients
./run_synthea.sh -p 10000 "New York" "New York City"

# The -p flag sets population size
# Output goes to output/fhir/ directory
# Each patient is a FHIR Bundle JSON file

# For urgent care focus, add these module flags:
./run_synthea.sh -p 10000 \
  --exporter.fhir.export=true \
  --exporter.csv.export=true \
  "New York" "New York City"
GENERATE

# ─── OPTION C: AWS OPEN DATA (largest, no download needed) ────
# 2.8 million patients in OMOP format on AWS S3
# Access via AWS CLI (free, just need AWS account):

cat << 'AWS_ACCESS'
# List available datasets
aws s3 ls s3://synthea-open-data/ --no-sign-request

# Download 100K patient sample
aws s3 cp s3://synthea-open-data/omop/100k/ ./synthea-data/ \
  --recursive --no-sign-request
AWS_ACCESS

# ─── MAPPING SYNTHEA TO AURALYN ──────────────────────────────
# Synthea doesn't generate urgent care chief complaints directly.
# The mapping script below extracts Synthea encounters and maps
# them to Auralyn complaint packs based on ICD-10 codes.

cat << 'MAPPING_SCRIPT' > /dev/stdout
// server/simulation/SyntheaMapper.ts
// Maps Synthea FHIR R4 encounters to Auralyn complaint packs

interface SyntheaEncounter {
  resourceType: "Bundle";
  entry: Array<{
    resource: {
      resourceType: string;
      [key: string]: any;
    };
  }>;
}

// ICD-10 → Auralyn complaint pack mapping
// Based on most common urgent care chief complaints
const ICD10_TO_COMPLAINT: Record<string, string> = {
  // Chest pain
  "R07.9": "chest_pain",   "R07.1": "chest_pain",   "I21":   "chest_pain",
  "I20":   "chest_pain",   "I26":   "chest_pain",   "I71":   "chest_pain",

  // Abdominal pain
  "R10.9": "abdominal_pain", "K37": "abdominal_pain",
  "K81.0": "abdominal_pain", "K57": "abdominal_pain",
  "K85":   "abdominal_pain", "N20": "abdominal_pain",

  // Headache
  "G43.9": "headache",     "G44.309": "headache",   "R51": "headache",

  // UTI / GU
  "N30.00": "gu_uti",      "N39.0": "gu_uti",       "N10": "gu_uti",
  "N73.9":  "gu_uti",

  // URI / Respiratory
  "J06.9": "uri",          "J02.9": "uri",           "J20.9": "uri",
  "J18.9": "uri",          "J45.9": "uri",

  // MSK
  "M54.5": "msk_back_pain", "M54.4": "msk_back_pain",
  "M25.5": "msk_joint_pain",

  // Dermatology
  "L30.9": "derm_rash",    "L03.9": "derm_rash",    "B02.9": "derm_rash",
};

export function mapSyntheaToAuralyn(bundle: SyntheaEncounter): {
  complaintId: string | null;
  patientProfile: any;
  conditions: string[];
  medications: string[];
  allergies: string[];
  vitals: any;
} {
  const resources = bundle.entry?.map(e => e.resource) || [];

  // Extract patient demographics
  const patient = resources.find(r => r.resourceType === "Patient");
  const age = patient?.birthDate
    ? Math.floor((Date.now() - new Date(patient.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : 0;

  // Extract conditions and map to complaint
  const conditions = resources
    .filter(r => r.resourceType === "Condition")
    .map(c => c.code?.coding?.[0]?.code || "");

  let complaintId: string | null = null;
  for (const icd of conditions) {
    const prefix = icd.substring(0, 5);
    if (ICD10_TO_COMPLAINT[icd]) { complaintId = ICD10_TO_COMPLAINT[icd]; break; }
    if (ICD10_TO_COMPLAINT[prefix]) { complaintId = ICD10_TO_COMPLAINT[prefix]; break; }
    // Try 3-char prefix
    if (ICD10_TO_COMPLAINT[icd.substring(0, 3)]) {
      complaintId = ICD10_TO_COMPLAINT[icd.substring(0, 3)]; break;
    }
  }

  // Extract medications
  const medications = resources
    .filter(r => r.resourceType === "MedicationRequest" && r.status === "active")
    .map(m => m.medicationCodeableConcept?.text ||
               m.medicationCodeableConcept?.coding?.[0]?.display || "Unknown");

  // Extract allergies
  const allergies = resources
    .filter(r => r.resourceType === "AllergyIntolerance")
    .map(a => a.code?.text || a.code?.coding?.[0]?.display || "Unknown");

  // Extract vitals
  const observations = resources.filter(r => r.resourceType === "Observation");
  const vitals: any = {};
  for (const obs of observations) {
    const code = obs.code?.coding?.[0]?.code;
    const value = obs.valueQuantity?.value;
    if (code === "8310-5") vitals.temp = value;        // Body temp
    if (code === "8867-4") vitals.heartRate = value;   // Heart rate
    if (code === "8480-6") vitals.bpSystolic = value;  // Systolic BP
    if (code === "2708-6") vitals.o2sat = value;       // O2 sat
  }

  return {
    complaintId,
    patientProfile: {
      age,
      sex: patient?.gender || "unknown",
      comorbidities: conditions,
      currentMedications: medications,
      allergies,
    },
    conditions,
    medications,
    allergies,
    vitals,
  };
}
MAPPING_SCRIPT

echo ""
echo "============================================================"
echo "SIMULATION STRATEGY SUMMARY"
echo "============================================================"
echo ""
echo "IMMEDIATE (today):"
echo "  npm run simulate:quick"
echo "  Runs 35 pre-built scenarios through Auralyn (5 packs × 7 scenarios)"
echo "  Uses GPT-4o to generate realistic patient dialogue transcripts"
echo "  Takes ~15-20 minutes, costs ~$2-3 in OpenAI API"
echo ""
echo "THIS WEEK:"
echo "  Download Synthea 10K patient dataset from synthea.mitre.org"
echo "  Run SyntheaMapper to extract urgent care encounters"
echo "  Map ICD-10 codes → Auralyn complaint packs"
echo "  Run those patients through Auralyn"
echo "  Target: 500-1000 mapped encounters"
echo ""
echo "ONGOING:"
echo "  npm run simulate:volume"
echo "  Runs 100× each scenario = ~3,500 encounters"
echo "  Adds demographic variation (elderly, pediatric, pregnant)"
echo "  Adds human factors variations (distressed, confused, non-English)"
echo "  Tests edge cases and atypical presentations"
echo ""
echo "YOUR CLINICAL SCENARIOS (highest value):"
echo "  Each dialogue you describe to me becomes a test case"
echo "  Currently have: URI, chest pain, GU, headache, abdominal = 35 scenarios"
echo "  Add 5 more per complaint = 60 total"
echo "  These are ground truth validated by a practicing urgent care physician"
echo "  No AI-generated dataset can replace this"
echo ""
echo "TARGET BEFORE CLINICAL USE:"
echo "  ✓ 100% safety case pass rate (non-negotiable)"
echo "  ✓ ≥90% overall pass rate"
echo "  ✓ ≥85% pass rate across all demographic subgroups"
echo "  ✓ Human factors detected in ≥95% of simulated distress/confusion cases"
echo "  ✓ Zero dangerous failures (safety case → treat_and_watch)"
