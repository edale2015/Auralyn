export interface PhysicianDecision {
  caseId: string;
  engineDisposition: string;
  physicianDisposition: string;
  agreed: boolean;
  overrideReason?: string;
}

export function simulatePhysicianDecision(caseId: string, engineDisposition: string): PhysicianDecision {
  const overrideRate = 0.15;
  const agreed = Math.random() > overrideRate;

  return {
    caseId,
    engineDisposition,
    physicianDisposition: agreed ? engineDisposition : "OFFICE_VISIT",
    agreed,
    overrideReason: agreed ? undefined : "Clinical judgment differs",
  };
}
