import { db } from "../db";
import { labeledOutcomeStats } from "../../shared/schema";

const MIN_LABELED_ENCOUNTERS =
  Number(process.env.MIN_LABELED_ENCOUNTERS_FOR_LEARNING) || 10_000;

export interface LearningEligibilityResult {
  allowed: boolean;
  reason: string | null;
  labeled: number;
  goldenCases: number;
  threshold: number;
  pctToThreshold: number;
}

export async function canRunAutonomousLearning(
  clinicExternalId?: string
): Promise<LearningEligibilityResult> {
  let labeled = 0;
  let goldenCases = 0;

  try {
    const stats = await db.query.labeledOutcomeStats.findFirst();
    labeled = stats?.totalLabeledEncounters ?? 0;
    goldenCases = stats?.totalGoldenCases ?? 0;
  } catch {
    // DB not yet migrated — return permissive for dev
    return {
      allowed: true,
      reason: "Learning stats table not yet provisioned — running in dev mode",
      labeled: 0,
      goldenCases: 0,
      threshold: MIN_LABELED_ENCOUNTERS,
      pctToThreshold: 0,
    };
  }

  const pctToThreshold = Math.min(100, Math.round((labeled / MIN_LABELED_ENCOUNTERS) * 100));

  if (labeled < MIN_LABELED_ENCOUNTERS) {
    return {
      allowed: false,
      reason: `Autonomous learning disabled until ${MIN_LABELED_ENCOUNTERS.toLocaleString()} labeled encounters are available (currently ${labeled.toLocaleString()})`,
      labeled,
      goldenCases,
      threshold: MIN_LABELED_ENCOUNTERS,
      pctToThreshold,
    };
  }

  return {
    allowed: true,
    reason: null,
    labeled,
    goldenCases,
    threshold: MIN_LABELED_ENCOUNTERS,
    pctToThreshold: 100,
  };
}

export async function getLabeledStats() {
  try {
    return await db.query.labeledOutcomeStats.findFirst();
  } catch {
    return null;
  }
}

export async function upsertLabeledStats(patch: {
  totalLabeledEncounters?: number;
  totalGoldenCases?: number;
  clinicExternalId?: string;
}) {
  const existing = await getLabeledStats();
  if (!existing) {
    const [row] = await db
      .insert(labeledOutcomeStats)
      .values({
        totalLabeledEncounters: patch.totalLabeledEncounters ?? 0,
        totalGoldenCases:       patch.totalGoldenCases       ?? 0,
        clinicExternalId:       patch.clinicExternalId,
      })
      .returning();
    return row;
  }
  const [row] = await db
    .update(labeledOutcomeStats)
    .set({
      totalLabeledEncounters: patch.totalLabeledEncounters ?? existing.totalLabeledEncounters,
      totalGoldenCases:       patch.totalGoldenCases       ?? existing.totalGoldenCases,
      lastComputedAt:         new Date(),
    })
    .returning();
  return row;
}
