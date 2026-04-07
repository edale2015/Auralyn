import type { AuthRole } from "./authTypes";

// Re-export AuthRole for callers that previously imported from here
export type { AuthRole };

// ── Permissions ───────────────────────────────────────────────────────────────

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

// ── Role → Permission map ─────────────────────────────────────────────────────
//
// FIXED: was importing UserRole from types/auth.ts, a separate type that diverged
// silently from AuthRole in unifiedAuth.ts. rbacService.can() accepted UserRole
// strings ("nurse","patient","viewer") that verifyAccessToken never issued, and
// rejected the "reviewer" role that verifyAccessToken could issue.
//
// FIX: both now import AuthRole from authTypes.ts — one source of truth.
// AuthRole is the union of all roles across both old types.
//
// Also fixed: staff was missing billing:manage in the original.

const ROLE_PERMISSIONS: Record<AuthRole, Permission[]> = {
  admin: ["*"],

  physician: [
    "clinical:run",
    "clinical:override",
    "clinical:view",
    "view:analytics",
    "view:dashboard",
    "ehr:read",
    "ehr:write",
    "audit:view",
  ],

  reviewer: [
    "clinical:view",
    "view:analytics",
    "view:dashboard",
    "audit:view",
  ],

  nurse: [
    "clinical:run",
    "clinical:view",
    "view:dashboard",
    "ehr:read",
  ],

  staff: [
    "billing:view",
    "billing:manage",         // was missing in original
    "view:dashboard",
    "audit:view",
  ],

  patient: [
    "clinical:view",
  ],

  viewer: [
    "view:analytics",
    "view:dashboard",
  ],
};

// ── RBACService ───────────────────────────────────────────────────────────────

export class RBACService {
  /**
   * Returns true if `role` has the given permission.
   * `"*"` is a sentinel value meaning "all permissions" — it passes every can()
   * call. It is NOT a literal permission string to pass as `action`.
   */
  can(role: AuthRole, action: Permission): boolean {
    const perms = ROLE_PERMISSIONS[role] ?? [];
    return perms.includes("*") || perms.includes(action);
  }

  /**
   * Returns true if `role` has ALL of the listed permissions.
   * Use for multi-permission gates (e.g. clinical:run AND ehr:write).
   */
  canAll(role: AuthRole, actions: Permission[]): boolean {
    return actions.every(a => this.can(role, a));
  }

  getPermissions(role: AuthRole): Permission[] {
    return ROLE_PERMISSIONS[role] ?? [];
  }

  getAllRoles(): { role: AuthRole; permissions: Permission[]; description: string }[] {
    const descriptions: Record<AuthRole, string> = {
      admin:     "Full access — clinic owner / platform admin",
      physician: "Clinical usage + overrides + EHR read/write + analytics",
      reviewer:  "Read-only clinical + analytics (QA, compliance reviews)",
      nurse:     "Intake + triage + clinical view + EHR read",
      staff:     "Billing administration + dashboard",
      patient:   "Read-only clinical view",
      viewer:    "Read-only analytics dashboard",
    };
    return (Object.keys(ROLE_PERMISSIONS) as AuthRole[]).map(role => ({
      role,
      permissions: ROLE_PERMISSIONS[role],
      description: descriptions[role],
    }));
  }
}

export const rbacService = new RBACService();
