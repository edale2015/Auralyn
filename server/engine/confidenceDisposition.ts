import { db } from "../db";
import { kbConfidenceRules, kbDiagnosisRisk } from "../../shared/schema";
import { eq, and } from "drizzle-orm";

export interface ConfidenceDispositionResult {
  disposition: string;
  uncertainty: number;
  margin: number;
  topDx: string;
  posterior: number;
  ruleHits: Array<{ action: string; minConfidence: number; description: string | null }>;
  floorApplied: boolean;
  floorSource: string | null;
}

const DISPOSITION_ORDER = ["MONITOR", "office_followup", "urgent_care", "URGENT", "er_now", "ER_NOW", "CALL_911"];

function dispositionRank(d: string): number {
  const normalized = d.toUpperCase().replace(/-/g, "_");
  const idx = DISPOSITION_ORDER.findIndex(x => x.toUpperCase() === normalized);
  return idx === -1 ? 2 : idx;
}

export async function computeDispositionWithUncertainty(
  complaintId: string,
  logScored: Array<{ diagnosis: string; diagnosisLabel?: string; score: number; posterior: number }>,
  baseDisposition: string
): Promise<ConfidenceDispositionResult> {
  const ranked = [...logScored].sort((a, b) => b.posterior - a.posterior);
  const top = ranked[0];
  const second = ranked[1];

  const uncertainty = 1 - (top?.posterior ?? 0);
  const margin = (top?.posterior ?? 0) - (second?.posterior ?? 0);

  let rules: typeof kbConfidenceRules.$inferSelect[] = [];
  try {
    const globalRules = await db.select().from(kbConfidenceRules).where(eq(kbConfidenceRules.isActive, true));
    rules = globalRules
      .filter(r => !r.complaintId || r.complaintId === complaintId || r.complaintId === "global")
      .sort((a, b) => a.priority - b.priority);
  } catch { rules = []; }

  let escalated = baseDisposition;
  const ruleHits: ConfidenceDispositionResult["ruleHits"] = [];

  for (const r of rules) {
    if (uncertainty >= r.minConfidence) {
      escalated = r.action;
      ruleHits.push({ action: r.action, minConfidence: r.minConfidence, description: r.description });
    }
  }

  let floorApplied = false;
  let floorSource: string | null = null;

  if (top?.diagnosis) {
    try {
      const riskRows = await db.select().from(kbDiagnosisRisk).where(
        and(eq(kbDiagnosisRisk.diagnosis, top.diagnosis), eq(kbDiagnosisRisk.isActive, true))
      );
      const risk = riskRows[0];
      if (risk?.minDisposition) {
        if (dispositionRank(escalated) < dispositionRank(risk.minDisposition)) {
          escalated = risk.minDisposition;
          floorApplied = true;
          floorSource = risk.diagnosis;
        }
      }
    } catch { }
  }

  return {
    disposition: escalated,
    uncertainty,
    margin,
    topDx: top?.diagnosis ?? "unknown",
    posterior: top?.posterior ?? 0,
    ruleHits,
    floorApplied,
    floorSource,
  };
}
