import type { EhrPatientContext } from "./ehr/types";

export interface ConsistencyReport {
  issues: string[];
  ok: boolean;
  checkedFields: string[];
}

export function checkConsistencyMulti(
  epic?: Partial<EhrPatientContext> | null,
  ecw?: Partial<EhrPatientContext> | null,
  athena?: Partial<EhrPatientContext> | null
): ConsistencyReport {
  const issues: string[] = [];
  const checkedFields: string[] = [];

  const epicAllergies  = JSON.stringify((epic?.allergies  || []).sort());
  const ecwAllergies   = JSON.stringify((ecw?.allergies   || []).sort());
  const athenaAllergies = JSON.stringify((athena?.allergies || []).sort());

  checkedFields.push("allergies");
  if (epicAllergies !== ecwAllergies)    issues.push("Epic vs ECW allergy mismatch");
  if (athenaAllergies !== ecwAllergies)  issues.push("Athena vs ECW allergy mismatch");
  if (epicAllergies !== athenaAllergies) issues.push("Epic vs Athena allergy mismatch");

  const epicMeds  = JSON.stringify((epic?.medications  || []).sort());
  const ecwMeds   = JSON.stringify((ecw?.medications   || []).sort());
  const athenaMeds = JSON.stringify((athena?.medications || []).sort());

  checkedFields.push("medications");
  if (epicMeds !== ecwMeds)    issues.push("Epic vs ECW medication mismatch");
  if (athenaMeds !== ecwMeds)  issues.push("Athena vs ECW medication mismatch");

  if (epic?.dob && ecw?.dob && epic.dob !== ecw.dob) {
    checkedFields.push("dob");
    issues.push(`DOB mismatch: Epic=${epic.dob} ECW=${ecw.dob}`);
  }

  return { issues, ok: issues.length === 0, checkedFields };
}

export function checkConsistencyDual(
  a: Partial<EhrPatientContext> | null | undefined,
  b: Partial<EhrPatientContext> | null | undefined,
  labelA = "A",
  labelB = "B"
): string[] {
  const issues: string[] = [];
  const aAllergies = JSON.stringify((a?.allergies || []).sort());
  const bAllergies = JSON.stringify((b?.allergies || []).sort());
  if (aAllergies !== bAllergies) issues.push(`${labelA} vs ${labelB} allergy mismatch`);

  const aMeds = JSON.stringify((a?.medications || []).sort());
  const bMeds = JSON.stringify((b?.medications || []).sort());
  if (aMeds !== bMeds) issues.push(`${labelA} vs ${labelB} medication mismatch`);

  return issues.length ? issues : ["OK"];
}
