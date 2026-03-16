export interface PhysicianFeedback {
  id: string;
  caseId: string;
  physician: string;
  correction: string;
  category: "disposition" | "diagnosis" | "question" | "protocol" | "other";
  severity: "critical" | "high" | "medium" | "low";
  status: "pending" | "reviewed" | "applied" | "dismissed";
  timestamp: number;
}

const feedbackStore: PhysicianFeedback[] = [];

export function recordPhysicianFeedback(
  feedback: Omit<PhysicianFeedback, "id" | "status" | "timestamp"> & Partial<PhysicianFeedback>
) {
  const entry: PhysicianFeedback = {
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: "pending",
    timestamp: Date.now(),
    ...feedback,
  };
  feedbackStore.push(entry);
  if (feedbackStore.length > 5000) feedbackStore.shift();
  return entry;
}

export function listPhysicianFeedback(filter?: { status?: string; category?: string; limit?: number }) {
  let items = [...feedbackStore];
  if (filter?.status) items = items.filter((f) => f.status === filter.status);
  if (filter?.category) items = items.filter((f) => f.category === filter.category);
  items.sort((a, b) => b.timestamp - a.timestamp);
  if (filter?.limit) items = items.slice(0, filter.limit);
  return items;
}

export function updateFeedbackStatus(id: string, status: PhysicianFeedback["status"]): boolean {
  const item = feedbackStore.find((f) => f.id === id);
  if (!item) return false;
  item.status = status;
  return true;
}

export function getFeedbackStats() {
  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  feedbackStore.forEach((f) => {
    byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
  });

  return {
    total: feedbackStore.length,
    byStatus,
    byCategory,
    bySeverity,
  };
}
