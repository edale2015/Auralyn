export interface CommunicationOutcome {
  patientId: string;
  complaint: string;
  visitCount: number;
  scriptVariant: string;
  tone: string;
  antibioticsRequested: boolean;
  antibioticsGiven: boolean;
  delayedRxOffered?: boolean;
  delayedRxAccepted?: boolean;
  returnVisitWithin7Days?: boolean;
  sessionId?: string;
  createdAt?: Date;
}

export interface AntibioticDemandEvent {
  patientId: string;
  complaint: string;
  demanded: boolean;
  delayedRxOffered: boolean;
  delayedRxUsed?: boolean;
  antibioticsGiven: boolean;
  returnVisit7d?: boolean;
  createdAt?: Date;
}

const _outcomes: CommunicationOutcome[] = [];
const _demandEvents: AntibioticDemandEvent[] = [];

export async function logCommunicationOutcome(
  data: Omit<CommunicationOutcome, "createdAt">
): Promise<{ ok: boolean }> {
  _outcomes.push({ ...data, createdAt: new Date() });
  return { ok: true };
}

export async function logAntibioticDemandEvent(
  data: Omit<AntibioticDemandEvent, "createdAt">
): Promise<{ ok: boolean }> {
  _demandEvents.push({ ...data, createdAt: new Date() });
  return { ok: true };
}

export function getCommunicationStats() {
  const total = _outcomes.length;
  const antibioticRequests = _outcomes.filter(o => o.antibioticsRequested).length;
  const avoidedAntibiotics = _outcomes.filter(o => o.antibioticsRequested && !o.antibioticsGiven).length;
  const returnVisits = _outcomes.filter(o => o.returnVisitWithin7Days).length;
  const variantBreakdown = _outcomes.reduce<Record<string, number>>((acc, o) => {
    acc[o.scriptVariant] = (acc[o.scriptVariant] ?? 0) + 1;
    return acc;
  }, {});
  const toneBreakdown = _outcomes.reduce<Record<string, number>>((acc, o) => {
    acc[o.tone] = (acc[o.tone] ?? 0) + 1;
    return acc;
  }, {});

  return {
    total,
    antibioticRequests,
    avoidedAntibiotics,
    returnVisits,
    variantBreakdown,
    toneBreakdown,
    avoidanceRate: total > 0 ? avoidedAntibiotics / total : 0,
  };
}

export function getAntibioticDemandStats() {
  const total = _demandEvents.length;
  const demands = _demandEvents.filter(e => e.demanded).length;
  const delayedOffered = _demandEvents.filter(e => e.delayedRxOffered).length;
  const delayedUsed = _demandEvents.filter(e => e.delayedRxUsed).length;
  const avoided = _demandEvents.filter(e => e.demanded && !e.antibioticsGiven).length;
  const returns = _demandEvents.filter(e => e.returnVisit7d).length;

  return {
    total,
    demands,
    demandRate: total > 0 ? demands / total : 0,
    delayedOffered,
    delayedUsed,
    avoided,
    returns,
    acceptanceRate: delayedOffered > 0 ? delayedUsed / delayedOffered : 0,
  };
}

export function resetOutcomes(): void {
  _outcomes.length = 0;
  _demandEvents.length = 0;
}
