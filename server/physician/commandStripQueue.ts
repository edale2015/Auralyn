import { getSessions } from "../patient/sessionStorePg";
import { assignTier, TierAssignment, PhysicianTier } from "./triageRouter";
import { pool } from "../db/pool";

export interface CommandStripCase {
  id: string;
  patientName: string;
  age: number | null;
  complaintKey: string;
  disposition: string;
  confidence: number;
  debateOutcome: string;
  debateRationale: string;
  diagnoses: string[];
  hasPopulationFlags: boolean;
  hasRedFlags: boolean;
  populationFlagLabels: string[];
  redFlagLabels: string[];
  erNowMessage: string | null;
  status: string;
  queuedAt: string;
  tier: PhysicianTier;
  tierLabel: string;
  tierSlaMinutes: number;
  tierRationale: string;
  batchEligible: boolean;
  channel: string;
  priorOverrideExists: boolean;
}

export interface CommandStripPage {
  cases: CommandStripCase[];
  total: number;
  tierCounts: Record<PhysicianTier, number>;
  batchEligibleCount: number;
}

async function checkPriorOverride(complaintKey: string, disposition: string): Promise<boolean> {
  try {
    const fingerprint = `${complaintKey}|${disposition}`;
    const { rows } = await pool.query(
      `SELECT 1 FROM physician_overrides WHERE output_fingerprint LIKE $1 LIMIT 1`,
      [`${fingerprint}%`]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function getCommandStripQueue(params: {
  tierFilter?: PhysicianTier | null;
  limit?: number;
  offset?: number;
}): Promise<CommandStripPage> {
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const rawSessions = await getSessions(500, 0);

  const pending = rawSessions.filter(
    (s: any) => !["approved", "overridden", "escalated", "batch_approved"].includes(s.status)
  );

  const cases: CommandStripCase[] = [];

  for (const s of pending) {
    const debateResult = (s as any).debateResult ?? (s as any).disposition ?? {};
    const disposition: string = debateResult?.finalDisposition ?? debateResult?.disposition ?? s.disposition ?? "UNKNOWN";
    const confidence: number = Number(debateResult?.confidence ?? s.confidence ?? 0);
    const debateOutcome: string = debateResult?.outcome ?? "CONSENSUS";
    const diagnoses: string[] = debateResult?.diagnoses ?? [];
    const populationFlagLabels: string[] = (s as any).populationFlags ?? [];
    const redFlagLabels: string[] = (s as any).redFlags ?? [];
    const hasPopulationFlags = populationFlagLabels.length > 0;
    const hasRedFlags = redFlagLabels.length > 0;

    const priorOverrideExists = await checkPriorOverride(
      (s as any).complaintKey ?? "",
      disposition
    );

    const tierAssignment: TierAssignment = assignTier({
      debateOutcome,
      disposition,
      confidence,
      hasPopulationFlags,
      hasRedFlags,
      priorOverrideExists,
    });

    cases.push({
      id: s.id,
      patientName: (s as any).patientName ?? (s as any).name ?? "Patient",
      age: (s as any).age ?? null,
      complaintKey: (s as any).complaintKey ?? (s as any).complaint ?? "unknown",
      disposition,
      confidence,
      debateOutcome,
      debateRationale: debateResult?.rationale ?? "",
      diagnoses,
      hasPopulationFlags,
      hasRedFlags,
      populationFlagLabels,
      redFlagLabels,
      erNowMessage: (s as any).erNowMessage ?? debateResult?.erNowMessage ?? null,
      status: s.status ?? "pending",
      queuedAt: (s as any).createdAt ?? (s as any).timestamp ?? new Date().toISOString(),
      tier: tierAssignment.tier,
      tierLabel: tierAssignment.label,
      tierSlaMinutes: tierAssignment.slaMinutes,
      tierRationale: tierAssignment.rationale,
      batchEligible: tierAssignment.batchEligible,
      channel: (s as any).channel ?? "web",
      priorOverrideExists,
    });
  }

  // Sort: Tier 3 first, then Tier 2, then Tier 1; within tier by oldest first
  cases.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
  });

  const tierCounts: Record<PhysicianTier, number> = { 1: 0, 2: 0, 3: 0 };
  let batchEligibleCount = 0;
  for (const c of cases) {
    tierCounts[c.tier]++;
    if (c.batchEligible) batchEligibleCount++;
  }

  const filtered = params.tierFilter
    ? cases.filter(c => c.tier === params.tierFilter)
    : cases;

  return {
    cases: filtered.slice(offset, offset + limit),
    total: filtered.length,
    tierCounts,
    batchEligibleCount,
  };
}
