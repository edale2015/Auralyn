# All 20 Claude Review Packets — Med-Scribe
# Copy each block between the ═══ dividers and paste it as a single Claude message.
# Bugs already fixed in our codebase are marked ✅ FIXED — send anyway to get Claude's version for comparison.

---

# HOW TO USE

Paste the entire block (including the header lines) as one message to Claude.
After Claude responds, ask a follow-up: **"What did the original have that your version removed or changed? Is anything from the original intentional?"**
That follow-up catches cases where Claude simplified something that was actually required.

---
---

# ═══════════════════════════════════════════════════
# PACKET 1 — Audit Chain Integrity  [HIGHEST PRIORITY]
# ═══════════════════════════════════════════════════

**Block name:** Audit Chain Integrity

**What this block does:**
Maintains a SHA-256 hash chain across all clinical audit log entries so any tampering is detectable. `hashChain.ts` advances the chain and verifies individual links. `auditLogger.ts` writes every step of every clinical decision to the DB with chain hashes. `auditVerifier.ts` does batch Merkle-root spot-checking for FDA/OCR compliance.

**Runtime context:** TypeScript / Express / PostgreSQL / Drizzle ORM / Node.js crypto

**Constraints:**
- Preserve all chain math — do not weaken audit guarantees
- Do not remove the timingSafeEqual comparison
- This block is FDA 21 CFR Part 11 and HIPAA §164.312(b) relevant
- Do not invent new external dependencies

