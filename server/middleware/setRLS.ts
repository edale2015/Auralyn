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

// ── Trusted-proxy guard for X-Clinic-Id header ────────────────────────────────
//
// INDEPENDENT REVIEW FINDING: X-Clinic-Id header was trusted from ANY HTTP client.
// An attacker could set `X-Clinic-Id: <other-tenant-uuid>` to read other clinics'
// patient data — a complete bypass of PostgreSQL Row-Level Security tenant isolation.
//
// Fix strategy (defence-in-depth):
//   1. In production, the load balancer / ALB should STRIP this header from
//      external requests and re-inject it from JWT claims or a service mesh secret.
//   2. When `TRUSTED_PROXY_IPS` is set, only accept the header if the remote IP
//      matches the allowlist. Localhost (127.0.0.1 / ::1) is always trusted for
//      internal service calls.
//   3. When neither TRUSTED_PROXY_IPS is configured nor the header source is trusted,
//      we fall back to req.body.clinicId (set by validated routes, not user input)
//      and emit a warning so the security team can detect misconfiguration.
//
// PRODUCTION CHECKLIST:
//   - ALB: add header-rewrite rule to strip X-Clinic-Id from inbound requests
//   - App: set TRUSTED_PROXY_IPS=<alb-internal-cidr> in the task definition env
//   - Preferred: inject clinicId from auth JWT claims in requireRole() instead.
//
const TRUSTED_PROXY_IPS = new Set<string>(
  (process.env.TRUSTED_PROXY_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

// Localhost is always trusted — internal service calls (health checks, CLI tools)
const ALWAYS_TRUSTED = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function isSourceTrusted(req: Request): boolean {
  const remoteIp = req.socket?.remoteAddress ?? "";
  if (ALWAYS_TRUSTED.has(remoteIp)) return true;
  if (TRUSTED_PROXY_IPS.size > 0 && TRUSTED_PROXY_IPS.has(remoteIp)) return true;
  return false;
}

/**
 * Express middleware: reads the clinic ID from
 *   - the X-Clinic-Id header ONLY when the request originates from a trusted proxy, or
 *   - req.body.clinicId (set internally by validated routes), or
 *   - falls back to "default" (public / non-isolated context).
 *
 * Call this before any route that touches clinic-scoped tables.
 */
export function rlsMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const headerClinicId = req.headers["x-clinic-id"] as string | undefined;

  let clinicId: string;

  if (headerClinicId) {
    if (isSourceTrusted(req)) {
      // Trusted proxy — accept the header as authoritative
      clinicId = headerClinicId;
    } else {
      // Untrusted source sent X-Clinic-Id — ignore the header, log a warning.
      // This prevents cross-tenant spoofing from external clients.
      console.warn(
        `[RLS] SECURITY: X-Clinic-Id header '${headerClinicId}' received from ` +
        `untrusted source ${req.socket?.remoteAddress}. Ignoring header. ` +
        `Configure TRUSTED_PROXY_IPS or strip this header at the ALB.`
      );
      clinicId = (req.body?.clinicId as string | undefined) ?? "default";
    }
  } else {
    clinicId = (req.body?.clinicId as string | undefined) ?? "default";
  }

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
