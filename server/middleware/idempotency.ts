import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["idempotency-key"] as string | undefined;
  if (!key || req.method === "GET") return next();

  try {
    const found = await db.execute(sql`
      SELECT response FROM idempotency_keys WHERE key = ${key} LIMIT 1
    `);

    if (found.rows[0]) {
      const cached = (found.rows[0] as { response: unknown }).response;
      return res.status(200).json(cached);
    }

    const originalJson = res.json.bind(res);
    (res as any).json = (body: unknown) => {
      db.execute(sql`
        INSERT INTO idempotency_keys (key, response)
        VALUES (${key}, ${JSON.stringify(body)}::jsonb)
        ON CONFLICT (key) DO NOTHING
      `).catch(() => {});
      return originalJson(body);
    };

    next();
  } catch {
    next();
  }
}
