import type { Request, Response, NextFunction } from "express";

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin:     ["deploy", "override", "alerts", "view", "manage_tenants"],
  physician: ["override", "view", "triage"],
  staff:     ["view", "triage"],
};

export function can(role: string, action: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}

export function listPermissions(role: string): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function auth(actionRequired: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req.headers["x-role"] as string) ?? "";
    if (!can(role, actionRequired)) {
      return res.status(403).json({ error: "Forbidden", required: actionRequired, role });
    }
    next();
  };
}

export function listRoles(): string[] {
  return Object.keys(ROLE_PERMISSIONS);
}
