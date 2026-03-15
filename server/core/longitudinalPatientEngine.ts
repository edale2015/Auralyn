export interface VisitRecord {
  visitId: string;
  date: string;
  complaint: string;
  symptoms: string[];
  diagnosis?: string;
  disposition?: string;
  severityScore?: number;
}

export type LongitudinalStatus =
  | 'first_visit'
  | 'stable'
  | 'improving'
  | 'persistent'
  | 'worsening'
  | 'new_complaint'
  | 'resolved_and_returning';

export interface LongitudinalResult {
  status: LongitudinalStatus;
  visitCount: number;
  daysFromLastVisit?: number;
  persistentSymptoms?: string[];
  newSymptoms?: string[];
  resolvedSymptoms?: string[];
  trendNotes: string[];
  escalationRecommended: boolean;
}

export function longitudinalPatientEngine(
  current: Omit<VisitRecord, 'visitId' | 'date'>,
  history: VisitRecord[]
): LongitudinalResult {
  if (!history || history.length === 0) {
    return {
      status: 'first_visit',
      visitCount: 1,
      trendNotes: ['No prior visit history available'],
      escalationRecommended: false,
    };
  }

  const sorted = [...history].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const last = sorted[0];
  const visitCount = history.length + 1;

  const daysFromLastVisit = Math.floor(
    (Date.now() - new Date(last.date).getTime()) / 86_400_000
  );

  const currentSymptoms = new Set(current.symptoms);
  const lastSymptoms = new Set(last.symptoms);

  const persistentSymptoms = current.symptoms.filter((s) => lastSymptoms.has(s));
  const newSymptoms = current.symptoms.filter((s) => !lastSymptoms.has(s));
  const resolvedSymptoms = last.symptoms.filter((s) => !currentSymptoms.has(s));

  const trendNotes: string[] = [];
  let status: LongitudinalStatus;
  let escalationRecommended = false;

  // ── Complaint comparison ──────────────────────────────────────────────────
  if (last.complaint !== current.complaint) {
    status = 'new_complaint';
    trendNotes.push(`Complaint changed: ${last.complaint} → ${current.complaint}`);
  }
  // ── Prior diagnosis resolved but patient returned ─────────────────────────
  else if (last.disposition === 'HOME_CARE' && daysFromLastVisit < 7) {
    status = 'resolved_and_returning';
    trendNotes.push(`Return visit within ${daysFromLastVisit} days — prior home-care disposition may have been insufficient`);
    escalationRecommended = true;
  }
  // ── Worsening ─────────────────────────────────────────────────────────────
  else if (
    newSymptoms.length >= 2 ||
    (current.severityScore !== undefined &&
      last.severityScore !== undefined &&
      current.severityScore > last.severityScore + 2)
  ) {
    status = 'worsening';
    trendNotes.push(`Clinical trajectory: worsening (${newSymptoms.length} new symptoms)`);
    escalationRecommended = true;
  }
  // ── Persistent same diagnosis ─────────────────────────────────────────────
  else if (last.diagnosis && last.diagnosis === current.diagnosis) {
    status = 'persistent';
    trendNotes.push(`Same diagnosis persisting: ${last.diagnosis} — reconsider initial treatment`);
    if (daysFromLastVisit < 14) escalationRecommended = true;
  }
  // ── Improving ─────────────────────────────────────────────────────────────
  else if (resolvedSymptoms.length > newSymptoms.length) {
    status = 'improving';
    trendNotes.push(`Improving: ${resolvedSymptoms.length} symptoms resolved, ${newSymptoms.length} new`);
  }
  // ── Stable ────────────────────────────────────────────────────────────────
  else {
    status = 'stable';
    trendNotes.push('Clinical status stable compared to prior visit');
  }

  if (visitCount >= 3 && persistentSymptoms.length > 0) {
    trendNotes.push(`Recurring pattern over ${visitCount} visits — workup for chronic etiology recommended`);
    escalationRecommended = true;
  }

  if (newSymptoms.length > 0) trendNotes.push(`New symptoms: ${newSymptoms.join(', ')}`);
  if (resolvedSymptoms.length > 0) trendNotes.push(`Resolved: ${resolvedSymptoms.join(', ')}`);

  return {
    status,
    visitCount,
    daysFromLastVisit,
    persistentSymptoms,
    newSymptoms,
    resolvedSymptoms,
    trendNotes,
    escalationRecommended,
  };
}
