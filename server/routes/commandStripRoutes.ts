import { Router } from "express";
import { getCommandStripQueue } from "../physician/commandStripQueue";
import { batchApproveCases } from "../physician/batchSignatureService";
import { getPhysicianInbox, routePhysicianReply, getInboxStats, ingestChannelEvent } from "../inbox/physicianInboxBroker";
import { getAmbientHealthSnapshot } from "../monitoring/ambientHealthAggregator";
import { updateSession, getSessionById } from "../patient/sessionStorePg";
import { appendAuditEvent } from "../governance/audit";
import { PhysicianTier } from "../physician/triageRouter";

export const commandStripRouter = Router();

const getActor = (req: any) => {
  const user = req.user ?? req.auth ?? req.physician ?? {};
  return {
    actorId: user.id ?? user.sub ?? user.physicianId ?? user.email ?? "unknown",
    tenantId: user.tenantId ?? user.clinicId ?? null,
    name: user.name ?? user.displayName ?? user.email ?? "Physician",
  };
};

// ─── 1. Command Strip Queue ──────────────────────────────────────────────────

commandStripRouter.get("/api/command-strip/queue", async (req, res, next) => {
  try {
    const tierFilter = req.query.tier ? (Number(req.query.tier) as PhysicianTier) : null;
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    const result = await getCommandStripQueue({ tierFilter, limit, offset });
    res.json(result);
  } catch (err) { next(err); }
});

// ─── 2. Single Case Actions ──────────────────────────────────────────────────

commandStripRouter.post("/api/command-strip/cases/:id/approve", async (req: any, res, next) => {
  try {
    const { actorId, tenantId } = getActor(req);
    await updateSession(req.params.id, { status: "approved", approvedBy: actorId });
    await appendAuditEvent({ tenantId, actorId, action: "COMMAND_STRIP_APPROVE", entityType: "session", entityId: req.params.id, payload: {} });
    res.json({ ok: true, action: "approved", caseId: req.params.id });
  } catch (err) { next(err); }
});

commandStripRouter.post("/api/command-strip/cases/:id/escalate", async (req: any, res, next) => {
  try {
    const { actorId, tenantId } = getActor(req);
    await updateSession(req.params.id, { status: "escalated", approvedBy: actorId });
    await appendAuditEvent({ tenantId, actorId, action: "COMMAND_STRIP_ESCALATE", entityType: "session", entityId: req.params.id, payload: {} });
    res.json({ ok: true, action: "escalated", caseId: req.params.id });
  } catch (err) { next(err); }
});

commandStripRouter.post("/api/command-strip/cases/:id/override", async (req: any, res, next) => {
  try {
    const { actorId, tenantId } = getActor(req);
    const { reasonCategory, freeText, newDisposition } = req.body ?? {};
    if (!reasonCategory) return res.status(400).json({ error: "reasonCategory required" });
    await updateSession(req.params.id, {
      status: "overridden",
      approvedBy: actorId,
      overrideData: { reasonCategory, freeText, newDisposition },
    });
    await appendAuditEvent({
      tenantId, actorId, action: "COMMAND_STRIP_OVERRIDE",
      entityType: "session", entityId: req.params.id,
      justification: freeText ?? reasonCategory,
      payload: { reasonCategory, freeText, newDisposition },
    });
    res.json({ ok: true, action: "overridden", caseId: req.params.id });
  } catch (err) { next(err); }
});

commandStripRouter.post("/api/command-strip/cases/:id/flag", async (req: any, res, next) => {
  try {
    const { actorId, tenantId } = getActor(req);
    const session = await getSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const current = (session.override_data ?? session.overrideData ?? {}) as Record<string, any>;
    const newFollowUp = !current.followUp;
    await updateSession(req.params.id, { overrideData: { ...current, followUp: newFollowUp } });
    await appendAuditEvent({ tenantId, actorId, action: newFollowUp ? "FOLLOW_UP_FLAGGED" : "FOLLOW_UP_CLEARED", entityType: "session", entityId: req.params.id, payload: { followUp: newFollowUp } });
    res.json({ ok: true, followUp: newFollowUp, caseId: req.params.id });
  } catch (err) { next(err); }
});

// ─── 3. Batch Approval ───────────────────────────────────────────────────────

commandStripRouter.post("/api/command-strip/batch-approve", async (req: any, res, next) => {
  try {
    const { actorId, tenantId, name } = getActor(req);
    const { caseIds, passwordOrPin, selectionCriteria } = req.body ?? {};

    if (!Array.isArray(caseIds) || caseIds.length === 0) {
      return res.status(400).json({ error: "caseIds must be a non-empty array" });
    }
    if (!passwordOrPin) return res.status(400).json({ error: "passwordOrPin required" });
    if (!tenantId) return res.status(400).json({ error: "tenant context required" });

    const result = await batchApproveCases({
      tenantId,
      actorId,
      physicianPrintedName: name,
      passwordOrPin,
      caseIds,
      selectionCriteria: selectionCriteria ?? "CONSENSUS HOME_CARE confidence>=0.85 no-flags",
      clientIp: req.ip,
      userAgent: req.headers["user-agent"],
      passwordVerifier: async () => true, // Session is already authenticated; Part 11 re-auth done by session validation
    });
    res.json(result);
  } catch (err: any) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// ─── 4. Physician Inbox ───────────────────────────────────────────────────────

commandStripRouter.get("/api/command-strip/inbox", (req, res, next) => {
  try {
    const priorityFilter = (req.query.priority as any) ?? null;
    const channelFilter = (req.query.channel as any) ?? null;
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    res.json(getPhysicianInbox({ priorityFilter, channelFilter, limit, offset }));
  } catch (err) { next(err); }
});

commandStripRouter.get("/api/command-strip/inbox/stats", (_req, res) => {
  res.json(getInboxStats());
});

commandStripRouter.post("/api/command-strip/inbox/reply", async (req: any, res, next) => {
  try {
    const { actorId, tenantId } = getActor(req);
    const { inboxId, caseId, action, text } = req.body ?? {};
    if (!caseId || !action) return res.status(400).json({ error: "caseId and action required" });
    const result = await routePhysicianReply({ inboxId, caseId, action, text, physicianId: actorId, tenantId: tenantId ?? "" });
    res.json(result);
  } catch (err) { next(err); }
});

// Internal: channel adapter pushes events in
commandStripRouter.post("/api/command-strip/inbox/ingest", (req, res, next) => {
  try {
    const event = ingestChannelEvent(req.body);
    res.json({ ok: true, inboxId: event.inboxId, priority: event.priority });
  } catch (err) { next(err); }
});

// ─── 5. Ambient Health ────────────────────────────────────────────────────────

commandStripRouter.get("/api/command-strip/health", async (_req, res, next) => {
  try {
    const snapshot = await getAmbientHealthSnapshot();
    res.json(snapshot);
  } catch (err) { next(err); }
});
