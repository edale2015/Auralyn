import type { Request, Response, NextFunction } from "express";

export function requireKbAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const role =
    (req.headers["x-kb-role"] as string | undefined) ||
    (req as any).user?.role ||
    (req as any).actor?.role;

  if (!role || !["kb_admin", "system_admin", "super_admin"].includes(role)) {
    res.status(403).json({
      ok: false,
      code: "KB_ADMIN_REQUIRED",
      message: "KB admin role required for canonical pathway writes.",
    });
    return;
  }

  next();
}

export function requireKbWrite(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const role =
    (req.headers["x-kb-role"] as string | undefined) ||
    (req as any).user?.role ||
    (req as any).actor?.role;

  const allowed = ["kb_admin", "system_admin", "super_admin", "physician", "clinician"];
  if (!role || !allowed.includes(role)) {
    res.status(403).json({
      ok: false,
      code: "KB_WRITE_REQUIRED",
      message: "KB write role required.",
    });
    return;
  }

  next();
}
