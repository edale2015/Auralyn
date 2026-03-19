import { autoCodeDiagnosisCluster, type DiagnosisCluster, type AutoCodeResult } from "./diagnosisAutoCoder";
import { buildClaim, type ClaimData } from "./claimBuilder";
import { classifyRisk, type RiskClassification } from "../compliance/riskEngine";
import { MODEL } from "../compliance/modelVersionEngine";
import { MODEL_VERSION } from "../compliance/modelRegistry";
import { enforceRiskControls } from "../compliance/riskControl";
import { build837P, type X12_837P } from "./x12Mapper";

export interface EncounterBundleInput {
  patientId: string;
  patientName?: string;
  complaint: string;
  diagnosis: string;
  differentials?: string[];
  triage: string;
  confidence?: number;
  answers?: any;
  trace?: any;
  provider?: string;
  facility?: string;
}

export interface FHIREncounterResource {
  resourceType: "Encounter";
  status: "finished";
  class: { code: string; display: string };
  subject: { reference: string; display?: string };
  reasonCode: Array<{ coding: Array<{ system: string; code: string; display: string }>; text: string }>;
  diagnosis: Array<{ condition: { display: string }; rank: number }>;
  period: { start: string; end: string };
}

export interface ClinicalNote {
  hpi: string;
  assessment: string;
  plan: string;
  disposition: string;
  icdCodes: string;
  cptCode: string;
  generatedAt: string;
}

export interface EncounterBundle {
  bundleId: string;
  generatedAt: string;
  modelVersion: string;
  patient: {
    id: string;
    name?: string;
  };
  encounter: {
    complaint: string;
    diagnosis: string;
    triage: string;
    confidence?: number;
  };
  coding: AutoCodeResult;
  billing: {
    claim: ClaimData;
    x12Payload: X12_837P;
  };
  riskClassification: RiskClassification;
  riskControls: {
    blocked: boolean;
    requiresPhysicianReview: boolean;
    appliedControls: string[];
    reason?: string;
  };
  fhirEncounter: FHIREncounterResource;
  clinicalNote: ClinicalNote;
  auditTrail: {
    modelVersion: string;
    rulesVersion: string;
    scoringVersion: string;
    safetyVersion: string;
    trace: any;
    timestamp: string;
  };
}

let bundleCounter = 0;

export function buildEncounterBundle(input: EncounterBundleInput): EncounterBundle {
  bundleCounter++;
  const now = new Date().toISOString();
  const bundleId = `ENC-${Date.now()}-${bundleCounter.toString().padStart(4, "0")}`;

  const cluster: DiagnosisCluster = {
    primary: input.diagnosis,
    differentials: input.differentials,
    triage: input.triage,
    confidence: input.confidence,
  };
  const coding = autoCodeDiagnosisCluster(cluster);

  const claim = buildClaim(
    { diagnosis: input.diagnosis, triage: input.triage },
    { id: input.patientId, provider: input.provider, facility: input.facility }
  );

  const x12Payload = build837P({
    claimId: claim.claimId,
    patientName: input.patientName,
    provider: input.provider,
    icd10: coding.primary.icd10,
    cpt: coding.cpt.code,
    dateOfService: claim.dateOfService,
  });

  const risk = classifyRisk({
    triage: input.triage,
    diagnosis: input.diagnosis,
    confidence: input.confidence,
  });

  const riskResult = enforceRiskControls({
    triage: input.triage,
    diagnosis: input.diagnosis,
    confidence: input.confidence,
  });

  const encounterClass = input.triage === "ER" || input.triage === "emergency"
    ? { code: "EMER", display: "Emergency" }
    : input.triage === "urgent"
    ? { code: "AMB", display: "Ambulatory (Urgent)" }
    : { code: "AMB", display: "Ambulatory" };

  const fhirEncounter: FHIREncounterResource = {
    resourceType: "Encounter",
    status: "finished",
    class: encounterClass,
    subject: {
      reference: `Patient/${input.patientId}`,
      display: input.patientName,
    },
    reasonCode: [
      {
        coding: [{
          system: "http://hl7.org/fhir/sid/icd-10-cm",
          code: coding.primary.icd10,
          display: input.diagnosis,
        }],
        text: input.complaint,
      },
    ],
    diagnosis: [
      { condition: { display: input.diagnosis }, rank: 1 },
      ...(input.differentials || []).map((dx, i) => ({
        condition: { display: dx },
        rank: i + 2,
      })),
    ],
    period: {
      start: now,
      end: now,
    },
  };

  const clinicalNote: ClinicalNote = {
    hpi: `Chief Complaint: ${input.complaint}\nPatient presents with ${input.complaint}. Structured intake completed via clinical decision support system.${input.answers ? `\nKey responses: ${JSON.stringify(input.answers)}` : ""}`,
    assessment: `Primary Diagnosis: ${input.diagnosis} (ICD-10: ${coding.primary.icd10})\n${
      (input.differentials || []).length > 0
        ? `Differential Diagnoses:\n${input.differentials!.map((dx, i) => {
            const dxCode = coding.differentials[i];
            return `  ${i + 1}. ${dx} (ICD-10: ${dxCode?.icd10 || "R69"})`;
          }).join("\n")}`
        : "No additional differentials."
    }\nConfidence: ${input.confidence !== undefined ? `${(input.confidence * 100).toFixed(1)}%` : "N/A"}`,
    plan: `Disposition: ${input.triage}\n${
      risk.requiresPhysicianReview ? "** Requires physician review before action **\n" : ""
    }${risk.escalationRequired ? "** Escalation required **\n" : ""}`,
    disposition: input.triage,
    icdCodes: coding.allCodes.join(", "),
    cptCode: `${coding.cpt.code} — ${coding.cpt.description}`,
    generatedAt: now,
  };

  return {
    bundleId,
    generatedAt: now,
    modelVersion: `${MODEL.version}`,
    patient: { id: input.patientId, name: input.patientName },
    encounter: {
      complaint: input.complaint,
      diagnosis: input.diagnosis,
      triage: input.triage,
      confidence: input.confidence,
    },
    coding,
    billing: { claim, x12Payload },
    riskClassification: risk,
    riskControls: {
      blocked: riskResult.blocked,
      requiresPhysicianReview: riskResult.requiresPhysicianReview,
      appliedControls: riskResult.appliedControls,
      reason: riskResult.reason,
    },
    fhirEncounter,
    clinicalNote,
    auditTrail: {
      modelVersion: MODEL.version,
      rulesVersion: MODEL.rulesVersion,
      scoringVersion: MODEL.scoringVersion,
      safetyVersion: MODEL.safetyVersion,
      trace: input.trace || {},
      timestamp: now,
    },
  };
}
