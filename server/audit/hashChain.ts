import crypto from "crypto";
import { asc, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { auditLogs } from "../../shared/schema";

/**
 * Persistent tamper-evident audit hash chain.
 *
 * Why this version exists:
 * - The previous chain was module-local memory capped at 500 entries and reset on restart.
 * - For clinical/HIPAA auditability, audit events must survive process restarts.
 * - For multi-instance safety, append operations need a DB-level lock to avoid chain forks.
 *
 * Compatibility:
 * - appendAuditEvent() is the production path and persists to audit_logs.
 * - getAuditChainAsync() reads from Postgres.
 * - logEvent()/getAuditChain() remain as legacy sync shims for old call sites, but new code
 *   should not use them for regulated audit evidence.
 */

const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
const MAX_MEMORY_CHAIN = Number(process.env.AUDIT_MEMORY_CACHE_SIZE ?? 500);
const AUDIT_ADVISORY_LOCK_ID = Number(process.env.AUDIT_ADVISORY_LOCK_ID ?? 918273645);
const HASH_VERSION = "sha256:v2";

export interface AuditEntry {
  hash: string;
  prevHash: string;
  traceId: string;
  step: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  createdAt: string;
  ts: number;
  [key: string]: unknown;
}

export interface AuditMaterial {
  traceId: string;
  step: string;
  input: unknown;
  output: unknown;
  metadata: Record<string, unknown>;
  createdAt: string;
  hashVersion: string;
}

let memoryChain: AuditEntry[] = [];
let chainHead = GENESIS_HASH;
let hydrated = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isValidHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function safeJson(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(safeJson);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined && typeof v !== "function") out[k] = safeJson(v);
    }
    return out;
  }
  if (typeof value === "function") return String(value.name || "function");
  return value;
}

// Fully recursive canonicalization. JSON.stringify alone is insertion-order dependent.
function canonicalize(value: unknown, inArray = false): string {
  if (value === null) return "null";
  if (value === undefined) return inArray ? "null" : "";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "bigint") return JSON.stringify(value.toString());

  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(v => canonicalize(v, true)).join(",") + "]";
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalize(obj[k], false)).join(",") + "}";
  }
  return JSON.stringify(String(value));
}

export function stableStringify(value: unknown): string {
  return canonicalize(value, false);
}

export function computeChainHash(prevHash: string, entry: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(prevHash + stableStringify(entry), "utf8").digest("hex");
}

export function verifyChainLink(entry: Record<string, unknown>, prevHash: string, claimedHash: string): boolean {
  try {
    if (!isValidHash(prevHash) || !isValidHash(claimedHash)) return false;
    const expected = computeChainHash(prevHash, entry);
    const expectedBuf = Buffer.from(expected, "hex");
    const claimedBuf = Buffer.from(claimedHash, "hex");
    if (expectedBuf.length !== claimedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, claimedBuf);
  } catch {
    return false;
  }
}

function inferTraceId(data: Record<string, unknown>): string {
  const traceId = data.traceId ?? data.trace_id ?? data.patientId ?? data.patient_id;
  return typeof traceId === "string" && traceId.trim() ? traceId.trim() : `trace_${crypto.randomUUID()}`;
}

function inferStep(data: Record<string, unknown>): string {
  const step = data.step ?? data.eventType ?? data.type;
  return typeof step === "string" && step.trim() ? step.trim() : "audit_event";
}

function buildAuditMaterial(data: Record<string, unknown>, createdAt: Date): AuditMaterial {
  const traceId = inferTraceId(data);
  const step = inferStep(data);

  const metadataInput = isRecord(data.metadata) ? data.metadata : {};
  const metadata: Record<string, unknown> = {
    ...metadataInput,
    hashVersion: HASH_VERSION,
    source: metadataInput.source ?? "auralyn.audit.hashChain",
  };

  const input = data.input !== undefined ? data.input : null;
  const output = data.output !== undefined
    ? data.output
    : Object.fromEntries(
        Object.entries(data).filter(([k]) => !["hash", "prevHash", "metadata", "input"].includes(k)),
      );

  return {
    traceId,
    step,
    input: safeJson(input),
    output: safeJson(output),
    metadata: safeJson(metadata) as Record<string, unknown>,
    createdAt: createdAt.toISOString(),
    hashVersion: HASH_VERSION,
  };
}

function rowToMaterial(row: typeof auditLogs.$inferSelect): AuditMaterial {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  return {
    traceId: row.traceId,
    step: row.step,
    input: safeJson(row.input ?? null),
    output: safeJson(row.output ?? null),
    metadata: safeJson({ ...metadata, hashVersion: metadata.hashVersion ?? HASH_VERSION }) as Record<string, unknown>,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
    hashVersion: String(metadata.hashVersion ?? HASH_VERSION),
  };
}