**Known issues to fix (our codebase already fixed these — we want Claude's version for comparison):**
1. `lastHash` lived in memory only — server restart silently broke the chain (✅ FIXED: we now seed from DB)
2. `JSON.stringify` key order is insertion-order dependent — same logical entry could produce different hashes across restarts or JS engines (✅ FIXED: we now sort keys)
3. `timingSafeEqual` throws if buffer lengths differ — fixed with length guard

**Relevant types:**
```typescript
// auditLogs table columns: id, traceId, step, input (jsonb), output (jsonb),
// metadata (jsonb), hash (text), prevHash (text), createdAt (timestamp)
```

**Original code:**

```typescript
// server/audit/hashChain.ts
import crypto from "crypto";

let lastHash = "GENESIS";

export function computeChainHash(prevHash: string, entry: Record<string, unknown>): string {
  const content = prevHash + JSON.stringify(entry);
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function advanceChain(entry: Record<string, unknown>): { hash: string; prevHash: string } {
  const prevHash = lastHash;
  const hash = computeChainHash(prevHash, entry);
  lastHash = hash;
  return { hash, prevHash };
}

export function getCurrentChainHead(): string { return lastHash; }

export function verifyChainLink(entry: Record<string, unknown>, prevHash: string, claimedHash: string): boolean {
  const expected = computeChainHash(prevHash, entry);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(claimedHash, "hex"));
  } catch { return false; }
}
```

```typescript
// server/audit/auditLogger.ts
import { db } from "../db";
import { auditLogs } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { advanceChain } from "./hashChain";

export function createTraceId(): string { return uuidv4(); }

export async function auditStep({ traceId, step, input, output, metadata = {} }: {
  traceId: string; step: string; input: any; output: any; metadata?: Record<string, any>;
}): Promise<void> {
  try {
    const entry = { traceId, step, input: input ?? null, output: output ?? null, metadata };
    const { hash, prevHash } = advanceChain(entry as Record<string, unknown>);
    await db.insert(auditLogs).values({ traceId, step, input: input ?? null, output: output ?? null, metadata, hash, prevHash });
  } catch (e) {
    console.error("[AuditLogger] Failed to write audit step:", e);
  }
}

export async function getTraceSteps(traceId: string) {
  try {
    return await db.select().from(auditLogs).where(eq(auditLogs.traceId, traceId)).orderBy(auditLogs.createdAt);
  } catch (e) { console.error("[AuditLogger] getTraceSteps error:", e); return []; }
}
```

**Claude prompt:**
```
Review and reimplement this audit chain block from scratch.

Specific questions:
1. What happens to the chain if the server restarts? How do you fix it?
2. Is JSON.stringify deterministic enough for hash inputs? What breaks if it isn't?
3. Can timingSafeEqual throw? When and why?
4. Is there a race condition if two auditStep() calls happen concurrently?
5. What happens if the DB write succeeds but the in-memory hash has already advanced?

Output:
A) Bugs found
B) Rewritten hashChain.ts and auditLogger.ts
C) What your version changes vs the original
D) Test cases for each failure scenario
```

---

# ═══════════════════════════════════════════════════
# PACKET 2 — Auth + RBAC Enforcement
# ═══════════════════════════════════════════════════

**Block name:** Auth + RBAC Enforcement

**What this block does:**
`unifiedAuth.ts` issues and verifies JWTs. `rbacService.ts` maps roles to permissions. `requirePhysician.ts` is a route middleware that enforces physician-level access. The bug: these two verification paths read the JWT secret differently and use different token claim shapes, meaning a token issued by one path might behave unexpectedly when checked by the other.

**Runtime context:** TypeScript / Express / jsonwebtoken / PostgreSQL

**Known issues:**
- `requirePhysician.ts` reads `process.env.JWT_SECRET` directly instead of using ENV config (✅ FIXED)
- Token created by `signAccessToken` has `{ id, email, role }` but `requirePhysician` expects `{ sub, physician?, role? }` — shape mismatch (✅ FIXED: unified to one verifier)
- `admin` role was not accepted by `requirePhysician` even though admins should access physician endpoints

**Original code:**

```typescript
// server/auth/unifiedAuth.ts
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";

export type AuthRole = "admin" | "physician" | "reviewer" | "staff";

export interface AuthUser {
  id: string; email: string; role: AuthRole; clinicId?: string;
}
export interface AuthTokenPayload extends AuthUser { iat?: number; exp?: number; }

function getJwtSecret(): string {
  const secret = ENV.JWT_SECRET || (ENV.NODE_ENV !== "production" ? "dev-jwt-secret-DO-NOT-USE-IN-PROD" : undefined);
  if (!secret) throw new Error("❌ JWT_SECRET is not configured");
  return secret;
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(user as object, getJwtSecret(), { expiresIn: "12h" });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
}
```

```typescript
// server/auth/requirePhysician.ts — ORIGINAL (buggy)
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

type PhysicianClaims = { sub: string; role?: string; physician?: boolean; physicianId?: string; };

export function requirePhysician(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Missing bearer token" }); return; }
  try {
    const token = auth.slice("Bearer ".length);
    const isProd = process.env.NODE_ENV === "production";
    // BUG: reads process.env directly instead of ENV config; different from unifiedAuth
    const secret = process.env.JWT_SECRET || (isProd ? undefined : "dev-jwt-secret-DO-NOT-USE-IN-PROD");
    if (!secret) { res.status(500).json({ error: "JWT_SECRET not configured" }); return; }
    const decoded = jwt.verify(token, secret) as PhysicianClaims;
    // BUG: decoded.physician is never set by signAccessToken — it only sets role
    if (!decoded.physician && decoded.role !== "physician") {
      res.status(403).json({ error: "Physician access required" });
      return;
    }
    req.physician = decoded;
    next();
  } catch { res.status(401).json({ error: "Invalid or expired token" }); }
}
```

```typescript
// server/auth/rbacService.ts
import type { UserRole } from "../types/auth";
export type Permission = "*" | "clinical:run" | "clinical:override" | "clinical:view" |
  "view:analytics" | "view:dashboard" | "billing:view" | "billing:manage" | "tenant:manage" |
  "user:manage" | "ehr:read" | "ehr:write" | "deployment:manage" | "audit:view";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ["*"],
  physician: ["clinical:run","clinical:override","clinical:view","view:analytics","view:dashboard","ehr:read","ehr:write","audit:view"],
  nurse: ["clinical:run","clinical:view","view:dashboard","ehr:read"],
  staff: ["billing:view","view:dashboard","audit:view"],
  patient: ["clinical:view"],
  viewer: ["view:analytics","view:dashboard"],
};

export class RBACService {
  can(role: UserRole, action: Permission): boolean {
    const perms = ROLE_PERMISSIONS[role];
    if (!perms) return false;
    return perms.includes("*") || perms.includes(action);
  }
  getPermissions(role: UserRole): Permission[] { return ROLE_PERMISSIONS[role] || []; }
}
export const rbacService = new RBACService();
```

**Claude prompt:**
```
Review this auth + RBAC block. There are two JWT verification paths that may not agree.

Specific questions:
1. What token shape does signAccessToken produce? What shape does requirePhysician expect?
   Are they the same? What breaks if they differ?
2. Is there a scenario where an expired token passes one middleware but fails the other?
3. The RBAC service uses includes("*") for admin — is that correct for all permission checks?
4. Is the fallback dev secret safe? What if NODE_ENV is misconfigured?

Output:
A) Bugs and mismatches found
B) Rewritten requirePhysician.ts using verifyAccessToken (one verification path only)
C) Rewritten rbacService.ts if you find issues
D) Test cases: valid physician token, valid admin token, expired token, wrong role, missing token
```

---

# ═══════════════════════════════════════════════════
# PACKET 3 — Safety Gates + Escalation
# ═══════════════════════════════════════════════════

**Block name:** Safety Gates + Escalation

**What this block does:**
Three-layer safety system. `safetyGate.ts` blocks decisions with risk > 0.6 and hard-stops at 0.95. `escalationGuard.ts` monitors the hourly ER referral rate and flags when it exceeds 40% or 120/hour. `guardrails.ts` validates individual clinical actions (invasive procedures, consent requirements).

**Runtime context:** TypeScript / Express / in-memory state (Redis not used here)

**Known issues:**
- `escalationGuard.ts` window state is in-memory: server restart resets counters, multi-instance deployments each track separately, so the rate monitor is unreliable (no fix applied — needs Redis; include your fix)
- `safetyGate.ts` thresholds are hardcoded magic numbers — not configurable without a deploy
- No test for `riskScore < 0` or `riskScore > 1` inputs

**Original code:**

```typescript
// server/clinical/escalationGuard.ts
import { logSecureEvent } from "../ops/secureAudit";

interface EscalationWindow { windowMs: number; erCount: number; totalCount: number; lastReset: number; }

const window: EscalationWindow = { windowMs: 60 * 60 * 1000, erCount: 0, totalCount: 0, lastReset: Date.now() };
const ER_RATE_THRESHOLD = 0.40;
const MAX_ER_HOURLY = 120;

function resetWindowIfNeeded() {
  if (Date.now() - window.lastReset > window.windowMs) {
    window.erCount = 0; window.totalCount = 0; window.lastReset = Date.now();
  }
}

export function recordDisposition(disposition: string): void {
  resetWindowIfNeeded();
  window.totalCount++;
  if (disposition === "ER_NOW") window.erCount++;
}

export function escalationControl(input?: { erRate?: number }): EscalationAdjustment {
  resetWindowIfNeeded();
  const liveRate = window.totalCount > 0 ? window.erCount / window.totalCount : 0;
  const erRate = input?.erRate ?? liveRate;
  if (erRate > ER_RATE_THRESHOLD || window.erCount > MAX_ER_HOURLY) {
    logSecureEvent({ type: "ESCALATION_CONTROL", action: "REDUCE", erRate, hourlyErCount: window.erCount, factor: -0.2 });
    return { adjust: true, factor: -0.2, reason: erRate > ER_RATE_THRESHOLD ? "over-escalation-rate" : "hourly-er-cap-exceeded", currentRate: +erRate.toFixed(3), hourlyErCount: window.erCount, recommendation: "Review current triage parameters." };
  }
  return { adjust: false, factor: 0, reason: "within-normal-range", currentRate: +erRate.toFixed(3), hourlyErCount: window.erCount, recommendation: "No escalation adjustment needed." };
}
```

```typescript
// server/clinical/safetyGate.ts
import { auditLog } from "../security/auditLogger";

export interface SafetyGateInput { riskScore: number; uncertainty?: number; action?: string; patientId?: string; actorId?: string; }
export interface SafetyGateResult { allowed: boolean; reason?: string; requiredAction?: "physician_review" | "confidence_boost" | "hard_stop"; }

const RISK_THRESHOLD = 0.6;
const UNCERTAINTY_THRESHOLD = 0.3;
const HARD_STOP_THRESHOLD = 0.95;

export function clinicalSafetyGate(decision: SafetyGateInput): SafetyGateResult {
  if (decision.riskScore >= HARD_STOP_THRESHOLD) {
    auditLog({ actor: decision.actorId ?? "system", action: "safety_gate_hard_stop", patientId: decision.patientId, riskScore: decision.riskScore, details: { reason: "Extreme risk score" } });
    return { allowed: false, reason: "Extreme risk — hard stop. Immediate physician escalation required.", requiredAction: "hard_stop" };
  }
  if (decision.riskScore > RISK_THRESHOLD) {
    auditLog({ actor: decision.actorId ?? "system", action: "safety_gate_blocked", patientId: decision.patientId, riskScore: decision.riskScore, details: { reason: "Risk score exceeds threshold" } });
    return { allowed: false, reason: "Requires physician review", requiredAction: "physician_review" };
  }
  if ((decision.uncertainty ?? 0) > UNCERTAINTY_THRESHOLD) {
    auditLog({ actor: decision.actorId ?? "system", action: "safety_gate_blocked", patientId: decision.patientId, riskScore: decision.riskScore, details: { reason: "Uncertainty too high", uncertainty: decision.uncertainty } });
    return { allowed: false, reason: "Low confidence — additional data required", requiredAction: "confidence_boost" };
  }
  auditLog({ actor: decision.actorId ?? "system", action: "safety_gate_passed", patientId: decision.patientId, riskScore: decision.riskScore });
  return { allowed: true };
}
```

**Claude prompt:**
```
Review and reimplement this safety gate block from scratch. This is patient-safety-critical — never weaken blocking behavior without explicitly calling it out.

Specific questions:
1. The escalation window is in-memory. What breaks in production with multiple server instances or restarts? Reimplement using a Redis-compatible interface (provide a mock for testing).
2. Are the hardcoded thresholds (0.6, 0.3, 0.95) a safety or maintenance risk? How should they be managed?
3. What happens with riskScore < 0 or riskScore > 1? Is there input validation?
4. Can an unhandled exception inside clinicalSafetyGate cause a decision to pass when it should block?
5. Is the escalation "factor: -0.2" adjustment safe — what is it adjusting exactly?

Output:
A) Risk analysis
B) Rewritten safetyGate.ts (fail-closed, input validated)
C) Rewritten escalationGuard.ts (Redis-backed or injectable store)
D) Boundary tests: riskScore=0, 0.6, 0.6001, 0.95, 1.0, 1.5, -0.1
```

---

# ═══════════════════════════════════════════════════
# PACKET 4 — Startup Assertions + Runtime Safety
# ═══════════════════════════════════════════════════

**Block name:** Startup Assertions + Runtime Safety

**What this block does:**
Four startup checks that throw on bad config before the server accepts traffic. `assertProductionSafe` blocks banned placeholder secrets. `assertRuntimeModes` blocks dangerous flags in production. `assertQueueReady` pings Redis. `startupChecks` returns a structured check array (non-fatal, logged).

**Runtime context:** TypeScript / Express / Node.js / PostgreSQL / Redis

**Known issues:**
- `startupChecks.ts` checked that `DATABASE_URL` was *set* but never verified the DB was actually reachable (✅ FIXED: now runs `SELECT 1`)
- `JWT_SECRET` was only checked for presence, not entropy — a 4-char secret passes (✅ FIXED: now requires ≥32 chars in production)
- `assertProductionSafe` does not check `DATABASE_URL` at all

**Original startupChecks.ts:**
```typescript
import { ENV } from "./env"
export type CheckResult = { name: string; ok: boolean; detail: string }
export async function runStartupChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  results.push({ name: "SESSION_SECRET", ok: ENV.SESSION_SECRET.length >= 12, detail: ENV.SESSION_SECRET.length >= 12 ? "Set" : "Too short or missing" })
  results.push({ name: "OPENAI_API_KEY", ok: !!ENV.OPENAI_API_KEY, detail: ENV.OPENAI_API_KEY ? "Set" : "Missing — AI features disabled" })
  results.push({ name: "TWILIO_AUTH_TOKEN", ok: !!ENV.TWILIO_AUTH_TOKEN, detail: ENV.TWILIO_AUTH_TOKEN ? "Set" : "Missing — WhatsApp disabled" })
  results.push({ name: "TELEGRAM_BOT_TOKEN", ok: !!ENV.TELEGRAM_BOT_TOKEN, detail: ENV.TELEGRAM_BOT_TOKEN ? "Set" : "Missing — Telegram disabled" })
  results.push({ name: "EHR_ENDPOINT", ok: !!ENV.EHR_ENDPOINT, detail: ENV.EHR_ENDPOINT ? `Configured: ${ENV.EHR_ENDPOINT}` : "Not set — using mock adapter" })
  return results
}
```

**Original assertProductionSafe.ts:**
```typescript
import { ENV } from "./env";
const BANNED_VALUES = new Set(["dev-secret","dev-secret-change-in-prod","dev-jwt-secret","changeme","password","physician123","admin123","demo-password","replace-with-a-long-random-secret","replace-with-a-different-long-random-secret","replace-with-a-strong-password"]);
function assertRequired(name: string, value: string | undefined) {
  if (!value || value.trim() === "") throw new Error(`❌ [STARTUP FATAL] Missing required production secret: ${name}`);
}
function assertNotBanned(name: string, value: string | undefined) {
  if (!value) return;
  if (BANNED_VALUES.has(value)) throw new Error(`❌ [STARTUP FATAL] Unsafe placeholder value detected for: ${name}`);
}
export function assertProductionSafe() {
  if (ENV.NODE_ENV !== "production") return;
  assertRequired("JWT_SECRET", ENV.JWT_SECRET);
  assertRequired("SESSION_SECRET", ENV.SESSION_SECRET);
  assertRequired("MD_PASSWORD", ENV.MD_PASSWORD);
  assertRequired("CLINICIAN_PASSWORD", ENV.CLINICIAN_PASSWORD);
  assertNotBanned("JWT_SECRET", ENV.JWT_SECRET);
  assertNotBanned("SESSION_SECRET", ENV.SESSION_SECRET);
  assertNotBanned("MD_PASSWORD", ENV.MD_PASSWORD);
  assertNotBanned("CLINICIAN_PASSWORD", ENV.CLINICIAN_PASSWORD);
  if (process.env.DEMO_USERS === "true") throw new Error("❌ [STARTUP FATAL] DEMO_USERS cannot be enabled in production");
}
```

**Claude prompt:**
```
Review and reimplement this startup safety block from scratch.

Specific questions:
1. runStartupChecks checks that env vars are set — but does it verify the DB is actually reachable? Add a real connectivity test.
2. JWT_SECRET with 4 characters passes current checks. What should the minimum entropy requirement be?
3. assertProductionSafe never checks DATABASE_URL. Add it.
4. What other production-safety checks are missing from a HIPAA/FDA SaMD perspective?
5. If assertQueueReady throws, does the server refuse to start? Trace the call chain.

Output:
A) Missing checks you found
B) Rewritten startupChecks.ts (async, DB ping included, entropy check)
C) Rewritten assertProductionSafe.ts (DATABASE_URL + entropy)
D) Test cases for each assertion
```

---

# ═══════════════════════════════════════════════════
# PACKET 5 — Billing Denial + Claim Scrubbing
# ═══════════════════════════════════════════════════

**Block name:** Billing Denial + Claim Scrubbing

**What this block does:**
`claimScrubber.ts` validates a claim object before submission (ICD-10/CPT present, documentation requirements, modifier checks, future date). `denialPredictionEngine.ts` scores denial risk 0-1 with reasons. `preSubmission.ts` orchestrates both plus prior-auth and HCC detection.

**Runtime context:** TypeScript / Express / no external dependencies

**Known issues:**
- CPT pricing in `denialPredictionEngine.ts` is hardcoded — real reimbursements vary by payer, state, and year
- `riskScore` can theoretically go above 1.0 before the `Math.min(risk, 1)` clamp — intermediate calculations are unbounded
- No validation that ICD-10 format is actually valid (e.g. "ABC" passes)
- `dateOfService` check uses `new Date(string)` which accepts invalid dates on some inputs

**Original code:**
```typescript
// server/billing/claimScrubber.ts
export interface ClaimInput { icd10?: string; cpt?: string; documentation?: string; modifiers?: string[]; priorAuthRef?: string; dateOfService?: string; payerId?: string; patientId?: string; provider?: string; }
export interface ScrubResult { valid: boolean; issues: string[]; warnings: string[]; }

const PRIOR_AUTH_REQUIRED_CPTS = new Set(["99285","99283","99291","27447","27130","22612"]);
const MODIFIER_REQUIRED: Record<string, string> = { "99291": "GC" };

export function scrubClaim(claim: ClaimInput): ScrubResult {
  const issues: string[] = []; const warnings: string[] = [];
  if (!claim.icd10) issues.push("Missing diagnosis code (ICD-10)");
  if (!claim.cpt)   issues.push("Missing procedure code (CPT)");
  if (!claim.patientId) issues.push("Missing patient ID");
  if (!claim.provider)  warnings.push("No provider specified");
  if (claim.cpt === "99285" && !claim.documentation) issues.push("CPT 99285 (high-acuity ED) requires supporting documentation");
  if (claim.cpt && MODIFIER_REQUIRED[claim.cpt]) {
    const required = MODIFIER_REQUIRED[claim.cpt];
    if (!(claim.modifiers ?? []).includes(required)) warnings.push(`CPT ${claim.cpt} typically requires modifier ${required}`);
  }
  if (claim.cpt && PRIOR_AUTH_REQUIRED_CPTS.has(claim.cpt) && !claim.priorAuthRef) warnings.push(`CPT ${claim.cpt} usually requires prior authorization`);
  if (claim.dateOfService) {
    const dos = new Date(claim.dateOfService);
    if (isNaN(dos.getTime())) issues.push(`Invalid dateOfService: "${claim.dateOfService}"`);
    else if (dos > new Date()) issues.push("dateOfService is in the future");
  }
  return { valid: issues.length === 0, issues, warnings };
}
```

```typescript
// server/billing/denialPredictionEngine.ts (excerpt)
const CPT_PRICING: Record<string, number> = { "99213": 75, "99203": 90, "99214": 110, "99215": 150, "99284": 250, "99285": 400, "99441": 40, "99443": 85 };

export function predictDenial(bundle: { coding: AutoCodeResult; riskClassification: RiskClassification; encounter: { complaint: string; diagnosis: string; triage: string; confidence?: number; }; clinicalNote: { hpi: string; assessment: string; plan: string; }; }): DenialPrediction {
  let risk = 0;
  const reasons: string[] = []; const recommendations: string[] = [];
  if (!bundle.coding.primary.mapped) { risk += 0.35; reasons.push("Primary ICD-10 unmapped (R69)"); recommendations.push("Map to specific ICD-10 code"); }
  const unmappedDiffs = bundle.coding.differentials.filter((d) => !d.mapped);
  if (unmappedDiffs.length > 0) { risk += 0.05 * unmappedDiffs.length; reasons.push(`${unmappedDiffs.length} differential(s) unmapped`); }
  const cptCode = bundle.coding.cpt.code;
  const highCPTs = ["99215","99285","99284"];
  if (highCPTs.includes(cptCode) && (bundle.encounter.confidence ?? 1) < 0.7) { risk += 0.25; reasons.push(`High-complexity CPT (${cptCode}) with low confidence`); }
  risk = Math.min(risk, 1);
  const estimatedRevenue = CPT_PRICING[cptCode] || 75;
  const estimatedRevenueImpact = Math.round(estimatedRevenue * risk * 100) / 100;
  let riskLevel: "low" | "medium" | "high" = risk <= 0.2 ? "low" : risk <= 0.5 ? "medium" : "high";
  return { riskScore: Math.round(risk * 1000) / 1000, riskLevel, reasons, recommendations, estimatedRevenueImpact };
}
```

**Claude prompt:**
```
Review and reimplement this billing validation + denial prediction block.

Specific questions:
1. The CPT pricing table is hardcoded — where should it live instead, and how do you handle unknown CPTs?
2. Is ICD-10 format validated (e.g. "A01.1" vs "ABC" vs "")? Add a regex check.
3. `new Date("some string")` behavior: what inputs pass the isNaN check but are still wrong dates?
4. Risk score addition is unbounded before the Math.min clamp — what's the highest possible pre-clamp value and is that a problem?
5. preSubmission.ts returns `approved: boolean` — but what does "approved" mean when only warnings exist and no hard issues?

Output:
A) Bugs found
B) Rewritten claimScrubber.ts (ICD-10 format validation, safe date parse)
C) Rewritten predictDenial (configurable pricing, bounded intermediate risk)
D) Test cases: missing ICD-10, future date, invalid date string, high CPT with low confidence, all-clear claim
```

---

# ═══════════════════════════════════════════════════
# PACKET 6 — Bayesian Differential Engine
# ═══════════════════════════════════════════════════

**Block name:** Bayesian Differential Diagnosis Engine

**What this block does:**
Naive Bayes classifier for differential diagnosis. Given a set of observed patient symptoms, it updates prior probabilities P(diagnosis) using per-symptom likelihoods P(symptom|diagnosis) and returns a ranked differential list with confidence bands.

**Runtime context:** TypeScript / no external dependencies / pure function

**Known issues:**
- Naive Bayes assumes symptom independence — in medicine symptoms are correlated (fever + chills always co-occur in flu). This causes over-confidence on co-occurring symptoms.
- No normalization guard: if all posteriors are 0 (no matching priors), the division would be 0/0 — this is handled but silently returns empty
- No cap on the posterior: floating point rounding edge cases when all features are absent

**Relevant types:**
```typescript
export interface DiagnosisPrior {
  diagnosis: string;
  baseProbability: number;           // P(D) — unconditional prevalence
  featureLikelihoods: Record<string, number>;  // P(symptom | D)
  ruleId?: string; version?: number; tableName?: string;
}
export interface DifferentialResult {
  diagnosis: string; posterior: number; confidence: "high" | "moderate" | "low";
  matchedFeatures: string[]; source?: "KB_DB" | "FALLBACK_HARDCODED";
}
```

**Original algorithm (core Bayes update):**
```typescript
export function runDifferential(symptoms: string[], priors: DiagnosisPrior[]): DifferentialResult[] {
  if (!symptoms.length || !priors.length) return [];

  const scored = priors.map(prior => {
    let logScore = Math.log(prior.baseProbability);
    const matchedFeatures: string[] = [];

    for (const symptom of symptoms) {
      const likelihood = prior.featureLikelihoods[symptom];
      if (likelihood !== undefined) {
        logScore += Math.log(Math.max(likelihood, 0.001));
        matchedFeatures.push(symptom);
      } else {
        // Symptom absent from likelihood table — Laplace smoothing
        logScore += Math.log(0.01);
      }
    }
    return { diagnosis: prior.diagnosis, logScore, matchedFeatures, prior };
  });

  const maxLog = Math.max(...scored.map(s => s.logScore));
  const expScores = scored.map(s => ({ ...s, expScore: Math.exp(s.logScore - maxLog) }));
  const total = expScores.reduce((sum, s) => sum + s.expScore, 0);

  return expScores
    .map(s => ({
      diagnosis: s.diagnosis,
      posterior: total > 0 ? s.expScore / total : 0,
      confidence: s.expScore / total > 0.5 ? "high" : s.expScore / total > 0.2 ? "moderate" : "low" as any,
      matchedFeatures: s.matchedFeatures,
    }))
    .sort((a, b) => b.posterior - a.posterior);
}
```

**Claude prompt:**
```
Review and reimplement this Bayesian differential diagnosis engine.

Specific questions:
1. Naive Bayes assumes feature independence. In medicine, fever + chills are correlated. How does this cause over-confidence, and what's the simplest mitigation that doesn't require retraining?
2. What happens when a symptom appears in zero prior likelihood tables? The current code uses log(0.01) — is this appropriate? What does it imply clinically?
3. The log-sum-exp trick (subtracting maxLog before exp) prevents underflow — is it implemented correctly?
4. Confidence thresholds (>0.5 = high, >0.2 = moderate) are hardcoded. Are these medically appropriate?
5. What does posterior=0 for all results mean and when does it happen?

Output:
A) Statistical weaknesses found
B) Rewritten runDifferential with fixes and comments explaining each change
C) Suggested correlation dampening approach
D) Test cases: all symptoms match one prior, no symptoms match any prior, single symptom, 20 symptoms
```

---

# ═══════════════════════════════════════════════════
# PACKET 7 — Channel / Message Orchestration
# ═══════════════════════════════════════════════════

**Block name:** Channel Message Orchestration + Chat Intake Engine

**What this block does:**
`chatIntakeEngine.ts` handles the web chat intake flow — parses a complaint from free text, asks follow-up questions, runs the patient flow, and returns a structured reply. `conversationState.ts` defines the state shape shared across all channels (web, WhatsApp, Telegram).

**Runtime context:** TypeScript / Express / in-memory session store

**Known issues:**
- `parseComplaint` used `string.includes()` which matches substrings: "ear" matches "fear", "hear", "unclear"; "sore" matches "sore muscles" (not throat); "burning" alone maps to UTI (burning eyes, heartburn) (✅ FIXED: now uses RegExp with word boundaries)
- Complaint parser order was priority — "sore throat + cough" always mapped to sore_throat because that branch came first

**Original parseComplaint (buggy):**
```typescript
function parseComplaint(text?: string): string | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (t.includes("throat") || t.includes("sore")) return "sore_throat";
  if (t.includes("cough")) return "cough";
  if (t.includes("uti") || t.includes("burning") || t.includes("urination")) return "uti_simple";
  if (t.includes("rash") || t.includes("skin")) return "rash";
  if (t.includes("ear")) return "ear_pain";
  if (t.includes("headache") || t.includes("head ache")) return "headache_mild";
  if (t.includes("cold") || t.includes("uri") || t.includes("congestion")) return "uri";
  return undefined;
}
```

**conversationState.ts:**
```typescript
export interface ConversationState {
  conversationId: string; channel: Channel; externalUserId: string;
  caseId: string | null; encounterId: number | null; patientId: number | null;
  routingState: string; lastQuestionIdAsked: string | null;
  requiredMissing: string[]; toneProfile: string;
  lastNMessages: { from: "patient" | "system"; text: string; ts: string }[];
  frictionScore: number; frictionEvents: number; lastFrictionAt: string | null;
  isStaff: boolean; isStopped: boolean; stopReason: string | null; createdAt: string;
}
```

**Claude prompt:**
```
Review this chat intake + complaint parsing block.

Specific questions:
1. List every false positive the original parseComplaint() would produce (e.g. "I'm burning up" → uti_simple, "I can't hear you" → ear_pain).
2. Rewrite parseComplaint using RegExp with word boundaries to eliminate substring false matches.
3. The conversation state has frictionScore as a number — how is friction measured and is it accumulated or reset correctly across sessions?
4. What happens if runPatientFlow throws? Is the error swallowed and is that safe?
5. The multimodalContext variable is set but only used as session.answers.multimodal — is it actually used downstream?

Output:
A) False positives list for original parser
B) Rewritten parseComplaint with RegExp patterns and test cases
C) Assessment of conversationState — any fields that should be in DB vs in-memory?
D) Error handling improvements for runPatientFlow
```

---

# ═══════════════════════════════════════════════════
# PACKET 8 — Complaint Lab Feature Slice
# ═══════════════════════════════════════════════════

**Block name:** Complaint Lab — Frontend + Sim API

**What this block does:**
`ComplaintLabPage.tsx` is a three-panel React workbench: select a complaint, run async simulations (up to 500 cases), watch progress, then edit KB rules (questions, differentials, red flags) inline. The async sim uses `POST /api/ci/sim/start` + polling `GET /api/ci/sim/status/:jobId`.

**Runtime context:** React 18 / TanStack Query v5 / TypeScript / Shadcn UI / Express backend

**Known issues:**
- The KB editor sub-components use raw `fetch()` instead of the app's query client — cache invalidation won't fire for shared data
- `useEffect` for polling job completion has `activeJobId` and `results` as deps but `toast` is a stable ref — could cause stale closure if `toast` were ever recreated
- The `pollRef` import from `useRef` is defined but never used (the polling is done via `refetchInterval` on the query instead)

**Original code (key section):**
```typescript
// client/src/pages/ComplaintLabPage.tsx — KB editor uses raw fetch
const { data: questions = [], isLoading } = useQuery<KbQuestion[]>({
  queryKey: ["/api/kb/questions", complaintId],
  queryFn: () => fetch(`/api/kb/questions?complaintId=${encodeURIComponent(complaintId)}`).then(r => r.json()),
  enabled: !!complaintId,
});

// Sim start mutation
const startSim = useMutation({
  mutationFn: () => apiRequest("POST", "/api/ci/sim/start", {
    complaint: selectedComplaint || "all",
    count: parseInt(count) || 50,
    difficulty,
    mode: "generated",
    label: `Lab: ${selectedComplaint || "all"} × ${count}`,
  }),
  onSuccess: (data: any) => {
    setActiveJobId(data.jobId);
    setResults(null);
  },
});

// Poll status
const { data: jobStatus } = useQuery<SimJob>({
  queryKey: ["/api/ci/sim/status", activeJobId],
  queryFn: () => fetch(`/api/ci/sim/status/${activeJobId}`).then(r => r.json()),
  enabled: !!activeJobId && !results,
  refetchInterval: activeJobId && !results ? 1500 : false,
});
```

**Claude prompt:**
```
Review this Complaint Lab frontend + simulation API slice.

Specific questions:
1. The KB editor uses raw fetch() instead of the app's query client. What breaks with cache invalidation? Rewrite using useQuery with apiRequest for consistency.
2. The pollRef is imported from useRef but never used — the polling is done via refetchInterval. Is this a dead variable? Remove it and simplify.
3. When the job completes, we fetch results with a raw fetch() inside useEffect. What are the risks (race conditions, component unmount mid-fetch)? Rewrite this fetch as a proper useQuery that activates on job completion.
4. The filter buttons (all/pass/fail) are local state — is there any reason this should be a URL param instead?
5. The three KB sub-editors (QuestionEditor, DifferentialsEditor, RedFlagsEditor) share almost identical structure. How would you abstract them?

Output:
A) Issues found
B) Rewritten ComplaintLabPage with apiRequest throughout and cleaned-up polling
C) Optional: abstract KB editor into a single generic component
D) Test scenarios: sim runs 0 cases, sim errors, KB add succeeds, KB add fails validation
```

---

# ═══════════════════════════════════════════════════
# PACKET 9 — Self-Improvement + Learning Loop
# ═══════════════════════════════════════════════════

**Block name:** Self-Improvement + Learning Loop

**What this block does:**
`selfImprove.ts` evaluates agent success rates and emits improvement actions when they fall below thresholds. `selfImprovementOrchestrator.ts` runs an improvement cycle and applies only "auto-approved" fixes. The critical governance question: what gates what gets auto-approved?

**Runtime context:** TypeScript / Express / in-memory state

**Known issues:**
- `selfImprovementOrchestrator.ts` applies fixes where `autoApprove === true` without any audit trail of *what* was changed or *who* approved it
- `selfImprove.ts` stores `improvementLog` in-memory — lost on restart
- `agentThresholds` record grows unboundedly — no eviction or size limit
- The `conservatism` adjustment has no cap — could increment indefinitely

**Original code:**
```typescript
// server/agents/selfImprove.ts
const improvementLog: ImprovementAction[] = [];
const agentThresholds: Record<string, Record<string, number>> = {};

export function evaluateAndImprove(): ImprovementAction[] {
  const stats = getAgentStats();
  const actions: ImprovementAction[] = [];
  for (const [agent, s] of Object.entries(stats)) {
    if (s.runs < 5) continue;
    if (s.successRate < 60) {
      actions.push({ agent, action: "threshold_adjustment", reason: `Success rate ${s.successRate}%`, timestamp: new Date().toISOString(), metric: { successRate: s.successRate, runs: s.runs } });
      if (!agentThresholds[agent]) agentThresholds[agent] = {};
      // BUG: conservatism increments unboundedly
      agentThresholds[agent].conservatism = (agentThresholds[agent].conservatism || 0) + 0.1;
      publish("selfimprove:adjustment", { agent, adjustment: "increased_conservatism" });
    }
  }
  improvementLog.push(...actions);
  if (improvementLog.length > 500) improvementLog.splice(0, improvementLog.length - 500);
  return actions;
}
```

```typescript
// server/agents/selfImprovementOrchestrator.ts
export async function runContinuousImprovement(): Promise<OrchestrationResult> {
  const cycleResult = runSelfImprovementCycle();
  // RISK: anything with autoApprove:true is applied without physician gate
  const approvedFixes = (cycleResult.fixes || []).filter((f: any) => f.autoApprove === true);
  const skippedFixes = (cycleResult.fixes || []).filter((f: any) => f.autoApprove !== true);
  return { cycleResult, appliedCount: approvedFixes.length, skippedCount: skippedFixes.length };
}
```

**Claude prompt:**
```
Review this self-improvement and learning loop. This is a governance-critical block — the system must never modify clinical logic without an explicit human approval gate.

Specific questions:
1. What prevents a bug in runSelfImprovementCycle from setting autoApprove:true on a clinical rule change?
2. The conservatism value increments on every cycle with no cap — what happens after 100 cycles of low performance?
3. improvementLog is in-memory — what important information is lost on restart?
4. Is there an audit record for every auto-approved fix? If not, how do you prove to an FDA auditor what changed and when?
5. Should there be a max number of auto-approved changes per time window?

Output:
A) Governance risks found
B) Rewritten selfImprove.ts (capped thresholds, DB-backed log)
C) Rewritten orchestrator with mandatory audit record for every applied fix
D) Test cases: 5-run minimum gate, auto-approve with audit, concurrent cycles
```

---

# ═══════════════════════════════════════════════════
# PACKET 10 — Governance + Compliance Routes
# ═══════════════════════════════════════════════════

**Block name:** Governance + Compliance Routes

**What this block does:**
`governanceCommandRoutes.ts` exposes audit events, policy snapshots, golden validation, and audit chain verification. `physicianCheckpoint.ts` gates ER_NOW / ER_URGENT / URGENT_CARE dispositions behind physician pre-approval with tier-specific timeouts.

**Runtime context:** TypeScript / Express / PostgreSQL / Drizzle ORM

**Known issues:**
- `governanceCommandRoutes.ts` uses `sql.raw(q)` with raw SQL strings — no parameterization for any of the queries, creating SQL injection surface even if callers are trusted
- The helper `qRow(q, params)` accepts params but the `q.replace(/\?/g, ...)` substitution is regex-based string replacement, not true parameterized queries

**Original helper code:**
```typescript
async function qRow<T = any>(q: string, params: any[] = []): Promise<T | undefined> {
  // BUG: this is string replacement, not parameterized queries
  const r = await db.execute(sql.raw(q.replace(/\?/g, (_, i) => `$${i + 1}`)));
  return ((r as any).rows ?? r)[0] as T | undefined;
}
async function qRows<T = any>(q: string): Promise<T[]> {
  // BUG: no params at all — pure raw SQL
  const r = await db.execute(sql.raw(q));
  return ((r as any).rows ?? r) as T[];
}
```

```typescript
// physicianCheckpoint.ts excerpt
export const DISPOSITIONS_REQUIRING_APPROVAL: DispositionTier[] = [
  DispositionTier.ER_NOW, DispositionTier.ER_URGENT, DispositionTier.URGENT_CARE,
];

// Tier-specific timeouts
const TIMEOUT_MS: Record<string, number> = {
  ER_NOW: 5 * 60 * 1000,
  ER_URGENT: 10 * 60 * 1000,
  URGENT_CARE: 20 * 60 * 1000,
};
```

**Claude prompt:**
```
Review this governance + compliance route block.

Specific questions:
1. The qRow/qRows helpers use sql.raw() with string templates. Why is this dangerous even in an internal admin route? How do you fix it without rewriting all queries to Drizzle ORM?
2. physicianCheckpoint.ts has tier-specific timeouts — what happens when a timeout expires? Does the disposition auto-escalate, auto-approve, or get stuck?
3. Are the governance routes protected by auth middleware? Trace how the router is mounted and whether requireRole is applied.
4. The audit chain verification endpoint — if verification fails, what is the response and what action does it trigger?
5. What's missing from a FDA 21 CFR Part 11 "electronic records" requirement that this block should cover?

Output:
A) SQL injection surfaces identified
B) Rewritten query helpers using proper Drizzle ORM parameterization
C) Timeout expiry behavior for physician checkpoint — explicit recommendation
D) Missing audit fields for Part 11 compliance
```

---

# ═══════════════════════════════════════════════════
# PACKET 11 — Complaint Node Execution Layer  [MEDIUM GRANULARITY]
# ═══════════════════════════════════════════════════

**Block name:** Complaint Node Runner + Config Loader

**What this block does:**
`complaintConfigLoader.ts` loads complaint config from a registry (CSV-backed), validates it via corruption guard, and assembles the full `ComplaintConfig` object. `complaintNodeRunner.ts` sequences clinical nodes (red flags → questions → scoring → disposition → template) for a single complaint. `complaintEngines.ts` implements each node as a pure function operating on `CaseState`.

**Runtime context:** TypeScript / Express / PostgreSQL / CSV registry / Google Sheets cache

**Known issues:**
- `complaintConfigLoader.ts` reads CSV files synchronously at cold start — no lazy loading or caching strategy visible
- Node sequencing in `complaintNodeRunner.ts` is controlled by a string-literal `NodeId` type — adding a new node requires touching the type, the runner, and the engine separately
- If a corruption guard assertion throws mid-load, the entire complaint is unavailable with no partial fallback

**Original types:**
```typescript
export type NodeId =
  | "RED_FLAGS" | "CORE_QUESTIONS" | "SCORING" | "DISPOSITION"
  | "TEMPLATE" | "EXAM_OVERRIDE" | "DIFF_CONFIDENCE"
  | "RED_FLAG_MASTER_JOIN" | "SPOT_INTERVENTIONS" | "SPECIALIST_COUNCIL";

export interface ComplaintRegistryEntry {
  ccId: string; system: string; label: string; version: number;
  defaultCluster: string; scoringModule: string; graphId: string; enabled: boolean;
}
```

**Claude prompt:**
```
Review this complaint node execution block.

Specific questions:
1. The NodeId type is a union of string literals — what happens when a new node is added? Is there a risk of a node being skipped silently?
2. If loadComplaintConfig throws (e.g. corrupt CSV), what does the caller receive? Is there a graceful fallback?
3. complaintEngines.ts imports 10 different scoring modules — are these called unconditionally or routed by complaint? What happens for a complaint with no matching scorer?
4. Is the config loaded fresh on every request or cached? How is cache invalidation handled when the CSV changes?
5. The corruption guard runs assertions — are these assertions the same as the ones in corruptionGuard.ts that were recently fixed?

Output:
A) Node sequencing risks
B) Rewritten node runner with explicit error isolation per node
C) Config loading with cache + lazy load pattern
D) Test cases: missing node, corrupt config, unknown complaint
```

---

# ═══════════════════════════════════════════════════
# PACKET 12 — Adaptive Questions + Dynamic Intake  [MEDIUM GRANULARITY]
# ═══════════════════════════════════════════════════

**Block name:** Adaptive Questioning Engine

**What this block does:**
`adaptiveQuestionEngine.ts` ranks candidate questions by information gain (entropy reduction) given the current differential distribution. `dynamicQuestionService.ts` detects feature gaps in collected answers and generates targeted follow-up questions.

**Runtime context:** TypeScript / no external dependencies / pure information theory

**Known issues:**
- `expectedInfoGain` is computed as `currentEntropy - (pYes * entropyIfYes + pNo * entropyIfNo)` — this is mathematically correct but `pYes` is estimated from the prior without evidence, making it circular
- Questions with `expectedInfoGain = 0` are included in output — they provide no clinical value
- `dynamicQuestionService.ts` uses `t.includes()` substring matching for feature detection (same class of bug as the complaint parser)

**Original types:**
```typescript
export interface AdaptiveQuestion {
  id: string; text: string; feature: string; expectedInfoGain: number; rationale: string;
  currentEntropy: number; entropyIfYes: number; entropyIfNo: number; pYes: number;
}
export interface AdaptiveQuestionResult {
  complaint: string; currentEntropy: number; topDiagnosis: string; topProbability: number;
  questions: AdaptiveQuestion[];
  differential: Array<{ diagnosis: string; probability: number }>;
}
```

**Claude prompt:**
```
Review this adaptive questioning / information gain block.

Specific questions:
1. The expected information gain formula — is H(D) - E[H(D|Q)] implemented correctly? Walk through a worked example with 3 diagnoses and 1 question.
2. pYes is estimated from the prior without patient evidence — when does this cause bad question ordering?
3. Should questions with expectedInfoGain <= 0 be filtered out before returning?
4. dynamicQuestionService.ts uses keyword includes() — list false positives similar to the complaint parser bug (e.g. "no shortness of breath" contains "shortness" and would match SOB).
5. Is there protection against asking the same question twice (idempotency)?

Output:
A) Math correctness assessment
B) Rewritten information gain calculation with comments
C) Rewritten feature detection using negation-aware matching
D) Test cases: entropy=0 (certain diagnosis), uniform distribution, repeated question prevention
```

---

# ═══════════════════════════════════════════════════
# PACKET 13 — Multi-Agent Orchestration  [LARGE GRANULARITY]
# ═══════════════════════════════════════════════════

**Block name:** Multi-Agent Orchestration

**What this block does:**
`orchestrator.ts` runs registered agents in priority order with timeouts and circuit breakers. `multiAgentCoordinator.ts` prevents duplicate task assignment. `controllerAgent.ts` routes clinical inputs to the right agents. `unifiedAgentRegistry.ts` tracks agent health via heartbeats.

**Runtime context:** TypeScript / Express / PostgreSQL / in-memory + DB agent state

**Known issues:**
- `MultiAgentCoordinator` tracks tasks in `this.tasks` array — O(n) scan for conflict detection, unbounded growth, lost on restart
- `orchestrator.ts` runs agents in priority order sequentially — `dependsOn` field exists on the Agent interface but dependency resolution is not implemented (it's a dead field)
- Circuit breaker state is per-instance — multi-instance deployments have independent circuit breakers

**Original code:**
```typescript
export class MultiAgentCoordinator {
  private tasks: AgentTask[] = [];
  assign(agent: string, task: string): { status: string; reason?: string } {
    const conflict = this.tasks.find((t) => t.task === task && t.status === "active");
    if (conflict) return { status: "blocked", reason: `Task already assigned to ${conflict.agent}` };
    this.tasks.push({ agent, task, assignedAt: Date.now(), status: "active" });
    return { status: "assigned" };
  }
}

export interface Agent {
  name: string; priority: number; timeoutMs?: number; dependsOn?: string[];
  run: (context: AgentContext, priorResults: Record<string, AgentOutput>) => Promise<AgentOutput>;
}
// NOTE: dependsOn is defined but never used in the orchestrator loop
```

**Claude prompt:**
```
Review this multi-agent orchestration block.

Specific questions:
1. The task conflict detection is O(n) linear scan on an unbounded array. What's the impact at 10,000 tasks? Rewrite with a Map.
2. The Agent interface has a dependsOn field — trace through orchestrator.ts and confirm whether it is actually used. If not, either implement it or remove it.
3. Circuit breaker state is in-memory per instance — what happens with a load balancer and 3 server instances? Agent A trips on instance 1, instances 2 and 3 don't know.
4. What happens if agent.run() never resolves (hangs)? Does the timeout actually fire?
5. unifiedAgentRegistry.ts writes heartbeats to DB — does it clean up stale agents, or does the table grow forever?

Output:
A) Concurrency and scalability issues
B) Rewritten MultiAgentCoordinator with Map-based O(1) conflict detection and size limit
C) dependsOn implementation or removal recommendation
D) Test cases: duplicate task, agent timeout, dead agent heartbeat
```

---

# ═══════════════════════════════════════════════════
# PACKET 14 — Clinical Brain Engine  [LARGE GRANULARITY]
# ═══════════════════════════════════════════════════

**Block name:** Clinical Brain Engine

**What this block does:**
The central orchestrator that coordinates 15+ sub-engines (differential probability, next-best question, red flags, treatment, uncertainty, evidence aggregation, governance, temporal progression, risk stratification, guideline adherence) and assembles a `ClinicalBrainOutput` from their results. The longest call chain in the system.

**Runtime context:** TypeScript / Express / PostgreSQL

**Known issues:**
- 20+ imports with direct coupling — any sub-engine failing causes the entire brain call to fail
- No clear ownership: some outputs are used, some computed but unused in the final assembly
- No timeout on sub-engine calls — a slow sub-engine hangs the whole brain

**Import list (shows coupling scope):**
```typescript
import { findSimilarCasesForState } from "../similarity/caseSimilarityService";
import { computeDifferentialProbabilities } from "../services/diagnostic/differentialProbabilityEngine";
import { selectNextBestQuestion } from "../services/diagnostic/nextBestQuestionEngine";
import { detectRedFlags } from "../agent/safety/redFlags";
import { logBrainDecision } from "./brainAuditLog";
import { storeClinicalCase, findSimilarMemoryCases } from "./clinicalMemoryEngine";
import { normalizeSymptoms } from "./symptomNormalizationEngine";
import { safetyGuard } from "./clinicalSafetyGuard";
import { diagnosticEvidenceEngine } from "./diagnosticEvidenceEngine";
import { computeUncertainty } from "./uncertaintyEngine";
import { getBulkRecommendations } from "./treatmentEngine";
import { prioritizeTests } from "./testRecommendationEngine";
import { generateBulkReturnPrecautions } from "./returnPrecautionEngine";
import { contradictionEngine } from "./contradictionEngine";
import { evidenceAggregatorEngine } from "./evidenceAggregatorEngine";
import { clinicalGovernanceEngine } from "./clinicalGovernanceEngine";
import { temporalProgressionEngine } from "./temporalProgressionEngine";
import { riskStratificationEngine } from "./riskStratificationEngine";
import { guidelineAdherenceEngine } from "./guidelineAdherenceEngine";
import { physicianReviewPacketEngine } from "./physicianReviewPacketEngine";
import { dispositionCalibrationEngine } from "./dispositionCalibrationEngine";
import { complaintCompletenessEngine } from "./complaintCompletenessEngine";
```

**Claude prompt:**
```
Review this clinical brain engine's architecture. Do NOT rewrite all 20+ engines — focus on the orchestration layer only.

Specific questions:
1. With 20+ direct imports, what happens when one sub-engine throws? Is there error isolation?
2. Which of these sub-engines are called in parallel vs sequentially? Should any be parallelized?
3. There's no timeout on any sub-engine call. Add a withTimeout wrapper to each that logs and returns a safe default on expiry.
4. How would you refactor this to allow new sub-engines to be added without touching the brain file?
5. Which outputs appear to be computed but not used in the final ClinicalBrainOutput assembly?

Output:
A) Coupling risks and failure propagation analysis
B) Rewritten orchestration layer with error isolation (try/catch per engine) and parallel execution where safe
C) withTimeout pattern for sub-engine calls
D) Suggested plugin registration pattern to decouple the brain from its imports
```

---

# ═══════════════════════════════════════════════════
# PACKET 15 — Telemedicine Assistant API Slice  [MEDIUM GRANULARITY]
# ═══════════════════════════════════════════════════

**Block name:** Telemedicine Assistant Service + Routes

**What this block does:**
`telemedicineAssistantService.ts` aggregates 8 sub-services (differential, safety alerts, medication suggestions, return precautions, resources, urgency score, contradiction, adaptive questions) into a single `AssistantResult`. `telemedicineAssistantRoutes.ts` exposes 15+ endpoints including session management, safety checks, coding, note generation, and discharge.

**Runtime context:** TypeScript / Express / PostgreSQL / session state

**Known issues:**
- The route file imports from 10+ services directly — the service layer and route layer are not cleanly separated
- Session operations (`createSession`, `addPatientMessage`, etc.) are called directly in route handlers rather than in a service
- No rate limiting on any endpoint despite containing LLM calls

**Original service signature:**
```typescript
export interface AssistantResult {
  caseId: string; complaint: string | null;
  triage: { level: string; urgencyScore: number; reason: string; };
  differential: Array<{ diagnosis: string; confidence: number; }>;
  safetyAlerts: string[]; medicationSuggestions: string[];
  returnPrecautions: string[]; nextQuestion: string | null;
  resourceRecommendations: string[]; contradictionReport: any;
  adaptiveQuestions: any[];
}
```

**Claude prompt:**
```
Review this telemedicine assistant route + service pair.

Specific questions:
1. The route file directly calls session management functions. Should these be behind the service layer? What's the risk of having them in both places?
2. runTelemedicineAssistant aggregates 8 async calls — are they run in parallel or serial? What's the latency impact?
3. There's no rate limiting on LLM-backed endpoints. What's the risk and how do you add it?
4. The AssistantResult has `nextQuestion: string | null` — what happens downstream if this is always null?
5. What validation runs on the request body before it reaches runTelemedicineAssistant?

Output:
A) Service/route coupling issues
B) Rewritten service with parallel sub-service calls using Promise.allSettled
C) Rate limiting middleware recommendation
D) Request validation additions
```

---

# ═══════════════════════════════════════════════════
# PACKET 16 — Control Tower Socket + Aggregator  [MEDIUM GRANULARITY]
# ═══════════════════════════════════════════════════

**Block name:** Control Tower WebSocket Feed + State Aggregator

**What this block does:**
`socket.ts` opens a WebSocket server on `/ws/control-tower` and pushes live events to all connected clients. `aggregator.ts` maintains bounded in-memory arrays for patients (max 500), errors (max 200), and alerts (max 100), updated via the event bus. `SystemControlTowerPage.tsx` consumes this via WebSocket with manual reconnection.

**Runtime context:** TypeScript / Express / ws / React / in-memory state

**Known issues:**
- Socket sends initial SNAPSHOT then only updates via events — if a client reconnects it gets a stale snapshot of whatever was accumulated in memory since last restart
- No heartbeat/ping from server — dead connections accumulate silently
- `aggregator.ts` uses `unshift + slice` for bounded arrays but on high volume this is O(n) per event
- No backpressure: if a client is slow, events queue up until the socket buffer fills

**Original socket code:**
```typescript
wss.on("connection", (client: WebSocket, _req: IncomingMessage) => {
  const snapshot = JSON.stringify({ type: "SNAPSHOT", data: getState() });
  if (client.readyState === WebSocket.OPEN) client.send(snapshot);
  client.on("error", () => {});
  // No heartbeat. No backpressure. No cleanup on disconnect.
});

subscribeToTower((event) => {
  if (!wss) return;
  const msg = JSON.stringify({ type: "EVENT", event, state: getState() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
});
```

**Claude prompt:**
```
Review this WebSocket control tower feed.

Specific questions:
1. Dead connections: if a client disconnects without a close frame, how long does the server hold the connection? Add a ping/pong heartbeat.
2. Backpressure: if client.send() is called faster than the client consumes, what happens to the socket buffer? Add a check for client.bufferedAmount.
3. aggregator.ts uses array.unshift() for bounded collections — what's the time complexity as events accumulate? Replace with a circular buffer or deque.
4. On reconnect, the client gets a SNAPSHOT of current state — but events that occurred during the disconnect are lost. Is this acceptable for a clinical monitoring feed?
5. The `client.on("error", () => {})` silently swallows all socket errors — what should happen on a client error?

Output:
A) Reliability issues
B) Rewritten socket.ts with ping/pong heartbeat and bufferedAmount check
C) Rewritten aggregator using a circular buffer
D) Reconnection gap analysis — what clinical events could be missed?
```

---

# ═══════════════════════════════════════════════════
# PACKET 17 — Corruption Guard + Validation  [SMALL GRANULARITY]
# ═══════════════════════════════════════════════════

**Block name:** Corruption Guard + Clinical Schema Validator

**What this block does:**
`corruptionGuard.ts` validates rows loaded from CSV/Google Sheets against format rules before they are used in clinical decisions. Catches missing IDs, bad patterns, invalid dispositions, and corrupt scoring rules. `clinicalSchemaValidator.ts` validates the entire loaded workbook structure against required sheet schemas.

**Runtime context:** TypeScript / pure validation / no external dependencies

**Recent fixes applied in this codebase:**
- Fixed: `CC_ID_PATTERN` now accepts both lowercase (`/^[a-z0-9_]+$/`) AND mixed-case `OUT_*` prefixed IDs
- Fixed: `assertCoreQuestionsNotCorrupt` now accepts numeric string IDs
- All 98 unit tests pass after these fixes

**Original CC_ID_PATTERN (pre-fix):**
```typescript
// Was: only accepted lowercase — broke OUT_SORE_THROAT_V1 prefixed IDs
const CC_ID_PATTERN = /^[a-z0-9_]+$/;
// Fix applied: /^[A-Za-z0-9_]+$/
```

**Claude prompt:**
```
Review and reimplement this validation / corruption guard block from scratch.

Specific questions:
1. The CC_ID_PATTERN was changed — what's the full set of valid complaint ID formats this system uses? Infer from context.
2. What happens when a corruption guard assertion fails mid-load — does the whole complaint fail or just the bad row?
3. clinicalSchemaValidator.ts validates required sheet schemas — what's the behavior when a required sheet is entirely missing vs partially populated?
4. Are there any validation rules that should block clinical use but currently only produce warnings?
5. Is there a test that feeds a deliberately corrupted row and verifies the error message content?

Output:
A) Validation gaps found
B) Rewritten corruptionGuard.ts with explicit per-row error reporting (not throw-on-first)
C) Severity classification: which violations should block vs warn?
D) Test cases: empty ID, wrong pattern, missing required field, valid OUT_* prefix
```

---

# ═══════════════════════════════════════════════════
# PACKET 18 — KB Runtime + Admin Routes  [LARGE GRANULARITY]
# ═══════════════════════════════════════════════════

**Block name:** Knowledge Base Runtime Cache + Admin API

**What this block does:**
`kbRuntime.ts` loads clinical KB tables (priors, red flags, treatments) from PostgreSQL at startup and caches them in memory with TTL. All triage calls read from this cache. Admin routes in `knowledgeBaseAdminRoutes.ts` expose GET/POST/PATCH/DELETE for every KB table and call `reloadAndRewireKbCache()` after writes.

**Runtime context:** TypeScript / Express / PostgreSQL / Drizzle ORM / in-memory cache

**Known issues:**
- Cache invalidation after write: if two instances run, only the one that received the write reloads — other instances serve stale KB data
- No cache warm-up status endpoint — you can't tell if the cache is loaded or still loading
- `knowledgeBaseAdminRoutes.ts` is 600+ lines — schema validation, business logic, and HTTP handling all in one file

**Cache structure:**
```typescript
export interface KbRedFlagRule { ruleId: string; complaintId: string; label: string; triggerExpr: string; severity: string; action: string; immediateActions?: string; active: boolean; }

// Cache is a module-level object, reloaded on demand
let cache: { priors: DiagnosisPrior[]; redFlags: KbRedFlagRule[]; treatments: KbTreatmentRule[]; loadedAt: number; } | null = null;
```

**Claude prompt:**
```
Review this KB runtime cache + admin API block.

Specific questions:
1. Two server instances both have the KB cached. Instance A receives a write and reloads. Instance B is still serving the old KB. How long until they converge, and what clinical impact could the divergence have?
2. The cache is a module-level nullable object. What's the behavior if a triage request arrives before the cache has loaded?
3. knowledgeBaseAdminRoutes.ts is 600+ lines. What are the top 3 concerns with a file that large?
4. After a POST /api/kb/questions creates a new question, is reloadAndRewireKbCache() actually called? Trace the code path.
5. Is there auth middleware on every admin write route? Which roles are allowed to write KB rules?

Output:
A) Cache consistency issues and recommendations
B) Rewritten cache module with status tracking and safe null handling
C) Recommendation for splitting the admin routes file (what goes where)
D) Auth audit: list every route that writes to the KB and its required role
```

---

# ═══════════════════════════════════════════════════
# PACKET 19 — Final Clinical Pipeline  [LARGE GRANULARITY]
# ═══════════════════════════════════════════════════

**Block name:** Final Clinical Pipeline Orchestration

**What this block does:**
`finalPipeline.ts` runs an 8-stage clinical flow: NLP intake → multi-complaint fusion → hybrid reasoning → safety pipeline → explainability → RLHF proposal → security log → FHIR sync. `safetyPipeline.ts` runs hard safety gates in fixed priority order: sepsis → pediatric → OB → mental health → conflict resolver.

**Runtime context:** TypeScript / Express / PostgreSQL / OpenAI

**Known issues:**
- `safetyPipeline.ts` priority order is comments-only — nothing in the code enforces the execution order if someone reorders the checks
- If the FHIR sync (stage 8) fails, does the pipeline fail the whole request or just log and continue?
- RLHF proposal (stage 6) is "never autonomous, always gated" per comment — but what enforces this?

**safetyPipeline comment (claimed behavior):**
```
Priority order (hard-coded, non-negotiable):
  1. Sepsis detection (qSOFA / NEWS2)  → ER_NOW if score ≥ 2
  2. Pediatric deterioration (PEWS)    → ER_NOW if score ≥ 6, URGENT if ≥ 4
  3. Obstetric emergency              → ER_NOW for any critical OB finding
  4. Mental health / suicide risk     → ER_NOW for high/imminent ideation
  5. Hybrid engine conflict resolver  → deterministic vs. probabilistic merge
  6. Final output
```

**Claude prompt:**
```
Review this clinical pipeline orchestration block.

Specific questions:
1. safetyPipeline.ts claims a fixed priority order — does the code actually enforce this order, or is it just documentation? How would you make it structurally enforced?
2. finalPipeline.ts stage 8 (FHIR sync) is described as "non-blocking" — if it throws, does the error propagate or is it swallowed? Show the error handling.
3. Stage 6 (RLHF proposal) is "never autonomous" per the comment — what in the code prevents autonomy? Is there a runtime check or just the comment?
4. What happens if NLP intake (stage 1) returns an empty complaint? Does the pipeline short-circuit or proceed with null data?
5. Are all 8 stages individually timed? If not, how do you identify which stage is slow in production?

Output:
A) Ordering enforcement gaps
B) Rewritten safetyPipeline with structurally enforced priority (array of handlers in order)
C) Error isolation for non-critical stages (FHIR, RLHF)
D) Per-stage timing instrumentation pattern
```

---

# ═══════════════════════════════════════════════════
# PACKET 20 — Automation Template Studio  [SMALL GRANULARITY]
# ═══════════════════════════════════════════════════

**Block name:** Browser Automation Template Backend

**What this block does:**
`templateStore.ts` persists recorded browser automation templates to PostgreSQL. `templateRecorder.ts` records Playwright actions into a replayable template. `selectorHealing.ts` tries alternative selectors when a recorded selector no longer exists on the page. `templateRegistry.ts` holds a static list of built-in templates.

**Runtime context:** TypeScript / Express / Playwright / PostgreSQL

**Known issues:**
- `selectorHealing.ts` tries selectors sequentially with `page.locator().count()` calls — each is a round-trip to the browser, N candidates = N round trips
- `normalizeKey()` in `templateRecorder.ts` produces camelCase from form labels — but two different labels that normalize to the same key collide silently
- `templateRegistry.ts` is a static array — there's no validation that template selectors actually exist on their target URLs

**Original selectorHealing.ts:**
```typescript
export async function healSelector(page: Page, selector: string): Promise<string | null> {
  try {
    const found = await page.locator(selector).count();
    if (found > 0) return selector;
  } catch {}

  if (selector.startsWith("#")) {
    const id = selector.slice(1);
    const candidates = [
      `[name="${id}"]`, `[aria-label="${id}"]`, `[placeholder*="${id}" i]`,
      `label:has-text("${id}") + input`, `label:has-text("${id}") + select`,
    ];
    for (const candidate of candidates) {
      try {
        const found = await page.locator(candidate).count();
        if (found > 0) return candidate;
      } catch {}
    }
  }
  return null;
}
```

**Claude prompt:**
```
Review this browser automation template backend.

Specific questions:
1. selectorHealing.ts makes N sequential browser round-trips. How do you batch these into a single page.evaluate() call to check all candidates at once?
2. normalizeKey() converts form labels to camelCase. What happens when "First Name" and "First name" both appear on the same form? Collision detection?
3. templateRegistry.ts is a static array with no URL validation. How would you add a health-check that verifies each template's selectors work against their target URL?
4. templateRecorder.ts records Playwright actions — does it handle dynamic content (e.g. a dropdown that loads options asynchronously)?
5. templateStore.ts uses ON CONFLICT DO UPDATE — if an existing template is overwritten, is the old definition preserved anywhere for rollback?

Output:
A) Performance and correctness issues
B) Rewritten healSelector using page.evaluate() for batch checking
C) normalizeKey collision detection
D) Template validation health-check design
```

---

# END OF ALL 20 PACKETS
# After running all packets, paste Claude's version of each file back and ask:
# "What did the original have that your version changed or removed? Is anything from the original intentional?"
