import {
  clinicalSupervisorEngine,
  type SupervisorInput,
  type SupervisorOutput,
} from "./clinicalSupervisorEngine";

export type GovernanceOutput = SupervisorOutput & {
  autoAllowed: boolean;
  auditTags: string[];
};

export function clinicalGovernanceEngine(input: SupervisorInput): GovernanceOutput {
  const supervisor = clinicalSupervisorEngine(input);

  const auditTags: string[] = [
    `decision:${supervisor.supervisorDecision}`,
    `confidence:${supervisor.confidenceBand}`,
  ];

  if (supervisor.topDiagnosis)           auditTags.push(`top_dx:${supervisor.topDiagnosis}`);
  if (supervisor.escalationRecommended)  auditTags.push("escalation:true");
  if (!supervisor.allowedToAutoTreat)    auditTags.push("auto_treat:false");
  if (!supervisor.allowedToAutoDischarge) auditTags.push("auto_discharge:false");
  if (supervisor.blockers.length > 0)   auditTags.push(`blockers:${supervisor.blockers.length}`);

  const autoAllowed =
    supervisor.allowedToAutoTreat &&
    supervisor.allowedToAutoDischarge &&
    supervisor.supervisorDecision === "SAFE_FOR_PROTOCOLIZED_CARE";

  return { ...supervisor, autoAllowed, auditTags };
}
