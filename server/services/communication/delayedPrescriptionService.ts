export type DelayedRxStatus = "PENDING_ACTIVATION" | "ACTIVATED" | "EXPIRED" | "CANCELLED";

export interface DelayedRxParams {
  patientId: string;
  medication: string;
  instructions: string;
  activationCriteria: string[];
  expiresInDays?: number;
}

export interface DelayedRxRecord {
  id: string;
  patientId: string;
  medication: string;
  instructions: string;
  activationCriteria: string[];
  status: DelayedRxStatus;
  expiresAt: Date;
  createdAt: Date;
}

function generateRxId(): string {
  return `delayed-rx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function createDelayedPrescription(
  params: DelayedRxParams
): Promise<{ success: boolean; record: DelayedRxRecord }> {
  const expiresInDays = params.expiresInDays ?? 7;
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);

  const record: DelayedRxRecord = {
    id: generateRxId(),
    patientId: params.patientId,
    medication: params.medication,
    instructions: params.instructions,
    activationCriteria: params.activationCriteria,
    status: "PENDING_ACTIVATION",
    expiresAt,
    createdAt: new Date(),
  };

  return { success: true, record };
}

export async function activateDelayedPrescription(
  rxId: string
): Promise<{ success: boolean; message: string }> {
  return {
    success: true,
    message: `Delayed prescription ${rxId} activated — patient should begin medication per instructions.`,
  };
}

export function buildActivationCriteria(options: {
  fever?: boolean;
  throatPain?: boolean;
  worsening?: boolean;
  rash?: boolean;
  custom?: string[];
}): string[] {
  const criteria: string[] = [];
  if (options.fever)      criteria.push("Fever ≥ 101°F (38.3°C)");
  if (options.throatPain) criteria.push("Worsening throat pain, difficulty swallowing");
  if (options.worsening)  criteria.push("Symptoms not improving or worsening after 48 hours");
  if (options.rash)       criteria.push("New rash develops");
  if (options.custom)     criteria.push(...options.custom);
  return criteria;
}
