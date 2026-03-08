export interface Notification {
  id: string;
  type: "case_assigned" | "review_needed" | "escalation" | "export_ready" | "system";
  recipientId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

const notifications: Notification[] = [];

export function createNotification(input: Omit<Notification, "id" | "read" | "createdAt">): Notification {
  const n: Notification = {
    ...input,
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    read: false,
    createdAt: new Date().toISOString(),
  };
  notifications.push(n);
  return n;
}

export function listNotifications(recipientId?: string, unreadOnly = false): Notification[] {
  return notifications
    .filter((n) => (!recipientId || n.recipientId === recipientId) && (!unreadOnly || !n.read))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function markNotificationRead(id: string): boolean {
  const n = notifications.find((x) => x.id === id);
  if (n) { n.read = true; return true; }
  return false;
}

export function getUnreadCount(recipientId: string): number {
  return notifications.filter((n) => n.recipientId === recipientId && !n.read).length;
}
