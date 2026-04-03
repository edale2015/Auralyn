import type { Request, Response, NextFunction } from "express";

/**
 * Hard-fail middleware for tenant context.
 * 
 * Per Claude Q11 recommendation: when tenantContext middleware fails to set 
 * app.current_tenant_id, we must not silently continue. Applied selectively 
 * to routes that require strict tenant isolation (not globally, to avoid 
 * breaking existing public/health routes).
 */
export function tenantContextHardFail(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = (req as any).user ?? (req as any).auth ?? {};
  const tenantId =
    (req.headers["x-tenant-id"] as string | undefined)?.trim() ||
    user?.tenantId ||
    user?.clinicId;

  if (!tenantId) {
    res.status(400).json({
      error: "TENANT_CONTEXT_REQUIRED",
      message:
        "A tenant identifier is required to access this resource. " +
        "Provide X-Tenant-Id header or ensure your session includes tenant context.",
    });
    return;
  }

  (req as any).resolvedTenantId = tenantId;
  (req as any).actorId =
    user?.id ?? user?.email ?? user?.sub ?? "unknown-actor";

  next();
}

/**
 * Express router-level middleware factory. Use to protect specific route groups:
 * 
 * router.use(requireTenantContext());
 */
export function requireTenantContext() {
  return tenantContextHardFail;
}
