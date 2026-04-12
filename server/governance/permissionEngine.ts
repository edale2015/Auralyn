export interface PermissionContext {
  confirmed_bacterial_features?: boolean;
  bacterial_criteria_met?:       boolean;
  red_flags_present?:            boolean;
  centorScore?:                  number;
  probability?:                  number;
  actorRole?:                    string;
  requiresPhysicianApproval?:    boolean;
}

export interface PermissionResult {
  allowed: boolean;
  reason:  string | null;
  requiresReview?: boolean;
}

const PHYSICIAN_ONLY_ACTIONS = new Set([
  "prescribe_controlled_med",
  "order_imaging",
  "admit_patient",
  "override_safety_floor",
]);

export function checkClinicalPermission(
  action: string,
  context: PermissionContext
): PermissionResult {
  if (PHYSICIAN_ONLY_ACTIONS.has(action)) {
    const role = context.actorRole ?? "";
    if (!["physician", "attending", "md", "do", "np", "pa"].includes(role.toLowerCase())) {
      return {
        allowed:       false,
        reason:        `Action '${action}' requires a licensed provider role.`,
        requiresReview: true,
      };
    }
  }

  switch (action) {
    case "prescribe_antibiotic": {
      const hasCriteria =
        context.confirmed_bacterial_features ||
        context.bacterial_criteria_met ||
        (context.centorScore ?? 0) >= 3 ||
        (context.probability ?? 0) > 0.5;
      if (!hasCriteria) {
        return {
          allowed: false,
          reason:  "No bacterial criteria met — antibiotic prescribing blocked.",
        };
      }
      return { allowed: true, reason: null };
    }

    case "generate_disposition": {
      if (context.red_flags_present) {
        return {
          allowed:       false,
          reason:        "Cannot discharge — red flags require physician review.",
          requiresReview: true,
        };
      }
      return { allowed: true, reason: null };
    }

    case "discharge_patient": {
      if (context.red_flags_present) {
        return {
          allowed:       false,
          reason:        "Red flags present — escalation required before discharge.",
          requiresReview: true,
        };
      }
      return { allowed: true, reason: null };
    }

    default:
      return { allowed: true, reason: null };
  }
}

export function checkPermission(toolCall: {
  name:  string;
  input: Record<string, unknown>;
}): PermissionResult {
  const ctx: PermissionContext = {
    confirmed_bacterial_features: toolCall.input.confirmed_bacterial_features as boolean,
    bacterial_criteria_met:       toolCall.input.bacterial_criteria_met       as boolean,
    red_flags_present:            toolCall.input.red_flags_present            as boolean,
    centorScore:                  toolCall.input.centorScore                  as number,
    probability:                  toolCall.input.probability                  as number,
    actorRole:                    toolCall.input.actorRole                    as string,
  };
  return checkClinicalPermission(toolCall.name, ctx);
}
