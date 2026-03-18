import { Request, Response, NextFunction } from "express";

export function tenantGuard(req: Request, res: Response, next: NextFunction) {
  const authUser = (req as any).authUser;
  const headerClinicId = req.headers["x-clinic-id"] as string | undefined;
  const queryClinicId = req.query.clinicId as string | undefined;
  const bodyClinicId = req.body?.clinicId as string | undefined;

  const clinicId = headerClinicId || queryClinicId || bodyClinicId || authUser?.organizationId;

  if (!clinicId || typeof clinicId !== "string") {
    return res.status(400).json({ error: "Missing clinic context. Provide clinicId via header (x-clinic-id), query, or body." });
  }

  (req as any).clinicId = clinicId;
  res.locals.clinicId = clinicId;
  next();
}

export function enforceClinicIsolation(dataClinicId: string, requestClinicId: string): boolean {
  return dataClinicId === requestClinicId;
}
