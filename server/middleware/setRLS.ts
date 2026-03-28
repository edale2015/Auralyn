import { pool } from "../db";
import type { Request, Response, NextFunction } from "express";

/**
 * Set the Postgres session variable app.clinic_id so that
 * all subsequent queries on this connection are automatically
 * filtered by the clinic_patients / clinic_encounters / clinic_intake_sessions
 * Row-Level Security policies.
 *
 * Safe: uses parameterised SET — no SQL injection surface.
 */
export async function setClinicContext(clinicId: string): Promise<void> {
  await pool.query(`SET LOCAL app.clinic_id = $1`, [clinicId]);
}

/**
 * Express middleware: reads the clinic ID from
 *   - the X-Clinic-Id header (trusted internal header), or
 *   - req.body.clinicId, or
 *   - falls back to "default" (public / non-isolated context).
 *
 * Call this before any route that touches clinic-scoped tables.
 */
export function rlsMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const clinicId =
    (req.headers["x-clinic-id"] as string | undefined) ||
    (req.body?.clinicId as string | undefined) ||
    "default";

  setClinicContext(clinicId)
    .then(() => next())
    .catch(next);
}

/** Use inside service code when you have a known clinicId */
export async function withClinicContext<T>(
  clinicId: string,
  fn: () => Promise<T>
): Promise<T> {
  await setClinicContext(clinicId);
  return fn();
}
