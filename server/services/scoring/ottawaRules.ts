/**
 * Ottawa Ankle Rules — Determines if ankle X-rays are needed after ankle injury.
 * Ottawa Knee Rule — Determines if knee X-rays are needed after knee injury.
 * Reference: Stiell et al., JAMA 1994; JAMA 1996.
 * Sensitivity for fracture: ~97–99%. Used to safely rule OUT fracture (high sensitivity, reduces unnecessary X-rays).
 */

export interface OttawaAnkleInput {
  bonyTendernessPosteriorTipOrEdgeLateralMalleolus: boolean;
  bonyTendernessPosteriorTipOrEdgeMedialMalleolus: boolean;
  bonyTendernessBaseOf5thMetatarsal: boolean;
  bonyTendernessNavicular: boolean;
  inabilityToBearWeight4Steps: boolean;
  ageUnder18OrOver55: boolean;
}

export interface OttawaAnkleResult {
  ankleXrayIndicated: boolean;
  footXrayIndicated: boolean;
  interpretation: string;
  ankleFindings: string[];
  footFindings: string[];
}

export function computeOttawaAnkleRule(input: OttawaAnkleInput): OttawaAnkleResult {
  const ankleFindings: string[] = [];
  const footFindings: string[] = [];

  if (input.bonyTendernessPosteriorTipOrEdgeLateralMalleolus)
    ankleFindings.push('Bony tenderness — posterior tip/edge of lateral malleolus');
  if (input.bonyTendernessPosteriorTipOrEdgeMedialMalleolus)
    ankleFindings.push('Bony tenderness — posterior tip/edge of medial malleolus');
  if (input.inabilityToBearWeight4Steps)
    ankleFindings.push('Unable to bear weight ×4 steps');

  if (input.bonyTendernessBaseOf5thMetatarsal)
    footFindings.push('Bony tenderness — base of 5th metatarsal');
  if (input.bonyTendernessNavicular)
    footFindings.push('Bony tenderness — navicular');
  if (input.inabilityToBearWeight4Steps)
    footFindings.push('Unable to bear weight ×4 steps');

  const ankleXrayIndicated = ankleFindings.length > 0;
  const footXrayIndicated = footFindings.length > 0;

  const parts: string[] = [];
  if (ankleXrayIndicated) parts.push('Ankle X-ray indicated');
  else parts.push('Ankle X-ray NOT required (Ottawa negative)');
  if (footXrayIndicated) parts.push('Foot X-ray indicated');
  else parts.push('Foot X-ray NOT required (Ottawa negative)');

  return { ankleXrayIndicated, footXrayIndicated, interpretation: parts.join('. ') + '.', ankleFindings, footFindings };
}

export interface OttawaKneeInput {
  age55OrOlder: boolean;
  isolatedPatellaTenderness: boolean;
  tendernessFibularHead: boolean;
  inabilityToFlexTo90Degrees: boolean;
  inabilityToBearWeight4Steps: boolean;
}

export interface OttawaKneeResult {
  kneeXrayIndicated: boolean;
  interpretation: string;
  positiveFindings: string[];
}

export function computeOttawaKneeRule(input: OttawaKneeInput): OttawaKneeResult {
  const positiveFindings: string[] = [];

  if (input.age55OrOlder)              positiveFindings.push('Age ≥55');
  if (input.isolatedPatellaTenderness) positiveFindings.push('Isolated patella tenderness (no bony tenderness elsewhere)');
  if (input.tendernessFibularHead)     positiveFindings.push('Tenderness at fibular head');
  if (input.inabilityToFlexTo90Degrees) positiveFindings.push('Unable to flex to 90°');
  if (input.inabilityToBearWeight4Steps) positiveFindings.push('Unable to bear weight ×4 steps');

  const kneeXrayIndicated = positiveFindings.length > 0;

  const interpretation = kneeXrayIndicated
    ? `Knee X-ray indicated — ${positiveFindings.length} Ottawa criterion/criteria met.`
    : 'Knee X-ray NOT required — Ottawa Knee Rule negative. Fracture very unlikely.';

  return { kneeXrayIndicated, interpretation, positiveFindings };
}
