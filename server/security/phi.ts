import crypto from "crypto";
import type { RequestUser } from "./session";

const RISK_ORDER: Record<string, number> = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };

function hash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function publicPatientRef(patientId: unknown, clinicSiteId?: unknown): string {
  const salt = process.env.PHI_REF_SALT || process.env.JWT_SECRET || "development-only-phi-salt";
  const rawId = String(patientId ?? "unknown");
  const clinic = String(clinicSiteId ?? "global");
  return `pt_${hash(`${salt}:${clinic}:${rawId}`).slice(0, 12)}`;
}

export function isClinicalRole(user?: RequestUser | null): boolean {
  return !!user && ["admin", "physician", "staff"].includes(user.role);
}

function sameTenant(payload: any, user?: RequestUser | null): boolean {
  if (!user) return false;
  const payloadTenant = payload?.clinicSiteId ?? payload?.vitals?.clinicSiteId ?? payload?.organizationId;
  if (payloadTenant === undefined || payloadTenant === null) return true;
  const userTenant = user.clinicSiteId ?? user.organizationId;
  if (userTenant === undefined || userTenant === null) return false;
  return String(payloadTenant) === String(userTenant);
}

function truncHash(value: unknown): string | undefined {
  return typeof value === "string" ? value.slice(0, 12) : undefined;
}

function minimalInsights(insights: unknown): unknown[] {
  if (!Array.isArray(insights)) return [];
  return insights.slice(0, 10).map((i: any) => ({
    priority: i?.priority,
    title: i?.title ?? i?.type,
    // Do not forward free-text bodies over WS by default; they often contain complaint text.
  }));
}

function safeVitals(vitals: any): Record<string, number | undefined> | undefined {
  if (!vitals) return undefined;
  return {
    hr: typeof vitals.hr === "number" ? vitals.hr : undefined,
    spo2: typeof vitals.spo2 === "number" ? vitals.spo2 : undefined,
    temp: typeof vitals.temp === "number" ? vitals.temp : undefined,
    sbp: typeof vitals.sbp === "number" ? vitals.sbp : undefined,
    dbp: typeof vitals.dbp === "number" ? vitals.dbp : undefined,
    rr: typeof vitals.rr === "number" ? vitals.rr : undefined,
  };
}

export function sanitizeAgentCycleForSocket(payload: any, user?: RequestUser | null): Record<string, unknown> {
  const clinical = isClinicalRole(user) && sameTenant(payload, user);
  const allowVitals = clinical && process.env.AURALYN_WS_ALLOW_VITALS === "true";
  const riskLevel = payload?.risk?.level ?? payload?.riskLevel;

  return {
    type: payload?.type ?? "agent_cycle",
    patientRef: publicPatientRef(payload?.patientId ?? payload?.vitals?.patientId, payload?.clinicSiteId ?? payload?.vitals?.clinicSiteId),
    risk: payload?.risk ? {
      level: payload.risk.level,
      score: payload.risk.score,
      flagCount: Array.isArray(payload.risk.flags) ? payload.risk.flags.length : 0,
      // Only include generic flag labels for authenticated clinical users. Never include name/phone/free text.
      flags: clinical ? payload.risk.flags : undefined,
    } : undefined,
    icu: payload?.icu ? {
      needsICU: payload.icu.needsICU,
      urgency: payload.icu.urgency,
    } : undefined,
    routing: payload?.routing ? {
      destination: payload.routing.destination,
      urgency: payload.routing.urgency,
    } : undefined,
    safety: payload?.safety ? {
      allowed: payload.safety.allowed,
      requiresApproval: payload.safety.requiresApproval,
      blockedReason: clinical ? payload.safety.blockedReason : undefined,
    } : undefined,
    vitals: allowVitals ? safeVitals(payload?.vitals) : undefined,
    clinicalDecision: payload?.clinicalDecision ? {
      mode: payload.clinicalDecision.mode,
      finalRisk: payload.clinicalDecision.finalRisk,
      requiresPhysicianReview: payload.clinicalDecision.requiresPhysicianReview,
      agreementRate: payload.clinicalDecision.fleet?.consensus?.agreementRate,
    } : undefined,
    insights: clinical ? minimalInsights(payload?.insights) : undefined,
    auditHash: truncHash(payload?.auditHash),
    ts: payload?.ts ?? Date.now(),
    elevated: typeof riskLevel === "string" ? RISK_ORDER[riskLevel] >= RISK_ORDER.HIGH : undefined,
  };
}

export function scrubCycleForApi(result: any, user?: RequestUser | null): Record<string, unknown> {
  const clinical = isClinicalRole(user) && sameTenant(result, user);
  const base = sanitizeAgentCycleForSocket({ type: "agent_cycle", ...result }, user);

  if (!clinical) return base;

  // Authenticated same-tenant clinical API calls can receive fuller clinical detail.
  // Still omit patient name from generic responses; the UI can fetch demographics via a dedicated audited endpoint.
  return {
    ...base,
    patientId: result.patientId,
    vitals: safeVitals(result.vitals),
    risk: result.risk,
    icu: result.icu,
    safety: result.safety,
    twin: result.twin,
    routing: result.routing,
    insights: result.insights,
    clinicalDecision: result.clinicalDecision,
    auditHash: result.auditHash,
    durationMs: result.durationMs,
  };
}
