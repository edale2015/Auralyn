/**
 * requireClinicAccess — ensures the authenticated physician has a clinicId bound
 * to their identity token before any clinic-scoped action proceeds.
 *
 * Place AFTER requirePhysician or requireRole so req.physician is already populated.
 *
 * Phase 1 fix: Without this, a physician token with no clinicId would bypass
 * all tenant-isolation checks downstream (no clinicId → every session/record
 * would match their undefined clinicId, leaking cross-tenant data).
 */

import type { Request, Response, NextFunction } from "express";

export function requireClinicAccess(req: Request, res: Response, next: NextFunction): void {
  // Support both req.physician (legacy) and req.authUser (requireRole path)
  const physician = (req as any).physician ?? (req as any).authUser;

  if (!physician) {
    res.status(401).json({ error: "Unauthorized — authentication required" });
    return;
  }

  if (!physician.clinicId) {
    res.status(403).json({
      error: "Missing clinic context — token must include clinicId",
      hint: "Ensure the auth token is issued for a clinic-bound account",
    });
    return;
  }

  next();
}
