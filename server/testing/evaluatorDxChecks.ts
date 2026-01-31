import { Scenario, SystemOutput, Score } from "./types";
import { loadAllowedDiagnosisIdsBySystem } from "./dx/dxLoader";

function norm(x: any) { return String(x ?? "").trim(); }

function extractDxIds(out: SystemOutput): string[] {
  const proposal = out?.raw?.proposal;
  const arr = proposal?.diagnoses || proposal?.dxIds || proposal?.dx_ids;
  if (!arr || !Array.isArray(arr)) return [];
  return arr.map((x: any) => norm(x)).filter(Boolean);
}

export async function applyDxSanityChecks(s: Scenario, out: SystemOutput, score: Score): Promise<Score> {
  const dx = extractDxIds(out);
  if (!dx.length) return score;

  const allowed = await loadAllowedDiagnosisIdsBySystem(s.system);
  const issues = [...score.issues];
  let severity = score.severity;

  const unknown = dx.filter(id => !allowed.has(id));
  if (unknown.length) {
    severity += 3;
    issues.push({ code: "DX_UNKNOWN", message: `Proposal contains dx not in CLINICAL_DIAGNOSES for system=${s.system}: ${unknown.join(", ")}` });
  }

  return { ...score, pass: severity === 0, severity, issues };
}
