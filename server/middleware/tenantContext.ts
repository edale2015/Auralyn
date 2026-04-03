import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db';

export interface TenantRequest extends Request {
  user?: {
    id: string;
    role: string;
    tenantId?: string;
  };
  tenantId?: string;
}

export function tenantContextMiddleware(req: TenantRequest, res: Response, next: NextFunction) {
  const tenantId =
    req.user?.tenantId ||
    (req.header('x-tenant-id') as string | undefined) ||
    (req.body?.tenantId as string | undefined);

  if (!tenantId) {
    next();
    return;
  }

  req.tenantId = tenantId;

  pool.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId])
    .then(() => next())
    .catch(next);
}
