/**
 * Safe parameterized SQL helpers for governance routes.
 *
 * SECURITY CONTRACT:
 *   - Static query text is passed via `sql.raw()` — safe for literal SQL fragments.
 *   - User-controlled values are bound via Drizzle `sql\`${value}\`` template, which
 *     always produces a numbered `$N` placeholder. No string interpolation into SQL.
 *   - NEVER call sql.raw() with user input. Use qRow/qRows/qExec with the params[] array.
 *
 * Injection sites that previously used template-string interpolation have been
 * migrated to call db.execute(sql`...`) directly or to pass params[] here.
 */

import { db }   from "../db";
import { sql }  from "drizzle-orm";

type SqlChunk = ReturnType<typeof sql>;

function buildQuery(q: string, params: unknown[]): SqlChunk {
  if (params.length === 0) {
    return sql.raw(q) as unknown as SqlChunk;
  }
  const parts = q.split("?");
  const chunks: SqlChunk[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) chunks.push(sql.raw(parts[i]) as unknown as SqlChunk);
    if (i < params.length) chunks.push(sql`${params[i]}` as unknown as SqlChunk);
  }
  return sql.join(chunks) as unknown as SqlChunk;
}

export async function qRow<T = any>(q: string, params: unknown[] = []): Promise<T | undefined> {
  const r = await db.execute(buildQuery(q, params));
  return ((r as any).rows ?? r)[0] as T | undefined;
}

export async function qRows<T = any>(q: string, params: unknown[] = []): Promise<T[]> {
  const r = await db.execute(buildQuery(q, params));
  return ((r as any).rows ?? r) as T[];
}

export async function qExec(q: string, params: unknown[] = []): Promise<void> {
  await db.execute(buildQuery(q, params));
}