function pushMemory(entry: AuditEntry): void {
  memoryChain.push(entry);
  if (memoryChain.length > MAX_MEMORY_CHAIN) memoryChain = memoryChain.slice(-MAX_MEMORY_CHAIN);
  chainHead = entry.hash;
}

export async function hydrateAuditChain(limit = MAX_MEMORY_CHAIN): Promise<void> {
  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.id))
    .limit(limit);

  const ordered = rows.reverse();
  memoryChain = ordered
    .filter(r => isValidHash(r.hash) && isValidHash(r.prevHash))
    .map(row => {
      const material = rowToMaterial(row);
      return {
        ...material,
        hash: row.hash!,
        prevHash: row.prevHash!,
        ts: new Date(material.createdAt).getTime(),
      } as AuditEntry;
    });

  const [latest] = await db
    .select({ hash: auditLogs.hash })
    .from(auditLogs)
    .orderBy(desc(auditLogs.id))
    .limit(1);

  chainHead = isValidHash(latest?.hash) ? latest.hash : GENESIS_HASH;
  hydrated = true;
}

export async function appendAuditEvent(data: Record<string, unknown>): Promise<AuditEntry> {
  const createdAt = new Date();
  const material = buildAuditMaterial(data, createdAt);

  const stored = await db.transaction(async tx => {
    // Prevent two Node workers from reading the same head and writing divergent links.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_ADVISORY_LOCK_ID})`);

    const [latest] = await tx
      .select({ hash: auditLogs.hash })
      .from(auditLogs)
      .orderBy(desc(auditLogs.id))
      .limit(1);

    const prevHash = isValidHash(latest?.hash) ? latest.hash : GENESIS_HASH;
    const hash = computeChainHash(prevHash, material as unknown as Record<string, unknown>);

    const [row] = await tx
      .insert(auditLogs)
      .values({
        traceId: material.traceId,
        step: material.step,
        input: material.input as any,
        output: material.output as any,
        metadata: material.metadata as any,
        hash,
        prevHash,
        createdAt,
      })
      .returning();

    return {
      ...material,
      hash: row.hash!,
      prevHash: row.prevHash!,
      ts: createdAt.getTime(),
    } as AuditEntry;
  });

  pushMemory(stored);
  return stored;
}

export async function getAuditChainAsync(limit = 500): Promise<AuditEntry[]> {
  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.id))
    .limit(limit);

  return rows
    .reverse()
    .filter(r => isValidHash(r.hash) && isValidHash(r.prevHash))
    .map(row => {
      const material = rowToMaterial(row);
      return { ...material, hash: row.hash!, prevHash: row.prevHash!, ts: new Date(material.createdAt).getTime() };
    });
}

export async function verifyPersistedChain(limit = 10_000): Promise<{
  ok: boolean;
  checked: number;
  firstBadId?: number;
  reason?: string;
}> {
  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(asc(auditLogs.id))
    .limit(limit);

  let prev = GENESIS_HASH;
  let checked = 0;

  for (const row of rows) {
    if (!isValidHash(row.hash) || !isValidHash(row.prevHash)) {
      return { ok: false, checked, firstBadId: row.id, reason: "Malformed hash or prev_hash" };
    }
    if (row.prevHash !== prev) {
      return { ok: false, checked, firstBadId: row.id, reason: "prev_hash does not match prior row hash" };
    }

    const material = rowToMaterial(row) as unknown as Record<string, unknown>;
    if (!verifyChainLink(material, row.prevHash, row.hash)) {
      return { ok: false, checked, firstBadId: row.id, reason: "Hash mismatch" };
    }

    prev = row.hash;
    checked++;
  }

  return { ok: true, checked };
}

export function getChainHead(): string {
  return chainHead;
}

export function isAuditHydrated(): boolean {
  return hydrated;
}

/**
 * Legacy sync shim. Use appendAuditEvent() for production evidence.
 * This keeps older call sites from crashing while you migrate them.
 */
export function logEvent(data: Record<string, unknown>): AuditEntry {
  const createdAt = new Date();
  const material = buildAuditMaterial(data, createdAt);
  const hash = computeChainHash(chainHead, material as unknown as Record<string, unknown>);
  const entry = { ...material, hash, prevHash: chainHead, ts: createdAt.getTime(), legacyVolatile: true } as AuditEntry;
  pushMemory(entry);
  return entry;
}

/** Legacy sync cache. Use getAuditChainAsync() for persisted records. */
export function getAuditChain(): AuditEntry[] {
  return [...memoryChain];
}
