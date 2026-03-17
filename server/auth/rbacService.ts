import type { UserRole } from "../types/auth";

export type Permission =
  | "*"
  | "clinical:run"
  | "clinical:override"
  | "clinical:view"
  | "view:analytics"
  | "view:dashboard"
  | "billing:view"
  | "billing:manage"
  | "tenant:manage"
  | "user:manage"
  | "ehr:read"
  | "ehr:write"
  | "deployment:manage"
  | "audit:view";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ["*"],
  physician: ["clinical:run", "clinical:override", "clinical:view", "view:analytics", "view:dashboard", "ehr:read", "ehr:write", "audit:view"],
  nurse: ["clinical:run", "clinical:view", "view:dashboard", "ehr:read"],
  staff: ["billing:view", "view:dashboard", "audit:view"],
  patient: ["clinical:view"],
  viewer: ["view:analytics", "view:dashboard"],
};

export class RBACService {
  can(role: UserRole, action: Permission): boolean {
    const perms = ROLE_PERMISSIONS[role];
    if (!perms) return false;
    return perms.includes("*") || perms.includes(action);
  }

  getPermissions(role: UserRole): Permission[] {
    return ROLE_PERMISSIONS[role] || [];
  }

  getAllRoles(): { role: UserRole; permissions: Permission[]; description: string }[] {
    const descriptions: Record<UserRole, string> = {
      admin: "Full access — clinic owner",
      physician: "Clinical usage + overrides + analytics",
      nurse: "Intake + triage + clinical view",
      staff: "Administrative tasks + billing",
      patient: "Read-only clinical view",
      viewer: "Read-only analytics",
    };
    return (Object.keys(ROLE_PERMISSIONS) as UserRole[]).map((role) => ({
      role,
      permissions: ROLE_PERMISSIONS[role],
      description: descriptions[role],
    }));
  }
}

export const rbacService = new RBACService();
