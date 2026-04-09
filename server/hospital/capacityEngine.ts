/**
 * Capacity Engine — Air traffic control for clinicians
 *
 * Converts raw slot/staffing numbers into actionable capacity state.
 * The systemState label is used downstream by the routing engine and surge
 * detector to make routing decisions under strain.
 *
 * Utilization is computed relative to queue size because what matters
 * clinically is not how many slots exist, but whether there are enough
 * to absorb the current demand.
 */

export interface CapacityInput {
  telemedOpenSlots:    number;
  clinicOpenSlots:     number;
  physicianAvailable:  number;
  nurseAvailable:      number;
  currentQueueSize:    number;
  averageWaitMinutes:  number;
}

export interface CapacityState {
  telemedUtilization:     number;
  clinicUtilization:      number;
  strainScore:            number;
  systemState:            "stable" | "busy" | "strained";
  canAbsorbMoreTelemed:   boolean;
  canAbsorbMoreClinic:    boolean;
}

export function computeCapacityState(input: CapacityInput): CapacityState {
  const telemedUtilization =
    input.telemedOpenSlots <= 0
      ? 1
      : Math.min(1, input.currentQueueSize / Math.max(1, input.telemedOpenSlots));

  const clinicUtilization =
    input.clinicOpenSlots <= 0
      ? 1
      : Math.min(1, input.currentQueueSize / Math.max(1, input.clinicOpenSlots));

  const strainScore =
    (telemedUtilization * 2) +
    (clinicUtilization * 2) +
    (input.averageWaitMinutes > 30 ? 2 : 0) +
    (input.physicianAvailable < 2  ? 2 : 0) +
    (input.nurseAvailable < 1      ? 1 : 0);

  const systemState: CapacityState["systemState"] =
    strainScore >= 6 ? "strained" :
    strainScore >= 3 ? "busy"     : "stable";

  return {
    telemedUtilization,
    clinicUtilization,
    strainScore,
    systemState,
    canAbsorbMoreTelemed: input.telemedOpenSlots > 0 && telemedUtilization < 0.85,
    canAbsorbMoreClinic:  input.clinicOpenSlots  > 0 && clinicUtilization  < 0.85,
  };
}
