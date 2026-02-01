import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db } from "./db";
import type { DraftPayload, SubmitPayload, VerifyPayload, CaseStatus, CaseRow, IntakeSession } from "./types";
import { renderSummaryHtml, saveSummaryHtml } from "./pdf";

export const intakeRouter = Router();

const SESSION_EXPIRY_MS = 30 * 60 * 1000;
export const verifiedSessions = new Map<string, { expiresAt: number; caseId: string }>();

function nowMs() { return Date.now(); }

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function newId(prefix: string) {
  return `${prefix}_${new Date().toISOString().slice(0,10).replace(/-/g,"")}_${crypto.randomBytes(6).toString("hex")}`;
}

function requireVerifiedSession(req: Request, res: Response, next: NextFunction) {
  const token = req.params.token;
  const sessionData = verifiedSessions.get(token);
  
  if (!sessionData) {
    return res.status(401).json({ ok: false, error: "Session not verified. Please enter your code first." });
  }
  
  if (sessionData.expiresAt < nowMs()) {
    verifiedSessions.delete(token);
    return res.status(401).json({ ok: false, error: "Session expired. Please verify again." });
  }
  
  (req as any).verifiedCaseId = sessionData.caseId;
  next();
}

function getOrCreateCase(token: string): CaseRow {
  const row = db.prepare(`SELECT * FROM cases WHERE token = ? ORDER BY created_at DESC LIMIT 1`).get(token) as CaseRow | undefined;
  if (row) return row;

  const caseId = newId("CASE");
  const ts = nowMs();
  db.prepare(`
    INSERT INTO cases (case_id, token, status, created_at, updated_at, current_step, draft_json, intake_json, assistant_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(caseId, token, "draft", ts, ts, 0, "{}", "{}", "{}");

  return db.prepare(`SELECT * FROM cases WHERE case_id = ?`).get(caseId) as CaseRow;
}

intakeRouter.post("/api/intake/:token/verify", (req: Request, res: Response) => {
  const token = req.params.token;
  const body = req.body as VerifyPayload;

  if (!body?.code || String(body.code).trim().length < 4) {
    return res.status(400).json({ ok: false, error: "Missing code." });
  }

  const session = db.prepare(`SELECT * FROM intake_sessions WHERE token = ?`).get(token) as IntakeSession | undefined;
  if (!session) return res.status(404).json({ ok: false, error: "Invalid link." });

  if (session.used_at) return res.status(410).json({ ok: false, error: "This link has already been used." });
  if (Number(session.expires_at) < nowMs()) return res.status(410).json({ ok: false, error: "This link has expired." });

  const codeHash = sha256(String(body.code).trim());
  if (codeHash !== session.code_hash) return res.status(401).json({ ok: false, error: "Incorrect code." });

  const c = getOrCreateCase(token);

  verifiedSessions.set(token, {
    expiresAt: nowMs() + SESSION_EXPIRY_MS,
    caseId: c.case_id
  });

  let savedDraft: Record<string, any> | null = null;
  try {
    const parsed = JSON.parse(c.draft_json || "{}");
    if (Object.keys(parsed).length > 0) savedDraft = parsed;
  } catch {}

  return res.json({
    ok: true,
    caseId: c.case_id,
    status: c.status,
    currentStep: c.current_step,
    savedDraft,
    flowId: "DEFAULT_FLOW"
  });
});

intakeRouter.post("/api/intake/:token/save_draft", requireVerifiedSession, (req: Request, res: Response) => {
  const token = req.params.token;
  const body = req.body as DraftPayload;

  const c = getOrCreateCase(token);
  const ts = nowMs();

  const mergedDraft = safeMergeJson(c.draft_json, body?.draft || {});
  const step = Number.isFinite(body?.currentStep) ? body.currentStep : c.current_step;

  db.prepare(`
    UPDATE cases
    SET draft_json = ?, current_step = ?, updated_at = ?, status = ?
    WHERE case_id = ?
  `).run(JSON.stringify(mergedDraft), step, ts, "draft", c.case_id);

  return res.json({ ok: true });
});

intakeRouter.post("/api/intake/:token/submit", requireVerifiedSession, (req: Request, res: Response) => {
  const token = req.params.token;
  const body = req.body as SubmitPayload;

  if (!body?.consent?.telehealth || !body?.consent?.privacy || !body?.consent?.signatureName) {
    return res.status(400).json({ ok: false, error: "Consent is required." });
  }

  const c = getOrCreateCase(token);
  const ts = nowMs();

  const assistant = {
    triageLevel: computeTriage(body),
    redFlags: computeRedFlags(body),
    draftNote: `HPI: ${body.chiefComplaint}\n\nPatient-reported symptoms recorded via portal.`
  };

  db.prepare(`
    UPDATE cases
    SET intake_json = ?, assistant_json = ?, status = ?, updated_at = ?
    WHERE case_id = ?
  `).run(JSON.stringify(body), JSON.stringify(assistant), "submitted", ts, c.case_id);

  db.prepare(`UPDATE intake_sessions SET used_at = ? WHERE token = ?`).run(ts, token);
  
  verifiedSessions.delete(token);

  return res.json({ ok: true, caseId: c.case_id });
});

intakeRouter.get("/api/intake/:token/status", requireVerifiedSession, (req: Request, res: Response) => {
  const token = req.params.token;
  const row = db.prepare(`SELECT * FROM cases WHERE token = ? ORDER BY created_at DESC LIMIT 1`).get(token) as CaseRow | undefined;
  if (!row) return res.status(404).json({ ok: false, error: "Not found." });

  return res.json({
    ok: true,
    caseId: row.case_id,
    status: row.status,
    updatedAt: row.updated_at,
    nextActionText: statusText(row.status as CaseStatus)
  });
});

intakeRouter.get("/api/intake/:token/summary", requireVerifiedSession, (req: Request, res: Response) => {
  const token = req.params.token;
  const row = db.prepare(`SELECT * FROM cases WHERE token = ? ORDER BY created_at DESC LIMIT 1`).get(token) as CaseRow | undefined;
  if (!row) return res.status(404).send("Not found.");

  if (row.status !== "signed") return res.status(403).send("Summary not available yet.");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(row.summary_html || "<html><body>No summary.</body></html>");
});

intakeRouter.post("/api/admin/case/:caseId/sign", (req: Request, res: Response) => {
  const caseId = req.params.caseId;
  const row = db.prepare(`SELECT * FROM cases WHERE case_id = ?`).get(caseId) as CaseRow | undefined;
  if (!row) return res.status(404).json({ ok: false });

  const intake = JSON.parse(row.intake_json || "{}");
  const assistant = JSON.parse(row.assistant_json || "{}");

  const html = renderSummaryHtml(caseId, intake, assistant);
  const htmlPath = saveSummaryHtml(caseId, html);

  db.prepare(`
    UPDATE cases
    SET status = ?, summary_html = ?, updated_at = ?
    WHERE case_id = ?
  `).run("signed", html, Date.now(), caseId);

  return res.json({ ok: true, htmlPath });
});

function safeMergeJson(existingJson: string, incoming: Record<string, any>) {
  let existing: any = {};
  try { existing = JSON.parse(existingJson || "{}"); } catch {}
  return { ...existing, ...incoming };
}

function statusText(s: CaseStatus) {
  if (s === "draft") return "Continue your intake.";
  if (s === "submitted") return "Submitted. Provider review pending.";
  if (s === "in_review") return "In review.";
  if (s === "signed") return "Complete. Summary available.";
  if (s === "closed") return "Closed.";
  return "Unknown.";
}

function computeRedFlags(body: SubmitPayload): string[] {
  const flags: string[] = [];
  const s = body.symptoms || {};
  if (s["chest_pain"] === "yes") flags.push("Chest pain");
  if (s["shortness_of_breath"] === "yes") flags.push("Shortness of breath");
  if (s["confusion"] === "yes") flags.push("Confusion");
  return flags;
}

function computeTriage(body: SubmitPayload): string {
  const flags = computeRedFlags(body);
  if (flags.length) return "Urgent screen: needs clinician review now";
  return "Routine";
}
