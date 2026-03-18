import { intakeCaseStore, OutcomeRecord } from "../services/intakeCaseStore";
import { intakeAuditLog } from "../services/intakeAuditLog";

export function recordOutcome(input: OutcomeRecord): OutcomeRecord {
  const saved = intakeCaseStore.saveOutcome(input);
  const linkedCase = intakeCaseStore.getCase(input.caseId);

  intakeAuditLog.write({
    actor: "system_outcome_collector",
    entityId: input.caseId,
    event: "outcome_recorded",
    details: {
      outcomeType: input.outcomeType,
      npsScore: input.npsScore ?? null,
      patientComment: input.patientComment ?? null,
      complaint: linkedCase?.chiefComplaint ?? null,
      disposition: linkedCase?.proposedDisposition ?? null,
    },
  });

  return saved;
}

export function buildOutcomeAnalytics() {
  const outcomes = intakeCaseStore.listOutcomes();
  const total = outcomes.length || 1;
  const npsItems = outcomes.filter((x) => typeof x.npsScore === "number");
  const avgNps = npsItems.reduce((sum, x) => sum + (x.npsScore || 0), 0) / Math.max(1, npsItems.length);
  const byType = outcomes.reduce<Record<string, number>>((acc, item) => {
    acc[item.outcomeType] = (acc[item.outcomeType] || 0) + 1;
    return acc;
  }, {});

  return {
    totalOutcomes: outcomes.length,
    averageNps: Number(avgNps.toFixed(2)),
    byType,
    worseningRate: Number((((byType["worsened"] || 0) / total) * 100).toFixed(2)),
    erVisitRate: Number((((byType["er_visit"] || 0) / total) * 100).toFixed(2)),
  };
}
