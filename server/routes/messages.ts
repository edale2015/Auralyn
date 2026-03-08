import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { listMessages, getMessageStats, routeMessage } from "../services/messageRoutingService";

export const messagesRouter = Router();

messagesRouter.get("/", requireRole(["admin", "physician", "staff"]), async (_req, res) => {
  res.json({ messages: listMessages() });
});

messagesRouter.get("/stats", requireRole(["admin"]), async (_req, res) => {
  res.json(getMessageStats());
});

messagesRouter.post("/send", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { recipientId, content, channels } = req.body;
    if (!recipientId || !content) { res.status(400).json({ error: "recipientId and content required" }); return; }
    const msg = routeMessage(recipientId, content, channels);
    res.json(msg);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});
