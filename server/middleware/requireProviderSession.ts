import { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  provider?: {
    id: string;
    clinicId: string;
    role: string;
  };
}

/**
 * Middleware that enforces a valid provider session with clinic binding.
 * Blocks any request that does not have an authenticated provider with a clinicId —
 * preventing unauthenticated triage submissions and tenant leakage.
 */
export function requireProviderSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const provider = (req as any).provider ?? (req as any).physician;

  if (!provider) {
    return res.status(401).json({
      error: "Unauthorized — provider session required",
      code: "PROVIDER_SESSION_REQUIRED",
    });
  }

  if (!provider.clinicId) {
    return res.status(401).json({
      error: "Unauthorized — provider is not bound to a clinic",
      code: "CLINIC_BINDING_REQUIRED",
    });
  }

  next();
}

/**
 * Middleware that validates the request body's clinicId matches the session clinicId.
 * Prevents a provider at clinic A from writing data for clinic B.
 */
export function requireTenantMatch(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const sessionClinicId = (req as any).provider?.clinicId ?? (req as any).physician?.clinicId;
  const bodyClinicId = req.body?.clinicId;

  if (bodyClinicId && sessionClinicId && bodyClinicId !== sessionClinicId) {
    return res.status(403).json({
      error: "Forbidden — tenant mismatch",
      code: "TENANT_MISMATCH",
      details: "Request clinicId does not match authenticated provider clinicId",
    });
  }

  next();
}
