import { logMetric } from "../monitoring/metrics";

export type PAStatus = "pending" | "submitted" | "approved" | "denied" | "appealing" | "appealed_approved" | "expired";

export interface PriorAuthRequest {
  paId:        string;
  caseId:      string;
  diagnosis:   string;
  cpt:         string;
  icd10:       string;
  payer:       string;
  patientId:   string;
  urgency:     "routine" | "urgent" | "emergent";
  status:      PAStatus;
  submittedAt: string;
  updatedAt:   string;
  authId?:     string;
  decisionAt?: string;
  denialReason?: string;
  appealNotes?:  string;
  estimatedDecisionHours: number;
}

const store: Map<string, PriorAuthRequest> = new Map();

const PAYER_APPROVAL_RATES: Record<string, number> = {
  "bcbs-ny":      0.82,
  "aetna":        0.78,
  "cigna":        0.75,
  "unitedhealth": 0.80,
  "humana":       0.71,
  "medicare":     0.90,
  "medicaid":     0.88,
  "unknown":      0.65,
};

const DENIAL_REASONS = [
  "Not medically necessary per payer guidelines",
  "Service requires specialist referral first",
  "Diagnosis code does not support requested CPT",
  "Duplicate request within 30 days",
  "Plan benefit exclusion",
  "Missing clinical documentation",
];

function getApprovalRate(payer: string): number {
  return PAYER_APPROVAL_RATES[payer.toLowerCase()] ?? 0.65;
}

export function buildPARequest(input: {
  caseId: string;
  diagnosis: string;
  cpt?: string;
  icd10?: string;
  payer?: string;
  patientId?: string;
  urgency?: "routine" | "urgent" | "emergent";
}): PriorAuthRequest {
  const paId = `PA-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const now  = new Date().toISOString();
  const urgency = input.urgency ?? "routine";
  const decisionHours = urgency === "emergent" ? 4 : urgency === "urgent" ? 24 : 72;

  const req: PriorAuthRequest = {
    paId,
    caseId:    input.caseId,
    diagnosis: input.diagnosis,
    cpt:       input.cpt   ?? "99213",
    icd10:     input.icd10 ?? "J06.9",
    payer:     input.payer ?? "unknown",
    patientId: input.patientId ?? "pt-unknown",
    urgency,
    status:    "pending",
    submittedAt: now,
    updatedAt:   now,
    estimatedDecisionHours: decisionHours,
  };

  store.set(paId, req);
  return req;
}

export async function submitPA(paId: string): Promise<PriorAuthRequest> {
  const req = store.get(paId);
  if (!req) throw new Error(`PA not found: ${paId}`);

  req.status    = "submitted";
  req.authId    = `AUTH-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  req.updatedAt = new Date().toISOString();
  store.set(paId, req);

  logMetric("pa.submitted", 1, "throughput", { payer: req.payer });

  // Simulate async payer decision (resolves quickly in dev, mimics hours in prod)
  const delay = process.env.NODE_ENV === "production" ? 0 : 3_000;
  setTimeout(() => simulatePayerDecision(paId), delay);

  return req;
}

async function simulatePayerDecision(paId: string): Promise<void> {
  const req = store.get(paId);
  if (!req || req.status !== "submitted") return;

  const rate = getApprovalRate(req.payer);
  const approved = Math.random() < rate;

  req.status     = approved ? "approved" : "denied";
  req.decisionAt = new Date().toISOString();
  req.updatedAt  = req.decisionAt;
  if (!approved) {
    req.denialReason = DENIAL_REASONS[Math.floor(Math.random() * DENIAL_REASONS.length)];
  }
  store.set(paId, req);

  logMetric("pa.decision", 1, "throughput", { payer: req.payer, outcome: req.status });
  console.log(`[PriorAuth] ${paId} → ${req.status} (${req.payer})`);
}

export async function appealPA(paId: string, notes: string): Promise<PriorAuthRequest> {
  const req = store.get(paId);
  if (!req) throw new Error(`PA not found: ${paId}`);
  if (req.status !== "denied") throw new Error(`Can only appeal denied PAs`);

  req.status      = "appealing";
  req.appealNotes = notes;
  req.updatedAt   = new Date().toISOString();
  store.set(paId, req);

  setTimeout(() => {
    const r = store.get(paId);
    if (!r) return;
    r.status     = Math.random() < 0.55 ? "appealed_approved" : "denied";
    r.decisionAt = new Date().toISOString();
    r.updatedAt  = r.decisionAt;
    store.set(paId, r);
    logMetric("pa.appeal_decision", 1, "throughput", { outcome: r.status });
  }, 2_000);

  return req;
}

export function getPA(paId: string): PriorAuthRequest | undefined {
  return store.get(paId);
}

export function getAllPAs(limit = 50): PriorAuthRequest[] {
  return Array.from(store.values())
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .slice(0, limit);
}

export function getPAStats() {
  const all = Array.from(store.values());
  const byStatus = all.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const byPayer  = all.reduce((acc, r) => {
    acc[r.payer] = (acc[r.payer] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const approvalRate = all.length
    ? (all.filter(r => r.status === "approved" || r.status === "appealed_approved").length / all.length)
    : 0;
  return { total: all.length, byStatus, byPayer, approvalRate };
}

// Seed with realistic example PAs
(function seed() {
  const examples = [
    { caseId: "c-001", diagnosis: "Strep Pharyngitis", cpt: "87880", icd10: "J02.0", payer: "bcbs-ny",      urgency: "routine"  as const },
    { caseId: "c-002", diagnosis: "Acute Otitis Media", cpt: "69436", icd10: "H66.90", payer: "aetna",      urgency: "urgent"   as const },
    { caseId: "c-003", diagnosis: "Viral URI", cpt: "99213",          icd10: "J06.9",  payer: "cigna",      urgency: "routine"  as const },
    { caseId: "c-004", diagnosis: "Influenza A", cpt: "87804",        icd10: "J09.X1", payer: "unitedhealth", urgency: "urgent" as const },
  ];
  for (const e of examples) {
    const req = buildPARequest({ ...e, patientId: `pt-${e.caseId}` });
    setTimeout(() => submitPA(req.paId).catch(() => {}), 500);
  }
})();
