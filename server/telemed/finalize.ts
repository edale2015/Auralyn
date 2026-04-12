export interface FinalVisitOutput {
  diagnosis:    string;
  disposition:  string;
  medications:  string[];
  instructions: string[];
  follow_up:    string;
  audit_trace:  unknown[];
  sessionId?:   string;
  generatedAt:  string;
}

export function finalizeVisit(result: {
  session?:      { id?: string };
  finalState?:   Record<string, unknown>;
  trace?:        unknown[];
  diagnosis?:    string;
  disposition?:  string;
  medications?:  string[];
  instructions?: string[];
  follow_up?:    string;
}): FinalVisitOutput {
  const state       = result.finalState ?? {};
  const dispositionResult = (state.dispositionResult as any) ?? {};
  const clinicalScore     = (state.clinicalScore    as any) ?? {};

  const disposition = result.disposition
    ?? dispositionResult.finalDisposition
    ?? (state.finalDisposition as string)
    ?? "follow_up_primary_care";

  const decision = clinicalScore.finalDecision ?? "NO_ANTIBIOTIC";

  const medications: string[] = result.medications ?? (
    decision === "ANTIBIOTIC" ? ["amoxicillin 500mg TID x 10 days"] : []
  );

  const instructions: string[] = result.instructions ?? [
    "Rest and adequate hydration.",
    "Paracetamol or ibuprofen for pain and fever.",
    "Return if symptoms worsen or new red flags develop.",
    ...(decision === "ANTIBIOTIC" ? ["Complete the full antibiotic course."] : []),
  ];

  const follow_up = result.follow_up ?? (
    disposition === "home_with_rx"
      ? "Follow up in 48-72 hours if no improvement."
      : disposition === "er_now"
        ? "Proceed to ER immediately."
        : "Follow up with primary care within 3-5 days if symptoms persist."
  );

  return {
    diagnosis:    result.diagnosis ?? (clinicalScore.topDiagnosis as string) ?? "pharyngitis",
    disposition,
    medications,
    instructions,
    follow_up,
    audit_trace:  result.trace ?? [],
    sessionId:    result.session?.id,
    generatedAt:  new Date().toISOString(),
  };
}
