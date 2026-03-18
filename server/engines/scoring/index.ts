import { calculatePERC, type PERCInput, type PERCResult } from "./perc";
import { calculateCHA2DS2VASC, type CHA2DS2VASCInput, type CHA2DS2VASCResult } from "./cha2ds2vasc";
import { calculateOttawaAnkle, type OttawaAnkleInput, type OttawaAnkleResult } from "./ottawaAnkle";
import { calculatePedsFever, type PedsFeverInput, type PedsFeverResult } from "./pedsFever";
import { calculateAlvarado, type AlvaradoInput, type AlvaradoResult } from "./alvarado";
import { calculateTIMI, type TIMIInput, type TIMIResult } from "./timi";
import { calculateGCS, type GCSInput, type GCSResult } from "./gcs";
import { calculateNEWS2, type NEWS2Input, type NEWS2Result } from "./news2";
import { calculateCIWA, type CIWAInput, type CIWAResult } from "./ciwa";
import { calculateCURB65, type CURB65Input, type CURB65Result } from "./curb65";

export type ExtendedScoringSystemId =
  | "PERC" | "CHA2DS2_VASC" | "OTTAWA_ANKLE" | "PEDS_FEVER"
  | "ALVARADO" | "TIMI" | "GCS" | "NEWS2" | "CIWA" | "CURB65";

export interface ExtendedScoringMeta {
  id: ExtendedScoringSystemId;
  name: string;
  description: string;
  category: string;
}

const EXTENDED_REGISTRY: Record<ExtendedScoringSystemId, ExtendedScoringMeta> = {
  PERC: { id: "PERC", name: "PERC Rule", description: "Pulmonary Embolism Rule-out Criteria", category: "pulmonary" },
  CHA2DS2_VASC: { id: "CHA2DS2_VASC", name: "CHA₂DS₂-VASc", description: "Stroke risk in atrial fibrillation", category: "cardiology" },
  OTTAWA_ANKLE: { id: "OTTAWA_ANKLE", name: "Ottawa Ankle Rules", description: "Need for ankle/foot X-ray after injury", category: "orthopedic" },
  PEDS_FEVER: { id: "PEDS_FEVER", name: "Pediatric Fever Risk", description: "Risk stratification for febrile pediatric patients", category: "pediatrics" },
  ALVARADO: { id: "ALVARADO", name: "Alvarado Score", description: "Probability of appendicitis (MANTRELS)", category: "surgical" },
  TIMI: { id: "TIMI", name: "TIMI Score", description: "Risk stratification for NSTEMI/Unstable Angina", category: "cardiology" },
  GCS: { id: "GCS", name: "Glasgow Coma Scale", description: "Level of consciousness after brain injury", category: "neurology" },
  NEWS2: { id: "NEWS2", name: "NEWS2", description: "National Early Warning Score 2 — deterioration risk", category: "general" },
  CIWA: { id: "CIWA", name: "CIWA-Ar", description: "Clinical Institute Withdrawal Assessment for Alcohol", category: "psychiatry" },
  CURB65: { id: "CURB65", name: "CURB-65", description: "Community-acquired pneumonia severity", category: "pulmonary" },
};

export function listExtendedScoringSystems(): ExtendedScoringMeta[] {
  return Object.values(EXTENDED_REGISTRY);
}

export function computeExtendedScore(id: ExtendedScoringSystemId, input: any): any {
  switch (id) {
    case "PERC": return calculatePERC(input as PERCInput);
    case "CHA2DS2_VASC": return calculateCHA2DS2VASC(input as CHA2DS2VASCInput);
    case "OTTAWA_ANKLE": return calculateOttawaAnkle(input as OttawaAnkleInput);
    case "PEDS_FEVER": return calculatePedsFever(input as PedsFeverInput);
    case "ALVARADO": return calculateAlvarado(input as AlvaradoInput);
    case "TIMI": return calculateTIMI(input as TIMIInput);
    case "GCS": return calculateGCS(input as GCSInput);
    case "NEWS2": return calculateNEWS2(input as NEWS2Input);
    case "CIWA": return calculateCIWA(input as CIWAInput);
    case "CURB65": return calculateCURB65(input as CURB65Input);
    default: throw new Error(`Unknown extended scoring system: ${id}`);
  }
}

export {
  calculatePERC, calculateCHA2DS2VASC, calculateOttawaAnkle,
  calculatePedsFever, calculateAlvarado, calculateTIMI,
  calculateGCS, calculateNEWS2, calculateCIWA, calculateCURB65,
};
