export function coerceBool(v: any): boolean | null {
  if (v === true || v === "true" || v === "yes" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === "no" || v === 0 || v === "0") return false;
  return null;
}

export function effectiveExamOrPatient(
  answers: Record<string, any>,
  examKey: string,
  patientKey: string
): boolean | null {
  const ex = coerceBool(answers[examKey]);
  if (ex !== null) return ex;
  const pt = coerceBool(answers[patientKey]);
  if (pt !== null) return pt;
  return null;
}

export function applyExamOverrides(answers: Record<string, any>): { applied: boolean; overrides: string[] } {
  const overrides: string[] = [];

  const exudate = effectiveExamOrPatient(answers, "EXAM_TONSILLAR_EXUDATE", "Q_TONSILLAR_EXUDATE");
  const tenderNodes = effectiveExamOrPatient(answers, "EXAM_TENDER_ANT_CERV_NODES", "Q_TENDER_ANT_CERV_NODES");

  answers.__EXUDATE_EFFECTIVE = exudate;
  answers.__TENDER_NODES_EFFECTIVE = tenderNodes;

  if (answers.EXAM_TONSILLAR_EXUDATE != null) {
    overrides.push("EXAM_TONSILLAR_EXUDATE");
    answers.Q_TONSILLAR_EXUDATE = exudate ? "yes" : "no";
  }
  if (answers.EXAM_TENDER_ANT_CERV_NODES != null) {
    overrides.push("EXAM_TENDER_ANT_CERV_NODES");
    answers.Q_TENDER_ANT_CERV_NODES = tenderNodes ? "yes" : "no";
  }

  return { applied: overrides.length > 0, overrides };
}
