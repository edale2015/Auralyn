import type { Request, Response, NextFunction } from "express";

// Middleware that gates an endpoint on physician-level approval.
// Used for KB activation flows where a physician (not just a kb_admin) must sign off.
export function requirePhysicianReview(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const role =
    (req as any).physician?.role ||
    (req as any).user?.role ||
    (req as any).actor?.role;

  if (!role || !["physician", "kb_admin", "system_admin", "super_admin"].includes(role)) {
    res.status(403).json({
      ok: false,
      code: "PHYSICIAN_REVIEW_REQUIRED",
      message: "Physician approval required for this operation.",
    });
    return;
  }

  next();
}
