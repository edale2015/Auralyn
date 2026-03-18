export type DashboardFilterInput = {
  clinicId?: string;
  startDate?: string;
  endDate?: string;
  complaint?: string;
  physicianId?: string;
};

export type DashboardAuthUser = {
  id: string;
  role: "admin" | "physician" | "reviewer" | "executive";
  clinicId: string;
};

export function resolveAuthAwareFilters(
  requested: DashboardFilterInput,
  user: DashboardAuthUser
): DashboardFilterInput {
  const resolved: DashboardFilterInput = { ...requested };

  if (user.role !== "executive") {
    resolved.clinicId = user.clinicId;
  } else if (!resolved.clinicId) {
    resolved.clinicId = user.clinicId;
  }

  if (user.role === "physician") {
    resolved.physicianId = user.id;
  }

  return resolved;
}
