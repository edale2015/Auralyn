import type { Request } from "express";

export function getTenant(req: Request | { headers: Record<string, string | undefined> }): string {
  const h = (req as any).headers;
  return (h["x-tenant-id"] as string) || "default";
}

export function scopedQuery(tenant: string, table: string): string {
  const safe = table.replace(/[^a-zA-Z0-9_]/g, "");
  return `SELECT * FROM ${safe} WHERE tenant='${tenant}'`;
}

export interface TenantMetrics {
  tenant: string;
  patientCount: number;
  avgLatencyMs: number;
  erRate: number;
}

export function buildTenantMetrics(
  tenant: string,
  overrides: Partial<Omit<TenantMetrics, "tenant">> = {}
): TenantMetrics {
  return {
    tenant,
    patientCount: 0,
    avgLatencyMs: 0,
    erRate: 0,
    ...overrides,
  };
}

const KNOWN_TENANTS = ["default", "clinicA", "clinicB", "clinicC"];

export function listTenants(): string[] {
  return KNOWN_TENANTS;
}
