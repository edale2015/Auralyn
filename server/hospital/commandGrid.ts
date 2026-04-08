export interface PatientNode {
  caseId: string;
  complaint: string;
  triageLevel: string;
  riskScore: number;
  trajectory: string;
  escalation: string | null;
  lastUpdated: number;
  iteration: number;
}

const activePatients = new Map<string, PatientNode>();

export function updateCommandGridNode(node: Omit<PatientNode, "lastUpdated">): void {
  activePatients.set(node.caseId, { ...node, lastUpdated: Date.now() });
}

export function getCommandGrid(): PatientNode[] {
  return [...activePatients.values()].sort((a, b) => b.riskScore - a.riskScore);
}

export function getHighRiskPatients(threshold = 0.65): PatientNode[] {
  return getCommandGrid().filter(p => p.riskScore >= threshold);
}

export function removePatientNode(caseId: string): void {
  activePatients.delete(caseId);
}
