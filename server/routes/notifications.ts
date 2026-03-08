import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { listNotifications, markNotificationRead, getUnreadCount } from "../services/notificationService";

export const notificationsRouter = Router();

notificationsRouter.get("/", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  const recipientId = (req as any).authUser?.userId;
  const unreadOnly = req.query.unreadOnly === "true";
  res.json({ notifications: listNotifications(recipientId, unreadOnly) });
});

notificationsRouter.get("/count", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  const recipientId = (req as any).authUser?.userId;
  res.json({ unreadCount: getUnreadCount(recipientId || "") });
});

notificationsRouter.post("/:id/read", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  const ok = markNotificationRead(req.params.id);
  if (!ok) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json({ success: true });
});
