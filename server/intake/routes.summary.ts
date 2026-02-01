import { Router, Request, Response, NextFunction } from "express";
import { db } from "./db";
import type { CaseRow } from "./types";

export const summaryRouter = Router();

function requireProviderAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["x-provider-key"];
  const providerKey = process.env.PROVIDER_API_KEY;
  
  if (!providerKey) {
    return res.status(503).json({ ok: false, error: "Provider API not configured." });
  }
  
  if (authHeader !== providerKey) {
    return res.status(401).json({ ok: false, error: "Unauthorized. Invalid provider key." });
  }
  
  next();
}

summaryRouter.get("/api/provider/case/:caseId", requireProviderAuth, (req: Request, res: Response) => {
  const caseId = req.params.caseId;
  const row = db.prepare(`SELECT * FROM cases WHERE case_id = ?`).get(caseId) as CaseRow | undefined;
  if (!row) return res.status(404).json({ ok: false });

  return res.json({
    ok: true,
    caseId: row.case_id,
    status: row.status,
    intake: JSON.parse(row.intake_json || "{}"),
    assistant: JSON.parse(row.assistant_json || "{}"),
    updatedAt: row.updated_at
  });
});

summaryRouter.get("/api/provider/cases", requireProviderAuth, (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  
  let query = `SELECT case_id, token, status, created_at, updated_at FROM cases`;
  const params: any[] = [];
  
  if (status) {
    query += ` WHERE status = ?`;
    params.push(status);
  }
  
  query += ` ORDER BY updated_at DESC LIMIT 100`;
  
  const rows = db.prepare(query).all(...params) as CaseRow[];
  return res.json({ ok: true, cases: rows });
});
